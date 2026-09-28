-- Tyrebiter v1 schema
-- Run with the Supabase CLI (`supabase db push`) or paste into the Supabase SQL editor.


-- ---------------------------------------------------------------------------
-- Settings (fees and auction rules). Public read, admin write.
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null
);

insert into public.settings (key, value) values
  ('fees', '{
     "premium_rate": 0.10,
     "admin_fee": 99,
     "surcharge_rate": 0.012,
     "card_limit": 5000,
     "nrd_low": 500,
     "nrd_high": 1000,
     "nrd_split": 20000,
     "cancel_fee": 250,
     "cancel_above": 1000
   }'::jsonb),
  ('auction', '{
     "extend_minutes": 10,
     "referral_days": 2,
     "offer_days": 2,
     "payment_days": 2,
     "collection_days": 5
   }'::jsonb);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  dob date,
  mobile text,
  mobile_verified boolean not null default false,
  street text,
  suburb text,
  state text,
  postcode text,
  intent text default 'buy',
  details_done boolean not null default false,
  stripe_customer_id text,
  payment_method_id text,
  card_brand text,
  card_last4 text,
  id_status text not null default 'none' check (id_status in ('none','pending','verified','failed')),
  id_session_id text,
  role text not null default 'buyer' check (role in ('buyer','admin')),
  suspended boolean not null default false,
  terms_accepted_at timestamptz,
  notify jsonb not null default '{
    "outbid":{"sms":true,"email":true},
    "ending":{"sms":true,"email":false},
    "won":{"sms":true,"email":true},
    "searches":{"sms":false,"email":true},
    "marketing":{"sms":false,"email":false}
  }'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_bid(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and details_done and mobile_verified
      and payment_method_id is not null and id_status = 'verified' and not suspended
  );
$$;

-- New auth user -> profile row
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their own details, but never verification, payment or role fields.
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  -- Only signed-in members editing through the API are restricted; the service role,
  -- admins and the SQL editor are not.
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.role is distinct from old.role
      or new.mobile_verified is distinct from old.mobile_verified
      or new.id_status is distinct from old.id_status
      or new.id_session_id is distinct from old.id_session_id
      or new.payment_method_id is distinct from old.payment_method_id
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.card_brand is distinct from old.card_brand
      or new.card_last4 is distinct from old.card_last4
      or new.suspended is distinct from old.suspended then
      raise exception 'protected_field';
    end if;
    -- changing legal name or DOB after ID verification resets the ID check
    if old.id_status = 'verified' and (new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name or new.dob is distinct from old.dob) then
      new.id_status := 'none';
    end if;
    if new.mobile is distinct from old.mobile then
      new.mobile_verified := false;
    end if;
  end if;
  return new;
end $$;

create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------------
-- Lots (public) and lot_private (admin only)
-- ---------------------------------------------------------------------------
create sequence public.lot_number_seq start 10001;

create table public.lots (
  id bigint primary key default nextval('public.lot_number_seq'),
  status text not null default 'draft'
    check (status in ('draft','scheduled','live','referred','offers','sold','passed','cancelled')),
  title text not null,
  short_title text,
  subtitle text,
  vehicle_type text not null default 'car' check (vehicle_type in ('car','ute','truck')),
  category text not null default 'cars' check (category in ('cars','utes','trucks')),
  year int,
  make text,
  model text,
  variant text,
  body text,
  engine text,
  transmission text,
  fuel text,
  odometer int,
  colour text,
  seats int,
  keys int,
  suburb text,
  state text,
  postcode text,
  backdrop text not null default 'sun',
  take text,
  owner_note text,
  service_history text,
  known_faults text,
  roadworthy_note text,
  ppsr_clear boolean,
  ppsr_note text,
  visual_grade text check (visual_grade in ('A','B','C','D','E')),
  grade_paint text check (grade_paint in ('A','B','C','D','E')),
  grade_interior text check (grade_interior in ('A','B','C','D','E')),
  grade_tyres text check (grade_tyres in ('A','B','C','D','E')),
  tyre_tread text,
  has_reserve boolean not null default false,
  reserve_met boolean not null default true,
  buy_now_price numeric(12,2),
  start_price numeric(12,2) not null default 100,
  current_bid numeric(12,2) not null default 0,
  bid_count int not null default 0,
  leader_id uuid references public.profiles(id),
  starts_at timestamptz,
  ends_at timestamptz,
  decision_by timestamptz,
  winner_id uuid references public.profiles(id),
  sold_price numeric(12,2),
  sold_via text check (sold_via in ('auction','buy_now','offer','referral')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lots_status_ends on public.lots (status, ends_at);

create table public.lot_private (
  lot_id bigint primary key references public.lots(id) on delete cascade,
  reserve_price numeric(12,2),
  leader_max numeric(12,2),
  leader_max_at timestamptz,
  seller_name text,
  seller_phone text,
  seller_email text,
  seller_address text,
  seller_notes text
);

create table public.lot_photos (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  path text not null,
  angle text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.lot_flaws (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  title text not null,
  note text,
  photo_path text,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Bidding
-- ---------------------------------------------------------------------------
create table public.bids (
  id bigint generated always as identity primary key,
  lot_id bigint not null references public.lots(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  is_auto boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index bids_lot on public.bids (lot_id, created_at desc);

create table public.max_bids (
  lot_id bigint not null references public.lots(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id),
  max_amount numeric(12,2) not null,
  first_set_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (lot_id, bidder_id)
);

create table public.watchlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lot_id bigint not null references public.lots(id) on delete cascade,
  remind boolean not null default true,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, lot_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  query jsonb not null default '{}'::jsonb,
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','lapsed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create sequence public.invoice_seq start 100001;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('TB-' || nextval('public.invoice_seq')),
  lot_id bigint not null references public.lots(id),
  buyer_id uuid not null references public.profiles(id),
  sold_via text not null,
  price numeric(12,2) not null,
  premium numeric(12,2) not null,
  gst numeric(12,2) not null,
  admin_fee numeric(12,2) not null,
  subtotal numeric(12,2) not null,
  mode text not null check (mode in ('card','deposit')),
  card_amount numeric(12,2) not null,
  surcharge numeric(12,2) not null,
  balance_due numeric(12,2) not null,
  total numeric(12,2) not null,
  status text not null default 'pending_charge'
    check (status in ('pending_charge','paid','deposit_paid','payment_failed','cancelled')),
  stripe_payment_intent text,
  failure_reason text,
  due_at timestamptz,
  paid_at timestamptz,
  balance_paid_at timestamptz,
  cancel_fee numeric(12,2),
  collector_name text,
  collector_mobile text,
  collected_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Inspections, appraisals, reports, notifications
-- ---------------------------------------------------------------------------
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  preferred_day text not null,
  preferred_time text not null,
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled')),
  confirmed_for text,
  admin_note text,
  created_at timestamptz not null default now()
);

create sequence public.appraisal_seq start 50001;

create table public.appraisals (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('AP-' || nextval('public.appraisal_seq')),
  user_id uuid references public.profiles(id),
  kind text not null default 'car',
  rego text not null,
  state text not null,
  odometer text,
  postcode text,
  name text not null,
  mobile text,
  email text,
  photo_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','contacted','booked','listed','closed')),
  lot_id bigint references public.lots(id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint references public.lots(id) on delete set null,
  user_id uuid references public.profiles(id),
  type text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewed')),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  channels text[] not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.bid_increment(p_amount numeric) returns numeric
language sql immutable as $$
  select case when p_amount < 5000 then 100 when p_amount < 20000 then 250 else 500 end::numeric;
$$;

create or replace function public.setting_num(p_group text, p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value ->> p_key)::numeric from public.settings where key = p_group;
$$;

-- Fee maths shared by invoices and the all-in preview.
create or replace function public.price_breakdown(p_price numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_premium numeric := round(p_price * setting_num('fees','premium_rate'), 2);
  v_gst numeric := round(v_premium * 0.10, 2);
  v_admin numeric := setting_num('fees','admin_fee');
  v_sub numeric;
  v_mode text;
  v_card numeric;
  v_sur numeric;
begin
  v_sub := p_price + v_premium + v_gst + v_admin;
  if v_sub < setting_num('fees','card_limit') then
    v_mode := 'card';
    v_card := v_sub;
  else
    v_mode := 'deposit';
    v_card := case when v_sub < setting_num('fees','nrd_split') then setting_num('fees','nrd_low') else setting_num('fees','nrd_high') end;
  end if;
  v_sur := round(v_card * setting_num('fees','surcharge_rate'), 2);
  return jsonb_build_object(
    'price', p_price, 'premium', v_premium, 'gst', v_gst, 'admin_fee', v_admin,
    'subtotal', v_sub, 'mode', v_mode, 'card_base', v_card, 'surcharge', v_sur,
    'card_amount', v_card + v_sur, 'balance_due', v_sub - v_card, 'total', v_sub + v_sur);
end $$;

create or replace function public.business_days_from(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable as $$
declare d timestamptz := p_from; n int := p_days;
begin
  while n > 0 loop
    d := d + interval '1 day';
    if extract(isodow from d at time zone 'Australia/Brisbane') < 6 then n := n - 1; end if;
  end loop;
  return d;
end $$;

-- Creates an invoice for a sold lot. Charging happens in the app (Stripe).
create or replace function public.create_invoice(p_lot bigint, p_buyer uuid, p_price numeric, p_via text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b jsonb := price_breakdown(p_price); v_id uuid;
begin
  insert into invoices (lot_id, buyer_id, sold_via, price, premium, gst, admin_fee, subtotal, mode,
    card_amount, surcharge, balance_due, total, due_at)
  values (p_lot, p_buyer, p_via, p_price, (b->>'premium')::numeric, (b->>'gst')::numeric,
    (b->>'admin_fee')::numeric, (b->>'subtotal')::numeric, b->>'mode', (b->>'card_amount')::numeric,
    (b->>'surcharge')::numeric, (b->>'balance_due')::numeric, (b->>'total')::numeric,
    business_days_from(now(), setting_num('auction','payment_days')::int))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- The bidding engine: proxy (auto) bidding, increments, 10-minute extension,
-- earliest maximum wins ties. Runs atomically with the lot row locked.
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(p_lot bigint, p_max numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  l public.lots%rowtype;
  pr public.lot_private%rowtype;
  v_min numeric;
  v_new numeric;
  v_prev_leader uuid;
  v_outbid uuid;
  v_status text;
  v_extend interval := make_interval(mins => setting_num('auction','extend_minutes')::int);
  v_extended boolean := false;
  v_inserted int := 0;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if not can_bid(v_user) then raise exception 'not_verified'; end if;
  if p_max is null or p_max <= 0 or p_max <> round(p_max) then raise exception 'invalid_amount'; end if;

  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status <> 'live' or l.ends_at <= now() or (l.starts_at is not null and l.starts_at > now()) then
    raise exception 'auction_closed';
  end if;
  select * into pr from lot_private where lot_id = p_lot for update;
  if not found then insert into lot_private (lot_id) values (p_lot) returning * into pr; end if;

  v_prev_leader := l.leader_id;

  -- Leader raising their own maximum
  if l.leader_id = v_user then
    if p_max <= pr.leader_max then raise exception 'max_not_higher'; end if;
    update lot_private set leader_max = p_max where lot_id = p_lot;
    insert into max_bids (lot_id, bidder_id, max_amount) values (p_lot, v_user, p_max)
      on conflict (lot_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = clock_timestamp();
    -- If the new maximum clears the reserve, the visible bid jumps to the reserve.
    if pr.reserve_price is not null and l.current_bid < pr.reserve_price and p_max >= pr.reserve_price then
      update lots set current_bid = pr.reserve_price, bid_count = bid_count + 1, reserve_met = true, updated_at = now()
        where id = p_lot;
      insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, v_user, pr.reserve_price, true);
      l.current_bid := pr.reserve_price;
    end if;
    return jsonb_build_object('status','leading','current_bid', l.current_bid, 'max', p_max,
      'ends_at', l.ends_at, 'extended', false, 'outbid_user', null);
  end if;

  v_min := case when l.bid_count = 0 then greatest(l.start_price, l.current_bid)
                else l.current_bid + bid_increment(l.current_bid) end;
  if p_max < v_min then raise exception 'too_low:%', v_min; end if;

  if l.leader_id is null then
    v_new := v_min;
    if pr.reserve_price is not null and p_max >= pr.reserve_price then v_new := greatest(v_new, pr.reserve_price); end if;
    insert into bids (lot_id, bidder_id, amount) values (p_lot, v_user, v_new);
    v_inserted := 1;
    l.leader_id := v_user;
    update lot_private set leader_max = p_max, leader_max_at = clock_timestamp() where lot_id = p_lot;
    v_status := 'leading';
  elsif p_max > pr.leader_max then
    -- New bidder takes the lead. Old leader's maximum is shown as their last auto-bid.
    v_new := least(p_max, pr.leader_max + bid_increment(pr.leader_max));
    if pr.reserve_price is not null and p_max >= pr.reserve_price then v_new := greatest(v_new, pr.reserve_price); end if;
    if pr.leader_max > l.current_bid then
      insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, l.leader_id, pr.leader_max, true);
      v_inserted := v_inserted + 1;
    end if;
    insert into bids (lot_id, bidder_id, amount) values (p_lot, v_user, v_new);
    v_inserted := v_inserted + 1;
    v_outbid := l.leader_id;
    l.leader_id := v_user;
    update lot_private set leader_max = p_max, leader_max_at = clock_timestamp() where lot_id = p_lot;
    v_status := 'leading';
  else
    -- Existing leader's maximum holds (ties go to the earlier maximum).
    insert into bids (lot_id, bidder_id, amount) values (p_lot, v_user, p_max);
    v_new := least(pr.leader_max, p_max + bid_increment(p_max));
    if v_new > p_max then
      insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, l.leader_id, v_new, true);
      v_inserted := 2;
    else
      v_new := p_max;
      v_inserted := 1;
    end if;
    v_outbid := v_user;
    v_status := 'outbid';
  end if;

  insert into max_bids (lot_id, bidder_id, max_amount) values (p_lot, v_user, p_max)
    on conflict (lot_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = clock_timestamp();

  -- Going, going, gone
  if l.ends_at - now() < v_extend then
    l.ends_at := now() + v_extend;
    v_extended := true;
  end if;

  update lots set
    current_bid = v_new,
    bid_count = bid_count + v_inserted,
    leader_id = l.leader_id,
    ends_at = l.ends_at,
    reserve_met = (pr.reserve_price is null or v_new >= pr.reserve_price),
    updated_at = now()
  where id = p_lot;

  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;

  return jsonb_build_object('status', v_status, 'current_bid', v_new, 'max', p_max,
    'ends_at', l.ends_at, 'extended', v_extended, 'outbid_user', v_outbid,
    'previous_leader', v_prev_leader);
end $$;

-- Buy Now: ends the auction immediately at the Buy Now price.
create or replace function public.buy_now(p_lot bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_inv uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if not can_bid(v_user) then raise exception 'not_verified'; end if;
  select * into l from lots where id = p_lot for update;
  if l.status <> 'live' or l.ends_at <= now() then raise exception 'auction_closed'; end if;
  if l.buy_now_price is null or l.current_bid >= l.buy_now_price then raise exception 'buy_now_unavailable'; end if;
  insert into bids (lot_id, bidder_id, amount) values (p_lot, v_user, l.buy_now_price);
  update lots set status = 'sold', current_bid = buy_now_price, bid_count = bid_count + 1,
    leader_id = v_user, winner_id = v_user, sold_price = buy_now_price, sold_via = 'buy_now',
    reserve_met = true, ends_at = now(), updated_at = now()
  where id = p_lot;
  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;
  v_inv := create_invoice(p_lot, v_user, l.buy_now_price, 'buy_now');
  return v_inv;
end $$;

-- Make an Offer: only while a lot is in its offer period.
create or replace function public.make_offer(p_lot bigint, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_last numeric; v_id uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if not can_bid(v_user) then raise exception 'not_verified'; end if;
  select * into l from lots where id = p_lot;
  if l.status <> 'offers' or l.decision_by <= now() then raise exception 'offers_closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) then raise exception 'invalid_amount'; end if;
  select max(amount) into v_last from offers where lot_id = p_lot and user_id = v_user;
  if v_last is not null and p_amount <= v_last then raise exception 'offer_not_higher:%', v_last; end if;
  update offers set status = 'lapsed', decided_at = now() where lot_id = p_lot and user_id = v_user and status = 'pending';
  insert into offers (lot_id, user_id, amount) values (p_lot, v_user, p_amount) returning id into v_id;
  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;
  return v_id;
end $$;

-- Closes every auction whose time is up. Called every minute by the cron route.
create or replace function public.close_due_lots() returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0;
  v_days int := setting_num('auction','referral_days')::int;
  v_offer_days int := setting_num('auction','offer_days')::int;
begin
  for l in select lots.*, p.reserve_price from lots left join lot_private p on p.lot_id = lots.id
           where status = 'live' and ends_at <= now() for update of lots skip locked loop
    if l.leader_id is null then
      if l.has_reserve then
        update lots set status = 'offers', decision_by = business_days_from(now(), v_offer_days), updated_at = now() where id = l.id;
      else
        update lots set status = 'passed', updated_at = now() where id = l.id;
      end if;
    elsif l.reserve_price is null or l.current_bid >= l.reserve_price then
      update lots set status = 'sold', winner_id = l.leader_id, sold_price = l.current_bid, sold_via = 'auction', updated_at = now() where id = l.id;
      perform create_invoice(l.id, l.leader_id, l.current_bid, 'auction');
    else
      update lots set status = 'referred', decision_by = business_days_from(now(), v_days), updated_at = now() where id = l.id;
    end if;
    n := n + 1;
  end loop;
  -- Offer periods that lapse without a sale
  update offers set status = 'lapsed', decided_at = now()
    where status = 'pending' and lot_id in (select id from lots where status = 'offers' and decision_by <= now());
  update lots set status = 'passed', updated_at = now() where status = 'offers' and decision_by <= now();
  return n;
end $$;

-- Admin: seller accepts the referred highest bid, or an offer.
create or replace function public.admin_accept(p_lot bigint, p_offer uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.lots%rowtype; o public.offers%rowtype; v_inv uuid;
begin
  if not is_admin() and coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into l from lots where id = p_lot for update;
  if p_offer is null then
    if l.status <> 'referred' then raise exception 'not_referred'; end if;
    update lots set status = 'sold', winner_id = leader_id, sold_price = current_bid, sold_via = 'referral', updated_at = now() where id = p_lot;
    v_inv := create_invoice(p_lot, l.leader_id, l.current_bid, 'referral');
  else
    select * into o from offers where id = p_offer and lot_id = p_lot for update;
    if o.status <> 'pending' or l.status not in ('offers','referred') then raise exception 'offer_not_pending'; end if;
    update offers set status = 'accepted', decided_at = now() where id = p_offer;
    update offers set status = 'declined', decided_at = now() where lot_id = p_lot and id <> p_offer and status = 'pending';
    update lots set status = 'sold', winner_id = o.user_id, sold_price = o.amount, sold_via = 'offer', updated_at = now() where id = p_lot;
    v_inv := create_invoice(p_lot, o.user_id, o.amount, 'offer');
  end if;
  return v_inv;
end $$;

-- Admin: seller declines the referred bid -> Make an Offer opens.
create or replace function public.admin_decline_referral(p_lot bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden'; end if;
  update lots set status = 'offers', decision_by = business_days_from(now(), setting_num('auction','offer_days')::int), updated_at = now()
    where id = p_lot and status = 'referred';
end $$;

-- Public bid history with masked bidder tags. Marks the caller's own bids.
create or replace function public.bid_history(p_lot bigint, p_limit int default 20)
returns table (amount numeric, created_at timestamptz, bidder_tag text, is_me boolean, is_auto boolean)
language sql stable security definer set search_path = public as $$
  select b.amount, b.created_at,
    upper(left(md5(b.bidder_id::text || b.lot_id::text), 1)) || '•••' || right(md5(b.bidder_id::text), 2),
    b.bidder_id = auth.uid(), b.is_auto
  from bids b where b.lot_id = p_lot order by b.created_at desc, b.id desc limit p_limit;
$$;

-- The caller's own position on a lot (their max stays private to them).
create or replace function public.my_position(p_lot bigint)
returns table (my_max numeric, is_leader boolean)
language sql stable security definer set search_path = public as $$
  select m.max_amount, l.leader_id = auth.uid()
  from lots l left join max_bids m on m.lot_id = l.id and m.bidder_id = auth.uid()
  where l.id = p_lot;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.lots enable row level security;
alter table public.lot_private enable row level security;
alter table public.lot_photos enable row level security;
alter table public.lot_flaws enable row level security;
alter table public.bids enable row level security;
alter table public.max_bids enable row level security;
alter table public.watchlist enable row level security;
alter table public.saved_searches enable row level security;
alter table public.offers enable row level security;
alter table public.invoices enable row level security;
alter table public.inspections enable row level security;
alter table public.appraisals enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

create policy settings_read on public.settings for select using (true);
create policy settings_admin on public.settings for all using (is_admin()) with check (is_admin());

create policy profiles_self_read on public.profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create policy lots_public_read on public.lots for select using (status <> 'draft' or is_admin());
create policy lots_admin_write on public.lots for all using (is_admin()) with check (is_admin());
create policy lot_private_admin on public.lot_private for all using (is_admin()) with check (is_admin());

create policy photos_read on public.lot_photos for select using (
  is_admin() or exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'draft'));
create policy photos_admin on public.lot_photos for all using (is_admin()) with check (is_admin());
create policy flaws_read on public.lot_flaws for select using (
  is_admin() or exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'draft'));
create policy flaws_admin on public.lot_flaws for all using (is_admin()) with check (is_admin());

create policy bids_own on public.bids for select using (bidder_id = auth.uid() or is_admin());
create policy max_bids_own on public.max_bids for select using (bidder_id = auth.uid() or is_admin());

create policy watch_own on public.watchlist for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy searches_own on public.saved_searches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy offers_own on public.offers for select using (user_id = auth.uid() or is_admin());
create policy invoices_own on public.invoices for select using (buyer_id = auth.uid() or is_admin());
create policy invoices_admin on public.invoices for update using (is_admin()) with check (is_admin());

create policy inspections_own on public.inspections for select using (user_id = auth.uid() or is_admin());
create policy inspections_insert on public.inspections for insert with check (user_id = auth.uid() and can_bid(auth.uid()));
create policy inspections_admin on public.inspections for update using (is_admin()) with check (is_admin());

create policy appraisals_insert on public.appraisals for insert with check (user_id is null or user_id = auth.uid());
create policy appraisals_read on public.appraisals for select using (user_id = auth.uid() or is_admin());
create policy appraisals_admin on public.appraisals for update using (is_admin()) with check (is_admin());

create policy reports_insert on public.reports for insert with check (auth.uid() is not null and user_id = auth.uid());
create policy reports_admin on public.reports for select using (is_admin());
create policy reports_admin_update on public.reports for update using (is_admin()) with check (is_admin());

create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live bid updates to every open lot page
alter publication supabase_realtime add table public.lots;
