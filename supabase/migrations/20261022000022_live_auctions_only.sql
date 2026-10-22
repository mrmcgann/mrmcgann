-- Live auctions only, like Turners Live, with an auction estimate on every listing. The seller sends the photos and
-- the walkaround video: Tyrebiter is never at the vehicle, so every listing check is a check of what the seller sent
-- and of the records (src/lib/listing.ts). docs/legal-basis.md has the full legal register; in short:
--
--  * Every vehicle is offered by an auctioneer in a live online auction and sold at the fall of the hammer. That keeps
--    each sale a "sale by auction" (Australian Consumer Law s 2: conducted by the seller's agent, in person or by
--    electronic means) and inside Victoria's rule that a trader may sell a consigned vehicle only at public auction.
--    So: no Buy Now, no tenders, no offers or referrals after the auction and no second-chance offers. A vehicle that
--    doesn't reach its reserve is passed in, and can be offered again at a later auction.
--  * Sale of Goods Acts (NSW s 60, QLD s 59 and the others): a bid can be retracted until the hammer falls, so a
--    bidder can withdraw a bid (an early bid, or a live one) until then. The seller never bids, and we never bid for
--    the seller.
--  * ACL s 4 (a statement about the future needs reasonable grounds): every estimate has a written basis on file, its
--    spread is limited, and the reserve is never above the low estimate.
--  * The seller can lower the reserve (or remove it) while the vehicle waits or while it's up, so it can sell under
--    the hammer; the change is recorded as their written instruction (QLD MDCA Regulation s 24).
--  * QLD MDCA Regulation s 12: the auctioneer's name is shown for the whole auction, so a live auction can't start
--    without one.
--  * A registered vehicle in a state that needs a certificate to transfer the registration (QLD safety certificate,
--    VIC roadworthy certificate, ACT and NT roadworthy inspections, SA inspections for heavy vehicles and trailers)
--    has the seller's certificate date on file before bidding opens, or a recorded exemption, or is sold unregistered.
--
-- It's a setting (auction.live_only, on) so the database tests that cover the older timed auctions still run with it off.

-- ---------------------------------------------------------------------------
-- 1. The setting
-- ---------------------------------------------------------------------------
update public.settings set value = coalesce(value, '{}'::jsonb) || '{"live_only": true}'::jsonb where key = 'auction';

create or replace function public.live_only() returns boolean
language sql stable set search_path = public as $$
  select coalesce((select (value->>'live_only')::boolean from public.settings where key = 'auction'), false)
$$;

-- ---------------------------------------------------------------------------
-- 2. The auction estimate: low and high (public), the basis for it (private, with who wrote it and when)
-- ---------------------------------------------------------------------------
alter table public.lots
  add column if not exists estimate_low numeric(12,2),
  add column if not exists estimate_high numeric(12,2),
  add column if not exists roadworthy_issued_on date;
alter table public.lots drop constraint if exists lots_estimate_range;
-- whole dollars; the high end no more than 25% above the low end (or $1,000, for cheaper vehicles)
alter table public.lots add constraint lots_estimate_range check (
  (estimate_low is null and estimate_high is null)
  or (estimate_low > 0 and estimate_high >= estimate_low and estimate_low = round(estimate_low) and estimate_high = round(estimate_high)
      and estimate_high <= greatest(estimate_low * 1.25, estimate_low + 1000)));

alter table public.lot_private
  add column if not exists estimate_basis text,
  add column if not exists estimate_by uuid references public.profiles(id) on delete set null,
  add column if not exists estimate_at timestamptz;
alter table public.lot_private drop constraint if exists lot_private_estimate_basis_len;
alter table public.lot_private add constraint lot_private_estimate_basis_len check (estimate_basis is null or char_length(estimate_basis) <= 4000);

create or replace function public.estimate_basis_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.estimate_basis is not null then new.estimate_at := now(); new.estimate_by := auth.uid(); end if;
  elsif new.estimate_basis is distinct from old.estimate_basis then
    new.estimate_at := now(); new.estimate_by := auth.uid();
  end if;
  return new;
end $$;
revoke execute on function public.estimate_basis_stamp() from public, anon, authenticated;
drop trigger if exists estimate_basis_stamp on public.lot_private;
create trigger estimate_basis_stamp before insert or update of estimate_basis on public.lot_private
  for each row execute function public.estimate_basis_stamp();

-- The reserve is never above the low estimate, whichever of the two changes.
create or replace function public.reserve_within_estimate() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_low numeric;
begin
  if new.reserve_price is null then return new; end if;
  select estimate_low into v_low from lots where id = new.lot_id;
  if v_low is not null and new.reserve_price > v_low then
    raise exception 'estimate_rule:the reserve ($%) can''t be above the low estimate ($%). Lower the reserve, or raise the estimate if the evidence supports it',
      to_char(new.reserve_price, 'FM999,999,990'), to_char(v_low, 'FM999,999,990');
  end if;
  return new;
end $$;
revoke execute on function public.reserve_within_estimate() from public, anon, authenticated;
drop trigger if exists reserve_within_estimate on public.lot_private;
create trigger reserve_within_estimate before insert or update of reserve_price on public.lot_private
  for each row execute function public.reserve_within_estimate();

create or replace function public.estimate_above_reserve() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_res numeric;
begin
  if new.estimate_low is null then return new; end if;
  select reserve_price into v_res from lot_private where lot_id = new.id;
  if v_res is not null and v_res > new.estimate_low then
    raise exception 'estimate_rule:the low estimate ($%) can''t be below the seller''s reserve ($%). Agree a lower reserve with the seller first',
      to_char(new.estimate_low, 'FM999,999,990'), to_char(v_res, 'FM999,999,990');
  end if;
  return new;
end $$;
revoke execute on function public.estimate_above_reserve() from public, anon, authenticated;
drop trigger if exists estimate_above_reserve on public.lots;
create trigger estimate_above_reserve before insert or update of estimate_low on public.lots
  for each row execute function public.estimate_above_reserve();

-- ---------------------------------------------------------------------------
-- 3. The certificate a state needs to transfer a registered vehicle (mirrored by certNeeded() in src/lib/transfer.ts).
--    null when none is needed. Age is by build year; an unknown year or weight counts as needing one.
-- ---------------------------------------------------------------------------
create or replace function public.roadworthy_needed(p_state text, p_year int, p_category text, p_gvm int) returns text
language sql stable set search_path = public as $$
  select case
    when p_category in ('boats', 'machinery') then null
    when upper(coalesce(p_state, '')) = 'QLD' and (p_category in ('cars', 'utes', 'vans', 'motorbikes')
         or (p_category in ('caravans', 'trailers') and coalesce(p_gvm, 750) between 750 and 4500)
         or (p_category in ('trucks', 'buses') and coalesce(p_gvm, 4500) <= 4500)) then 'safety certificate'
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
-- 4. Publishing: a live auction, an estimate with its basis, and the transfer certificate, on top of every earlier check
-- ---------------------------------------------------------------------------
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[]; s public.sales%rowtype; v_basis text; v_cert text; v_day date;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if new.status in ('live','scheduled') and (tg_op = 'INSERT' or old.status = 'draft') then
    if current_user in ('authenticated','service_role','anon') then
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
        if new.depot_id is null or not exists (select 1 from depots where id = new.depot_id and active) then
          raise exception 'not_ready:choose the depot the buyer collects it from';
        end if;
        if new.transport_fee is null then
          raise exception 'not_ready:enter the transport amount (the pickup from the seller to the depot, from the transport quote)';
        end if;
        if coalesce((select seller_address from lot_private where lot_id = new.id), '') = '' then
          raise exception 'not_ready:add the pickup address (where our transport partner collects it)';
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
        -- the certificate the state needs before the registration can be transferred to the buyer
        if new.registration = 'registered' then
          v_cert := roadworthy_needed(coalesce(new.rego_state, new.state), new.year, new.category, new.gvm_kg);
          if v_cert is not null and new.roadworthy_issued_on is null and coalesce(new.roadworthy_note, '') !~* '^\s*exempt' then
            raise exception 'not_ready:a vehicle registered in % needs a current % before the registration can be transferred. Record the date on the seller''s certificate, start the roadworthy note with "Exempt" and say why, or list it as unregistered',
              coalesce(new.rego_state, new.state), v_cert;
          end if;
          if new.roadworthy_issued_on is not null then
            if new.roadworthy_issued_on > v_today then
              raise exception 'not_ready:the certificate date is in the future';
            end if;
            v_day := coalesce((select (starts_at at time zone 'Australia/Brisbane')::date from sales where id = new.sale_id),
                              (new.ends_at at time zone 'Australia/Brisbane')::date, v_today);
            if v_cert = 'roadworthy certificate' and new.roadworthy_issued_on <= v_day - 30 then
              raise exception 'not_ready:a Victorian roadworthy certificate must be issued less than 30 days before the sale (the auction is on %). Ask the seller for a new one',
                to_char(v_day, 'FMDD Mon YYYY');
            end if;
            if v_cert = 'safety certificate' and new.roadworthy_issued_on < (v_day - interval '2 months')::date then
              raise exception 'not_ready:a Queensland safety certificate from a private seller lasts 2 months, so this one won''t be current at the auction on %. Ask the seller for a new one',
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

-- ---------------------------------------------------------------------------
-- 5. Corrections: the estimate and the certificate date are key facts too. A vehicle waiting in a live auction keeps
--    its place in the running order (its time is only an estimate): it just can't be offered until 24 hours after
--    the change (live_advance below).
-- ---------------------------------------------------------------------------
create or replace function public.fact_text(p_field text, v jsonb) returns text
language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb or v = '""'::jsonb then 'not stated'
    when p_field = 'odometer' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' km'
    when p_field = 'hours' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' hours'
    when p_field in ('estimate_low', 'estimate_high') then '$' || to_char((v #>> '{}')::numeric, 'FM999,999,990')
    when p_field = 'roadworthy_issued_on' then to_char((v #>> '{}')::date, 'FMDD Mon YYYY')
    when p_field = 'ev_battery_soh' then (v #>> '{}') || '%'
    when p_field = 'runs' then case v #>> '{}' when 'drives' then 'starts and drives' when 'starts' then 'starts, doesn''t drive'
      when 'no_start' then 'doesn''t start' else 'not tested' end
    when p_field = 'write_off_status' then case v #>> '{}' when 'none' then 'not written off' when 'repairable' then 'repairable write-off'
      when 'inspected' then 'inspected write-off' when 'statutory' then 'statutory write-off' else 'being checked' end
    when jsonb_typeof(v) = 'boolean' then case when v = 'true'::jsonb then 'yes' else 'no' end
    else left(v #>> '{}', 300) end
$$;

create or replace function public.lot_correction_notice(p_lot bigint, p_title text, p_status text, p_ends timestamptz, p_changes text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_bidders uuid[]; v_users uuid[]; v_body text; v_waiting boolean;
  v_tag text := floor(extract(epoch from clock_timestamp()))::bigint::text || ':' || left(md5(array_to_string(p_changes, '|')), 8);
begin
  select live_state = 'waiting' into v_waiting from lots where id = p_lot;
  select array_agg(distinct bidder_id) into v_bidders from bids where lot_id = p_lot;
  select array_agg(distinct user_id) into v_users from watchlist where lot_id = p_lot and not (user_id = any(coalesce(v_bidders, '{}')));
  v_body := 'We''ve corrected this listing: ' || array_to_string(p_changes[1:6], '; ') || case when cardinality(p_changes) > 6 then '; and more' else '' end || '.'
    || case when p_status = 'live' and coalesce(v_waiting, false)
              then ' It won''t be offered until at least 24 hours after this change.'
            when p_status = 'live'
              then ' Bidding now ends no earlier than ' || to_char(p_ends at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time).'
            else '' end;
  if v_bidders is not null then
    perform queue_notice_many(v_bidders, 'account', 'Correction to a vehicle you bid on: ' || p_title,
      v_body || case when p_status = 'live' and coalesce(v_waiting, false)
        then ' If this changes your mind, withdraw your early bid on the listing: you can until the hammer falls.'
        when p_status = 'live'
        then ' If this changes your mind, call the consultant on the listing before bidding ends and we''ll cancel your bids.'
        else ' If this changes your mind, call the consultant on the listing before the seller accepts, and we''ll release you from your bid or offer.' end,
      '/lot/' || p_lot || '#changes', 'correction:' || p_lot || ':' || v_tag);
  end if;
  if v_users is not null then
    perform queue_notice_many(v_users, 'ending', 'Correction to a vehicle you''re watching: ' || p_title, v_body,
      '/lot/' || p_lot || '#changes', 'correction-w:' || p_lot || ':' || v_tag);
  end if;
end $$;
revoke execute on function public.lot_correction_notice(bigint, text, text, timestamptz, text[]) from public, anon, authenticated;

create or replace function public.lot_corrections_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
  f record; k text; changes text[] := '{}';
begin
  if old.status not in ('live','referred','offers') then return new; end if;
  for f in select * from (values
      ('title','Title'), ('year','Year'), ('make','Make'), ('model','Model'), ('variant','Variant'), ('body','Body'), ('engine','Engine'),
      ('transmission','Transmission'), ('fuel','Fuel'), ('drive','Drive'), ('odometer','Odometer'), ('hours','Hours'),
      ('vin','VIN'), ('build_date','Build date'), ('compliance_date','Compliance date'), ('registration','Registration'),
      ('rego_plate','Plate'), ('rego_state','Registration state'),
      ('rego_expiry','Registration expiry'), ('write_off_status','Write-off status'), ('stolen_clear','Stolen check'),
      ('ppsr_clear','PPSR finance check'), ('keys','Keys'), ('service_books','Service books'), ('runs','Starts and drives'),
      ('known_faults','Known faults'), ('service_history','Service history'), ('roadworthy_note','Roadworthy'),
      ('roadworthy_issued_on','Roadworthy or safety certificate'),
      ('visual_grade','Visual grade'), ('grade_paint','Paint grade'), ('grade_interior','Interior grade'), ('grade_tyres','Tyre grade'),
      ('tyre_tread','Tyre tread'), ('seats','Seats'), ('gvm_kg','GVM'), ('seller_type','Seller'), ('gst_status','GST'),
      ('ev_battery_soh','Battery health'), ('colour','Colour'), ('take','Description'), ('suburb','Collect from'), ('state','State'),
      ('statutory_warranty','Statutory warranty'), ('estimate_low','Estimate (low)'), ('estimate_high','Estimate (high)')) t(field, label)
  loop
    if o->f.field is distinct from n->f.field then
      insert into lot_corrections (lot_id, field, label, before, after)
        values (new.id, f.field, f.label, fact_text(f.field, o->f.field), fact_text(f.field, n->f.field));
      changes := changes || case when f.field = 'take' then 'Description updated (see the listing)'
        else f.label || ': ' || fact_text(f.field, o->f.field) || ' → ' || fact_text(f.field, n->f.field) end;
    end if;
  end loop;
  for k in select distinct key from (select jsonb_object_keys(coalesce(o->'disclosures', '{}')) key
                                     union select jsonb_object_keys(coalesce(n->'disclosures', '{}'))) s
           where key not in ('finance_amount','lender_name','lender_ref','rego_expiry','business','runs')
  loop
    if o->'disclosures'->k is distinct from n->'disclosures'->k then
      insert into lot_corrections (lot_id, field, label, before, after)
        values (new.id, 'disclosures.' || k, 'Seller declared: ' || replace(k, '_', ' '),
          fact_text(k, o->'disclosures'->k), fact_text(k, n->'disclosures'->k));
      changes := changes || ('Seller declared ' || replace(k, '_', ' ') || ': ' || fact_text(k, n->'disclosures'->k));
    end if;
  end loop;
  if cardinality(changes) = 0 then return new; end if;

  new.corrected_at := now();
  -- a timed auction keeps 24 hours of bidding after the change (a live one waits 24 hours before it's offered)
  if new.status = 'live' and new.live_state is null and new.ends_at is not null and new.ends_at < now() + interval '24 hours' then
    new.ends_at := now() + interval '24 hours';
  end if;
  perform lot_correction_notice(new.id, new.title, new.status, new.ends_at, changes);
  return new;
end $$;

drop trigger if exists lot_corrections_log on public.lots;
create trigger lot_corrections_log before update on public.lots
  for each row
  when ((old.year, old.make, old.model, old.variant, old.body, old.engine, old.transmission, old.fuel, old.drive, old.odometer,
         old.hours, old.vin, old.build_date, old.compliance_date, old.registration, old.rego_expiry, old.write_off_status,
         old.stolen_clear, old.ppsr_clear, old.keys, old.service_books, old.runs, old.known_faults, old.service_history,
         old.roadworthy_note, old.visual_grade, old.grade_paint, old.grade_interior, old.grade_tyres, old.tyre_tread, old.seats,
         old.gvm_kg, old.seller_type, old.gst_status, old.ev_battery_soh, old.colour, old.disclosures,
         old.title, old.rego_plate, old.rego_state, old.take, old.suburb, old.state, old.statutory_warranty,
         old.roadworthy_issued_on, old.estimate_low, old.estimate_high)
    is distinct from
        (new.year, new.make, new.model, new.variant, new.body, new.engine, new.transmission, new.fuel, new.drive, new.odometer,
         new.hours, new.vin, new.build_date, new.compliance_date, new.registration, new.rego_expiry, new.write_off_status,
         new.stolen_clear, new.ppsr_clear, new.keys, new.service_books, new.runs, new.known_faults, new.service_history,
         new.roadworthy_note, new.visual_grade, new.grade_paint, new.grade_interior, new.grade_tyres, new.tyre_tread, new.seats,
         new.gvm_kg, new.seller_type, new.gst_status, new.ev_battery_soh, new.colour, new.disclosures,
         new.title, new.rego_plate, new.rego_state, new.take, new.suburb, new.state, new.statutory_warranty,
         new.roadworthy_issued_on, new.estimate_low, new.estimate_high))
  execute function public.lot_corrections_log();

-- ---------------------------------------------------------------------------
-- 6. Closing: sold under the hammer, or passed in. Nothing is referred to the seller or opened to offers.
-- ---------------------------------------------------------------------------
create or replace function public.close_one_lot(p_lot bigint) returns text
language plpgsql security definer set search_path = public as $$
declare l record; v_status text;
  v_days int := setting_num('auction','referral_days')::int;
  v_offer_days int := setting_num('auction','offer_days')::int;
  v_live_only boolean := live_only();
begin
  select lots.*, p.reserve_price into l from lots left join lot_private p on p.lot_id = lots.id where lots.id = p_lot for update of lots;
  if not found or l.status <> 'live' then return null; end if;
  if l.leader_id is null then
    v_status := case when l.has_reserve and not v_live_only then 'offers' else 'passed' end;
    update lots set status = v_status, decision_by = case when v_status = 'offers' then business_days_from(now(), v_offer_days) end,
      live_state = case when live_state is not null then 'closed' end, ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
  elsif l.reserve_price is null or l.current_bid >= l.reserve_price then
    v_status := 'sold';
    update lots set status = 'sold', winner_id = l.leader_id, sold_price = l.current_bid, sold_via = 'auction',
      live_state = case when live_state is not null then 'closed' end, ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
    perform create_invoice(l.id, l.leader_id, l.current_bid, 'auction');
  elsif v_live_only then
    -- passed in: below the reserve, so no sale (the highest bidder owes nothing; it can go to a later auction)
    v_status := 'passed';
    update lots set status = 'passed', live_state = case when live_state is not null then 'closed' end,
      ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
  else
    v_status := 'referred';
    update lots set status = 'referred', decision_by = business_days_from(now(), v_days),
      live_state = case when live_state is not null then 'closed' end, ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
  end if;
  return v_status;
end $$;
revoke execute on function public.close_one_lot(bigint) from public, anon, authenticated;
grant execute on function public.close_one_lot(bigint) to service_role;

-- What people hear when a vehicle closes. Passed in: the highest bidder knows they owe nothing, the seller hears the
-- highest bid and that it can go to a later auction.
create or replace function public.queue_status_notices(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0; v_users uuid[]; v_when text;
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
          '. Similar vehicles are listed every week.', '/auctions?cat=' || l.category, 'lost:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Sold: your ' || l.title || ' for $' || to_char(l.sold_price, 'FM999,999,990'),
        'Congratulations. The buyer pays us first. Once it''s paid, our transport partner will call you to book the pickup. Never hand it to anyone else or take money from anyone: if someone contacts you about it, tell us.',
        '/sell/dashboard', 'seller-sold:' || l.id);
    elsif l.status = 'passed' then
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id;
      if v_users is not null and l.bid_count > 0 then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' was passed in',
          'Bidding didn''t reach the seller''s reserve, so it wasn''t sold and nobody owes anything. If it''s offered again, it''ll be in a later auction: we''ll let you know.',
          '/lot/' || l.id, 'passed:' || l.id);
      end if;
      perform queue_seller_notice(l.id, 'Your ' || l.title || ' didn''t sell this time',
        case when l.bid_count > 0 then 'It was passed in at $' || to_char(l.current_bid, 'FM999,999,990') || ', below your reserve. ' else 'Nobody bid this time. ' end ||
        'We''ll call you about offering it again at a later auction, with or without a lower reserve.', '/sell/dashboard', 'seller-passed:' || l.id);
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_status_notices(int) from public, anon, authenticated;
grant execute on function public.queue_status_notices(int) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Nothing is sold except under the hammer: Buy Now, offers, referrals and second-chance offers are refused
-- ---------------------------------------------------------------------------
alter function public.buy_now(bigint) rename to buy_now_core;
revoke execute on function public.buy_now_core(bigint) from public, anon, authenticated;
grant execute on function public.buy_now_core(bigint) to service_role;
create or replace function public.buy_now(p_lot bigint) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if live_only() then raise exception 'buy_now_unavailable'; end if;
  return buy_now_core(p_lot);
end $$;
revoke execute on function public.buy_now(bigint) from public, anon;
grant execute on function public.buy_now(bigint) to authenticated, service_role;

alter function public.make_offer(bigint, numeric) rename to make_offer_core;
revoke execute on function public.make_offer_core(bigint, numeric) from public, anon, authenticated;
grant execute on function public.make_offer_core(bigint, numeric) to service_role;
create or replace function public.make_offer(p_lot bigint, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if live_only() then raise exception 'offers_closed'; end if;
  return make_offer_core(p_lot, p_amount);
end $$;
revoke execute on function public.make_offer(bigint, numeric) from public, anon;
grant execute on function public.make_offer(bigint, numeric) to authenticated, service_role;

alter function public.admin_offer_next_bidder(bigint, int, boolean) rename to admin_offer_next_bidder_core;
revoke execute on function public.admin_offer_next_bidder_core(bigint, int, boolean) from public, anon, authenticated;
grant execute on function public.admin_offer_next_bidder_core(bigint, int, boolean) to service_role;
create or replace function public.admin_offer_next_bidder(p_lot bigint, p_hours int default 24, p_seller_ok boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if live_only() then
    raise exception 'live_only:every vehicle is sold under the hammer, so it can''t be offered to the next bidder. Relist it for a later auction';
  end if;
  return admin_offer_next_bidder_core(p_lot, p_hours, p_seller_ok);
end $$;
revoke execute on function public.admin_offer_next_bidder(bigint, int, boolean) from public, anon;
grant execute on function public.admin_offer_next_bidder(bigint, int, boolean) to authenticated, service_role;

alter function public.respond_second_chance(uuid, boolean) rename to respond_second_chance_core;
revoke execute on function public.respond_second_chance_core(uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_second_chance_core(uuid, boolean) to service_role;
create or replace function public.respond_second_chance(p_offer uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if live_only() and p_accept then
    raise exception 'live_only:vehicles are only sold under the hammer now, so this offer can''t be accepted';
  end if;
  return respond_second_chance_core(p_offer, p_accept);
end $$;
revoke execute on function public.respond_second_chance(uuid, boolean) from public, anon;
grant execute on function public.respond_second_chance(uuid, boolean) to authenticated, service_role;

alter function public.seller_decide(bigint, text, uuid) rename to seller_decide_core;
revoke execute on function public.seller_decide_core(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.seller_decide_core(bigint, text, uuid) to service_role;
create or replace function public.seller_decide(p_lot bigint, p_action text, p_offer uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if live_only() and p_action in ('accept_referral', 'accept_offer') then
    raise exception 'live_only:vehicles are only sold under the hammer, so a bid can''t be accepted after the auction. It can go to a later auction instead';
  end if;
  return seller_decide_core(p_lot, p_action, p_offer);
end $$;
revoke execute on function public.seller_decide(bigint, text, uuid) from public, anon;
grant execute on function public.seller_decide(bigint, text, uuid) to authenticated, service_role;

alter function public.admin_accept(bigint, uuid) rename to admin_accept_core;
revoke execute on function public.admin_accept_core(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_accept_core(bigint, uuid) to service_role;
create or replace function public.admin_accept(p_lot bigint, p_offer uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if live_only() then
    raise exception 'live_only:vehicles are only sold under the hammer, so a bid can''t be accepted after the auction. Relist it for a later auction';
  end if;
  return admin_accept_core(p_lot, p_offer);
end $$;
revoke execute on function public.admin_accept(bigint, uuid) from public, anon;
grant execute on function public.admin_accept(bigint, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. A bidder can withdraw their bid until the hammer falls (an early bid while the vehicle waits, or a bid while
--    it's up). The price is worked out again as if they'd never bid; the countdown gives the room time to answer.
-- ---------------------------------------------------------------------------
create or replace function public.remove_bids_core(p_lot bigint, p_user uuid, p_reason text, p_by uuid, p_notify boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; pr lot_private%rowtype; v_max numeric; v_new numeric; v_old_leader uuid;
  v_top uuid; v_top_max numeric; v_top_at timestamptz; v_sec uuid; v_sec_max numeric;
begin
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status <> 'live' then raise exception 'not_live:bids can only be removed while bidding is open'; end if;
  select * into pr from lot_private where lot_id = p_lot for update;
  select max_amount into v_max from max_bids where lot_id = p_lot and bidder_id = p_user;
  if v_max is null and not exists (select 1 from bids where lot_id = p_lot and bidder_id = p_user) then raise exception 'no_bids'; end if;
  v_old_leader := l.leader_id;

  delete from bids where lot_id = p_lot and bidder_id = p_user;
  delete from max_bids where lot_id = p_lot and bidder_id = p_user;
  insert into bid_removals (lot_id, bidder_id, max_amount, reason, removed_by) values (p_lot, p_user, v_max, left(trim(p_reason), 500), p_by);

  select bidder_id, max_amount, first_set_at into v_top, v_top_max, v_top_at from max_bids where lot_id = p_lot
    order by max_amount desc, first_set_at asc limit 1;
  if v_top is not null then
    select bidder_id, max_amount into v_sec, v_sec_max from max_bids where lot_id = p_lot and bidder_id <> v_top
      order by max_amount desc, first_set_at asc limit 1;
  end if;
  if v_top is null then
    delete from bids where lot_id = p_lot;
    update lot_private set leader_max = null, leader_max_at = null where lot_id = p_lot;
    update lots set current_bid = 0, bid_count = 0, leader_id = null, reserve_met = (pr.reserve_price is null), updated_at = now() where id = p_lot;
    v_new := 0;
  else
    v_new := case when v_sec is null then l.start_price else least(v_top_max, v_sec_max + bid_increment(v_sec_max)) end;
    if pr.reserve_price is not null and v_top_max >= pr.reserve_price then v_new := greatest(v_new, pr.reserve_price); end if;
    v_new := least(v_new, v_top_max);
    -- bids placed in answer to the removed bidder go; the leader's bid at the new price stays
    delete from bids where lot_id = p_lot and amount > v_new;
    if not exists (select 1 from bids where lot_id = p_lot and bidder_id = v_top and amount = v_new) then
      insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, v_top, v_new, true);
    end if;
    update lot_private set leader_max = v_top_max, leader_max_at = v_top_at where lot_id = p_lot;
    update lots set current_bid = v_new, bid_count = (select count(*) from bids where lot_id = p_lot), leader_id = v_top,
      reserve_met = (pr.reserve_price is null or v_new >= pr.reserve_price), updated_at = now() where id = p_lot;
  end if;

  if p_notify then
    perform queue_notice(p_user, 'account', 'Your bids on the ' || l.title || ' were cancelled',
      'We''ve cancelled your bids on this vehicle. Reason: ' || left(trim(p_reason), 200), '/lot/' || p_lot, 'bid-removed:' || p_lot || ':' || p_user);
  end if;
  if v_top is not null and v_top is distinct from v_old_leader then
    perform queue_notice(v_top, 'account', 'You''re the highest bidder again on the ' || l.title,
      'Another bidder''s bids were withdrawn, so you''re in front at $' || to_char(v_new, 'FM999,999,990') || '.', '/lot/' || p_lot,
      'lead-restored:' || p_lot || ':' || v_top || ':' || floor(extract(epoch from now()))::bigint);
  end if;
  return jsonb_build_object('current_bid', v_new, 'leader_changed', v_top is distinct from v_old_leader);
end $$;
revoke execute on function public.remove_bids_core(bigint, uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.remove_bids_core(bigint, uuid, text, uuid, boolean) to service_role;

-- staff removing a bidder: the same sum, and the bidder is told why
create or replace function public.admin_remove_bidder_core(p_lot bigint, p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  return remove_bids_core(p_lot, p_user, p_reason, auth.uid(), true);
end $$;
revoke execute on function public.admin_remove_bidder_core(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_remove_bidder_core(bigint, uuid, text) to service_role;

create or replace function public.withdraw_bid(p_lot bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l lots%rowtype; v_out jsonb; v_sale text;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.method = 'tender' then return jsonb_build_object('tender_count', withdraw_tender(p_lot)); end if;
  if l.status <> 'live' or l.live_state is null or l.live_state not in ('waiting', 'open')
     or (l.live_state = 'open' and l.ends_at <= now()) then
    raise exception 'withdraw_closed:bids can be withdrawn only until the hammer falls in a live auction';
  end if;
  if l.live_state = 'open' then
    select live_status into v_sale from sales where id = l.sale_id;
    if v_sale = 'paused' then raise exception 'live_paused'; end if;
  end if;
  if not exists (select 1 from max_bids where lot_id = p_lot and bidder_id = v_user) then raise exception 'no_bids'; end if;
  v_out := remove_bids_core(p_lot, v_user,
    case when l.live_state = 'waiting' then 'Early bid withdrawn by the bidder before the vehicle was offered'
         else 'Bid withdrawn by the bidder before the hammer fell' end, v_user, false);
  -- the room gets a moment to answer a lower price
  if l.live_state = 'open' then
    update lots set ends_at = greatest(ends_at, now() + make_interval(secs => coalesce(extend_seconds, 20))), updated_at = now()
      where id = p_lot and live_state = 'open' and status = 'live';
  end if;
  perform queue_notice(v_user, 'account', 'Your bid on the ' || l.title || ' was withdrawn',
    'You withdrew your bid, so you won''t buy this vehicle unless you bid again.', '/lot/' || p_lot,
    'bid-withdrawn:' || p_lot || ':' || v_user || ':' || floor(extract(epoch from now()))::bigint);
  return v_out;
end $$;
revoke execute on function public.withdraw_bid(bigint) from public, anon;
grant execute on function public.withdraw_bid(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. The seller's reserve: they can see it, and lower or remove it until the hammer falls (or tell the auctioneer,
--    who records it for them). Raising it is never allowed once there are bids (reserve_locked).
-- ---------------------------------------------------------------------------
alter table public.seller_decisions drop constraint if exists seller_decisions_action_check;
alter table public.seller_decisions add constraint seller_decisions_action_check
  check (action in ('accept_referral','decline_referral','accept_offer','decline_offer','lower_reserve','remove_reserve'));

create or replace function public.set_reserve_core(p_lot bigint, p_reserve numeric, p_via text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; pr lot_private%rowtype;
begin
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status not in ('scheduled', 'live') or (l.status = 'live' and l.live_state is distinct from 'waiting' and l.ends_at <= now()) then
    raise exception 'auction_closed';
  end if;
  select * into pr from lot_private where lot_id = p_lot for update;
  if pr.reserve_price is null then
    raise exception 'reserve_rule:there''s no reserve on this vehicle, so it already sells to the highest bid';
  end if;
  if p_reserve is not null and (p_reserve <= 0 or p_reserve <> round(p_reserve) or p_reserve > 10000000) then raise exception 'invalid_amount'; end if;
  if p_reserve is not null and p_reserve >= pr.reserve_price then
    raise exception 'reserve_rule:a reserve can only be lowered (it''s $% now)', to_char(pr.reserve_price, 'FM999,999,990');
  end if;
  update lot_private set reserve_price = p_reserve where lot_id = p_lot;
  -- the highest bidder's maximum already covers the new reserve: their bid rises to it, as if they'd just bid
  if p_reserve is not null and l.leader_id is not null and coalesce(pr.leader_max, 0) >= p_reserve and l.current_bid < p_reserve then
    insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, l.leader_id, p_reserve, true);
    update lots set current_bid = p_reserve, bid_count = bid_count + 1, reserve_met = true, updated_at = now() where id = p_lot;
  end if;
  insert into seller_decisions (lot_id, seller_id, action, amount, via)
    values (p_lot, l.seller_id, case when p_reserve is null then 'remove_reserve' else 'lower_reserve' end, p_reserve, p_via);
  select * into l from lots where id = p_lot;
  return jsonb_build_object('reserve', p_reserve, 'current_bid', l.current_bid, 'reserve_met', l.reserve_met, 'has_reserve', l.has_reserve);
end $$;
revoke execute on function public.set_reserve_core(bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.set_reserve_core(bigint, numeric, text) to service_role;

create or replace function public.seller_set_reserve(p_lot bigint, p_reserve numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from lots where id = p_lot and seller_id = auth.uid()) then raise exception 'forbidden'; end if;
  return set_reserve_core(p_lot, p_reserve, 'portal');
end $$;
revoke execute on function public.seller_set_reserve(bigint, numeric) from public, anon;
grant execute on function public.seller_set_reserve(bigint, numeric) to authenticated, service_role;

create or replace function public.seller_lot_reserve(p_lot bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  if auth.uid() is null or not exists (select 1 from lots where id = p_lot and seller_id = auth.uid()) then raise exception 'forbidden'; end if;
  select reserve_price into v from lot_private where lot_id = p_lot;
  return jsonb_build_object('reserve', v);
end $$;
revoke execute on function public.seller_lot_reserve(bigint) from public, anon;
grant execute on function public.seller_lot_reserve(bigint) to authenticated, service_role;

-- The auctioneer records the seller's instruction (given by phone) for the vehicle that's up.
create or replace function public.admin_live_reserve(p_sale bigint, p_reserve numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale;
  if not found or s.live_status not in ('running', 'paused') or s.current_lot_id is null
     or not exists (select 1 from lots where id = s.current_lot_id and status = 'live' and live_state = 'open') then
    raise exception 'no_open_lot';
  end if;
  return set_reserve_core(s.current_lot_id, p_reserve, 'admin');
end $$;
revoke execute on function public.admin_live_reserve(bigint, numeric) from public, anon;
grant execute on function public.admin_live_reserve(bigint, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. The live room: an auctioneer named before it starts; corrected vehicles wait 24 hours; nothing that wasn't
--     offered is sold when the sale ends (it's passed in, and early bidders are told)
-- ---------------------------------------------------------------------------
create or replace function public.live_pass_unoffered(p_sale bigint) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_users uuid[];
begin
  for r in select id, title from lots where sale_id = p_sale and status = 'live' and live_state = 'waiting'
           order by sale_order nulls last, id for update loop
    update lots set status = 'passed', live_state = 'closed', ends_at = least(ends_at, now()),
      notified_status = 'passed', updated_at = now() where id = r.id;
    select array_agg(distinct bidder_id) into v_users from max_bids where lot_id = r.id;
    if v_users is not null then
      perform queue_notice_many(v_users, 'account', 'The ' || r.title || ' wasn''t offered',
        'It wasn''t offered in this auction, so your early bid has lapsed and nobody owes anything. If it''s offered at a later auction, we''ll let you know.',
        '/lot/' || r.id, 'not-offered:' || r.id);
    end if;
    perform queue_seller_notice(r.id, 'Your ' || r.title || ' wasn''t offered this time',
      'The auction finished before it was offered, so nothing was sold. We''ll call you about the next auction.', '/sell/dashboard', 'seller-not-offered:' || r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.live_pass_unoffered(bigint) from public, anon, authenticated;
grant execute on function public.live_pass_unoffered(bigint) to service_role;

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
  else
    select id into v_lot from lots where sale_id = p_sale and live_state = 'waiting' and status = 'live'
      and (not v_live_only or corrected_at is null or corrected_at <= now() - interval '24 hours')
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

create or replace function public.admin_live_start(p_sale bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.mode <> 'live' then raise exception 'not_live_sale'; end if;
  if not s.published then raise exception 'sale_hidden:publish the sale first'; end if;
  if s.live_status <> 'scheduled' then raise exception 'sale_started:this sale has already started'; end if;
  if char_length(trim(coalesce(s.auctioneer, ''))) < 3 then
    raise exception 'auctioneer_needed:add the auctioneer''s name first (it''s shown to bidders for the whole auction)';
  end if;
  return live_advance(p_sale, null);
end $$;

-- the clock starts self-running sales too: the same rule
create or replace function public.live_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select * from sales where mode = 'live' and published and live_status in ('scheduled','running') loop
    begin
      if s.live_status = 'scheduled' and s.auto_advance and s.starts_at <= now() then
        if char_length(trim(coalesce(s.auctioneer, ''))) >= 3 then perform live_advance(s.id, null); n := n + 1; end if;
      elsif s.live_status = 'running' and s.auto_advance
        and not exists (select 1 from lots where id = s.current_lot_id and status = 'live' and live_state = 'open') then
        perform live_advance(s.id, null); n := n + 1;
      else
        perform live_estimates(s.id);
      end if;
    exception when others then
      null; -- one sale's problem never stops the others; Site health sees the error from the clock step
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.live_sweep() from public, anon, authenticated;
grant execute on function public.live_sweep() to service_role;

-- Finish the sale. The vehicle that's up closes on its bids (sold or passed in); anything not offered is passed in
-- (with the older timed rules, it closed on its early bids).
create or replace function public.admin_live_end(p_sale bigint) returns int
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; r record; n int := 0; v_live_only boolean := live_only();
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found or s.mode <> 'live' then raise exception 'not_live_sale'; end if;
  if s.live_status = 'ended' then return 0; end if;
  for r in select id, live_state from lots where sale_id = p_sale and status = 'live' and live_state in ('waiting','open') order by sale_order nulls last, id loop
    if v_live_only and r.live_state = 'waiting' then continue; end if;
    perform close_one_lot(r.id);
    if not v_live_only then n := n + 1; end if;
  end loop;
  if v_live_only then n := live_pass_unoffered(p_sale); end if;
  update sales set live_status = 'ended', live_ended_at = now(), paused_remaining = null,
    live_message = 'That''s the end of the sale. Thanks for bidding.', live_message_at = now(), updated_at = now() where id = p_sale;
  return n;
end $$;

-- What a seller hears when their vehicle goes on sale.
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
      'Keep it at your place, insured and in the same condition, until our transport partner picks it up after the buyer has paid. Buyers never visit and are never told your name or address. If a bidder orders a mechanical inspection, our partner mechanic will call you to arrange a time. Follow the bids from your seller dashboard.',
      '/sell/dashboard', 'live:' || new.id);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Relisting for a later auction: a fresh draft that doesn't carry the old sale, its place in it or its locked fees.
--     Nor its estimate: a vehicle passed in didn't reach its reserve, so it needs a fresh estimate with fresh grounds.
-- ---------------------------------------------------------------------------
create or replace function public.admin_relist(p_lot bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_new bigint; cols text;
  skip text[] := array['id','status','current_bid','bid_count','leader_id','starts_at','ends_at','decision_by','winner_id','sold_price',
    'sold_via','created_at','updated_at','featured','notified_status','published_at','views','relisted_from','corrected_at','reserve_met',
    'verified','verified_at','ppsr_checked_at','ppsr_cert_no','sale_id','sale_order','live_state','extend_seconds','fees','tender_count',
    'estimate_low','estimate_high'];
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into l from lots where id = p_lot;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status not in ('passed','cancelled') then raise exception 'not_relistable:only a vehicle that didn''t sell, or whose sale was cancelled, can be relisted'; end if;
  if exists (select 1 from lots where relisted_from = p_lot and status <> 'cancelled') then raise exception 'already_relisted:this vehicle has already been relisted'; end if;
  v_new := nextval('lot_number_seq');
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols from pg_attribute
   where attrelid = 'public.lots'::regclass and attnum > 0 and not attisdropped and attgenerated = '' and attname <> all (skip);
  execute format('insert into public.lots (id, status, relisted_from, reserve_met, %1$s) select $1, ''draft'', $2, not has_reserve, %1$s from public.lots where id = $2', cols)
    using v_new, p_lot;
  perform copy_lot_rows('lot_private', p_lot, v_new, array['seller_invite','leader_max','leader_max_at','estimate_basis','estimate_by','estimate_at']);
  perform copy_lot_rows('lot_photos', p_lot, v_new, array['id','created_at']);
  perform copy_lot_rows('lot_flaws', p_lot, v_new, array['id']);
  perform copy_lot_rows('lot_videos', p_lot, v_new, array['id','created_at'], 'status = ''approved''');
  perform copy_lot_rows('seller_agreements', p_lot, v_new, array['id'], 'status = ''signed''');
  return v_new;
end $$;
revoke execute on function public.admin_relist(bigint) from public, anon;
grant execute on function public.admin_relist(bigint) to authenticated, service_role;

-- The hour-before reminder for a watched vehicle. In a live auction it's "up in about an hour" (its time is an
-- estimate that follows the vehicles before it) and links to the live room; a timed auction keeps the old words.
create or replace function public.queue_ending_reminders(p_limit int default 20000) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
    with due as (
      select w.user_id, w.lot_id, l.title from watchlist w join lots l on l.id = w.lot_id
      where l.status = 'live' and l.ends_at > now() and l.ends_at <= now() + interval '1 hour'
        and w.remind and w.reminded_at is null
      limit p_limit for update of w skip locked
    ), upd as (
      update watchlist w set reminded_at = now() from due where w.user_id = due.user_id and w.lot_id = due.lot_id returning due.*
    )
    select upd.lot_id, upd.title, array_agg(upd.user_id) users, max(l.ends_at) ends_at, max(l.live_state) live_state, max(s.slug) slug
    from upd join lots l on l.id = upd.lot_id left join sales s on s.id = l.sale_id and s.mode = 'live'
    group by upd.lot_id, upd.title
  loop
    if r.live_state in ('waiting', 'open') and r.slug is not null then
      n := n + queue_notice_many(r.users, 'ending', 'Up in about an hour: ' || r.title,
        'A vehicle on your watchlist is due in the live auction in about an hour (an estimate: it depends on the vehicles before it). Join the live room to bid, or leave an early bid on the listing.',
        '/live/' || r.slug, 'ending:' || r.lot_id, r.ends_at + interval '1 hour');
    else
      n := n + queue_notice_many(r.users, 'ending', 'Ending within the hour: ' || r.title,
        'A vehicle on your watchlist ends within the hour.', '/lot/' || r.lot_id, 'ending:' || r.lot_id, r.ends_at);
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_ending_reminders(int) from public, anon, authenticated;
grant execute on function public.queue_ending_reminders(int) to service_role;

-- ---------------------------------------------------------------------------
-- 12. Nothing new open to the public; the console can call its new step; new terms
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_live_start(bigint) from public, anon;
grant execute on function public.admin_live_start(bigint) to authenticated, service_role;
revoke execute on function public.admin_live_end(bigint) from public, anon;
grant execute on function public.admin_live_end(bigint) to authenticated, service_role;
revoke execute on function public.notify_seller_live() from public, anon, authenticated;

update public.settings set value = coalesce(value, '{}'::jsonb) || '{"buyer_version": "2026-10-23", "seller_version": "2026-10-23"}'::jsonb
  where key = 'terms';
