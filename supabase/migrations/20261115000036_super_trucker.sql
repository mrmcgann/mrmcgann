-- Super Trucker: trucks only, in Queensland, New South Wales and Western Australia, viewed by appointment at the
-- owner's place and collected from there.
--
-- What changes, and why each one is safe to change:
--
--  1. What we sell and where is a setting (selling.categories, selling.states), checked when a listing is published.
--     Opening Victoria or adding trailers is a change to a setting, not to code.
--  2. A listing is collected from our depot (the old way, still here) or from the seller (the way from now on):
--     lots.collect_from, fixed once bidding opens because bidders rely on it. Collected from the seller there is no
--     tow, no depot leg and nothing in the premium for transport.
--  3. Viewing by appointment is back (migration 21 switched it off). The address is given only for a confirmed
--     booking, to a member whose ID is verified, who has agreed in writing that we introduced them: that agreement,
--     kept on the booking, is what protects our fee now that buyers and sellers meet.
--  4. The buyer's premium is 6% (trucks elsewhere are 9.9% and up), still checked against the market at publish.
--  5. A truck isn't sold after the auction by private treaty: outside an auction the consumer guarantees can apply
--     to a goods vehicle at any price, so it goes under the hammer or into the next auction.
--  6. Two rules of law the engine didn't know: New South Wales won't let a vehicle be auctioned with its plates on
--     unless a current inspection report is shown with it (or sold without plates unless the reason is shown), and
--     Queensland needs a certificate of inspection, not a safety certificate, to transfer a heavy vehicle.
--
-- The law behind each is in docs/legal-basis.md (sections 5, 7, 15 and 16).

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('selling', '{}'::jsonb) on conflict (key) do nothing;
update public.settings set value = value
  || '{"categories": ["trucks"], "states": ["QLD", "NSW", "WA"], "collection": "seller", "viewings": true, "after_auction_heavy": false}'::jsonb
  where key = 'selling';
-- 6% of the price, nothing for transport, still never less than the floor. The benchmark (what a buyer pays
-- elsewhere) stays as migration 35 left it: trucks are measured against 9.9%.
update public.settings set value = value || '{"premium_rate": 0.06}'::jsonb where key = 'fees';
-- How long after a listing ends our fee still applies on a sale to someone we introduced (seller agreement s 2).
update public.settings set value = value || '{"exclusivity_days": 90}'::jsonb where key = 'auction';

create or replace function public.selling_categories() returns text[]
language sql stable set search_path = public as $$
  select coalesce((select array(select jsonb_array_elements_text(value->'categories')) from settings
                   where key = 'selling' and jsonb_typeof(value->'categories') = 'array'), array['trucks']);
$$;
create or replace function public.selling_states() returns text[]
language sql stable set search_path = public as $$
  select coalesce((select array(select upper(jsonb_array_elements_text(value->'states'))) from settings
                   where key = 'selling' and jsonb_typeof(value->'states') = 'array'), array['QLD', 'NSW', 'WA']);
$$;
create or replace function public.collection_mode() returns text
language sql stable set search_path = public as $$
  select case when (select value->>'collection' from settings where key = 'selling') = 'depot' then 'depot' else 'seller' end;
$$;
create or replace function public.viewings_on() returns boolean
language sql stable set search_path = public as $$
  select coalesce((select (value->>'viewings')::boolean from settings where key = 'selling'), true);
$$;
create or replace function public.exclusivity_days() returns int
language sql stable set search_path = public as $$
  select coalesce((select (value->>'exclusivity_days')::int from settings where key = 'auction'), 90);
$$;

-- ---------------------------------------------------------------------------
-- 2. Where a listing is collected from
-- ---------------------------------------------------------------------------
alter table public.lots add column if not exists collect_from text check (collect_from in ('depot', 'seller'));
-- Everything listed before today was sold on the depot promise, and keeps it.
update public.lots set collect_from = 'depot' where collect_from is null;
alter table public.lots alter column collect_from set not null;

-- New South Wales: why a vehicle sold without plates has none (Motor Dealers and Repairers Act 2013 s 59).
alter table public.lots add column if not exists plates_note text;

-- Viewing by appointment is offered again.
alter table public.lots drop constraint if exists lots_no_viewings;

/* Runs first of the lot triggers (the name sorts before the others), so the rest can rely on collect_from.
   Collected from the seller there is no depot and nothing for transport: saying so here means a stray depot or
   transport amount on a draft can't leak a depot's suburb onto the listing or a tow into the premium. */
create or replace function public.lot_collect_rules() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.collect_from := coalesce(new.collect_from, collection_mode());
    if new.collect_from = 'seller' and viewings_on() then new.in_person_viewing := true; end if;
  elsif new.collect_from is distinct from old.collect_from and old.status not in ('draft', 'scheduled') then
    raise exception 'collect_locked:where a vehicle is collected from can''t change once bidding has opened';
  end if;
  -- What we sell, and where we're licensed to sell it. Checked here, first, so staff are told the real reason and
  -- not whatever a later check (the fee comparison, say) makes of a category we don't price for.
  if new.status in ('live', 'scheduled') and (tg_op = 'INSERT' or old.status = 'draft')
     and current_user in ('authenticated', 'service_role', 'anon')
     and coalesce((select (value->>'require_checks')::boolean from settings where key = 'selling'), true) then
    if not (coalesce(new.category, '') = any(selling_categories())) then
      raise exception 'not_ready:we only sell % for now, and this is listed under %',
        array_to_string(selling_categories(), ', '), coalesce(nullif(new.category, ''), 'no category');
    end if;
    if not (upper(coalesce(new.state, '')) = any(selling_states())) then
      raise exception 'not_ready:we sell in % only for now, and this one is in %',
        array_to_string(selling_states(), ', '), coalesce(nullif(upper(new.state), ''), 'no state');
    end if;
  end if;
  if new.collect_from = 'seller' then
    if new.depot_id is not null then
      raise exception 'not_ready:this vehicle is collected from the seller, so it has no depot. Remove the depot';
    end if;
    if coalesce(new.transport_fee, 0) <> 0 then
      raise exception 'not_ready:this vehicle is collected from the seller, so there is no transport amount. Remove it';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lot_0_collect_rules on public.lots;
create trigger lot_0_collect_rules before insert or update on public.lots
  for each row execute function public.lot_collect_rules();

-- ---------------------------------------------------------------------------
-- 3. The certificate a state needs
-- ---------------------------------------------------------------------------
/* Two additions.
   Queensland: a heavy vehicle (over 4.5 t GVM) is transferred on a certificate of inspection, not a safety
   certificate (qld.gov.au, "Selling a used vehicle").
   New South Wales: nothing is needed to TRANSFER a current registration, but a vehicle can't be offered or sold
   by auction with a number-plate attached unless a current inspection report (42 days) is shown with it
   (Motor Dealers and Repairers Act 2013 ss 55-57; Regulation 2025 cl 55). Same field, same date, different reason. */
create or replace function public.roadworthy_needed(p_state text, p_year int, p_category text, p_gvm int) returns text
language sql stable set search_path = public as $$
  select case
    when p_category in ('boats', 'machinery') then null
    when upper(coalesce(p_state, '')) = 'QLD' and (p_category in ('cars', 'utes', 'vans', 'motorbikes')
         or (p_category in ('caravans', 'trailers') and coalesce(p_gvm, 750) between 750 and 4500)
         or (p_category in ('trucks', 'buses') and coalesce(p_gvm, 4500) <= 4500)) then 'safety certificate'
    when upper(coalesce(p_state, '')) = 'QLD' and (p_category in ('trucks', 'buses')
         or (p_category in ('caravans', 'trailers') and coalesce(p_gvm, 0) > 4500)) then 'certificate of inspection'
    when upper(coalesce(p_state, '')) = 'NSW' then 'inspection report'
    when upper(coalesce(p_state, '')) = 'VIC' and (p_category in ('cars', 'utes', 'vans', 'motorbikes', 'trucks', 'buses')
         or (p_category in ('caravans', 'trailers') and coalesce(p_gvm, 0) > 4500)) then 'roadworthy certificate'
    when upper(coalesce(p_state, '')) = 'ACT' and coalesce(extract(year from current_date)::int - p_year, 99) >= 6
         and (p_category in ('cars', 'utes', 'vans', 'motorbikes', 'caravans', 'trailers')
              or (p_category in ('trucks', 'buses') and coalesce(p_gvm, 4500) <= 4500)) then 'roadworthy inspection'
    when upper(coalesce(p_state, '')) = 'NT' and coalesce(extract(year from current_date)::int - p_year, 99) >= 7
         and (p_category in ('cars', 'utes', 'vans', 'motorbikes')
              or (p_category in ('trucks', 'buses') and coalesce(p_gvm, 4500) <= 4500)) then 'roadworthy inspection'
    when upper(coalesce(p_state, '')) = 'SA' and coalesce(extract(year from current_date)::int - p_year, 99) >= 3
         and (p_category in ('caravans', 'trailers') or (p_category in ('trucks', 'buses') and coalesce(p_gvm, 4501) > 4500)) then 'inspection'
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. What a listing needs before it goes live
-- ---------------------------------------------------------------------------
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[]; v_w jsonb; s public.sales%rowtype; v_basis text; v_cert text; v_day date; v_auth_end timestamptz; v_sale_at timestamptz;
  v_today date := (now() at time zone 'Australia/Brisbane')::date; v_exempt boolean;
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
        -- the agreement is the seller's written authority to sell, for 90 days from signing (seller agreement s 1; in the ACT
        -- a non-trade owner's written authority lapses after 90 days): the auction must fall inside it, relisted or not
        select max(signed_at) + interval '90 days' into v_auth_end from seller_agreements where lot_id = new.id and seller_id = new.seller_id and status = 'signed';
        v_sale_at := coalesce((select starts_at from sales where id = new.sale_id and mode = 'live'), new.ends_at);
        if v_auth_end is not null and v_sale_at is not null and v_sale_at >= v_auth_end then
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
      end if;
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;

-- The fee check's refusal no longer blames a tow that may not exist.
create or replace function public.lot_fees_snapshot() returns trigger language plpgsql set search_path = public as $$
declare v_at numeric;
begin
  if new.status = 'draft' then new.fees := null;
  elsif new.status in ('scheduled','live') and new.fees is null then
    select value || jsonb_build_object('transport', coalesce(new.transport_fee, 0)) into new.fees from settings where key = 'fees';
    v_at := coalesce(new.estimate_low, new.buy_now_price);
    if v_at is not null and not beats_market(v_at, new.fees, new.category) then
      if coalesce(new.transport_fee, 0) > 0 then
        raise exception 'over_market:the all-in would cost a buyer more than they would pay elsewhere at %, mostly because of the % transport. Lower the transport amount or price it lower.',
          v_at, new.transport_fee;
      end if;
      raise exception 'over_market:at % our buyer''s premium would be more than a buyer pays elsewhere (the minimum premium is the reason). It is too cheap to list.', v_at;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Viewing by appointment, and the record that we made the introduction
-- ---------------------------------------------------------------------------
-- What the member agreed to when they asked, word for word, with the terms version and the moment: this row is
-- the evidence that a buyer met a seller through us. address_sent_at is when the address left our hands.
alter table public.viewings add column if not exists ack_text text;
alter table public.viewings add column if not exists ack_version text;
alter table public.viewings add column if not exists ack_at timestamptz;
alter table public.viewings add column if not exists address_sent_at timestamptz;

/* The acknowledgement, in one place. src/lib/viewings.ts (viewingAck) says the same thing word for word, and the
   database test holds the two together. */
create or replace function public.viewing_ack_text() returns text
language sql stable set search_path = public as $$
  select 'I''m asking Super Trucker to introduce me to this vehicle and its owner. If I buy it from the owner other than through Super Trucker, while it''s listed or within '
    || exclusivity_days() || ' days after, I''ll pay Super Trucker the buyer''s premium on the price I pay. I won''t make the owner an offer or ask them to deal direct. '
    || 'The address is for this viewing only and I won''t share it. Super Trucker gives the owner my name so they know who''s coming. '
    || 'Super Trucker won''t be there: I follow the owner''s site rules and take care around the vehicle. Looking it over and hearing it run only, no road test.';
$$;

drop function if exists public.request_viewing(bigint, text, jsonb, text);
create or replace function public.request_viewing(p_lot bigint, p_kind text, p_slots jsonb, p_note text default null, p_ack boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); p record; l record; v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_last date; s jsonb; v_slots jsonb := '[]'::jsonb; v_id uuid; v_ref text; v_admins uuid[]; v_sale timestamptz;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  -- viewing is at the owner's place, in person. Video calls with an owner aren't offered.
  if not viewings_on() or p_kind is distinct from 'in_person' then raise exception 'viewing_not_offered'; end if;
  select id, suspended, mobile_verified, first_name, last_name into p from profiles where id = v_uid;
  if p.suspended then raise exception 'account_suspended'; end if;
  select id, title, status, ends_at, seller_id, in_person_viewing, collect_from, suburb, state, sale_id, live_state into l from lots where id = p_lot;
  if not found or l.status not in ('live', 'scheduled') or coalesce(l.live_state, 'waiting') <> 'waiting' then raise exception 'viewing_closed'; end if;
  if l.collect_from <> 'seller' or not l.in_person_viewing then raise exception 'viewing_in_person_off'; end if;
  if l.seller_id = v_uid then raise exception 'viewing_own_vehicle'; end if;
  -- the owner is told who is coming, so we need to know: the same checks as bidding
  if not can_bid(v_uid) then raise exception 'viewing_needs_id'; end if;
  if not coalesce(p_ack, false) then raise exception 'viewing_ack'; end if;
  -- offered times: 1 to 3, from tomorrow, no more than 14 days out and no later than the day before the auction
  select starts_at into v_sale from sales where id = l.sale_id and mode = 'live';
  v_last := least(v_today + 14, coalesce((v_sale at time zone 'Australia/Brisbane')::date - 1, (l.ends_at at time zone 'Australia/Brisbane')::date, v_today + 14));
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) not between 1 and 3 then raise exception 'viewing_times'; end if;
  for s in select * from jsonb_array_elements(p_slots) loop
    if s->>'part' not in ('morning', 'afternoon', 'evening') or (s->>'day') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'viewing_times'; end if;
    if (s->>'day')::date < v_today + 1 or (s->>'day')::date > v_last then raise exception 'viewing_times_range'; end if;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object('day', s->>'day', 'part', s->>'part'));
  end loop;
  -- one open request per vehicle, five open across the site, ten requests a day
  perform pg_advisory_xact_lock(hashtext('viewing:' || v_uid::text));
  if exists (select 1 from viewings where user_id = v_uid and lot_id = p_lot and status in ('requested', 'confirmed')) then
    raise exception 'viewing_already';
  end if;
  if (select count(*) from viewings where user_id = v_uid and status in ('requested', 'confirmed')) >= 5 then raise exception 'viewing_too_many'; end if;
  if (select count(*) from viewings where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then raise exception 'viewing_too_many'; end if;
  insert into viewings (lot_id, user_id, kind, slots, note, ack_text, ack_version, ack_at)
    values (p_lot, v_uid, 'in_person', v_slots, left(nullif(trim(p_note), ''), 500), viewing_ack_text(),
            (select value->>'buyer_version' from settings where key = 'terms'), now())
    returning id, ref into v_id, v_ref;
  select array_agg(id) into v_admins from profiles where role = 'admin';
  if v_admins is not null then
    perform queue_notice_many(v_admins, 'staff', 'Viewing request ' || v_ref,
      coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' would like to view the ' || l.title || ' (' || l.suburb || ', ' || l.state
        || '). Agree a time with the owner, then confirm it in Admin → Viewings: that sends them the address.',
      '/admin/viewings', 'viewing-new:' || v_id);
  end if;
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;
revoke execute on function public.request_viewing(bigint, text, jsonb, text, boolean) from public, anon;
grant execute on function public.request_viewing(bigint, text, jsonb, text, boolean) to authenticated, service_role;

/* Staff confirm a time they have agreed with the owner. This is the one place the address is given out before a
   sale: to this member, for this booking. The owner is told who is coming, by name, and that we introduced them:
   that sentence, in writing, at the time, is what seller agreement section 2 relies on. */
create or replace function public.admin_viewing(p_id uuid, p_action text, p_starts timestamptz default null, p_host text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record; v_when text; v_addr text; v_notes text; v_name text;
begin
  if not is_admin() and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select w.*, l.title, l.suburb, l.state, l.status lot_status into v from viewings w join lots l on l.id = w.lot_id where w.id = p_id for update of w;
  if not found then raise exception 'viewing_not_found'; end if;
  if p_action = 'confirm' then
    if v.status not in ('requested', 'confirmed') then raise exception 'viewing_not_open'; end if;
    if p_starts is null or p_starts < now() then raise exception 'viewing_time'; end if;
    select seller_address, pickup_notes into v_addr, v_notes from lot_private where lot_id = v.lot_id;
    if coalesce(trim(v_addr), '') = '' then raise exception 'viewing_no_address'; end if;
    update viewings set status = 'confirmed', starts_at = p_starts, host = 'seller', staff_note = coalesce(left(p_note, 500), staff_note),
      reminded_at = null, address_sent_at = now(), status_at = now() where id = p_id;
    v_when := to_char(p_starts at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') || ' (Brisbane time)';
    select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into v_name from profiles where id = v.user_id;
    perform queue_notice(v.user_id, 'account', 'Viewing booked: ' || v.title,
      v_when || ' at ' || v_addr || '.' || coalesce(' ' || nullif(trim(v_notes), ''), '')
        || ' Bring photo ID and this reference: ' || v.ref || '. Look it over and hear it run; no road test. Bring a mechanic if you like. '
        || 'Keep the address to yourself, and keep any talk of price for the auction: you agreed when you booked that every sale goes through Super Trucker. '
        || 'Can''t make it? Cancel from the listing so nobody waits.' || coalesce(' ' || nullif(trim(p_note), ''), ''),
      '/lot/' || v.lot_id, 'viewing-confirm:' || p_id || ':' || extract(epoch from p_starts)::bigint);
    perform queue_seller_notice(v.lot_id, 'Viewing booked: ' || v.title,
      coalesce(nullif(v_name, ''), 'A verified member') || ' will come to view it on ' || v_when || ' (booking ' || v.ref || '). They''ll show photo ID. '
        || 'We introduced them to you, like everyone we send: section 2 of your agreement covers a sale to them. '
        || 'Let them look it over and hear it run; no road test. If they, or anyone, ask to buy it direct, say no and tell us. Can''t do that time? Call us straight away.',
      '/sell/dashboard', 'viewing-seller:' || p_id || ':' || extract(epoch from p_starts)::bigint);
  elsif p_action = 'decline' then
    if v.status not in ('requested', 'confirmed') then return; end if;
    update viewings set status = 'declined', staff_note = left(p_note, 500), status_at = now() where id = p_id;
    perform queue_notice(v.user_id, 'account', 'We couldn''t book your viewing',
      'For ' || v.title || ': ' || coalesce(nullif(p_note, ''), 'none of the times worked.') || ' You can ask for other times on the listing.',
      '/lot/' || v.lot_id, 'viewing-decline:' || p_id);
    if v.status = 'confirmed' then
      perform queue_seller_notice(v.lot_id, 'Viewing cancelled: ' || v.title,
        'The viewing for ' || to_char(v.starts_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') || ' is off. Nobody will come.',
        '/sell/dashboard', 'viewing-cancel:' || p_id);
    end if;
  elsif p_action in ('done', 'no_show') then
    if v.status <> 'confirmed' then raise exception 'viewing_not_confirmed'; end if;
    update viewings set status = p_action, staff_note = coalesce(left(p_note, 500), staff_note), status_at = now() where id = p_id;
  else
    raise exception 'viewing_action';
  end if;
end $$;
revoke execute on function public.admin_viewing(uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_viewing(uuid, text, timestamptz, text, text) to authenticated, service_role;

-- The reminders and the tidy-up, without the video wording.
create or replace function public.viewing_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v record; n int := 0;
begin
  for v in select w.*, l.title from viewings w join lots l on l.id = w.lot_id
           where w.status = 'confirmed' and w.reminded_at is null and w.starts_at between now() and now() + interval '75 minutes'
           order by w.starts_at limit 200 for update of w skip locked loop
    update viewings set reminded_at = now() where id = v.id;
    perform queue_notice(v.user_id, 'account', 'Soon: your viewing of ' || v.title,
      'At ' || to_char(v.starts_at at time zone 'Australia/Brisbane', 'FMHH12:MI am') || ' (Brisbane time). Bring photo ID and your reference ' || v.ref
        || '. Can''t make it? Cancel from the listing.', '/lot/' || v.lot_id, 'viewing-remind:' || v.id);
    perform queue_seller_notice(v.lot_id, 'Viewing soon: ' || v.title,
      'Your visitor is due at ' || to_char(v.starts_at at time zone 'Australia/Brisbane', 'FMHH12:MI am') || ' (booking ' || v.ref || '). Looking and listening only, no road test.',
      '/sell/dashboard', 'viewing-remind-seller:' || v.id);
    n := n + 1;
  end loop;
  with gone as (
    update viewings w set status = 'cancelled', staff_note = 'The vehicle is no longer open for viewing', status_at = now()
    from lots l where l.id = w.lot_id and w.status in ('requested', 'confirmed')
      and (l.status not in ('live', 'scheduled') or coalesce(l.live_state, 'waiting') <> 'waiting')
    returning w.id
  )
  select n + count(*) into n from gone;
  return n;
end $$;
revoke execute on function public.viewing_sweep() from public, anon, authenticated;
grant execute on function public.viewing_sweep() to service_role;

/* Everyone we can show we introduced to a vehicle, for staff, when a seller sells around us.
   A viewing with the address sent is the strongest; a bid or an offer shows they found it through us. */
create or replace function public.lot_introductions(p_lot bigint)
returns table (user_id uuid, name text, how text, at timestamptz, ref text)
language sql stable security definer set search_path = public as $$
  select x.user_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), x.how, x.at, x.ref
  from (
    select w.user_id, 'viewing' as how, coalesce(w.address_sent_at, w.created_at) as at, w.ref
      from viewings w where w.lot_id = p_lot and w.address_sent_at is not null
    union all
    select m.bidder_id, 'bid', min(m.first_set_at), null from max_bids m where m.lot_id = p_lot group by m.bidder_id
    union all
    select b.bidder_id, 'bid', min(b.created_at), null from bids b where b.lot_id = p_lot
      and not exists (select 1 from max_bids m where m.lot_id = p_lot and m.bidder_id = b.bidder_id) group by b.bidder_id
    union all
    select o.user_id, 'offer', min(o.created_at), null from second_chance_offers o where o.lot_id = p_lot group by o.user_id
  ) x join profiles p on p.id = x.user_id
  where (select is_admin())
  order by x.at;
$$;
revoke execute on function public.lot_introductions(bigint) from public, anon;
grant execute on function public.lot_introductions(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Paid for, then collected from the seller
-- ---------------------------------------------------------------------------
create or replace function public.start_ownership_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record; v_reg text; n int; d record; v_where text; v_job text; v_admins uuid[];
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select title, registration, rego_plate, rego_state, state, suburb, depot_id, collect_from into l from lots where id = new.lot_id;
    v_reg := coalesce(l.registration, case when coalesce(l.rego_plate, '') <> '' then 'registered' else 'unregistered' end);
    insert into ownership_transfers (invoice_id, lot_id, buyer_id, registration, rego_state)
      values (new.id, new.lot_id, new.buyer_id, v_reg, coalesce(l.rego_state, l.state))
      on conflict (invoice_id) do nothing;
    get diagnostics n = row_count;
    select array_agg(id) into v_admins from profiles where role = 'admin';

    if l.collect_from = 'seller' then
      -- No tow and no depot: the buyer books a time and collects it where it is.
      v_where := coalesce(nullif(l.suburb, '') || ', ' || l.state, 'where it is kept');
      if n > 0 then
        perform queue_notice(new.buyer_id, 'account', 'Paid in full. Here''s what happens next',
          case when v_reg = 'registered'
            then 'Book a time on your invoice to collect the ' || l.title || ' from the seller in ' || v_where || '. Your invoice also has the steps to put it in your name in ' || coalesce(l.rego_state, l.state) || '.'
            else 'The ' || l.title || ' is sold unregistered: say on your invoice how you''ll move it (a carrier, your own float or trailer, or a permit), then book a time to collect it from the seller in ' || v_where || '.' end
          || ' We confirm the time with the seller, then send you the address and your release code.',
          '/account/invoices/' || new.id, 'transfer-start:' || new.id);
        perform queue_seller_notice(new.lot_id, 'Paid in full. Next: the handover',
          'The buyer has paid us for the ' || l.title || '. They''ll book a time to collect it from you, and we''ll agree it with you first. '
            || 'Keep it as it was listed, with all the keys. Hand it over only to the person whose release code works on the handover link we send you, and never take money from anyone: we pay you.'
            || case when v_reg = 'registered' then ' We lodge the notice of disposal for you.' else '' end,
          '/sell/dashboard', 'transfer-seller:' || new.id);
        if v_admins is not null then
          perform queue_notice_many(v_admins, 'staff', 'Paid in full: ' || l.title,
            case when v_reg = 'registered' then 'Lodge the owner''s notice of disposal (Admin → Transfers): the buyer can book a collection once it''s lodged. ' else '' end
              || 'When the buyer asks for a time, agree it with the seller and confirm it in Admin → Collections.',
            case when v_reg = 'registered' then '/admin/transfers' else '/admin/collections' end, 'paid-seller-collect:' || new.id);
        end if;
      end if;
      perform collection_ready(new.id);
      return null;
    end if;

    insert into transport_jobs (invoice_id, lot_id, buyer_id, depot_id) values (new.id, new.lot_id, new.buyer_id, l.depot_id)
      on conflict (invoice_id) do nothing returning ref into v_job;
    select name, suburb, state into d from depots where id = l.depot_id;
    v_where := case when d.suburb is not null then 'our depot in ' || d.suburb || ', ' || d.state else 'our depot' end;
    if n > 0 then
      perform queue_notice(new.buyer_id, 'account', 'Paid in full. Here''s what happens next',
        case when v_reg = 'registered'
          then 'Transfer the registration of the ' || l.title || ' into your name (your invoice has the steps for ' || coalesce(l.rego_state, l.state) || '). Meanwhile our transport partner picks it up and takes it to ' || v_where || '. Once both are done, you book a time to collect it there.'
          else 'The ' || l.title || ' is sold unregistered: confirm the certificate of sale and how you''ll move it. Meanwhile our transport partner picks it up and takes it to ' || v_where || ', where you collect it.' end,
        '/account/invoices/' || new.id, 'transfer-start:' || new.id);
      perform queue_seller_notice(new.lot_id, 'Paid in full. Next: the pickup',
        'The buyer has paid for the ' || l.title || '. Our transport partner will call you to book a time to pick it up'
          || case when v_reg = 'registered' then '. Also lodge your part of the registration transfer in ' || coalesce(l.rego_state, l.state) || ': the steps are in your seller dashboard' else '' end
          || '. Keep it as it was listed, with all the keys. If anyone else contacts you about it, don''t deal with them: tell us.',
        '/sell/dashboard', 'transfer-seller:' || new.id);
    end if;
    if v_job is not null and v_admins is not null then
      perform queue_notice_many(v_admins, 'staff', 'Book a pickup: ' || l.title,
        v_job || ' is paid in full. Book our transport partner to pick it up from the seller and take it to ' || coalesce(d.name, 'a depot (choose one first)') || '. Admin → Transport.',
        '/admin/transport', 'transport-new:' || v_job);
    end if;
  end if;
  return null;
end $$;

-- The depot gate only guards a depot.
create or replace function public.collection_needs_depot() returns trigger
language plpgsql security definer set search_path = public as $$
declare j record;
begin
  if (select collect_from from lots where id = new.lot_id) = 'seller' then return new; end if;
  select status, condition_ok, buyer_decision into j from transport_jobs where invoice_id = new.invoice_id;
  if not found or j.status <> 'at_depot' then raise exception 'not_at_depot'; end if;
  if j.condition_ok is false and j.buyer_decision is distinct from 'proceed' then raise exception 'change_not_answered'; end if;
  return new;
end $$;
revoke execute on function public.collection_needs_depot() from public, anon, authenticated;

/* When the collection window opens. Collected from the seller it opens as soon as the money is in and the
   seller's side is lodged (or there's nothing to lodge): nothing has to travel anywhere first. */
create or replace function public.collection_ready(p_invoice uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare i record; j record; d record; l record; v_by timestamptz;
begin
  select id, buyer_id, lot_id, status, collected_at, collect_by into i from invoices where id = p_invoice for update;
  if not found or i.status <> 'paid' or i.collected_at is not null then return false; end if;
  if not transfer_clear(p_invoice) then return false; end if;
  select title, collect_from, suburb, state into l from lots where id = i.lot_id;
  if l.collect_from = 'seller' then
    if i.collect_by is not null then return true; end if;
    v_by := business_days_from(now(), setting_num('auction','collection_days')::int);
    update invoices set collect_by = v_by where id = p_invoice;
    perform queue_notice(i.buyer_id, 'account', 'Ready to collect: ' || l.title,
      'Book a time to collect it from the seller in ' || coalesce(nullif(l.suburb, '') || ', ' || l.state, 'its home yard') || ' by '
        || to_char(v_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || ' (storage applies after that). We agree the time with the seller, then send you the address and your release code.',
      '/account/invoices/' || p_invoice, 'collect-ready:' || p_invoice);
    return true;
  end if;
  select * into j from transport_jobs where invoice_id = p_invoice;
  if not found or j.status <> 'at_depot' or (j.condition_ok is false and j.buyer_decision is distinct from 'proceed') then return false; end if;
  v_by := greatest(coalesce(i.collect_by, now()), business_days_from(now(), setting_num('auction','collection_days')::int));
  update invoices set collect_by = v_by where id = p_invoice;
  select suburb, state into d from depots where id = j.depot_id;
  perform queue_notice(i.buyer_id, 'account', 'Ready to collect: ' || l.title,
    'It''s at our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || '. Book a time to collect it by '
      || to_char(v_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || ' (storage applies after that). We send the address and your release code once your time is confirmed.',
    '/account/invoices/' || p_invoice, 'collect-ready:' || p_invoice);
  return true;
end $$;
revoke execute on function public.collection_ready(uuid) from public, anon, authenticated;
grant execute on function public.collection_ready(uuid) to service_role;

create or replace function public.collection_released() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_mode text;
begin
  if new.status = 'collected' and old.status is distinct from 'collected' then
    update transport_jobs set status = 'released', released_at = now(), status_at = now() where invoice_id = new.invoice_id and status = 'at_depot';
    select title, collect_from into v_title, v_mode from lots where id = new.lot_id;
    perform queue_seller_notice(new.lot_id, 'Collected by the buyer: ' || v_title,
      case when v_mode = 'seller' then 'The handover is recorded.' else 'The buyer has collected it from our depot.' end
        || ' We pay you once their claim window closes on '
        || to_char(business_days_from(now(), setting_num('auction','claim_days')::int) at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth')
        || ', and send your settlement statement.',
      '/sell/dashboard', 'collected-seller:' || new.id);
  end if;
  return null;
end $$;

/* Where the buyer collects from. The suburb is on the listing already; the street address and the owner's notes
   (who to ask for, the gate) appear only once a collection time is confirmed, and only to this buyer. */
create or replace function public.invoice_pickup(p_invoice uuid)
returns table (collect_from text, suburb text, state text, postcode text, address text, notes text)
language sql stable security definer set search_path = public as $$
  select l.collect_from, l.suburb, l.state, l.postcode,
    case when l.collect_from = 'seller' and c.ok then lp.seller_address end,
    case when l.collect_from = 'seller' and c.ok then lp.pickup_notes end
  from invoices i join lots l on l.id = i.lot_id left join lot_private lp on lp.lot_id = l.id
    cross join lateral (select exists (select 1 from collections c where c.invoice_id = i.id and c.status in ('confirmed', 'collected')) as ok) c
  where i.id = p_invoice and (i.buyer_id = (select auth.uid()) or (select is_admin()))
$$;
revoke execute on function public.invoice_pickup(uuid) from public, anon;
grant execute on function public.invoice_pickup(uuid) to authenticated, service_role;

/* The seller's view of the handover. At a depot the seller isn't involved and sees only that it happened. Where
   the buyer collects from the seller, the seller is the one handing it over: they see the confirmed time, who is
   coming and the handover link. Never the buyer's contact details. */
create or replace function public.seller_lot_collection(p_lot bigint)
returns table (status text, confirmed_for text, collector text, seller_token text, collected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.status,
    case when l.collect_from = 'seller' then c.confirmed_for end,
    case when l.collect_from = 'seller' and c.status in ('confirmed', 'collected')
         then coalesce(nullif(c.collector_name, ''), trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) end,
    case when l.collect_from = 'seller' and c.status = 'confirmed' then c.seller_token end,
    c.collected_at
  from collections c join lots l on l.id = c.lot_id left join profiles p on p.id = c.buyer_id
  where c.lot_id = p_lot and l.seller_id = (select auth.uid()) and c.status <> 'cancelled'
  order by c.created_at desc limit 1;
$$;

-- The handover itself is unchanged; only the buyer's message says where it happened.
create or replace function public.complete_handover(
  p_token text, p_code text, p_odometer int, p_keys int, p_notes text,
  p_left_by text default null, p_permit text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.collections%rowtype; v_claim timestamptz; v_title text; v_unreg boolean; v_can_permit boolean; v_permit text; v_mode text;
begin
  select * into c from collections where seller_token = p_token for update;
  if not found then raise exception 'not_found'; end if;
  if c.status = 'collected' then return jsonb_build_object('ok', true, 'already', true); end if;
  if c.status <> 'confirmed' then raise exception 'not_confirmed'; end if;
  if c.code_attempts >= 5 then raise exception 'too_many_attempts'; end if;
  if p_code is distinct from c.release_code then
    update collections set code_attempts = code_attempts + 1 where id = c.id;
    return jsonb_build_object('ok', false, 'error', case when c.code_attempts + 1 >= 5 then 'too_many_attempts' else 'wrong_code' end);
  end if;

  -- The registration check, after the code so a wrong code still fails first and nobody is asked to establish
  -- anything about a collector who hasn't proved who they are.
  select unregistered, permit_possible into v_unreg, v_can_permit from leaves_unregistered(c.invoice_id);
  if coalesce(v_unreg, false) then
    if coalesce(p_left_by, '') not in ('carrier', 'trailer', 'permit') then
      raise exception 'unreg_how';
    end if;
    if p_left_by = 'permit' then
      -- A written-off vehicle cannot hold a permit, so no number entered against one can be genuine.
      if not coalesce(v_can_permit, false) then raise exception 'unreg_writeoff'; end if;
      v_permit := nullif(trim(coalesce(p_permit, '')), '');
      -- A permit number we have actually been shown. Without it, driving away is an offence and whoever handed
      -- over the keys is the one permitting it, so the handover cannot complete.
      if v_permit is null or length(v_permit) < 4 then raise exception 'unreg_permit'; end if;
    end if;
  end if;

  v_claim := business_days_from(now(), setting_num('auction','claim_days')::int);
  update invoices set collected_at = now(), claim_until = v_claim where id = c.invoice_id;
  update collections set status = 'collected', collected_at = now(),
    handover = jsonb_build_object(
      'odometer', p_odometer, 'keys', p_keys, 'notes', left(coalesce(p_notes, ''), 1000), 'at', now(),
      'unregistered', v_unreg, 'left_by', case when v_unreg then p_left_by else 'driven' end,
      'permit', v_permit)
  where id = c.id;

  select title, collect_from into v_title, v_mode from lots where id = c.lot_id;
  perform queue_notice(c.buyer_id, 'account', 'Collected: ' || v_title,
    case when v_mode = 'seller' then 'Handed over.' else 'Handed over at our depot.' end
      || ' The vehicle is now your responsibility. If something is materially different from the listing, lodge a claim from your invoice by ' ||
    to_char(v_claim at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/account/invoices/' || c.invoice_id, 'collected:' || c.id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 7. A truck is sold under the hammer, not after it
-- ---------------------------------------------------------------------------
/* Selling after the auction is the dealer's private-treaty sale, not a sale by auction. Two things follow for a
   goods vehicle. The consumer guarantees, which don't apply to a sale by auction, can apply to "a vehicle or
   trailer acquired for use principally in the transport of goods on public roads" at any price (Australian
   Consumer Law s 3), so a $150,000 prime mover sold by private treaty can carry them where the same truck under
   the hammer doesn't. And Western Australia's duty to repair covers a goods vehicle with two rows of seats.
   So a truck that's passed in goes into the next auction, where the seller can lower the reserve before or
   during it. selling.after_auction_heavy turns this off if that ever changes. */
create or replace function public.after_auction_check(p_lot bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l lots%rowtype; v_state text; v_rule jsonb; v_w jsonb; v_end timestamptz; v_rid bigint; v_rstatus text; v_code text; v_why text; v_req boolean;
  v_heavy boolean;
begin
  select * into l from lots where id = p_lot;
  if not found then return jsonb_build_object('ok', false, 'code', 'lot_not_found', 'why', 'We couldn''t find that vehicle.'); end if;
  -- the vehicle's state is where it's consigned and collected; one located or registered in Victoria is Victorian
  v_state := case when upper(coalesce(l.rego_state, '')) = 'VIC' then 'VIC' else upper(coalesce(nullif(trim(l.state), ''), l.rego_state, '')) end;
  v_rule := after_auction_rule(v_state);
  v_w := warranty_free_for(v_state, l.year, l.odometer, l.category, l.gvm_kg);
  select max(signed_at) + interval '90 days' into v_end from seller_agreements where lot_id = p_lot and status = 'signed';
  select id, status into v_rid, v_rstatus from lots where relisted_from = p_lot and status <> 'cancelled' order by created_at desc limit 1;
  select coalesce((value->>'require_checks')::boolean, true) into v_req from settings where key = 'selling';
  v_heavy := coalesce(l.category, '') in ('trucks', 'buses', 'trailers', 'machinery')
    and not coalesce((select (value->>'after_auction_heavy')::boolean from settings where key = 'selling'), false);
  if not live_only() then
    v_code := 'live_only_off'; v_why := 'Selling after the auction is for live auctions.';
  elsif l.status <> 'passed' then
    v_code := 'not_passed'; v_why := 'Only a vehicle that was passed in, or whose buyer didn''t pay, can be sold after the auction.';
  elsif exists (select 1 from invoices where lot_id = p_lot and status <> 'cancelled') then
    v_code := 'sold'; v_why := 'It already has a sale.';
  elsif v_heavy then
    v_code := 'heavy'; v_why := 'Trucks are sold under the hammer only. It goes into the next auction, and the seller can lower the reserve before or during it.';
  elsif not coalesce((v_rule->>'allowed')::boolean, false) then
    v_code := 'state'; v_why := v_rule->>'why';
  elsif v_w->>'free' is null then
    v_code := 'warranty_unknown'; v_why := (v_w->>'why') || '.';
  elsif not (v_w->>'free')::boolean then
    v_code := 'warranty'; v_why := (v_w->>'why') || '. We never give a statutory warranty, so it can''t be sold after the auction.';
  elsif v_rid is not null and v_rstatus <> 'draft' then
    v_code := 'relisted'; v_why := 'It''s already listed for the next auction (lot ' || v_rid || '), so it can only be sold there.';
  elsif coalesce(v_req, true) and (l.seller_id is null or v_end is null) then
    v_code := 'no_agreement'; v_why := 'There''s no signed seller agreement on it, so we have no authority to sell it.';
  elsif v_end is not null and v_end <= now() then
    v_code := 'authority'; v_why := 'The seller''s authority to sell ended on ' || to_char(v_end at time zone 'Australia/Brisbane', 'FMDD Mon YYYY')
      || ' (90 days after they signed). They sign the agreement again first.';
  end if;
  return jsonb_build_object('ok', v_code is null, 'code', v_code, 'why', v_why, 'state', v_state, 'rule', v_rule, 'warranty', v_w,
    'authority_ends', v_end, 'relist_id', v_rid, 'relist_status', v_rstatus);
end $$;

-- ---------------------------------------------------------------------------
-- 8. What sellers are told, now that buyers come to them
-- ---------------------------------------------------------------------------
create or replace function public.notify_seller_live() returns trigger
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    select * into s from sales where id = new.sale_id and mode = 'live';
    perform queue_seller_notice(new.id, 'Your ' || new.title || ' is listed',
      case when s.id is not null
        then 'It''s in our live auction on ' || to_char(s.starts_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') ||
             ' (Brisbane time), and buyers can leave early bids now. You can lower your reserve from your seller dashboard until the hammer falls (or call us during the auction). '
        else 'Bidding is open until ' || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') || ' (Brisbane time). ' end ||
      case when new.collect_from = 'seller'
        then 'Keep it at your place, insured and in the same condition, until the buyer has paid us and collected it. The listing shows your suburb only. '
          || 'A buyer can ask to view it: we agree a time with you first, tell you their name, and only then give them the address. '
          || 'Every sale goes through us: if anyone asks to buy it direct, say no and tell us. Follow the bids from your seller dashboard.'
        else 'Keep it at your place, insured and in the same condition, until our transport partner picks it up after the buyer has paid. Buyers never visit and are never told your name or address. If a bidder orders a mechanical inspection, our partner mechanic will call you to arrange a time. Follow the bids from your seller dashboard.' end,
      '/sell/dashboard', 'live:' || new.id);
  end if;
  return null;
end $$;

create or replace function public.queue_status_notices(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0; v_users uuid[]; v_when text; v_plan jsonb;
begin
  for l in select * from lots where status in ('referred','offers','sold','passed') and notified_status is distinct from status
           order by id limit p_limit for update skip locked loop
    v_when := to_char(l.decision_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am');
    if l.status = 'referred' and l.leader_id is not null then
      perform queue_notice(l.leader_id, 'account', 'Your bid on the ' || l.title || ' is with the seller',
        'Bidding ended below the reserve. Your bid of $' || to_char(l.current_bid, 'FM999,999,990') ||
        ' has gone to the seller, who has until ' || v_when || ' (Brisbane time) to accept. Your bid stays binding until then.',
        '/lot/' || l.id, 'referred:' || l.id);
      perform queue_seller_notice(l.id, 'Decision needed: $' || to_char(l.current_bid, 'FM999,999,990') || ' for your ' || l.title,
        'Bidding ended below your reserve. The highest bid is $' || to_char(l.current_bid, 'FM999,999,990') ||
        '. Accept or decline in your seller dashboard by ' || v_when || ' (Brisbane time). If you don''t respond, it counts as a decline and offers open.',
        '/sell/dashboard', 'seller-referred:' || l.id);
    elsif l.status = 'offers' then
      select array_agg(user_id) into v_users from watchlist where lot_id = l.id;
      if v_users is not null then
        perform queue_notice_many(v_users, 'ending', 'Make an offer on the ' || l.title,
          'The auction closed below the reserve. You can make an offer until ' || v_when || '.', '/lot/' || l.id, 'offers:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Offers are open on your ' || l.title,
        'We''ll send you each offer as it arrives. Accept or decline in your seller dashboard.', '/sell/dashboard', 'seller-offers:' || l.id);
    elsif l.status = 'sold' then
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id and bidder_id is distinct from l.winner_id;
      if v_users is not null then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' has sold',
          'Thanks for bidding. This one went to another bidder for $' || to_char(l.sold_price, 'FM999,999,990') ||
          case when l.sold_via = 'after_auction' then ', after the auction' else '' end || '. Similar vehicles are listed every week.',
          '/auctions?cat=' || l.category, 'lost:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Sold: your ' || l.title || ' for $' || to_char(l.sold_price, 'FM999,999,990'),
        case when l.sold_via = 'after_auction' then 'It''s sold after the auction, at the price you agreed. ' else 'Congratulations. ' end ||
        case when l.collect_from = 'seller'
          then 'The buyer pays us first. Once it''s paid they book a time to collect it from you, which we agree with you. Hand it over only on the release code, and never take money from anyone: if someone contacts you about it, tell us.'
          else 'The buyer pays us first. Once it''s paid, our transport partner will call you to book the pickup. Never hand it to anyone else or take money from anyone: if someone contacts you about it, tell us.' end,
        '/sell/dashboard', 'seller-sold:' || l.id);
    elsif l.status = 'passed' and not exists (select 1 from invoices where lot_id = l.id) then
      -- into the next auction first, so the seller hears when (a failure here leaves it for staff to relist by hand)
      begin
        v_plan := relist_auto(l.id);
      exception when others then
        v_plan := null;
      end;
      if l.leader_id is not null and l.bid_count > 0 then
        perform queue_notice(l.leader_id, 'account', 'You were the highest bidder on the ' || l.title,
          'Bidding reached $' || to_char(l.current_bid, 'FM999,999,990') || ', below the seller''s reserve, so it wasn''t sold and you don''t owe anything. '
          || 'One of our consultants will be in touch.', '/lot/' || l.id, 'passed-top:' || l.id);
      end if;
      if live_only() or (l.leader_id is not null and l.bid_count > 0) then perform queue_passed_followup(l.id, 'passed'); end if;
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id and bidder_id is distinct from l.leader_id;
      if v_users is not null and l.bid_count > 0 then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' was passed in',
          'Bidding didn''t reach the seller''s reserve, so it wasn''t sold and nobody owes anything. If it''s offered again, it''ll be in a later auction: we''ll let you know.',
          '/lot/' || l.id, 'passed:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Your ' || l.title || ' didn''t sell this time',
        case when l.bid_count > 0 then 'It was passed in at $' || to_char(l.current_bid, 'FM999,999,990') || ', below your reserve. ' else 'Nobody bid this time. ' end ||
        relist_seller_text(v_plan) || after_seller_text(l.id), '/sell/dashboard', 'seller-passed:' || l.id);
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 9. The name in messages
-- ---------------------------------------------------------------------------
create or replace function public.ask_for_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text := nullif(trim((select value->>'review_url' from settings where key = 'business')), ''); v_title text;
begin
  if v_url is null then return null; end if;
  if tg_table_name = 'invoices' and new.collected_at is not null and old.collected_at is null then
    select title into v_title from lots where id = new.lot_id;
    perform queue_notice(new.buyer_id, 'review', 'How did it go?',
      'Thanks for buying the ' || coalesce(v_title, 'vehicle') || ' through Super Trucker. Would you tell other buyers how it went, good or bad? It takes a minute: ' || v_url,
      '/account', 'review:buyer:' || new.id);
  elsif tg_table_name = 'seller_payouts' and new.paid_at is not null and old.paid_at is null and new.kind = 'sale' and new.seller_id is not null then
    perform queue_notice(new.seller_id, 'review', 'How did we do?',
      'Your payout is on its way. Would you tell other sellers how selling with Super Trucker went, good or bad? It takes a minute: ' || v_url,
      '/sell/dashboard', 'review:seller:' || new.id);
  end if;
  return null;
end $$;

create or replace function public.profile_role_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and (new.role = 'admin' or old.role = 'admin') then
    insert into admin_audit (actor, actor_email, action, target, detail, outcome)
    values ((select auth.uid()), (select email from profiles where id = (select auth.uid())),
      case when new.role = 'admin' then 'admin added' else 'admin removed' end, 'profile:' || new.id,
      jsonb_build_object('email', new.email, 'from', old.role, 'to', new.role), 'ok');
    perform queue_health_alert(
      case when new.role = 'admin' then 'New admin: ' || coalesce(new.email, new.id::text) else 'Admin removed: ' || coalesce(new.email, new.id::text) end,
      case when new.role = 'admin'
        then 'This account now has full admin access to Super Trucker. If you didn''t expect this, remove it in Admin → Members straight away and change your password.'
        else 'This account no longer has admin access.' end,
      '/admin/security', 'role:' || new.id || ':' || new.role || ':' || extract(epoch from now())::bigint, new.role = 'admin');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 10. New terms: members accept them again before they bid; sellers sign the new agreement
-- ---------------------------------------------------------------------------
update public.settings set value = '{"buyer_version":"2026-11-15","seller_version":"2026-11-15"}'::jsonb where key = 'terms';

-- ---------------------------------------------------------------------------
-- 11. Nothing new is open to the public
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    if not (f.proname = any(public.public_function_allowlist())) then
      execute format('revoke execute on function %s from public, anon', f.sig);
    end if;
  end loop;
end $$;
