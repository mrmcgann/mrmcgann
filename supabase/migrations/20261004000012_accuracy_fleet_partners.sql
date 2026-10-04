-- Tyrebiter: listing accuracy (Australian Consumer Law), fleet sales, relisting, offers to the
-- next bidder, transport and warranty partners, watchlist notes, price ranges from our own
-- results, listing audits and the weekly newsletter.
-- Run after 20261004000011_lookup_australia_only.sql.
--
-- Why the accuracy rules: in 2024 the Federal Court ordered Grays to pay $10 million for
-- misdescribing at least 750 cars sold online (wrong year and transmission, features the cars
-- didn't have, damage and warning lights left out). Auctions are not exempt from the ban on
-- misleading descriptions, so every listing is checked against the vehicle before it goes live,
-- every later change to a key fact is shown publicly and sent to bidders and watchers, and the
-- auction gets at least 24 more hours after a correction.

-- ---------------------------------------------------------------------------
-- 1. New listing facts
-- ---------------------------------------------------------------------------
alter table public.lots
  add column if not exists runs text check (runs in ('drives','starts','no_start','untested')),
  add column if not exists seller_type text not null default 'private' check (seller_type in ('private','business')),
  add column if not exists verified text[] not null default '{}',
  add column if not exists verified_at timestamptz,
  add column if not exists ev_battery_soh int check (ev_battery_soh between 0 and 100),
  add column if not exists ev_battery_report text check (ev_battery_report is null or ev_battery_report ~ '^https://'),
  add column if not exists relisted_from bigint references public.lots(id) on delete set null,
  add column if not exists corrected_at timestamptz;

update public.lots set seller_type = 'business' where gst_status = 'inc' and seller_type = 'private';
create index if not exists lots_live_runs on public.lots (runs) where status = 'live';
create index if not exists lots_live_seller_type on public.lots (seller_type) where status = 'live';
create index if not exists lots_relisted_from on public.lots (relisted_from) where relisted_from is not null;

-- Victoria also has "inspected" write-offs (a repairable write-off that has passed its inspection).
alter table public.lots drop constraint if exists lots_write_off_status_check;
alter table public.lots add constraint lots_write_off_status_check
  check (write_off_status in ('none','repairable','inspected','statutory','unknown'));

-- Who checked the listing against the vehicle, and when (staff only).
alter table public.lot_private
  add column if not exists checked_by uuid references public.profiles(id) on delete set null;

-- The checks staff tick before a listing can go live. Kept in step with LISTING_CHECKS in src/lib/listing.ts.
create or replace function public.listing_check_keys() returns text[]
language sql immutable as $$
  select array['vin','year','odometer','transmission','fuel','features','warning_lights','runs','damage','photos']
$$;

-- Listings already live were checked under the old process: record them as checked so the
-- new publishing rule applies to new listings only. (Before the correction trigger exists.)
update public.lots set verified = public.listing_check_keys(), verified_at = coalesce(published_at, now())
  where status <> 'draft' and verified = '{}';
update public.lots set runs = 'untested' where status <> 'draft' and runs is null;

-- Private or business seller: GST-registered sellers, companies, and sellers who say they're selling
-- in the course of a business are business sellers. It decides which consumer guarantees may apply.
-- (Named so it runs before the correction log below: triggers fire in name order.)
create or replace function public.lots_seller_type() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.gst_status = 'inc' or new.disclosures->>'business' = 'yes' then new.seller_type := 'business'; end if;
  elsif new.disclosures ? 'business' or new.gst_status is distinct from old.gst_status then
    new.seller_type := case when new.gst_status = 'inc' or new.disclosures->>'business' = 'yes' then 'business' else 'private' end;
  end if;
  return new;
end $$;
drop trigger if exists lots_seller_type on public.lots;
drop trigger if exists lot_a_seller_type on public.lots;
create trigger lot_a_seller_type before insert or update of gst_status, disclosures on public.lots
  for each row execute function public.lots_seller_type();

-- ---------------------------------------------------------------------------
-- 2. Publishing: the listing must be checked against the vehicle
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Corrections: shown on the listing, sent to bidders and watchers, and the
--    auction keeps at least 24 hours after a change to a key fact.
-- ---------------------------------------------------------------------------
create table if not exists public.lot_corrections (
  id bigint generated always as identity primary key,
  lot_id bigint not null references public.lots(id) on delete cascade,
  field text not null,
  label text not null,
  before text,
  after text,
  created_at timestamptz not null default now()
);
create index if not exists lot_corrections_lot on public.lot_corrections (lot_id, created_at);
alter table public.lot_corrections enable row level security;
drop policy if exists corrections_read on public.lot_corrections;
create policy corrections_read on public.lot_corrections for select using (true);
grant select on public.lot_corrections to anon, authenticated;

create or replace function public.fact_text(p_field text, v jsonb) returns text
language sql immutable as $$
  select case
    when v is null or v = 'null'::jsonb or v = '""'::jsonb then 'not stated'
    when p_field = 'odometer' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' km'
    when p_field = 'hours' then to_char((v #>> '{}')::numeric, 'FM999,999,990') || ' hours'
    when p_field = 'ev_battery_soh' then (v #>> '{}') || '%'
    when p_field = 'runs' then case v #>> '{}' when 'drives' then 'starts and drives' when 'starts' then 'starts, doesn''t drive'
      when 'no_start' then 'doesn''t start' else 'not tested' end
    when p_field = 'write_off_status' then case v #>> '{}' when 'none' then 'not written off' when 'repairable' then 'repairable write-off'
      when 'inspected' then 'inspected write-off' when 'statutory' then 'statutory write-off' else 'being checked' end
    when jsonb_typeof(v) = 'boolean' then case when v = 'true'::jsonb then 'yes' else 'no' end
    else left(v #>> '{}', 300) end
$$;

create or replace function public.lot_corrections_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
  f record; k text; changes text[] := '{}'; v_users uuid[]; v_bidders uuid[]; v_body text;
begin
  if old.status not in ('live','referred','offers') then return new; end if;
  for f in select * from (values
      ('year','Year'), ('make','Make'), ('model','Model'), ('variant','Variant'), ('body','Body'), ('engine','Engine'),
      ('transmission','Transmission'), ('fuel','Fuel'), ('drive','Drive'), ('odometer','Odometer'), ('hours','Hours'),
      ('vin','VIN'), ('build_date','Build date'), ('compliance_date','Compliance date'), ('registration','Registration'),
      ('rego_expiry','Registration expiry'), ('write_off_status','Write-off status'), ('stolen_clear','Stolen check'),
      ('ppsr_clear','PPSR finance check'), ('keys','Keys'), ('service_books','Service books'), ('runs','Starts and drives'),
      ('known_faults','Known faults'), ('service_history','Service history'), ('roadworthy_note','Roadworthy'),
      ('visual_grade','Visual grade'), ('grade_paint','Paint grade'), ('grade_interior','Interior grade'), ('grade_tyres','Tyre grade'),
      ('tyre_tread','Tyre tread'), ('seats','Seats'), ('gvm_kg','GVM'), ('seller_type','Seller'), ('gst_status','GST'),
      ('ev_battery_soh','Battery health'), ('colour','Colour')) t(field, label)
  loop
    if o->f.field is distinct from n->f.field then
      insert into lot_corrections (lot_id, field, label, before, after)
        values (new.id, f.field, f.label, fact_text(f.field, o->f.field), fact_text(f.field, n->f.field));
      changes := changes || (f.label || ': ' || fact_text(f.field, o->f.field) || ' → ' || fact_text(f.field, n->f.field));
    end if;
  end loop;
  -- seller declarations, one line per answer that changed
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

  select array_agg(distinct bidder_id) into v_bidders from bids where lot_id = new.id;
  select array_agg(distinct user_id) into v_users from watchlist where lot_id = new.id and not (user_id = any(coalesce(v_bidders, '{}')));
  v_body := 'We''ve corrected this listing: ' || array_to_string(changes[1:6], '; ') || case when cardinality(changes) > 6 then '; and more' else '' end || '.'
    || case when new.status = 'live' then ' Bidding now ends no earlier than '
         || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time).' else '' end;
  if v_bidders is not null then
    perform queue_notice_many(v_bidders, 'account', 'Correction to a vehicle you bid on: ' || new.title,
      v_body || ' If this changes your mind, call the consultant on the listing before bidding ends.',
      '/lot/' || new.id || '#changes', 'correction:' || new.id || ':' || floor(extract(epoch from now()))::bigint);
  end if;
  if v_users is not null then
    perform queue_notice_many(v_users, 'ending', 'Correction to a vehicle you''re watching: ' || new.title, v_body,
      '/lot/' || new.id || '#changes', 'correction-w:' || new.id || ':' || floor(extract(epoch from now()))::bigint);
  end if;
  return new;
end $$;

drop trigger if exists lot_corrections_log on public.lots;
create trigger lot_corrections_log before update on public.lots
  for each row
  when ((old.year, old.make, old.model, old.variant, old.body, old.engine, old.transmission, old.fuel, old.drive, old.odometer,
         old.hours, old.vin, old.build_date, old.compliance_date, old.registration, old.rego_expiry, old.write_off_status,
         old.stolen_clear, old.ppsr_clear, old.keys, old.service_books, old.runs, old.known_faults, old.service_history,
         old.roadworthy_note, old.visual_grade, old.grade_paint, old.grade_interior, old.grade_tyres, old.tyre_tread, old.seats,
         old.gvm_kg, old.seller_type, old.gst_status, old.ev_battery_soh, old.colour, old.disclosures)
    is distinct from
        (new.year, new.make, new.model, new.variant, new.body, new.engine, new.transmission, new.fuel, new.drive, new.odometer,
         new.hours, new.vin, new.build_date, new.compliance_date, new.registration, new.rego_expiry, new.write_off_status,
         new.stolen_clear, new.ppsr_clear, new.keys, new.service_books, new.runs, new.known_faults, new.service_history,
         new.roadworthy_note, new.visual_grade, new.grade_paint, new.grade_interior, new.grade_tyres, new.tyre_tread, new.seats,
         new.gvm_kg, new.seller_type, new.gst_status, new.ev_battery_soh, new.colour, new.disclosures))
  execute function public.lot_corrections_log();

-- ---------------------------------------------------------------------------
-- 4. Removing a bidder's bids (a bidder who bid before a material correction
--    and asks out, or shill bidding). Staff only; the price is worked out again
--    from the bids that are left, exactly as if the removed bidder never bid.
-- ---------------------------------------------------------------------------
create table if not exists public.bid_removals (
  id bigint generated always as identity primary key,
  lot_id bigint not null references public.lots(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  max_amount numeric(12,2),
  reason text not null,
  removed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.bid_removals enable row level security;
drop policy if exists bid_removals_admin on public.bid_removals;
create policy bid_removals_admin on public.bid_removals for select to authenticated using ((select public.is_admin()));

create or replace function public.admin_remove_bidder(p_lot bigint, p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; pr lot_private%rowtype; v_max numeric; v_new numeric; v_old_leader uuid;
  v_top uuid; v_top_max numeric; v_top_at timestamptz; v_sec uuid; v_sec_max numeric;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status <> 'live' then raise exception 'not_live:bids can only be removed while bidding is open'; end if;
  select * into pr from lot_private where lot_id = p_lot for update;
  select max_amount into v_max from max_bids where lot_id = p_lot and bidder_id = p_user;
  if v_max is null and not exists (select 1 from bids where lot_id = p_lot and bidder_id = p_user) then raise exception 'no_bids'; end if;
  v_old_leader := l.leader_id;

  delete from bids where lot_id = p_lot and bidder_id = p_user;
  delete from max_bids where lot_id = p_lot and bidder_id = p_user;
  insert into bid_removals (lot_id, bidder_id, max_amount, reason, removed_by) values (p_lot, p_user, v_max, left(trim(p_reason), 500), auth.uid());

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

  perform queue_notice(p_user, 'account', 'Your bids on the ' || l.title || ' were cancelled',
    'We''ve cancelled your bids on this vehicle. Reason: ' || left(trim(p_reason), 200), '/lot/' || p_lot, 'bid-removed:' || p_lot || ':' || p_user);
  if v_top is not null and v_top is distinct from v_old_leader then
    perform queue_notice(v_top, 'account', 'You''re the highest bidder again on the ' || l.title,
      'Another bidder''s bids were cancelled, so you''re in front at $' || to_char(v_new, 'FM999,999,990') || '.', '/lot/' || p_lot,
      'lead-restored:' || p_lot || ':' || v_top || ':' || floor(extract(epoch from now()))::bigint);
  end if;
  return jsonb_build_object('current_bid', v_new, 'leader_changed', v_top is distinct from v_old_leader);
end $$;
revoke execute on function public.admin_remove_bidder(bigint, uuid, text) from public, anon;
grant execute on function public.admin_remove_bidder(bigint, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Fleet sales: a named sale grouping one seller's vehicles, with staggered end times.
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (char_length(title) between 3 and 120),
  intro text,
  seller_label text,
  state text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sales enable row level security;
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select using (published or (select public.is_admin()));
drop policy if exists sales_admin on public.sales;
create policy sales_admin on public.sales for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.sales to anon, authenticated;
grant insert, update, delete on public.sales to authenticated;

alter table public.lots add column if not exists sale_id bigint references public.sales(id) on delete set null;
create index if not exists lots_sale on public.lots (sale_id, status) where sale_id is not null;

-- Live and closed counts and the closing window of each published sale.
create or replace function public.sale_stats(p_sale bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live', count(*) filter (where l.status = 'live'),
    'sold', count(*) filter (where l.status = 'sold'),
    'total', count(*) filter (where l.status <> 'draft' and l.status <> 'cancelled'),
    'first_end', min(l.ends_at) filter (where l.status = 'live'),
    'last_end', max(l.ends_at) filter (where l.status = 'live'))
  from lots l join sales s on s.id = l.sale_id
  where l.sale_id = p_sale and (s.published or is_admin())
$$;
grant execute on function public.sale_stats(bigint) to anon, authenticated, service_role;

-- One vehicle closes every few minutes, so bidders can follow each one (like a yard auction's lanes).
-- Only vehicles nobody has bid on yet are moved.
create or replace function public.admin_stagger_sale(p_sale bigint, p_first timestamptz, p_gap_minutes int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if p_first < now() + interval '1 hour' then raise exception 'too_soon:the first vehicle must close at least an hour from now'; end if;
  if p_gap_minutes not between 0 and 60 then raise exception 'bad_gap:choose a gap of 0 to 60 minutes'; end if;
  with o as (
    select id, row_number() over (order by id) - 1 rn from lots
    where sale_id = p_sale and (status in ('draft','scheduled') or (status = 'live' and bid_count = 0))
  )
  update lots l set ends_at = p_first + make_interval(mins => (o.rn * p_gap_minutes)::int), updated_at = now()
  from o where l.id = o.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.admin_stagger_sale(bigint, timestamptz, int) from public, anon;
grant execute on function public.admin_stagger_sale(bigint, timestamptz, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Relisting a vehicle that didn't sell (or whose buyer didn't pay): a fresh draft
--    copy. Staff re-run the PPSR and the listing checks before it goes live again.
-- ---------------------------------------------------------------------------
create or replace function public.copy_lot_rows(p_table text, p_old bigint, p_new bigint, p_skip text[], p_where text default 'true')
returns int language plpgsql security definer set search_path = public as $$
declare cols text; n int;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols from pg_attribute
   where attrelid = ('public.' || p_table)::regclass and attnum > 0 and not attisdropped and attgenerated = ''
     and attidentity = '' and attname <> 'lot_id' and attname <> all (p_skip);
  execute format('insert into public.%I (lot_id, %s) select $2, %s from public.%I where lot_id = $1 and %s', p_table, cols, cols, p_table, p_where)
    using p_old, p_new;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.copy_lot_rows(text, bigint, bigint, text[], text) from public, anon, authenticated;

create or replace function public.admin_relist(p_lot bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_new bigint; cols text;
  skip text[] := array['id','status','current_bid','bid_count','leader_id','starts_at','ends_at','decision_by','winner_id','sold_price',
    'sold_via','created_at','updated_at','featured','notified_status','published_at','views','relisted_from','corrected_at','reserve_met',
    'verified','verified_at','ppsr_checked_at','ppsr_cert_no'];
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
  perform copy_lot_rows('lot_private', p_lot, v_new, array['seller_invite','leader_max','leader_max_at']);
  perform copy_lot_rows('lot_photos', p_lot, v_new, array['id','created_at']);
  perform copy_lot_rows('lot_flaws', p_lot, v_new, array['id']);
  perform copy_lot_rows('lot_videos', p_lot, v_new, array['id','created_at'], 'status = ''approved''');
  perform copy_lot_rows('seller_agreements', p_lot, v_new, array['id'], 'status = ''signed''');
  return v_new;
end $$;
revoke execute on function public.admin_relist(bigint) from public, anon;
grant execute on function public.admin_relist(bigint) to authenticated, service_role;

-- When a relisted vehicle goes live, people who bid on or watched it last time hear about it.
create or replace function public.notify_relisted_live() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_users uuid[];
begin
  if new.relisted_from is not null and new.status = 'live' and old.status is distinct from 'live' then
    select array_agg(distinct u) into v_users from (
      select bidder_id u from bids where lot_id = new.relisted_from
      union select user_id from watchlist where lot_id = new.relisted_from) x;
    if v_users is not null then
      perform queue_notice_many(v_users, 'searches', 'Back for auction: ' || new.title,
        'A vehicle you bid on or watched is back for auction. Bidding ends ' || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time).',
        '/lot/' || new.id, 'relisted:' || new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notify_relisted_live on public.lots;
create trigger notify_relisted_live after update of status on public.lots
  for each row when (new.relisted_from is not null) execute function public.notify_relisted_live();

-- ---------------------------------------------------------------------------
-- 7. Offer to the next bidder when the winner doesn't pay
-- ---------------------------------------------------------------------------
create table if not exists public.second_chance_offers (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists second_chance_one_open on public.second_chance_offers (lot_id) where status = 'pending';
create index if not exists second_chance_user on public.second_chance_offers (user_id, created_at desc);
alter table public.second_chance_offers enable row level security;
drop policy if exists second_chance_read on public.second_chance_offers;
create policy second_chance_read on public.second_chance_offers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.admin_offer_next_bidder(p_lot bigint, p_hours int default 24, p_seller_ok boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_reserve numeric; v_default uuid; v_next uuid; v_amount numeric; v_id uuid; v_exp timestamptz; v_total numeric;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into l from lots where id = p_lot for update;
  if l.status <> 'passed' then raise exception 'not_passed:only a vehicle whose sale was cancelled can be offered to the next bidder'; end if;
  select buyer_id into v_default from invoices where lot_id = p_lot and status = 'cancelled' order by created_at desc limit 1;
  if v_default is null then raise exception 'no_cancelled_sale:there''s no cancelled sale for this vehicle'; end if;
  update second_chance_offers set status = 'expired', decided_at = now() where lot_id = p_lot and status = 'pending' and expires_at <= now();
  if exists (select 1 from second_chance_offers where lot_id = p_lot and status = 'pending') then raise exception 'offer_open:an offer to the next bidder is already open'; end if;
  select b.bidder_id, max(b.amount) into v_next, v_amount from bids b join profiles p on p.id = b.bidder_id
   where b.lot_id = p_lot and b.bidder_id <> v_default and not p.suspended
     and not exists (select 1 from second_chance_offers x where x.lot_id = p_lot and x.user_id = b.bidder_id)
     and not exists (select 1 from invoices i where i.lot_id = p_lot and i.buyer_id = b.bidder_id)
   group by b.bidder_id order by max(b.amount) desc, min(b.created_at) asc limit 1;
  if v_next is null then raise exception 'no_next_bidder:there''s no other bidder to offer it to'; end if;
  select reserve_price into v_reserve from lot_private where lot_id = p_lot;
  if v_reserve is not null and v_amount < v_reserve and not p_seller_ok then
    raise exception 'below_reserve:the next bid ($%) is below the reserve. Get the seller''s agreement first', to_char(v_amount, 'FM999,999,990');
  end if;
  v_exp := now() + make_interval(hours => greatest(4, least(coalesce(p_hours, 24), 72)));
  insert into second_chance_offers (lot_id, user_id, amount, expires_at, created_by) values (p_lot, v_next, v_amount, v_exp, auth.uid())
    returning id into v_id;
  v_total := (price_breakdown(v_amount)->>'total')::numeric;
  perform queue_notice(v_next, 'account', 'You can still buy the ' || l.title,
    'The winning bidder didn''t pay. You can buy it for your highest bid of $' || to_char(v_amount, 'FM999,999,990')
    || ' ($' || to_char(v_total, 'FM999,999,990.00') || ' all-in with fees) until '
    || to_char(v_exp at time zone 'Australia/Brisbane', 'FMDy DD Mon, FMHH12:MI am') || ' (Brisbane time). There''s no obligation: accept or decline on the offer page.',
    '/offers/' || v_id, 'second-chance:' || v_id);
  return jsonb_build_object('id', v_id, 'amount', v_amount, 'expires_at', v_exp);
end $$;
revoke execute on function public.admin_offer_next_bidder(bigint, int, boolean) from public, anon;
grant execute on function public.admin_offer_next_bidder(bigint, int, boolean) to authenticated, service_role;

create or replace function public.respond_second_chance(p_offer uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); o second_chance_offers%rowtype; l lots%rowtype; v_inv uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into o from second_chance_offers where id = p_offer for update;
  if not found or o.user_id <> v_user then raise exception 'offer_not_found'; end if;
  if o.status <> 'pending' then raise exception 'offer_closed:this offer has already been answered'; end if;
  if o.expires_at <= now() then
    update second_chance_offers set status = 'expired', decided_at = now() where id = p_offer;
    raise exception 'offer_expired:this offer has expired';
  end if;
  if not p_accept then
    update second_chance_offers set status = 'declined', decided_at = now() where id = p_offer;
    return null;
  end if;
  if not can_bid(v_user) then raise exception 'not_verified'; end if;
  perform bid_guard(o.lot_id, v_user);
  select * into l from lots where id = o.lot_id for update;
  if l.status <> 'passed' then raise exception 'offer_closed:this vehicle is no longer available'; end if;
  update lots set status = 'sold', winner_id = v_user, sold_price = o.amount, sold_via = 'offer', updated_at = now() where id = o.lot_id;
  v_inv := create_invoice(o.lot_id, v_user, o.amount, 'offer');
  update second_chance_offers set status = 'accepted', decided_at = now() where id = p_offer;
  perform queue_seller_notice(o.lot_id, 'Sold to the next bidder',
    'The next highest bidder has bought your ' || l.title || ' for $' || to_char(o.amount, 'FM999,999,990') || '. We''re taking their payment now.',
    '/sell/dashboard', 'second-chance-sold:' || p_offer);
  return v_inv;
end $$;
revoke execute on function public.respond_second_chance(uuid, boolean) from public, anon;
grant execute on function public.respond_second_chance(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Search: "starts and drives", sale events, and private/business by seller type
-- ---------------------------------------------------------------------------
create or replace function public.search_pred(f jsonb, part text) returns text
language plpgsql immutable set search_path = public as $$
declare w text[] := '{}'; p text := search_price(f); n int;
begin
  case part
  when 'view' then
    return case coalesce(nullif(f->>'view', ''), 'live')
      when 'offers' then $s$l.status = 'offers'$s$
      when 'closed' then $s$(l.status in ('sold','passed','offers','referred') and l.ends_at > now() - interval '60 days')$s$
      else $s$l.status = 'live'$s$ end;
  when 'cat' then
    if f->>'cat' = 'cheap' then w := array_append(w, (p || ' < 5000')::text);
    elsif coalesce(f->>'cat', '') <> '' then w := array_append(w, $s$l.category = ($1->>'cat')$s$::text); end if;
    if coalesce(f->>'type', '') <> '' then w := array_append(w, $s$l.kind = ($1->>'type')$s$::text); end if;
  when 'make' then
    if coalesce(trim(f->>'make'), '') <> '' then w := array_append(w, $s$lower(l.make) = lower(trim($1->>'make'))$s$::text); end if;
    if coalesce(trim(f->>'model'), '') <> '' then
      w := array_append(w, $s$lower(l.model) like (replace(replace(replace(lower(trim($1->>'model')), '\', ''), '%', ''), '_', '') || '%')$s$::text);
    end if;
  when 'state' then if coalesce(f->>'state', '') <> '' then w := array_append(w, $s$l.state = upper($1->>'state')$s$::text); end if;
  when 'fuel' then if coalesce(f->>'fuel', '') <> '' then w := array_append(w, $s$l.fuel_group = lower($1->>'fuel')$s$::text); end if;
  when 'trans' then if coalesce(f->>'trans', '') <> '' then w := array_append(w, $s$l.trans_group = lower($1->>'trans')$s$::text); end if;
  when 'drive' then if coalesce(f->>'drive', '') <> '' then w := array_append(w, $s$l.drive = upper($1->>'drive')$s$::text); end if;
  when 'rest' then
    if f ? '_lot' then w := array_append(w, $s$l.id = ($1->>'_lot')::bigint$s$::text); end if;
    n := coalesce(jsonb_array_length(case when jsonb_typeof(f->'_w') = 'array' then f->'_w' end), 0);
    for i in 0 .. least(n, 6) - 1 loop
      w := array_append(w, format($s$l.search like ('%%' || ($1->'_w'->>%s) || '%%')$s$, i)::text);
    end loop;
    if f_num(f->>'min') is not null then w := array_append(w, (p || $s$ >= f_num($1->>'min')$s$)::text); end if;
    if f_num(f->>'max') is not null then w := array_append(w, (p || $s$ <= f_num($1->>'max')$s$)::text); end if;
    if f_num(f->>'ymin') is not null then w := array_append(w, $s$l.year >= f_num($1->>'ymin')$s$::text); end if;
    if f_num(f->>'ymax') is not null then w := array_append(w, $s$l.year <= f_num($1->>'ymax')$s$::text); end if;
    if f_num(f->>'km') is not null then w := array_append(w, $s$l.odometer <= f_num($1->>'km')$s$::text); end if;
    if f_num(f->>'hrs') is not null then w := array_append(w, $s$l.hours <= f_num($1->>'hrs')$s$::text); end if;
    if f_num(f->>'ccmin') is not null then w := array_append(w, $s$l.engine_cc >= f_num($1->>'ccmin')$s$::text); end if;
    if f_num(f->>'ccmax') is not null then w := array_append(w, $s$l.engine_cc <= f_num($1->>'ccmax')$s$::text); end if;
    if f_num(f->>'berths') is not null then w := array_append(w, $s$l.berths >= f_num($1->>'berths')$s$::text); end if;
    if f_num(f->>'lenmin') is not null then w := array_append(w, $s$l.length_m >= f_num($1->>'lenmin')$s$::text); end if;
    if f_num(f->>'lenmax') is not null then w := array_append(w, $s$l.length_m <= f_num($1->>'lenmax')$s$::text); end if;
    if f_num(f->>'sale') is not null then w := array_append(w, $s$l.sale_id = f_num($1->>'sale')$s$::text); end if;
    if upper(f->>'lic') in ('C','LR','MR','HR','HC','MC') then
      w := array_append(w, $s$array_position(array['C','LR','MR','HR','HC','MC'], l.licence_class) <= array_position(array['C','LR','MR','HR','HC','MC'], upper($1->>'lic'))$s$::text);
    end if;
    if f->>'lams' = '1' then w := array_append(w, 'l.lams'::text); end if;
    if f->>'nores' = '1' then w := array_append(w, '(not l.has_reserve or l.reserve_met)'::text); end if;
    if f->>'buynow' = '1' then w := array_append(w, '(l.buy_now_price is not null and l.current_bid < l.buy_now_price)'::text); end if;
    if f->>'rego' in ('registered','unregistered') then w := array_append(w, $s$l.registration = ($1->>'rego')$s$::text); end if;
    if f->>'runs' = 'drives' then w := array_append(w, $s$l.runs = 'drives'$s$::text); end if;
    if f->>'seller' in ('private','business') then w := array_append(w, $s$l.seller_type = ($1->>'seller')$s$::text); end if;
    if upper(f->>'grade') in ('A','B','C','D','E') then w := array_append(w, $s$l.visual_grade <= upper($1->>'grade')$s$::text); end if;
    if f->>'ending' = '1h' then w := array_append(w, $s$l.ends_at <= now() + interval '1 hour'$s$::text); end if;
    if f->>'ending' = 'today' then w := array_append(w, $s$l.ends_at <= now() + interval '24 hours'$s$::text); end if;
    if f->>'ending' = '3d' then w := array_append(w, $s$l.ends_at <= now() + interval '3 days'$s$::text); end if;
  else return null;
  end case;
  return case when cardinality(w) = 0 then null else '(' || array_to_string(w, ' and ') || ')' end;
end $$;

create or replace function public.queue_search_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_minute bigint := floor(extract(epoch from now()) / 60)::bigint;
begin
  with fresh as (
    select * from lots where status = 'live' and published_at > now() - interval '1 day'
  ), m as (
    select s.id, s.user_id, s.label, count(*) cnt,
      string_agg(l.title || ' · $' || to_char(greatest(l.current_bid, l.start_price), 'FM999,999,990'), E'\n' order by l.ends_at) items
    from saved_searches s join fresh l on l.published_at > coalesce(s.last_notified_at, s.created_at)
      and (s.f_cat is null or s.f_cat = l.category or (s.f_cat = 'cheap' and greatest(l.current_bid, l.start_price) < 5000))
      and (s.f_type is null or s.f_type = l.kind)
      and (s.f_state is null or s.f_state = l.state)
      and (s.f_make is null or lower(l.make) = s.f_make)
      and (s.f_model is null or lower(l.model) like s.f_model || '%')
      and (s.f_min is null or greatest(l.current_bid, l.start_price) >= s.f_min)
      and (s.f_max is null or greatest(l.current_bid, l.start_price) <= s.f_max)
      and (s.f_ymin is null or l.year >= s.f_ymin)
      and (s.f_ymax is null or l.year <= s.f_ymax)
      and (s.f_km is null or l.odometer <= s.f_km)
      and (s.f_fuel is null or l.fuel_group = s.f_fuel)
      and (s.f_trans is null or l.trans_group = s.f_trans)
      and (s.f_drive is null or l.drive = s.f_drive)
      and (s.query->>'rego' is null or l.registration = s.query->>'rego')
      and (s.query->>'runs' is null or l.runs = s.query->>'runs')
      and (f_num(s.query->>'sale') is null or l.sale_id = f_num(s.query->>'sale'))
      and (s.f_words = '{}' or not exists (select 1 from unnest(s.f_words) w where l.search not like '%' || w || '%'))
      and (not s.f_extra or (
            ((s.query->>'lams') is distinct from '1' or l.lams)
        and ((s.query->>'nores') is distinct from '1' or not l.has_reserve or l.reserve_met)
        and (s.query->>'lic' is null or array_position(array['C','LR','MR','HR','HC','MC'], l.licence_class) <= array_position(array['C','LR','MR','HR','HC','MC'], upper(s.query->>'lic')))
        and (f_num(s.query->>'berths') is null or l.berths >= f_num(s.query->>'berths'))
        and (f_num(s.query->>'hrs') is null or l.hours <= f_num(s.query->>'hrs'))
        and (f_num(s.query->>'ccmin') is null or l.engine_cc >= f_num(s.query->>'ccmin'))
        and (f_num(s.query->>'ccmax') is null or l.engine_cc <= f_num(s.query->>'ccmax'))
        and (f_num(s.query->>'lenmin') is null or l.length_m >= f_num(s.query->>'lenmin'))
        and (f_num(s.query->>'lenmax') is null or l.length_m <= f_num(s.query->>'lenmax'))
        and (s.query->>'seller' is null or l.seller_type = s.query->>'seller')
        and (s.query->>'grade' is null or l.visual_grade <= upper(s.query->>'grade'))))
    group by s.id, s.user_id, s.label
  ), upd as (
    update saved_searches s set last_notified_at = now() from m where s.id = m.id returning m.*
  ), t as (
    select u.id sid, u.user_id, u.items,
      u.cnt || ' new match' || case when u.cnt > 1 then 'es' else '' end || ' for “' || u.label || '”' as title,
      p.email, p.mobile, p.mobile_verified, coalesce(p.notify -> 'searches', '{"sms":false,"email":true}'::jsonb) prefs
    from upd u join profiles p on p.id = u.user_id where not p.suspended
  ), app as (
    insert into notifications (user_id, kind, title, body, link, channels)
    select user_id, 'searches', title, items, '/watchlist#searches',
      array_remove(array[case when (prefs->>'sms')::boolean and mobile_verified then 'sms' end,
                         case when (prefs->>'email')::boolean and email is not null then 'email' end], null)
    from t returning 1
  ), sms as (
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
    select user_id, 'sms', mobile, 'searches', title, items, '/watchlist#searches', 'search:' || sid || ':' || v_minute || ':sms', 9
    from t where (prefs->>'sms')::boolean and mobile is not null and mobile_verified
    on conflict (dedupe_key) do nothing returning 1
  ), em as (
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
    select user_id, 'email', email, 'searches', title, items, '/watchlist#searches', 'search:' || sid || ':' || v_minute || ':email', 9
    from t where (prefs->>'email')::boolean and email is not null
    on conflict (dedupe_key) do nothing returning 1
  )
  select (select count(*) from app) into n;
  return n;
end $$;
revoke execute on function public.queue_search_alerts() from public, anon, authenticated;
grant execute on function public.queue_search_alerts() to service_role;

-- ---------------------------------------------------------------------------
-- 9. Transport and warranty partners; a tracking link on collections
-- ---------------------------------------------------------------------------
alter table public.partners drop constraint if exists partners_kind_check;
alter table public.partners add constraint partners_kind_check check (kind in ('finance','insurance','inspection','transport','warranty'));
alter table public.partner_leads drop constraint if exists partner_leads_kind_check;
alter table public.partner_leads add constraint partner_leads_kind_check check (kind in ('finance','insurance','inspection','transport','warranty'));

alter table public.collections add column if not exists tracking_url text check (tracking_url is null or tracking_url ~ '^https://');
grant select (tracking_url) on public.collections to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Private notes on watched vehicles
-- ---------------------------------------------------------------------------
alter table public.watchlist add column if not exists note text check (note is null or char_length(note) <= 500);

-- ---------------------------------------------------------------------------
-- 11. What similar vehicles sold for (the Sell page). Our own results only, and only
--     with at least 3 sales, so the range has a real basis.
-- ---------------------------------------------------------------------------
create index if not exists lots_sold_make_model on public.lots (lower(make), lower(model), year) where status = 'sold';
create or replace function public.price_estimate(p_make text, p_model text, p_year int default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (
    select sold_price from lots
    where status = 'sold' and sold_price > 0 and ends_at > now() - interval '18 months'
      and lower(make) = lower(trim(p_make)) and lower(model) = lower(trim(p_model))
      and (p_year is null or year between p_year - 2 and p_year + 2)
  )
  select case when count(*) < 3 then jsonb_build_object('count', count(*))
    else jsonb_build_object('count', count(*),
      'low', round(percentile_cont(0.25) within group (order by sold_price)::numeric, -2),
      'mid', round(percentile_cont(0.5) within group (order by sold_price)::numeric, -2),
      'high', round(percentile_cont(0.75) within group (order by sold_price)::numeric, -2)) end
  from s
$$;
grant execute on function public.price_estimate(text, text, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. Monthly listing audits (part of our consumer law compliance program)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_audits (
  id bigint generated always as identity primary key,
  lot_id bigint not null references public.lots(id) on delete cascade,
  checks jsonb not null default '{}'::jsonb,
  ok boolean not null,
  note text,
  audited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists listing_audits_lot on public.listing_audits (lot_id, created_at desc);
alter table public.listing_audits enable row level security;
drop policy if exists listing_audits_admin on public.listing_audits;
create policy listing_audits_admin on public.listing_audits for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert on public.listing_audits to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Weekly newsletter: only to members who opted in to "News and featured vehicles".
--     The sender adds the unsubscribe link and our details to every email (Spam Act).
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('newsletter', '{"enabled": false, "weekday": 4, "hour": 17}'::jsonb)
  on conflict (key) do nothing;

create or replace function public.queue_newsletter(p_title text, p_body text, p_link text, p_tag text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
  select id, 'email', email, 'marketing', p_title, p_body, p_link, p_tag || ':' || id || ':email', 9
  from profiles
  where not suspended and email is not null and coalesce((notify -> 'marketing' ->> 'email')::boolean, false)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.queue_newsletter(text, text, text, text) from public, anon, authenticated;
grant execute on function public.queue_newsletter(text, text, text, text) to service_role;
