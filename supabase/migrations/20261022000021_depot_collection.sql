-- Buyers never go to the seller's place, and never learn who the seller is.
--
-- * No viewings or video calls at all. A listing is sold on our walkaround and visual condition report, the photos,
--   the damage map and the seller's own walkaround video (checked by us). A bidder can order a mechanical inspection
--   through our partner mechanic (the bidder pays; they don't attend and never get the address).
-- * Vehicles stay with their owners until they're paid for. Then our transport partner picks them up and takes them
--   to a depot (transport_jobs). The buyer collects from the depot, after the ownership transfer, with a release code.
--   Listings show the depot's suburb (lots.depot_id copies it into lots.suburb/state/postcode), never the seller's.
-- * The transport is part of the buyer's premium: an amount per vehicle (lots.transport_fee, from the transport quote,
--   before GST) set before bidding opens, locked into lots.fees with the other fees, and in every all-in price.
-- * Queensland: whether a statutory warranty applies is stated on every listing before bidding (lots.statutory_warranty).
-- * A new listing check: nothing in the photos, video or words identifies the seller or where they live.
-- * Terms version 2026-10-22: members accept the new terms before they bid again.

-- ---------------------------------------------------------------------------
-- 1. Depots (our transport partner's yards, where buyers collect). The public sees the name, suburb and hours; the
--    street address goes to a buyer only with a confirmed collection time. Staff edit them through the server.
-- ---------------------------------------------------------------------------
create table if not exists public.depots (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  partner_id uuid references public.partners(id) on delete set null,
  suburb text not null check (char_length(suburb) between 2 and 60),
  state text not null check (state in ('QLD','NSW','VIC','SA','WA','TAS','ACT','NT')),
  postcode text not null check (postcode ~ '^[0-9]{4}$'),
  hours text check (hours is null or char_length(hours) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists depots_state on public.depots (state) where active;
alter table public.depots enable row level security;
drop policy if exists depots_read on public.depots;
create policy depots_read on public.depots for select using (active or (select public.is_admin()));
revoke insert, update, delete on public.depots from anon, authenticated;

create table if not exists public.depot_private (
  depot_id uuid primary key references public.depots(id) on delete cascade,
  address text not null check (char_length(address) between 5 and 200),  -- street address, sent with a confirmed collection
  phone text,                       -- the handover link goes to the depot by SMS and email
  email text,
  contact_name text,
  notes text                        -- for our team: gate codes, after-hours drop-off and so on
);
alter table public.depot_private enable row level security;
drop policy if exists depot_private_admin on public.depot_private;
create policy depot_private_admin on public.depot_private for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.depot_private from anon, authenticated;

do $$
declare t text; k text;
begin
  for t, k in select * from (values ('depots', 'id'), ('depot_private', 'depot_id')) v(t, k) loop
    execute format('drop trigger if exists zz_audit_admin on public.%I', t);
    execute format('create trigger zz_audit_admin after insert or update or delete on public.%I for each row execute function public.audit_admin_write(%L)', t, k);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Listings: the depot, the transport amount, the statutory warranty statement, no viewings
-- ---------------------------------------------------------------------------
alter table public.lots add column if not exists depot_id uuid references public.depots(id) on delete restrict;
alter table public.lots add column if not exists transport_fee numeric(10,2);
alter table public.lots drop constraint if exists lots_transport_fee_check;
alter table public.lots add constraint lots_transport_fee_check check (transport_fee is null or (transport_fee >= 0 and transport_fee <= 20000));
alter table public.lots add column if not exists statutory_warranty boolean;
create index if not exists lots_depot on public.lots (depot_id) where depot_id is not null;

-- Where the vehicle will be picked up from, and anything the driver should know (staff and our partners only).
alter table public.lot_private add column if not exists pickup_notes text;
-- What the seller agreed to when signing: the pickup after payment, inspection access, the walkaround video, and
-- never dealing with buyers directly.
alter table public.seller_agreements add column if not exists acknowledgements text[] not null default '{}';

-- The listing's location is the depot the buyer collects from (never the seller's suburb). Named so it runs
-- before the correction log (triggers fire in name order), which then tells bidders if a live listing's depot moves.
create or replace function public.lot_depot_location() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.depot_id is not null then
    select suburb, state, postcode into d from depots where id = new.depot_id;
    if found then new.suburb := d.suburb; new.state := d.state; new.postcode := d.postcode; end if;
  end if;
  return new;
end $$;
revoke execute on function public.lot_depot_location() from public, anon, authenticated;
drop trigger if exists lot_a_depot_location on public.lots;
create trigger lot_a_depot_location before insert or update of depot_id, suburb, state, postcode on public.lots
  for each row execute function public.lot_depot_location();

-- A depot that moves takes its listings with it (live ones are corrected and their bidders told).
create or replace function public.depot_moved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.suburb, new.state, new.postcode) is distinct from (old.suburb, old.state, old.postcode) then
    update lots set depot_id = depot_id where depot_id = new.id and status in ('draft','scheduled','live','referred','offers');
  end if;
  return null;
end $$;
revoke execute on function public.depot_moved() from public, anon, authenticated;
drop trigger if exists depot_moved on public.depots;
create trigger depot_moved after update of suburb, state, postcode on public.depots
  for each row execute function public.depot_moved();

-- No viewings: the seller's place is never offered to buyers. Open requests are cancelled and everyone is told.
do $$
declare v record;
begin
  for v in select w.id, w.user_id, w.lot_id, w.kind, w.status, w.host, l.title from public.viewings w join public.lots l on l.id = w.lot_id
           where w.status in ('requested', 'confirmed') loop
    update public.viewings set status = 'cancelled', staff_note = 'Tyrebiter no longer offers viewings', status_at = now() where id = v.id;
    perform public.queue_notice(v.user_id, 'account', 'Your ' || case when v.kind = 'video' then 'video walkaround' else 'viewing' end || ' is cancelled: ' || v.title,
      'We no longer offer viewings or video calls, for everyone''s safety. The listing has our condition report, photos and the walkaround video. You can order a mechanical inspection from the listing, or ask us anything.',
      '/lot/' || v.lot_id, 'viewing-off:' || v.id);
    if v.status = 'confirmed' and v.host = 'seller' then
      perform public.queue_seller_notice(v.lot_id, 'Viewing cancelled: ' || v.title,
        'Nobody will come to see it. Buyers no longer visit: if one orders a mechanical inspection, our partner mechanic will call you to arrange a time.',
        '/sell/dashboard', 'viewing-off-seller:' || v.id);
    end if;
  end loop;
end $$;
update public.lots set in_person_viewing = false where in_person_viewing;
alter table public.lots drop constraint if exists lots_no_viewings;
alter table public.lots add constraint lots_no_viewings check (not in_person_viewing);

create or replace function public.request_viewing(p_lot bigint, p_kind text, p_slots jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'viewing_not_offered';
end $$;
revoke execute on function public.request_viewing(bigint, text, jsonb, text) from public, anon;
grant execute on function public.request_viewing(bigint, text, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The transport is part of the buyer's premium (GST on the whole premium), locked when the listing goes live
-- ---------------------------------------------------------------------------
create or replace function public.price_breakdown_with(p_price numeric, f jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_transport numeric := greatest(round(coalesce((f->>'transport')::numeric, 0), 2), 0);
  v_premium numeric := round(p_price * coalesce((f->>'premium_rate')::numeric, 0), 2) + v_transport;
  v_gst numeric := round(v_premium * 0.10, 2);
  v_admin numeric := coalesce((f->>'admin_fee')::numeric, 0);
  v_sub numeric; v_mode text; v_card numeric; v_sur numeric;
begin
  v_sub := p_price + v_premium + v_gst + v_admin;
  if coalesce(f->>'pay_mode', 'transfer') = 'transfer' then
    v_mode := 'deposit'; v_card := 0; v_sur := 0;
  elsif f->>'pay_mode' = 'deposit' then
    v_mode := 'deposit'; v_card := least(deposit_for_with(p_price, f), v_sub); v_sur := 0;
  else
    if v_sub < coalesce((f->>'card_limit')::numeric, 0) then v_mode := 'card'; v_card := v_sub;
    else v_mode := 'deposit';
      v_card := case when v_sub < coalesce((f->>'nrd_split')::numeric, 0) then coalesce((f->>'nrd_low')::numeric, 0)
                     else coalesce((f->>'nrd_high')::numeric, 0) end;
    end if;
    v_sur := round(v_card * coalesce((f->>'surcharge_rate')::numeric, 0), 2);
  end if;
  return jsonb_build_object('price', p_price, 'premium', v_premium, 'transport', v_transport, 'gst', v_gst, 'admin_fee', v_admin,
    'subtotal', v_sub, 'mode', v_mode, 'card_base', v_card, 'surcharge', v_sur,
    'card_amount', v_card + v_sur, 'balance_due', v_sub - v_card, 'total', v_sub + v_sur);
end $$;

-- A listing's fees: locked when it went live (with its transport amount; none for listings that went live before
-- transport was part of the premium), or for a draft, today's fees with the transport entered so far.
create or replace function public.lot_price_breakdown(p_lot bigint, p_price numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  select price_breakdown_with(p_price,
    coalesce((select value from settings where key = 'fees'), '{}'::jsonb)
    || (coalesce(l.fees, '{}'::jsonb) - 'pay_mode' - 'deposit_rate' - 'deposit_min' - 'deposit_cap')
    || jsonb_build_object('transport', case when l.fees is not null then coalesce((l.fees->>'transport')::numeric, 0)
                                            else coalesce(l.transport_fee, 0) end))
  from (select 1) one left join lots l on l.id = p_lot
$$;

create or replace function public.lot_fees_snapshot() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'draft' then new.fees := null;
  elsif new.status in ('scheduled','live') and new.fees is null then
    select value || jsonb_build_object('transport', coalesce(new.transport_fee, 0)) into new.fees from settings where key = 'fees';
  end if;
  return new;
end $$;

-- The transport amount can change until bidding opens (a scheduled listing takes the new amount), never after.
create or replace function public.lot_transport_lock() returns trigger language plpgsql set search_path = public as $$
begin
  if new.transport_fee is distinct from old.transport_fee then
    if old.status = 'scheduled' and new.fees is not null then
      new.fees := new.fees || jsonb_build_object('transport', coalesce(new.transport_fee, 0));
    elsif old.status <> 'draft' and old.status <> 'scheduled' then
      raise exception 'transport_locked:the transport amount is part of the buyer''s premium, so it can''t change once bidding has opened';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lot_transport_lock on public.lots;
create trigger lot_transport_lock before update of transport_fee on public.lots
  for each row execute function public.lot_transport_lock();

alter table public.invoices add column if not exists transport numeric(10,2) not null default 0;

create or replace function public.create_invoice(p_lot bigint, p_buyer uuid, p_price numeric, p_via text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b jsonb := lot_price_breakdown(p_lot, p_price); v_id uuid; v_gst_status text;
  v_bank boolean := pay_mode() in ('deposit', 'transfer'); v_apply numeric := 0; v_sub numeric := (b->>'subtotal')::numeric;
begin
  select gst_status into v_gst_status from lots where id = p_lot;
  if v_bank and (b->>'card_base')::numeric > 0 then
    perform pg_advisory_xact_lock(hashtext('deposit:' || p_buyer::text));
    v_apply := least((b->>'card_base')::numeric, greatest(deposit_balance(p_buyer), 0));
  end if;
  insert into invoices (lot_id, buyer_id, sold_via, price, premium, transport, gst, admin_fee, subtotal, mode,
    card_amount, surcharge, balance_due, total, due_at, vehicle_gst, terms_version, pay_method, deposit_applied)
  values (p_lot, p_buyer, p_via, p_price, (b->>'premium')::numeric, coalesce((b->>'transport')::numeric, 0), (b->>'gst')::numeric,
    (b->>'admin_fee')::numeric, v_sub, case when v_bank then 'deposit' else b->>'mode' end,
    case when v_bank then v_apply else (b->>'card_amount')::numeric end,
    case when v_bank then 0 else (b->>'surcharge')::numeric end,
    case when v_bank then v_sub - v_apply else (b->>'balance_due')::numeric end,
    case when v_bank then v_sub else (b->>'total')::numeric end,
    business_days_from(now(), setting_num('auction','payment_days')::int),
    case when v_gst_status = 'inc' then round(p_price / 11, 2) else 0 end,
    (select terms_version from profiles where id = p_buyer),
    case when v_bank then 'bank' else 'card' end, v_apply)
  returning id into v_id;
  if v_apply > 0 then
    insert into bidder_deposits (user_id, kind, amount, invoice_id, note)
      values (p_buyer, 'applied', -v_apply, v_id, 'Deposit for the vehicle you won');
  end if;
  -- freeze the listing as it was sold (evidence for any misdescription claim)
  insert into lot_snapshots (lot_id, reason, data)
  select p_lot, 'sold', jsonb_build_object(
    'lot', to_jsonb(l), 'flaws', (select coalesce(jsonb_agg(to_jsonb(f) order by f.sort), '[]') from lot_flaws f where f.lot_id = p_lot),
    'photos', (select coalesce(jsonb_agg(ph.path order by ph.sort), '[]') from lot_photos ph where ph.lot_id = p_lot))
  from lots l where l.id = p_lot;
  return v_id;
end $$;
revoke execute on function public.create_invoice(bigint, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.create_invoice(bigint, uuid, numeric, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Publishing: a depot, the transport amount and the statutory warranty statement; the privacy check
-- ---------------------------------------------------------------------------
-- Kept in step with LISTING_CHECKS in src/lib/listing.ts.
create or replace function public.listing_check_keys() returns text[]
language sql immutable as $$
  select array['vin','year','odometer','transmission','fuel','features','warning_lights','runs','damage','photos','privacy']
$$;

create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean; v_missing text[];
begin
  if new.status in ('live','scheduled') and (tg_op = 'INSERT' or old.status = 'draft') then
    if current_user in ('authenticated','service_role','anon') then
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
          raise exception 'not_ready:tick every listing check against the vehicle (still to do: %)', array_to_string(v_missing, ', ');
        end if;
        if new.stolen_clear is false then
          raise exception 'not_ready:the PPSR shows this vehicle as stolen. Do not list it; contact the police';
        end if;
      end if;
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;

-- The statutory warranty statement is a key fact: changing it on a live listing is a correction like any other.
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
      ('visual_grade','Visual grade'), ('grade_paint','Paint grade'), ('grade_interior','Interior grade'), ('grade_tyres','Tyre grade'),
      ('tyre_tread','Tyre tread'), ('seats','Seats'), ('gvm_kg','GVM'), ('seller_type','Seller'), ('gst_status','GST'),
      ('ev_battery_soh','Battery health'), ('colour','Colour'), ('take','Description'), ('suburb','Collect from'), ('state','State'),
      ('statutory_warranty','Statutory warranty')) t(field, label)
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
  if new.status = 'live' and new.ends_at is not null and new.ends_at < now() + interval '24 hours' then
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
         old.title, old.rego_plate, old.rego_state, old.take, old.suburb, old.state, old.statutory_warranty)
    is distinct from
        (new.year, new.make, new.model, new.variant, new.body, new.engine, new.transmission, new.fuel, new.drive, new.odometer,
         new.hours, new.vin, new.build_date, new.compliance_date, new.registration, new.rego_expiry, new.write_off_status,
         new.stolen_clear, new.ppsr_clear, new.keys, new.service_books, new.runs, new.known_faults, new.service_history,
         new.roadworthy_note, new.visual_grade, new.grade_paint, new.grade_interior, new.grade_tyres, new.tyre_tread, new.seats,
         new.gvm_kg, new.seller_type, new.gst_status, new.ev_battery_soh, new.colour, new.disclosures,
         new.title, new.rego_plate, new.rego_state, new.take, new.suburb, new.state, new.statutory_warranty))
  execute function public.lot_corrections_log();

-- ---------------------------------------------------------------------------
-- 5. Transport jobs: one per paid invoice. Staff book our transport partner, the driver picks it up from the seller
--    (checking it against the listing), it arrives at the depot, and the buyer collects it there.
-- ---------------------------------------------------------------------------
create sequence if not exists public.transport_seq start 40001;
create table if not exists public.transport_jobs (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('TR-' || nextval('public.transport_seq')),   -- the driver quotes it to the seller
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  lot_id bigint not null references public.lots(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id),
  depot_id uuid references public.depots(id) on delete set null,
  status text not null default 'to_book' check (status in ('to_book','booked','picked_up','at_depot','released','returned','cancelled')),
  pickup_on date,
  pickup_window text check (pickup_window is null or pickup_window in ('morning','afternoon','day')),
  carrier_ref text,
  picked_up_at timestamptz,
  pickup_odometer int,
  pickup_keys int,
  condition_ok boolean,           -- the driver's check against the listing at pickup
  condition_note text,            -- what was different (the buyer sees it; never names the seller)
  buyer_decision text check (buyer_decision is null or buyer_decision in ('proceed','cancel')),
  buyer_decided_at timestamptz,
  at_depot_at timestamptz,
  released_at timestamptz,
  sale_cancelled_at timestamptz,
  staff_note text,
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists transport_jobs_open on public.transport_jobs (status, created_at) where status in ('to_book','booked','picked_up','at_depot');
create index if not exists transport_jobs_lot on public.transport_jobs (lot_id);
create index if not exists transport_jobs_buyer on public.transport_jobs (buyer_id);
create index if not exists transport_jobs_depot on public.transport_jobs (depot_id) where depot_id is not null;
alter table public.transport_jobs enable row level security;
drop policy if exists transport_jobs_admin on public.transport_jobs;
create policy transport_jobs_admin on public.transport_jobs for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.transport_jobs from anon, authenticated;
drop trigger if exists zz_audit_admin on public.transport_jobs;
create trigger zz_audit_admin after insert or update or delete on public.transport_jobs for each row execute function public.audit_admin_write('id');

create or replace function public.pickup_window_label(p text) returns text language sql immutable as $$
  select case p when 'morning' then 'in the morning (8am to 12pm)' when 'afternoon' then 'in the afternoon (12pm to 5pm)' else 'during the day (8am to 5pm)' end
$$;

-- The buyer can book a collection once the vehicle is at the depot and the paperwork is done (and, if the driver
-- noted a change at pickup, once the buyer has said they're going ahead). That's when the collection window starts.
create or replace function public.collection_ready(p_invoice uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare i record; j record; d record; v_by timestamptz; v_title text;
begin
  select id, buyer_id, lot_id, status, collected_at, collect_by into i from invoices where id = p_invoice for update;
  if not found or i.status <> 'paid' or i.collected_at is not null then return false; end if;
  if not exists (select 1 from ownership_transfers where invoice_id = p_invoice and status = 'complete') then return false; end if;
  select * into j from transport_jobs where invoice_id = p_invoice;
  if not found or j.status <> 'at_depot' or (j.condition_ok is false and j.buyer_decision is distinct from 'proceed') then return false; end if;
  v_by := greatest(coalesce(i.collect_by, now()), business_days_from(now(), setting_num('auction','collection_days')::int));
  update invoices set collect_by = v_by where id = p_invoice;
  select title into v_title from lots where id = i.lot_id;
  select suburb, state into d from depots where id = j.depot_id;
  perform queue_notice(i.buyer_id, 'account', 'Ready to collect: ' || v_title,
    'It''s at our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || ' and the paperwork is done. Book a time to collect it by '
      || to_char(v_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || ' (storage applies after that). We send the address and your release code once your time is confirmed.',
    '/account/invoices/' || p_invoice, 'collect-ready:' || p_invoice);
  return true;
end $$;
revoke execute on function public.collection_ready(uuid) from public, anon, authenticated;
grant execute on function public.collection_ready(uuid) to service_role;

-- Paid in full: start the transfer of ownership and the pickup, and tell the buyer, the seller and our team.
create or replace function public.start_ownership_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record; v_reg text; n int; d record; v_where text; v_job text; v_admins uuid[];
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select title, registration, rego_plate, rego_state, state, depot_id into l from lots where id = new.lot_id;
    v_reg := coalesce(l.registration, case when coalesce(l.rego_plate, '') <> '' then 'registered' else 'unregistered' end);
    insert into ownership_transfers (invoice_id, lot_id, buyer_id, registration, rego_state)
      values (new.id, new.lot_id, new.buyer_id, v_reg, coalesce(l.rego_state, l.state))
      on conflict (invoice_id) do nothing;
    get diagnostics n = row_count;
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
    if v_job is not null then
      select array_agg(id) into v_admins from profiles where role = 'admin';
      if v_admins is not null then
        perform queue_notice_many(v_admins, 'staff', 'Book a pickup: ' || l.title,
          v_job || ' is paid in full. Book our transport partner to pick it up from the seller and take it to ' || coalesce(d.name, 'a depot (choose one first)') || '. Admin → Transport.',
          '/admin/transport', 'transport-new:' || v_job);
      end if;
    end if;
  end if;
  return null;
end $$;

-- Ownership done: ready to collect if it's already at the depot; otherwise the buyer hears when it arrives.
create or replace function public.transfer_completed(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.ownership_transfers%rowtype; v_title text; v_job text;
begin
  select * into t from ownership_transfers where id = p_id;
  if not found then return; end if;
  select title into v_title from lots where id = t.lot_id;
  select status into v_job from transport_jobs where invoice_id = t.invoice_id;
  if not collection_ready(t.invoice_id) then
    perform queue_notice(t.buyer_id, 'account', 'Ownership done: ' || v_title,
      case when v_job = 'at_depot' then 'Thanks, that''s done. We''ll be in touch about collecting it.'
           else 'Thanks, that''s done. Our transport partner is bringing it to our depot: we''ll tell you as soon as it''s there, so you can book a time to collect it.' end,
      '/account/invoices/' || t.invoice_id, 'transfer-done:' || t.id);
  end if;
  perform queue_seller_notice(t.lot_id, 'Ownership transferred: ' || v_title,
    case when v_job in ('to_book', 'booked') then 'The transfer is complete. Next: our transport partner''s pickup. Keep it ready, with all the keys.'
         else 'The transfer is complete. That''s everything from you: we pay you once the buyer has collected it from our depot and their claim window has closed.' end,
    '/sell/dashboard', 'transfer-done-seller:' || t.id);
end $$;
revoke execute on function public.transfer_completed(uuid) from public, anon, authenticated;
grant execute on function public.transfer_completed(uuid) to service_role;

-- Staff, step by step (Admin → Transport): choose the depot, book the pickup, picked up (with the driver's check),
-- at the depot, returned to the seller (a sale cancelled after pickup), cancel, or a note.
create or replace function public.admin_transport(p_job uuid, p_action text, p_data jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare j public.transport_jobs%rowtype; l record; d record; v_day date; v_win text; v_ok boolean; v_note text; v_admins uuid[];
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if not is_admin() and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into j from transport_jobs where id = p_job for update;
  if not found then raise exception 'transport_not_found'; end if;
  select id, title, keys into l from lots where id = j.lot_id;
  p_data := coalesce(p_data, '{}'::jsonb);
  v_note := nullif(left(trim(coalesce(p_data->>'note', '')), 500), '');

  if p_action = 'depot' then
    if j.status not in ('to_book', 'booked', 'picked_up') then raise exception 'transport_step:the vehicle is already at the depot'; end if;
    if coalesce(p_data->>'depot_id', '') !~ '^[0-9a-f-]{36}$' or not exists (select 1 from depots where id = (p_data->>'depot_id')::uuid and active) then
      raise exception 'transport_depot';
    end if;
    update transport_jobs set depot_id = (p_data->>'depot_id')::uuid, status_at = now() where id = p_job;
  elsif p_action = 'book' then
    if j.status not in ('to_book', 'booked') then raise exception 'transport_step:it has already been picked up'; end if;
    if j.depot_id is null then raise exception 'transport_depot'; end if;
    if coalesce(p_data->>'day', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'transport_day'; end if;
    v_day := (p_data->>'day')::date;
    if v_day < v_today or v_day > v_today + 60 then raise exception 'transport_day'; end if;
    v_win := case when p_data->>'window' in ('morning', 'afternoon') then p_data->>'window' else 'day' end;
    update transport_jobs set status = 'booked', pickup_on = v_day, pickup_window = v_win,
      carrier_ref = coalesce(nullif(left(trim(coalesce(p_data->>'carrier_ref', '')), 60), ''), carrier_ref),
      staff_note = coalesce(v_note, staff_note), status_at = now() where id = p_job;
    perform queue_seller_notice(j.lot_id, 'Pickup booked: ' || l.title,
      'Our transport partner will pick it up on ' || to_char(v_day, 'FMDay FMDD FMMonth') || ' ' || pickup_window_label(v_win)
        || '. The driver will quote booking reference ' || j.ref || ': only hand it over to them, with all the keys' || coalesce(' (' || l.keys || ')', '')
        || '. Please take out your belongings and any toll tag. Can''t make that time? Call us straight away.',
      '/sell/dashboard', 'transport-booked:' || j.id || ':' || v_day || ':' || v_win);
  elsif p_action = 'picked_up' then
    if j.status not in ('to_book', 'booked') then raise exception 'transport_step:it isn''t waiting to be picked up'; end if;
    if j.depot_id is null then raise exception 'transport_depot'; end if;
    v_ok := coalesce((p_data->>'ok')::boolean, true);
    if not v_ok and v_note is null then raise exception 'transport_note'; end if;
    update transport_jobs set status = 'picked_up', picked_up_at = now(), status_at = now(),
      pickup_odometer = case when coalesce(p_data->>'odometer', '') ~ '^\d{1,7}$' then (p_data->>'odometer')::int end,
      pickup_keys = case when coalesce(p_data->>'keys', '') ~ '^\d{1,2}$' then (p_data->>'keys')::int end,
      condition_ok = v_ok, condition_note = v_note where id = p_job;
    select suburb, state into d from depots where id = j.depot_id;
    if v_ok then
      perform queue_notice(j.buyer_id, 'account', 'On its way to our depot: ' || l.title,
        'Our transport partner has picked it up. It''s going to our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || ': we''ll tell you when it arrives.',
        '/account/invoices/' || j.invoice_id, 'transport-picked:' || j.id);
      perform queue_seller_notice(j.lot_id, 'Picked up: ' || l.title,
        'Thanks. Our transport partner has collected it. We pay you once the buyer has collected it from our depot and their claim window has closed.',
        '/sell/dashboard', 'transport-picked-seller:' || j.id);
    else
      perform queue_notice(j.buyer_id, 'account', 'Please read: a change to the ' || l.title,
        'When our driver picked it up, they noted something the listing doesn''t show: ' || v_note
          || ' You can go ahead with the purchase, or cancel it for a full refund. Choose on your invoice within 2 business days; we''ll call you if we don''t hear from you.',
        '/account/invoices/' || j.invoice_id, 'transport-change:' || j.id);
      perform queue_seller_notice(j.lot_id, 'Picked up: ' || l.title,
        'Our transport partner has collected it. The driver noted something the listing doesn''t show, so we''ve told the buyer and we''ll call you about it.',
        '/sell/dashboard', 'transport-picked-seller:' || j.id);
    end if;
  elsif p_action = 'at_depot' then
    if j.status <> 'picked_up' then raise exception 'transport_step:mark it picked up first'; end if;
    update transport_jobs set status = 'at_depot', at_depot_at = now(), status_at = now() where id = p_job;
    if j.sale_cancelled_at is null and not collection_ready(j.invoice_id) then
      select suburb, state into d from depots where id = j.depot_id;
      perform queue_notice(j.buyer_id, 'account', 'At our depot: ' || l.title,
        'It''s at our depot in ' || coalesce(d.suburb || ', ' || d.state, 'your area') || '. '
          || case when j.condition_ok is false and j.buyer_decision is distinct from 'proceed' then 'Tell us on your invoice whether you''re going ahead, then you can book a time to collect it.'
                  else 'Once the transfer of ownership is done, you book a time to collect it.' end,
        '/account/invoices/' || j.invoice_id, 'transport-depot:' || j.id);
    end if;
  elsif p_action = 'returned' then
    if j.status not in ('picked_up', 'at_depot') or j.sale_cancelled_at is null then raise exception 'transport_step:only a vehicle whose sale was cancelled goes back to the seller'; end if;
    update transport_jobs set status = 'returned', status_at = now(), staff_note = coalesce(v_note, staff_note) where id = p_job;
  elsif p_action = 'cancel' then
    if j.status not in ('to_book', 'booked') then raise exception 'transport_step:it has already been picked up'; end if;
    if v_note is null then raise exception 'transport_note'; end if;
    update transport_jobs set status = 'cancelled', status_at = now(), staff_note = v_note where id = p_job;
    if j.status = 'booked' then
      perform queue_seller_notice(j.lot_id, 'Pickup cancelled: ' || l.title,
        'The pickup' || coalesce(' on ' || to_char(j.pickup_on, 'FMDay FMDD FMMonth'), '') || ' is off. Your consultant will call you about what happens next.',
        '/sell/dashboard', 'transport-off:' || j.id);
    end if;
  elsif p_action = 'note' then
    update transport_jobs set staff_note = v_note where id = p_job;
  else
    raise exception 'transport_action';
  end if;
  return (select status from transport_jobs where id = p_job);
end $$;
revoke execute on function public.admin_transport(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_transport(uuid, text, jsonb) to authenticated, service_role;

-- The buyer, when the driver noted a change at pickup: go ahead, or cancel for a full refund (our team refunds it).
create or replace function public.transport_decision(p_invoice uuid, p_proceed boolean) returns text
language plpgsql security definer set search_path = public as $$
declare j public.transport_jobs%rowtype; v_title text; v_admins uuid[];
begin
  select * into j from transport_jobs where invoice_id = p_invoice for update;
  if not found or j.buyer_id is distinct from (select auth.uid()) then raise exception 'not_found'; end if;
  if j.condition_ok is not false or j.sale_cancelled_at is not null then raise exception 'transport_no_decision'; end if;
  if j.buyer_decision is not null then return j.buyer_decision; end if;
  update transport_jobs set buyer_decision = case when p_proceed then 'proceed' else 'cancel' end, buyer_decided_at = now() where id = j.id;
  select title into v_title from lots where id = j.lot_id;
  select array_agg(id) into v_admins from profiles where role = 'admin';
  if v_admins is not null then
    perform queue_notice_many(v_admins, 'staff',
      case when p_proceed then 'Buyer is going ahead: ' else 'Buyer wants to cancel: ' end || v_title,
      j.ref || case when p_proceed then ': the buyer accepted the change the driver noted at pickup.' else ': the buyer chose to cancel after the change the driver noted at pickup. Cancel and refund the sale (Admin → Invoices), and arrange the vehicle''s return.' end,
      '/admin/transport', 'transport-decision:' || j.id);
  end if;
  if p_proceed then perform collection_ready(p_invoice); end if;
  return case when p_proceed then 'proceed' else 'cancel' end;
end $$;
revoke execute on function public.transport_decision(uuid, boolean) from public, anon;
grant execute on function public.transport_decision(uuid, boolean) to authenticated, service_role;

-- A sale cancelled before pickup cancels the pickup; after pickup, our team arranges the vehicle's return.
create or replace function public.transport_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare j public.transport_jobs%rowtype; v_title text; v_admins uuid[];
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select * into j from transport_jobs where invoice_id = new.id for update;
    if not found then return null; end if;
    select title into v_title from lots where id = new.lot_id;
    if j.status in ('to_book', 'booked') then
      update transport_jobs set status = 'cancelled', status_at = now(), staff_note = coalesce(staff_note || E'\n', '') || 'Sale cancelled' where id = j.id;
      if j.status = 'booked' then
        perform queue_seller_notice(new.lot_id, 'Pickup cancelled: ' || v_title,
          'The pickup' || coalesce(' on ' || to_char(j.pickup_on, 'FMDay FMDD FMMonth'), '') || ' is off because the sale has been cancelled. Your consultant will call you about what happens next.',
          '/sell/dashboard', 'transport-off:' || j.id);
      end if;
    elsif j.status in ('picked_up', 'at_depot') then
      update transport_jobs set sale_cancelled_at = now(), status_at = now() where id = j.id;
      select array_agg(id) into v_admins from profiles where role = 'admin';
      if v_admins is not null then
        perform queue_notice_many(v_admins, 'staff', 'Sale cancelled after pickup: ' || v_title,
          j.ref || ': the vehicle is with our transport partner. Arrange its return to the seller, or keep it at the depot to relist it. Admin → Transport.',
          '/admin/transport', 'transport-cancelled:' || j.id);
      end if;
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.transport_on_cancel() from public, anon, authenticated;
drop trigger if exists transport_on_cancel on public.invoices;
create trigger transport_on_cancel after update of status on public.invoices
  for each row execute function public.transport_on_cancel();

-- What the buyer sees (their invoice): where it's up to and the depot. The depot's street address only once their
-- collection time is confirmed. Never the seller, the pickup address or the booking reference.
create or replace function public.invoice_transport(p_invoice uuid)
returns table (status text, pickup_on date, picked_up_at timestamptz, at_depot_at timestamptz, released_at timestamptz,
  condition_ok boolean, condition_note text, buyer_decision text, sale_cancelled boolean,
  depot_name text, depot_suburb text, depot_state text, depot_postcode text, depot_hours text, depot_address text)
language sql stable security definer set search_path = public as $$
  select j.status, j.pickup_on, j.picked_up_at, j.at_depot_at, j.released_at, j.condition_ok, j.condition_note, j.buyer_decision,
    j.sale_cancelled_at is not null, d.name, d.suburb, d.state, d.postcode, d.hours,
    case when exists (select 1 from collections c where c.invoice_id = j.invoice_id and c.status in ('confirmed', 'collected')) then dp.address end
  from transport_jobs j left join depots d on d.id = j.depot_id left join depot_private dp on dp.depot_id = j.depot_id
  where j.invoice_id = p_invoice and (j.buyer_id = (select auth.uid()) or (select is_admin()))
$$;
revoke execute on function public.invoice_transport(uuid) from public, anon;
grant execute on function public.invoice_transport(uuid) to authenticated, service_role;

-- What the seller sees: the pickup (never the buyer).
create or replace function public.seller_lot_transport(p_lot bigint)
returns table (ref text, status text, pickup_on date, pickup_window text, picked_up_at timestamptz, released_at timestamptz)
language sql stable security definer set search_path = public as $$
  select j.ref, j.status, j.pickup_on, j.pickup_window, j.picked_up_at, j.released_at
  from transport_jobs j join lots l on l.id = j.lot_id
  where j.lot_id = p_lot and (l.seller_id = (select auth.uid()) or (select is_admin())) and j.status <> 'cancelled'
  order by j.created_at desc limit 1
$$;
revoke execute on function public.seller_lot_transport(bigint) from public, anon;
grant execute on function public.seller_lot_transport(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Collection from the depot: only once it's there; handed over by the depot with the buyer's release code
--    (collections.seller_token is now the depot's private handover link)
-- ---------------------------------------------------------------------------
create or replace function public.collection_needs_depot() returns trigger
language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select status, condition_ok, buyer_decision into j from transport_jobs where invoice_id = new.invoice_id;
  if not found or j.status <> 'at_depot' then raise exception 'not_at_depot'; end if;
  if j.condition_ok is false and j.buyer_decision is distinct from 'proceed' then raise exception 'change_not_answered'; end if;
  return new;
end $$;
revoke execute on function public.collection_needs_depot() from public, anon, authenticated;
drop trigger if exists collection_needs_depot on public.collections;
create trigger collection_needs_depot before insert on public.collections
  for each row execute function public.collection_needs_depot();

create or replace function public.collection_released() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.status = 'collected' and old.status is distinct from 'collected' then
    update transport_jobs set status = 'released', released_at = now(), status_at = now() where invoice_id = new.invoice_id and status = 'at_depot';
    select title into v_title from lots where id = new.lot_id;
    perform queue_seller_notice(new.lot_id, 'Collected by the buyer: ' || v_title,
      'The buyer has collected it from our depot. We pay you once their claim window closes on '
        || to_char(business_days_from(now(), setting_num('auction','claim_days')::int) at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth')
        || ', and send your settlement statement.',
      '/sell/dashboard', 'collected-seller:' || new.id);
  end if;
  return null;
end $$;
revoke execute on function public.collection_released() from public, anon, authenticated;
drop trigger if exists collection_released on public.collections;
create trigger collection_released after update of status on public.collections
  for each row execute function public.collection_released();

-- The depot (via its private link) enters the code the collector gives them.
create or replace function public.complete_handover(p_token text, p_code text, p_odometer int, p_keys int, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.collections%rowtype; v_claim timestamptz; v_title text;
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
  v_claim := business_days_from(now(), setting_num('auction','claim_days')::int);
  update invoices set collected_at = now(), claim_until = v_claim where id = c.invoice_id;
  update collections set status = 'collected', collected_at = now(),
    handover = jsonb_build_object('odometer', p_odometer, 'keys', p_keys, 'notes', left(coalesce(p_notes, ''), 1000), 'at', now())
  where id = c.id;
  select title into v_title from lots where id = c.lot_id;
  perform queue_notice(c.buyer_id, 'account', 'Collected: ' || v_title,
    'Handed over at our depot. The vehicle is now your responsibility. If something is materially different from the listing, lodge a claim from your invoice by ' ||
    to_char(v_claim at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/account/invoices/' || c.invoice_id, 'collected:' || c.id);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.complete_handover(text, text, int, int, text) from public, anon, authenticated;
grant execute on function public.complete_handover(text, text, int, int, text) to service_role;

-- The seller no longer hands over: they see whether the buyer has collected it, never who or when.
create or replace function public.seller_lot_collection(p_lot bigint)
returns table (status text, confirmed_for text, collector text, seller_token text, collected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.status, null::text, null::text, null::text, c.collected_at
  from collections c join lots l on l.id = c.lot_id
  where c.lot_id = p_lot and l.seller_id = (select auth.uid()) and c.status <> 'cancelled'
  order by c.created_at desc limit 1;
$$;
revoke execute on function public.seller_lot_collection(bigint) from public, anon;
grant execute on function public.seller_lot_collection(bigint) to authenticated, service_role;

-- Sales already paid: they go through the depot too, unless a collection was already confirmed the old way.
-- (No collection deadline, and so no storage, until it's at the depot.)
insert into public.transport_jobs (invoice_id, lot_id, buyer_id, depot_id)
select i.id, i.lot_id, i.buyer_id, l.depot_id from public.invoices i join public.lots l on l.id = i.lot_id
where i.status = 'paid' and i.collected_at is null
  and not exists (select 1 from public.collections c where c.invoice_id = i.id and c.status in ('confirmed', 'collected'))
on conflict (invoice_id) do nothing;
update public.collections c set status = 'cancelled' from public.transport_jobs j
  where j.invoice_id = c.invoice_id and j.status = 'to_book' and c.status = 'requested';
update public.invoices i set collect_by = null from public.transport_jobs j
  where j.invoice_id = i.id and j.status = 'to_book' and i.collected_at is null;

-- ---------------------------------------------------------------------------
-- 7. What sellers are told: buyers never visit, the pickup comes after payment
-- ---------------------------------------------------------------------------
create or replace function public.notify_seller_live() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    perform queue_seller_notice(new.id, 'Your ' || new.title || ' is live',
      'Bidding is open until ' || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') ||
      ' (Brisbane time). Keep it at your place, insured and in the same condition, until our transport partner picks it up after the buyer has paid. Buyers never visit and are never told your name or address. If a bidder orders a mechanical inspection, our partner mechanic will call you to arrange a time. Follow the bids from your seller dashboard.',
      '/sell/dashboard', 'live:' || new.id);
  end if;
  return null;
end $$;

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
      perform queue_seller_notice(l.id, 'Your ' || l.title || ' didn''t sell this time',
        'We''ll call you about relisting, with or without a lower reserve.', '/sell/dashboard', 'seller-passed:' || l.id);
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_status_notices(int) from public, anon, authenticated;
grant execute on function public.queue_status_notices(int) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Nothing new open to the public; new terms (no viewings, inspections, transport, depot collection)
-- ---------------------------------------------------------------------------
revoke execute on function public.pickup_window_label(text) from public, anon;
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

-- New Terms of Sale (no viewings, transport in the buyer's premium, depot collection, the seller kept private):
-- members accept them before their next bid. New seller agreements record the new seller agreement version.
update public.settings set value = value || '{"buyer_version": "2026-10-22"}'::jsonb
  where key = 'terms' and value->>'buyer_version' = '2026-10-21';
update public.settings set value = value || '{"seller_version": "2026-10-22"}'::jsonb
  where key = 'terms';
