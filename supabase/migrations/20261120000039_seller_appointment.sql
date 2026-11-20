-- Migration 39: the seller's appointment of Super Trucker on Queensland's approved form (Form 9).
--
-- A motor dealer may act for a client selling on consignment only once the client has appointed it in writing, in the
-- approved form, with a prominent statement that the client should get independent legal advice (Motor Dealers and
-- Chattel Auctioneers Act 2014 (Qld) ss 81, 83); the appointment is signed and dated by both, and the client gets a
-- copy straight after (s 84). Otherwise it's ineffective and no commission can be kept (ss 83(3), 88). It must say
-- either side may end it on at least 30 days' written notice (s 82(1)(i)). So:
--   1. the signed agreement carries the Form 9 snapshot the seller signed (built by src/lib/appointment.ts),
--      our countersignature, when the copy was sent, and when the appointment ends (90 days, or 30 days after notice);
--   2. staff countersign (admin_countersign_appointment) and the server records the copy (appointment_copy_sent);
--   3. either side gives notice (seller_end_appointment / admin_end_appointment);
--   4. a listing goes live only with the appointment countersigned and copied, inside its term; the live room never
--      offers a vehicle whose appointment has ended, and relisting stays inside it.
-- Register section 20 (docs/legal-basis.md).

-- ---------------------------------------------------------------------------
-- 1. The appointment on the agreement
-- ---------------------------------------------------------------------------
alter table public.seller_agreements
  add column if not exists appointment jsonb,
  add column if not exists assign_ok boolean not null default false,
  add column if not exists countersigned_at timestamptz,
  add column if not exists countersigned_by uuid references public.profiles(id),
  add column if not exists countersigned_name text,
  add column if not exists copy_sent_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists notice_at timestamptz,
  add column if not exists notice_by text check (notice_by in ('seller', 'us')),
  add column if not exists notice_note text;

update public.seller_agreements set ends_at = signed_at + interval '90 days' where ends_at is null;

-- A single appointment for 90 days from signing, unless notice brings the end forward.
create or replace function public.agreement_term() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.notice_at is null and (tg_op = 'INSERT' or new.signed_at is distinct from old.signed_at or new.ends_at is null) then
    new.ends_at := coalesce(case when tg_op = 'INSERT' then new.ends_at end, new.signed_at + interval '90 days');
  end if;
  return new;
end $$;
drop trigger if exists agreement_term on public.seller_agreements;
create trigger agreement_term before insert or update on public.seller_agreements for each row execute function public.agreement_term();

-- Is the seller's appointment still in force for this listing? A listing with no signed agreement at all (sample and
-- older timed listings) isn't held back here: the publish check is what demands one.
create or replace function public.appointment_in_force(p_lot bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from seller_agreements a where a.lot_id = p_lot and a.status = 'signed')
      or exists (select 1 from seller_agreements a where a.lot_id = p_lot and a.status = 'signed' and a.ends_at > now())
$$;
revoke execute on function public.appointment_in_force(bigint) from public, anon, authenticated;
grant execute on function public.appointment_in_force(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Our countersignature, and the copy
-- ---------------------------------------------------------------------------
create or replace function public.admin_countersign_appointment(p_agreement uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a seller_agreements%rowtype;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into a from seller_agreements where id = p_agreement for update;
  if not found then raise exception 'appointment:that agreement wasn''t found'; end if;
  if a.status <> 'signed' then raise exception 'appointment:that agreement has been replaced or withdrawn'; end if;
  if a.appointment is null then
    raise exception 'appointment:the seller signed before the appointment form (Form 9) was part of the agreement. Send them their agreement link to sign it again';
  end if;
  if a.countersigned_at is not null then
    raise exception 'appointment:already countersigned by % on %', a.countersigned_name, to_char(a.countersigned_at at time zone 'Australia/Brisbane', 'FMDD Mon YYYY');
  end if;
  if a.ends_at <= now() then raise exception 'appointment:it has already ended'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'appointment:type your full name to sign for Super Trucker'; end if;
  -- the same appointment on a relisted copy of the vehicle (relist_core copies the signed agreement)
  update seller_agreements set countersigned_at = now(), countersigned_by = auth.uid(), countersigned_name = trim(p_name)
   where status = 'signed' and countersigned_at is null and seller_id = a.seller_id and signed_at = a.signed_at;
  return jsonb_build_object('lot_id', a.lot_id, 'seller_id', a.seller_id);
end $$;
revoke execute on function public.admin_countersign_appointment(uuid, text) from public, anon;
grant execute on function public.admin_countersign_appointment(uuid, text) to authenticated, service_role;

-- The server calls this once the signed copy has gone to the seller (emailed as a PDF).
create or replace function public.appointment_copy_sent(p_agreement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a seller_agreements%rowtype;
begin
  select * into a from seller_agreements where id = p_agreement;
  if not found or a.countersigned_at is null then raise exception 'appointment:countersign it first'; end if;
  update seller_agreements set copy_sent_at = now() where status = 'signed' and seller_id = a.seller_id and signed_at = a.signed_at;
end $$;
revoke execute on function public.appointment_copy_sent(uuid) from public, anon, authenticated;
grant execute on function public.appointment_copy_sent(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Ending it on 30 days' written notice (either side). Sooner only by agreement in writing: a withdrawal (seller
--    agreement s 8), which staff handle as before.
-- ---------------------------------------------------------------------------
create or replace function public.appointment_notice_core(p_lot bigint, p_by text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a seller_agreements%rowtype; v_end timestamptz; v_late jsonb := '[]'::jsonb; l record; v_at timestamptz; v_title text;
begin
  if p_by not in ('seller', 'us') then raise exception 'appointment:who is giving notice?'; end if;
  select * into a from seller_agreements where lot_id = p_lot and status = 'signed' order by signed_at desc limit 1 for update;
  if not found then raise exception 'appointment:there''s no signed appointment for this vehicle'; end if;
  if a.notice_at is not null then
    return jsonb_build_object('ends_at', a.ends_at, 'already', true, 'by', a.notice_by);
  end if;
  if a.ends_at <= now() then raise exception 'appointment:it has already ended'; end if;
  v_end := least(a.ends_at, now() + interval '30 days');
  update seller_agreements set notice_at = now(), notice_by = p_by, notice_note = nullif(left(trim(coalesce(p_note, '')), 300), ''), ends_at = v_end
   where status = 'signed' and seller_id = a.seller_id and signed_at = a.signed_at;
  -- listings under this appointment with an auction after the end: the live room won't offer them, so take them out
  for l in select x.id, x.title, x.sale_id, x.ends_at from lots x
            where x.id in (select lot_id from seller_agreements where status = 'signed' and seller_id = a.seller_id and signed_at = a.signed_at)
              and x.status in ('draft', 'scheduled', 'live') loop
    v_at := coalesce((select starts_at from sales where id = l.sale_id and mode = 'live'), l.ends_at);
    if v_at is not null and v_at >= v_end then
      v_late := v_late || jsonb_build_object('lot', l.id, 'title', l.title, 'auction', v_at);
    end if;
  end loop;
  select title into v_title from lots where id = p_lot;
  perform queue_staff_email(p_lot,
    case when p_by = 'seller' then 'Seller gave notice ending their appointment' else 'We gave notice ending a seller''s appointment' end,
    format('%s: the appointment (Form 9) ends on %s, 30 days after the notice.%s', coalesce(v_title, 'Lot ' || p_lot),
      to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY'),
      case when jsonb_array_length(v_late) > 0 then ' Its auction is after that: take it out of that auction (the live room won''t offer it), or agree a sooner end in writing.' else '' end),
    '/admin/lots/' || p_lot, 'appointment-notice:' || a.id);
  perform queue_seller_notice(p_lot, 'Your appointment of Super Trucker ends ' || to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon'),
    case when p_by = 'seller'
      then format('We''ve received your notice. Your appointment of Super Trucker to sell %s ends on %s, 30 days from today. Until then it carries on as agreed. To end it sooner, call us: a withdrawal after it''s listed has the fee in your agreement (section 8).', coalesce(v_title, 'your vehicle'), to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY'))
      else format('This is our written notice: your appointment of Super Trucker to sell %s ends on %s, 30 days from today. Until then it carries on as agreed. Call us with any questions.', coalesce(v_title, 'your vehicle'), to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY')) end,
    '/sell/dashboard', 'appointment-notice:' || a.id);
  return jsonb_build_object('ends_at', v_end, 'late', v_late, 'already', false, 'by', p_by);
end $$;
revoke execute on function public.appointment_notice_core(bigint, text, text) from public, anon, authenticated;
grant execute on function public.appointment_notice_core(bigint, text, text) to service_role;

create or replace function public.seller_end_appointment(p_lot bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from seller_agreements where lot_id = p_lot and status = 'signed' and seller_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  return appointment_notice_core(p_lot, 'seller', null);
end $$;
revoke execute on function public.seller_end_appointment(bigint) from public, anon;
grant execute on function public.seller_end_appointment(bigint) to authenticated, service_role;

create or replace function public.admin_end_appointment(p_lot bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  return appointment_notice_core(p_lot, 'us', p_note);
end $$;
revoke execute on function public.admin_end_appointment(bigint, text) from public, anon;
grant execute on function public.admin_end_appointment(bigint, text) to authenticated, service_role;

-- What the seller's dashboard shows about their appointment (never another seller's).
create or replace function public.seller_lot_appointment(p_lot bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'signed_at', a.signed_at, 'countersigned_at', a.countersigned_at, 'countersigned_name', a.countersigned_name,
    'copy_sent_at', a.copy_sent_at, 'ends_at', a.ends_at, 'notice_at', a.notice_at, 'notice_by', a.notice_by, 'has_form', a.appointment is not null)
  from seller_agreements a
  where a.lot_id = p_lot and a.status = 'signed' and a.seller_id = auth.uid()
  order by a.signed_at desc limit 1
$$;
revoke execute on function public.seller_lot_appointment(bigint) from public, anon;
grant execute on function public.seller_lot_appointment(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. What a listing needs before it goes live: migration 36's checks, with the appointment's term (90 days, or sooner
--    after notice) in place of the bare 90 days, and the appointment countersigned and copied to the seller.
-- ---------------------------------------------------------------------------
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[]; v_w jsonb; s public.sales%rowtype; v_basis text; v_cert text; v_day date; v_auth_end timestamptz; v_sale_at timestamptz;
  v_today date := (now() at time zone 'Australia/Brisbane')::date; v_exempt boolean; v_notice boolean; v_ag public.seller_agreements%rowtype;
begin
  if new.status in ('live','scheduled') and (tg_op = 'INSERT' or old.status = 'draft') then
    if current_user in ('authenticated','service_role','anon') then
      -- we never give a statutory warranty: a listing that would carry one isn't published. In the ACT a dealer's duty to
      -- repair applies even at auction, so a vehicle it could cover can't be listed there.
      if new.statutory_warranty is true then
        raise exception 'not_ready:we never give a statutory warranty, so a vehicle that would carry one can''t be listed. Choose "Doesn''t apply" only if none does';
      end if;
      if upper(coalesce(new.state, '')) = 'ACT' or upper(coalesce(new.rego_state, '')) = 'ACT' then
        v_w := warranty_free_for('ACT', new.year, new.odometer, new.category, new.gvm_kg);
        if v_w->>'free' is null then
          raise exception 'not_ready:%', v_w->>'why';
        elsif not (v_w->>'free')::boolean then
          raise exception 'not_ready:%. In the ACT it applies even at auction, and we never give a statutory warranty, so it can''t be listed', v_w->>'why';
        end if;
      end if;
      if new.relisted_from is not null and exists (select 1 from public.second_chance_offers
           where lot_id = new.relisted_from and status in ('pending','cooling_off')) then
        raise exception 'not_ready:the last listing (lot %) has an open offer to sell it after the auction. Wait for the answer (or withdraw the offer) before this goes live', new.relisted_from;
      end if;
      if live_only() then
        if new.method is distinct from 'auction' then
          raise exception 'not_ready:every vehicle is sold in a live auction. Change it from a tender to an auction';
        end if;
        if new.buy_now_price is not null then
          raise exception 'not_ready:every vehicle is sold in a live auction. Remove the Buy Now price';
        end if;
        select * into s from sales where id = new.sale_id;
        if not found or s.mode <> 'live' then
          raise exception 'not_ready:choose the live auction it will be offered in';
        end if;
        if s.live_status = 'ended' then
          raise exception 'not_ready:that live auction has finished. Choose a later one';
        end if;
        if new.estimate_low is null or new.estimate_high is null then
          raise exception 'not_ready:add the auction estimate (low and high)';
        end if;
        select estimate_basis into v_basis from lot_private where lot_id = new.id;
        if char_length(trim(coalesce(v_basis, ''))) < 20 then
          raise exception 'not_ready:write down what the estimate is based on (recent sales of similar vehicles, a price guide). It''s kept on file, not shown';
        end if;
      end if;
      select coalesce((value->>'require_checks')::boolean, true) into v_req from settings where key = 'selling';
      if coalesce(v_req, true) then
        if new.seller_id is null or not exists (select 1 from seller_agreements where lot_id = new.id and seller_id = new.seller_id and status = 'signed') then
          raise exception 'not_ready:the seller hasn''t signed the agency agreement';
        end if;
        -- the appointment is the seller's written authority to sell: 90 days from signing, or 30 days after either side
        -- gives notice (seller agreement ss 1, 8). The auction must fall inside it, relisted or not.
        select max(coalesce(ends_at, signed_at + interval '90 days')), bool_or(notice_at is not null) into v_auth_end, v_notice
          from seller_agreements where lot_id = new.id and seller_id = new.seller_id and status = 'signed';
        v_sale_at := coalesce((select starts_at from sales where id = new.sale_id and mode = 'live'), new.ends_at);
        if v_auth_end is not null and v_sale_at is not null and v_sale_at >= v_auth_end then
          if coalesce(v_notice, false) then
            raise exception 'not_ready:the seller''s appointment ends on % (after 30 days'' notice), before this auction on %. Choose an earlier auction, or don''t list it',
              to_char(v_auth_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY'), to_char(v_sale_at at time zone 'Australia/Brisbane', 'FMDD Mon YYYY');
          end if;
          raise exception 'not_ready:the seller''s authority to sell ends on % (90 days after they signed), before this auction on %. Ask them to sign the agreement again',
            to_char(v_auth_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY'), to_char(v_sale_at at time zone 'Australia/Brisbane', 'FMDD Mon YYYY');
        end if;
        if not exists (select 1 from profiles where id = new.seller_id and id_status = 'verified') then
          raise exception 'not_ready:the seller hasn''t verified their ID';
        end if;
        if (select ownership_checked_at from lot_private where lot_id = new.id) is null then
          raise exception 'not_ready:ownership papers haven''t been checked';
        end if;
        if coalesce(new.vin, '') = '' or new.ppsr_checked_at is null then
          raise exception 'not_ready:add the VIN and the PPSR search result';
        end if;
        if new.write_off_status = 'unknown' then
          raise exception 'not_ready:record the written-off check result (from the PPSR search)';
        end if;
        if new.registration is null then
          raise exception 'not_ready:say whether the vehicle is registered or unregistered';
        end if;
        if new.registration = 'registered' and new.write_off_status = 'statutory' then
          raise exception 'not_ready:a statutory write-off can never be registered. List it as unregistered (parts or recycling only)';
        end if;
        if new.registration = 'registered' and (coalesce(new.rego_plate, '') = '' or new.rego_state is null or new.rego_expiry is null) then
          raise exception 'not_ready:add the rego plate, state and expiry date';
        end if;
        if new.registration = 'registered' and new.rego_expiry < current_date then
          raise exception 'not_ready:the registration has expired. Renew it, or list the vehicle as unregistered';
        end if;
        if new.runs is null then
          raise exception 'not_ready:say whether it starts and drives (or that it wasn''t tested)';
        end if;
        -- a truck's GVM decides the licence its buyer needs and the certificate its state asks for
        if new.category in ('trucks', 'buses') and new.gvm_kg is null then
          raise exception 'not_ready:add the GVM (gross vehicle mass, from the compliance plate). It decides the licence a buyer needs to drive it away and the certificate the state asks for';
        end if;
        if new.collect_from = 'seller' then
          if coalesce(new.suburb, '') = '' or coalesce(new.postcode, '') = '' then
            raise exception 'not_ready:add the suburb and postcode where it is kept (the listing shows the suburb, never the street)';
          end if;
          if coalesce((select seller_address from lot_private where lot_id = new.id), '') = '' then
            raise exception 'not_ready:add the address where it is kept (given only to a buyer with a confirmed viewing or collection)';
          end if;
        else
          if new.depot_id is null or not exists (select 1 from depots where id = new.depot_id and active) then
            raise exception 'not_ready:choose the depot the buyer collects it from';
          end if;
          if new.transport_fee is null then
            raise exception 'not_ready:enter the transport amount (the pickup from the seller to the depot, from the transport quote)';
          end if;
          if coalesce((select seller_address from lot_private where lot_id = new.id), '') = '' then
            raise exception 'not_ready:add the pickup address (where our transport partner collects it)';
          end if;
        end if;
        if new.statutory_warranty is null then
          raise exception 'not_ready:say whether a statutory warranty applies (it must be stated before bidding opens)';
        end if;
        select array_agg(k) into v_missing from unnest(listing_check_keys()) k where not (k = any(new.verified));
        if v_missing is not null then
          raise exception 'not_ready:tick every listing check against the seller''s photos, video and records (still to do: %)', array_to_string(v_missing, ', ');
        end if;
        if new.stolen_clear is false then
          raise exception 'not_ready:the PPSR shows this vehicle as stolen. Do not list it; contact the police';
        end if;
        v_day := coalesce((select (starts_at at time zone 'Australia/Brisbane')::date from sales where id = new.sale_id),
                          (new.ends_at at time zone 'Australia/Brisbane')::date, v_today);
        v_exempt := coalesce(new.roadworthy_note, '') ~* '^\s*exempt';
        -- New South Wales: sold without plates, the reason is shown with it
        if upper(coalesce(new.state, '')) = 'NSW' and new.registration = 'unregistered'
           and char_length(trim(coalesce(new.plates_note, ''))) < 10 then
          raise exception 'not_ready:in New South Wales a vehicle sold without number plates needs the reason shown with it. Say why it has none (for example: registration expired in March, plates handed in, receipt on file)';
        end if;
        -- the certificate the state needs: to transfer the registration, or (New South Wales) to auction it with plates on
        if new.registration = 'registered' then
          v_cert := roadworthy_needed(case when upper(coalesce(new.state, '')) = 'NSW' then 'NSW' else coalesce(new.rego_state, new.state) end,
                                      new.year, new.category, new.gvm_kg);
          if v_cert = 'inspection report' and new.roadworthy_issued_on is null and not v_exempt then
            raise exception 'not_ready:in New South Wales a vehicle can''t be auctioned with its plates on unless a current inspection report is shown with it. Record the report''s date and add a photo of the report to the listing; or start the roadworthy note with "Exempt" if the registration was first issued or renewed within 90 days of the auction; or list it without plates (unregistered)';
          end if;
          if v_cert is not null and new.roadworthy_issued_on is null and not v_exempt then
            raise exception 'not_ready:a vehicle registered in % needs a current % before the registration can be transferred. Record the date on the seller''s certificate, start the roadworthy note with "Exempt" and say why, or list it as unregistered',
              coalesce(new.rego_state, new.state), v_cert;
          end if;
          if new.roadworthy_issued_on is not null then
            if new.roadworthy_issued_on > v_today then
              raise exception 'not_ready:the certificate date is in the future';
            end if;
            if v_cert = 'roadworthy certificate' and new.roadworthy_issued_on <= v_day - 30 then
              raise exception 'not_ready:a Victorian roadworthy certificate must be issued less than 30 days before the sale (the auction is on %). Ask the seller for a new one',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
            if v_cert = 'safety certificate' and new.roadworthy_issued_on < (v_day - interval '2 months')::date then
              raise exception 'not_ready:a Queensland safety certificate from a private seller lasts 2 months, so this one won''t be current at the auction on %. Ask the seller for a new one',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
            if v_cert = 'certificate of inspection' and new.roadworthy_issued_on < (v_day - interval '12 months')::date then
              raise exception 'not_ready:a Queensland certificate of inspection lasts 12 months, so this one won''t be current at the auction on %. Ask the seller for a new one',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
            if v_cert = 'inspection report' and new.roadworthy_issued_on < v_day - 42 then
              raise exception 'not_ready:a New South Wales inspection report must be issued within 42 days before the auction (it is on %). Ask the seller for a new one, or list it without plates',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
          end if;
        end if;
        -- the appointment on the approved form (Form 9): signed by the seller, countersigned by us, and their copy sent,
        -- before we act on it (MDCA Act ss 81, 83, 84)
        select * into v_ag from seller_agreements where lot_id = new.id and seller_id = new.seller_id and status = 'signed' order by signed_at desc limit 1;
        if v_ag.appointment is null then
          raise exception 'not_ready:the seller hasn''t signed the appointment form (Form 9). Send them their agreement link to sign it';
        end if;
        if v_ag.countersigned_at is null then
          raise exception 'not_ready:countersign the seller''s appointment (Form 9) for Super Trucker, on this vehicle''s admin page';
        end if;
        if v_ag.copy_sent_at is null then
          raise exception 'not_ready:send the seller their signed copy of the appointment (Form 9) from this vehicle''s admin page. They must have it before we act';
        end if;
      end if;
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The live room never offers a vehicle whose appointment has ended (it's passed in as not offered, like one the
--    auction didn't reach); migration 22's live_advance otherwise unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.live_advance(p_sale bigint, p_lot bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_lot bigint; v_live_only boolean := live_only();
begin
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.mode <> 'live' then raise exception 'not_live_sale'; end if;
  if s.live_status = 'ended' then raise exception 'sale_ended:this live auction has finished'; end if;
  if s.live_status = 'paused' then raise exception 'live_paused'; end if;
  if s.current_lot_id is not null and exists (select 1 from lots where id = s.current_lot_id and status = 'live' and live_state = 'open') then
    raise exception 'live_lot_open:knock down the current vehicle first';
  end if;
  if p_lot is not null then
    select id into v_lot from lots where id = p_lot and sale_id = p_sale and live_state = 'waiting' and status = 'live' for update;
    if v_lot is null then raise exception 'lot_not_waiting:that vehicle isn''t waiting in this sale'; end if;
    if v_live_only and exists (select 1 from lots where id = v_lot and corrected_at > now() - interval '24 hours') then
      raise exception 'corrected_recently:its listing was corrected less than 24 hours ago, so it can''t be offered yet';
    end if;
    if not appointment_in_force(v_lot) then
      raise exception 'appointment_ended:the seller''s appointment has ended, so it can''t be offered';
    end if;
  else
    select id into v_lot from lots where sale_id = p_sale and live_state = 'waiting' and status = 'live'
      and (not v_live_only or corrected_at is null or corrected_at <= now() - interval '24 hours')
      and appointment_in_force(id)
      order by sale_order nulls last, id limit 1 for update skip locked;
  end if;
  if v_lot is null then
    if v_live_only then perform live_pass_unoffered(p_sale); end if;
    update sales set live_status = 'ended', live_ended_at = now(), live_message = 'That''s the end of the sale. Thanks for bidding.',
      live_message_at = now(), updated_at = now() where id = p_sale;
    return null;
  end if;
  update lots set live_state = 'open', extend_seconds = s.extend_seconds, ends_at = now() + make_interval(secs => s.lot_seconds), updated_at = now()
    where id = v_lot;
  update sales set live_status = 'running', current_lot_id = v_lot, live_message = null, live_message_at = now(),
    live_started_at = coalesce(live_started_at, now()), updated_at = now() where id = p_sale;
  perform live_estimates(p_sale);
  return v_lot;
end $$;
revoke execute on function public.live_advance(bigint, bigint) from public, anon, authenticated;
grant execute on function public.live_advance(bigint, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Relisting stays inside the appointment's term (migration 25's relist_auto, with the term in place of 90 days)
-- ---------------------------------------------------------------------------
create or replace function public.relist_auto(p_lot bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_new bigint; v_end timestamptz; v_sale bigint; v_title text; v_at timestamptz;
begin
  if not live_only() then return null; end if;
  select * into l from lots where id = p_lot;
  if not found or l.status <> 'passed' then return null; end if;
  -- a sale cancelled after the hammer also ends 'passed': staff decide what happens to those
  if exists (select 1 from invoices where lot_id = p_lot) then return null; end if;
  if exists (select 1 from lots where relisted_from = p_lot)
     or exists (select 1 from seller_decisions where lot_id = p_lot and action = 'decline_relist') then return null; end if;
  -- an appointment that has ended (or ends within 2 days) leaves nothing to relist under
  if exists (select 1 from seller_agreements where lot_id = p_lot and status = 'signed')
     and not exists (select 1 from seller_agreements where lot_id = p_lot and status = 'signed' and ends_at > now() + interval '2 days') then
    return null;
  end if;
  v_new := relist_core(p_lot);
  select max(coalesce(ends_at, signed_at + interval '90 days')) into v_end from seller_agreements where lot_id = v_new and status = 'signed';
  select s.id, s.title, s.starts_at into v_sale, v_title, v_at from sales s
   where s.mode = 'live' and s.published and s.live_status = 'scheduled'
     and s.starts_at >= now() + interval '2 days'
     and (coalesce(s.state, '') = '' or coalesce(l.state, '') = '' or upper(s.state) = upper(l.state))   -- a sale for several states takes any
     and (v_end is null or s.starts_at < v_end)
   order by s.starts_at limit 1;
  if v_sale is not null then update lots set sale_id = v_sale where id = v_new; end if;
  return jsonb_build_object('lot', v_new, 'sale_id', v_sale, 'sale', v_title, 'starts_at', v_at, 'authority_ends', v_end);
end $$;
revoke execute on function public.relist_auto(bigint) from public, anon, authenticated;
grant execute on function public.relist_auto(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 7. The seller agreement's new version (the Form 9 appointment, the 30-day notice); the buyer's Terms don't change.
--    The licence details Form 9 prints (Part 2) live in settings 'business' (qld_licence_no, qld_licence_expiry).
-- ---------------------------------------------------------------------------
update public.settings set value = value || '{"seller_version":"2026-11-20"}'::jsonb where key = 'terms';
update public.settings set value = value || '{"qld_licence_no":"","qld_licence_expiry":""}'::jsonb
 where key = 'business' and not (value ? 'qld_licence_no');
