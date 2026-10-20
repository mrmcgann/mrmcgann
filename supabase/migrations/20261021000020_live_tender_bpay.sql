-- Tyrebiter: the rest of what Australia's big auction sites offer.
--   1. Live auction events (like PicklesLIVE, Manheim Simulcast, Lloyds): an auctioneer offers one vehicle at a
--      time with a short countdown that resets on every bid; online and floor bids go through the same engine.
--   2. Tender sales: sealed best offers, revealed when the tender closes; the highest tender buys (at its price).
--   3. BPAY: every member gets a Customer Reference Number (CRN) for paying invoices and deposits.
--   4. Damage map: each flaw can be pinned to a part of the vehicle.
--   5. Search: write-off / salvage filter, and "how it's sold" (timed, live, tender).
--   6. The auction calendar.
-- Money and bidding rules stay in the database: the live console and the tender box only call these functions.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.sales
  add column if not exists mode text not null default 'timed',
  add column if not exists starts_at timestamptz,
  add column if not exists stream_url text,
  add column if not exists auctioneer text,
  add column if not exists live_status text not null default 'scheduled',
  add column if not exists current_lot_id bigint references public.lots(id) on delete set null,
  add column if not exists live_message text,
  add column if not exists live_message_at timestamptz,
  add column if not exists lot_seconds int not null default 60,
  add column if not exists extend_seconds int not null default 20,
  add column if not exists paused_remaining interval,
  add column if not exists auto_advance boolean not null default true,
  add column if not exists live_started_at timestamptz,
  add column if not exists live_ended_at timestamptz;
alter table public.sales drop constraint if exists sales_mode_check;
alter table public.sales add constraint sales_mode_check check (mode in ('timed','live'));
alter table public.sales drop constraint if exists sales_live_status_check;
alter table public.sales add constraint sales_live_status_check check (live_status in ('scheduled','running','paused','ended'));
alter table public.sales drop constraint if exists sales_live_needs_start;
alter table public.sales add constraint sales_live_needs_start check (mode = 'timed' or starts_at is not null);
alter table public.sales drop constraint if exists sales_lot_seconds_check;
alter table public.sales add constraint sales_lot_seconds_check check (lot_seconds between 20 and 600);
alter table public.sales drop constraint if exists sales_extend_seconds_check;
alter table public.sales add constraint sales_extend_seconds_check check (extend_seconds between 5 and 120);
-- only YouTube or Vimeo players (the site's content rules allow just these two to be framed)
alter table public.sales drop constraint if exists sales_stream_url_check;
alter table public.sales add constraint sales_stream_url_check check (stream_url is null
  or stream_url ~ '^https://(www\.youtube-nocookie\.com/embed/|www\.youtube\.com/embed/|player\.vimeo\.com/video/)[A-Za-z0-9_-]{1,64}(\?[A-Za-z0-9_=&-]{0,120})?$');
alter table public.sales drop constraint if exists sales_live_message_check;
alter table public.sales add constraint sales_live_message_check check (live_message is null or char_length(live_message) <= 80);
create index if not exists sales_live on public.sales (starts_at) where mode = 'live' and published;

alter table public.lots
  add column if not exists method text not null default 'auction',
  add column if not exists live_state text,
  add column if not exists sale_order int,
  add column if not exists extend_seconds int,
  add column if not exists tender_count int not null default 0;
alter table public.lots drop constraint if exists lots_method_check;
alter table public.lots add constraint lots_method_check check (method in ('auction','tender'));
alter table public.lots drop constraint if exists lots_live_state_check;
alter table public.lots add constraint lots_live_state_check check (live_state is null or (live_state in ('waiting','open','closed') and method = 'auction'));
alter table public.lots drop constraint if exists lots_extend_seconds_check;
alter table public.lots add constraint lots_extend_seconds_check check (extend_seconds is null or extend_seconds between 5 and 120);
create index if not exists lots_live_sale on public.lots (sale_id, live_state, sale_order) where live_state is not null;
create index if not exists lots_method on public.lots (method, ends_at) where method <> 'auction' and status = 'live';
create index if not exists lots_write_off on public.lots (write_off_status) where status = 'live';

-- where each bid came from: online, or the auctioneer taking a bid in the room or on the phone
alter table public.bids add column if not exists source text not null default 'online';
alter table public.bids drop constraint if exists bids_source_check;
alter table public.bids add constraint bids_source_check check (source in ('online','floor'));

-- the damage map: which part of the vehicle a flaw is on (words and drawing in src/lib/damage.ts)
alter table public.lot_flaws add column if not exists zone text;
alter table public.lot_flaws drop constraint if exists lot_flaws_zone_check;
alter table public.lot_flaws add constraint lot_flaws_zone_check check (zone is null or zone in (
  'front','bonnet','windscreen','roof','boot','rear',
  'left_front','left_rear','right_front','right_rear','wheels','interior','underbody','engine'));

-- ---------------------------------------------------------------------------
-- 2. BPAY: a Customer Reference Number per member (digits plus a MOD10V01 check digit, the Luhn method)
-- ---------------------------------------------------------------------------
create or replace function public.bpay_check_digit(p text) returns int
language plpgsql immutable set search_path = public as $$
declare s int := 0; d int; n int := length(p);
begin
  if p !~ '^[0-9]{1,19}$' then raise exception 'bad_crn'; end if;
  for i in 1..n loop
    d := substr(p, n - i + 1, 1)::int;
    if i % 2 = 1 then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    s := s + d;
  end loop;
  return (10 - s % 10) % 10;
end $$;
create or replace function public.bpay_valid(p text) returns boolean
language sql immutable set search_path = public as $$
  select p ~ '^[0-9]{2,20}$' and right(p, 1)::int = public.bpay_check_digit(left(p, length(p) - 1))
$$;
create sequence if not exists public.bpay_seq start 10000001;
create or replace function public.new_bpay_crn() returns text
language sql volatile set search_path = public as $$
  select n::text || public.bpay_check_digit(n::text) from (select nextval('public.bpay_seq') n) x
$$;
alter table public.profiles add column if not exists bpay_crn text;
update public.profiles set bpay_crn = public.new_bpay_crn() where bpay_crn is null;
alter table public.profiles alter column bpay_crn set default public.new_bpay_crn();
create unique index if not exists profiles_bpay_crn on public.profiles (bpay_crn);
alter table public.profiles drop constraint if exists profiles_bpay_crn_check;
alter table public.profiles add constraint profiles_bpay_crn_check check (bpay_crn is null or public.bpay_valid(bpay_crn));

-- members can't change their own CRN (it's how a payment finds them)
create or replace function public.protect_profile_bpay() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() and new.bpay_crn is distinct from old.bpay_crn then
    raise exception 'protected_field';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_bpay on public.profiles;
create trigger protect_profile_bpay before update of bpay_crn on public.profiles for each row execute function public.protect_profile_bpay();

alter table public.bidder_deposits drop constraint if exists bidder_deposits_method_check;
alter table public.bidder_deposits add constraint bidder_deposits_method_check check (method in ('bank','payid','bpay'));

-- the member's CRN beside their deposit reference
create or replace function public.deposit_summary(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f jsonb := coalesce((select value from settings where key = 'fees'), '{}'::jsonb);
  v_bal numeric := deposit_balance(p_user); v_com numeric := deposit_committed(p_user, null);
  v_av numeric; v_rate numeric := coalesce((f->>'deposit_rate')::numeric, 0.10); v_min numeric := coalesce((f->>'deposit_min')::numeric, 500);
  v_cap numeric := coalesce((f->>'deposit_cap')::numeric, 0); v_limit numeric;
begin
  v_av := greatest(v_bal - v_com, 0);
  v_limit := case when v_cap > 0 and v_av >= v_cap then null
                  when v_av < v_min or v_rate <= 0 then 0
                  else floor(v_av / v_rate) end;
  return jsonb_build_object(
    'balance', v_bal, 'committed', v_com, 'available', v_av,
    'pending_withdrawal', (select coalesce(-sum(amount), 0) from bidder_deposits where user_id = p_user and kind = 'withdrawal' and status = 'pending'),
    'limit', v_limit, 'unlimited', v_limit is null,
    'ref', (select deposit_ref from profiles where id = p_user),
    'crn', (select bpay_crn from profiles where id = p_user),
    'rate', v_rate, 'min', v_min, 'cap', v_cap);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tenders count toward the bidding deposit like a leading bid (deposit mode only)
-- ---------------------------------------------------------------------------
create or replace function public.deposit_committed(p_user uuid, p_except bigint default null) returns numeric
language sql stable security definer set search_path = public as $$
  with f as (select coalesce((select value from settings where key = 'fees'), '{}'::jsonb) v)
  select coalesce((select sum(deposit_for_with(case when l.status = 'live' then greatest(coalesce(p.leader_max, 0), l.current_bid) else l.current_bid end, f.v))
                     from lots l left join lot_private p on p.lot_id = l.id
                    where l.leader_id = p_user and l.status in ('live','referred') and l.id is distinct from p_except), 0)
       + coalesce((select sum(deposit_for_with(o.amount, f.v)) from offers o join lots l on l.id = o.lot_id
                    where o.user_id = p_user and o.status = 'pending' and l.status in ('offers','referred') and o.lot_id is distinct from p_except), 0)
       + coalesce((select sum(deposit_for_with(m.max_amount, f.v)) from max_bids m join lots l on l.id = m.lot_id
                    where m.bidder_id = p_user and l.method = 'tender' and l.status = 'live' and l.leader_id is null
                      and l.id is distinct from p_except), 0)
  from f
$$;

-- ---------------------------------------------------------------------------
-- 4. One bidding engine for everyone: place_bid_for (internal) does the work; place_bid (members) and
--    admin_floor_bid (the auctioneer, for a registered bidder in the room or on the phone) call it.
-- ---------------------------------------------------------------------------
create or replace function public.place_bid_for(p_user uuid, p_lot bigint, p_max numeric, p_source text default 'online')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
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
  v_sale_status text;
  v_n int;
begin
  if p_user is null then raise exception 'not_signed_in'; end if;
  if p_source not in ('online','floor') then raise exception 'invalid_source'; end if;
  perform bid_gate(p_user);
  if p_max is null or p_max <= 0 or p_max <> round(p_max) then raise exception 'invalid_amount'; end if;
  if p_max > 10000000 then raise exception 'invalid_amount'; end if;
  perform bid_guard(p_lot, p_user);

  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  -- a vehicle waiting for its turn in a live auction takes early bids (its closing time is only an estimate)
  if l.status <> 'live' or (l.ends_at <= now() and l.live_state is distinct from 'waiting')
     or (l.starts_at is not null and l.starts_at > now()) then
    raise exception 'auction_closed';
  end if;
  if l.live_state is not null then
    select live_status into v_sale_status from sales where id = l.sale_id;
    if v_sale_status = 'paused' and l.live_state = 'open' then raise exception 'live_paused'; end if;
    if l.extend_seconds is not null then v_extend := make_interval(secs => l.extend_seconds); end if;
  end if;

  -- a tender: one sealed amount per bidder, nobody else sees it, nothing on the public price until it closes
  if l.method = 'tender' then
    if p_source <> 'online' then raise exception 'tender_online_only'; end if;
    if p_max < greatest(l.start_price, 1) then raise exception 'too_low:%', greatest(l.start_price, 1); end if;
    perform deposit_check(p_user, p_lot, p_max);
    insert into max_bids (lot_id, bidder_id, max_amount) values (p_lot, p_user, p_max)
      on conflict (lot_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = clock_timestamp();
    select count(*) into v_n from max_bids where lot_id = p_lot;
    update lots set tender_count = v_n, updated_at = now() where id = p_lot;
    insert into watchlist (user_id, lot_id) values (p_user, p_lot) on conflict do nothing;
    return jsonb_build_object('status', 'tendered', 'max', p_max, 'tender_count', v_n, 'ends_at', l.ends_at,
      'current_bid', l.current_bid, 'extended', false, 'outbid_user', null);
  end if;

  -- the bidding deposit must cover this maximum (as well as everything else they're winning)
  perform deposit_check(p_user, p_lot, p_max);
  select * into pr from lot_private where lot_id = p_lot for update;
  if not found then insert into lot_private (lot_id) values (p_lot) returning * into pr; end if;

  v_prev_leader := l.leader_id;

  if l.leader_id = p_user then
    if p_max <= pr.leader_max then raise exception 'max_not_higher'; end if;
    update lot_private set leader_max = p_max where lot_id = p_lot;
    insert into max_bids (lot_id, bidder_id, max_amount) values (p_lot, p_user, p_max)
      on conflict (lot_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = clock_timestamp();
    if pr.reserve_price is not null and l.current_bid < pr.reserve_price and p_max >= pr.reserve_price then
      update lots set current_bid = pr.reserve_price, bid_count = bid_count + 1, reserve_met = true, updated_at = now()
        where id = p_lot;
      insert into bids (lot_id, bidder_id, amount, is_auto, source) values (p_lot, p_user, pr.reserve_price, true, p_source);
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
    insert into bids (lot_id, bidder_id, amount, source) values (p_lot, p_user, v_new, p_source);
    v_inserted := 1;
    l.leader_id := p_user;
    update lot_private set leader_max = p_max, leader_max_at = clock_timestamp() where lot_id = p_lot;
    v_status := 'leading';
  elsif p_max > pr.leader_max then
    v_new := least(p_max, pr.leader_max + bid_increment(pr.leader_max));
    if pr.reserve_price is not null and p_max >= pr.reserve_price then v_new := greatest(v_new, pr.reserve_price); end if;
    if pr.leader_max > l.current_bid then
      insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, l.leader_id, pr.leader_max, true);
      v_inserted := v_inserted + 1;
    end if;
    insert into bids (lot_id, bidder_id, amount, source) values (p_lot, p_user, v_new, p_source);
    v_inserted := v_inserted + 1;
    v_outbid := l.leader_id;
    l.leader_id := p_user;
    update lot_private set leader_max = p_max, leader_max_at = clock_timestamp() where lot_id = p_lot;
    v_status := 'leading';
  else
    insert into bids (lot_id, bidder_id, amount, source) values (p_lot, p_user, p_max, p_source);
    v_new := least(pr.leader_max, p_max + bid_increment(p_max));
    if v_new > p_max then
      insert into bids (lot_id, bidder_id, amount, is_auto) values (p_lot, l.leader_id, v_new, true);
      v_inserted := 2;
    else
      v_new := p_max;
      v_inserted := 1;
    end if;
    v_outbid := p_user;
    v_status := 'outbid';
  end if;

  insert into max_bids (lot_id, bidder_id, max_amount) values (p_lot, p_user, p_max)
    on conflict (lot_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = clock_timestamp();

  -- a bid in the closing moments gives everyone time to answer (not while a live vehicle waits its turn)
  if l.live_state is distinct from 'waiting' and l.ends_at - now() < v_extend then
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

  insert into watchlist (user_id, lot_id) values (p_user, p_lot) on conflict do nothing;

  -- Tell whoever lost the lead (never the person bidding right now)
  if v_outbid is not null and v_outbid <> p_user then
    perform queue_outbid(v_outbid, p_lot, v_new);
  end if;

  return jsonb_build_object('status', v_status, 'current_bid', v_new, 'max', p_max,
    'ends_at', l.ends_at, 'extended', v_extended, 'outbid_user', v_outbid,
    'previous_leader', v_prev_leader);
end $$;
revoke execute on function public.place_bid_for(uuid, bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.place_bid_for(uuid, bigint, numeric, text) to service_role;

create or replace function public.place_bid(p_lot bigint, p_max numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return place_bid_for(auth.uid(), p_lot, p_max, 'online');
end $$;

-- A tender can be withdrawn (or changed with place_bid) until the tender closes.
create or replace function public.withdraw_tender(p_lot bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l lots%rowtype; v_n int;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  select * into l from lots where id = p_lot for update;
  if not found or l.method <> 'tender' then raise exception 'not_a_tender'; end if;
  if l.status <> 'live' or l.ends_at <= now() then raise exception 'auction_closed'; end if;
  delete from max_bids where lot_id = p_lot and bidder_id = v_user;
  if not found then raise exception 'no_tender'; end if;
  select count(*) into v_n from max_bids where lot_id = p_lot;
  update lots set tender_count = v_n, updated_at = now() where id = p_lot;
  return v_n;
end $$;
revoke execute on function public.withdraw_tender(bigint) from public, anon;
grant execute on function public.withdraw_tender(bigint) to authenticated;

-- The closing-moments extension for bids from any path: a live vehicle uses its own short window,
-- a vehicle waiting its turn and a tender never extend.
create or replace function public.bid_extends_auction() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_extend interval := make_interval(mins => coalesce(setting_num('auction','extend_minutes'), 10)::int);
begin
  update lots set ends_at = now() + coalesce(make_interval(secs => extend_seconds), v_extend), updated_at = now()
   where id = new.lot_id and status = 'live' and method = 'auction' and live_state is distinct from 'waiting'
     and ends_at > now() and ends_at < now() + coalesce(make_interval(secs => extend_seconds), v_extend);
  return new;
end $$;

-- Buy Now isn't offered on a tender, or while the auctioneer has the vehicle up.
create or replace function public.buy_now(p_lot bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_inv uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  perform bid_gate(v_user);
  perform bid_guard(p_lot, v_user);
  select * into l from lots where id = p_lot for update;
  if l.status <> 'live' or l.ends_at <= now() or (l.starts_at is not null and l.starts_at > now()) then raise exception 'auction_closed'; end if;
  if l.method = 'tender' or l.live_state = 'open' then raise exception 'buy_now_unavailable'; end if;
  if l.buy_now_price is null or l.current_bid >= l.buy_now_price then raise exception 'buy_now_unavailable'; end if;
  perform deposit_check(v_user, p_lot, l.buy_now_price);
  insert into bids (lot_id, bidder_id, amount) values (p_lot, v_user, l.buy_now_price);
  update lots set status = 'sold', current_bid = buy_now_price, bid_count = bid_count + 1,
    leader_id = v_user, winner_id = v_user, sold_price = buy_now_price, sold_via = 'buy_now',
    reserve_met = true, ends_at = now(), live_state = case when live_state is not null then 'closed' end, updated_at = now()
  where id = p_lot;
  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;
  v_inv := create_invoice(p_lot, v_user, l.buy_now_price, 'buy_now');
  return v_inv;
end $$;

-- Removing a bidder from a tender that hasn't closed: just their sealed tender goes (nothing was public).
alter function public.admin_remove_bidder(bigint, uuid, text) rename to admin_remove_bidder_core;
revoke execute on function public.admin_remove_bidder_core(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_remove_bidder_core(bigint, uuid, text) to service_role;
create or replace function public.admin_remove_bidder(p_lot bigint, p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l lots%rowtype; v_max numeric; v_n int;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.method = 'tender' and l.status = 'live' and l.leader_id is null then
    delete from max_bids where lot_id = p_lot and bidder_id = p_user returning max_amount into v_max;
    if v_max is null then raise exception 'no_bids'; end if;
    insert into bid_removals (lot_id, bidder_id, max_amount, reason, removed_by) values (p_lot, p_user, v_max, left(trim(p_reason), 500), auth.uid());
    select count(*) into v_n from max_bids where lot_id = p_lot;
    update lots set tender_count = v_n, updated_at = now() where id = p_lot;
    perform queue_notice(p_user, 'account', 'Your tender on the ' || l.title || ' was cancelled',
      'We''ve cancelled your tender on this vehicle. Reason: ' || left(trim(p_reason), 200), '/lot/' || p_lot, 'bid-removed:' || p_lot || ':' || p_user);
    return jsonb_build_object('current_bid', l.current_bid, 'leader_changed', false, 'tender_count', v_n);
  end if;
  return admin_remove_bidder_core(p_lot, p_user, p_reason);
end $$;
revoke execute on function public.admin_remove_bidder(bigint, uuid, text) from public, anon;
grant execute on function public.admin_remove_bidder(bigint, uuid, text) to authenticated, service_role;

-- Tenders and live vehicles follow simple rules whoever edits them.
create or replace function public.lot_method_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_rank int;
begin
  if new.method = 'tender' then
    new.buy_now_price := null;
    new.live_state := null;
  end if;
  if tg_op = 'UPDATE' and new.method is distinct from old.method and (old.bid_count > 0 or old.tender_count > 0) then
    raise exception 'method_locked:this vehicle already has bids or tenders, so how it''s sold can''t change';
  end if;
  if tg_op = 'INSERT' or new.sale_id is distinct from old.sale_id or new.method is distinct from old.method then
    select * into s from sales where id = new.sale_id;
    if found and s.mode = 'live' and new.method = 'auction' and new.status in ('draft','scheduled','live') then
      if tg_op = 'UPDATE' and old.status = 'live' and old.bid_count > 0 and old.live_state is null then
        raise exception 'sale_move_bids:this vehicle already has bids on a timed auction, so it can''t move into a live auction';
      end if;
      if s.live_status = 'ended' then raise exception 'sale_ended:that live auction has finished'; end if;
      new.live_state := 'waiting';
      new.extend_seconds := null;
      select count(*) + 1 into v_rank from lots where sale_id = s.id and live_state = 'waiting' and id <> new.id;
      new.ends_at := greatest(s.starts_at, now()) + make_interval(secs => v_rank * (s.lot_seconds + 20)) + interval '2 minutes';
      if new.sale_order is null then
        select coalesce(max(sale_order), 0) + 1 into new.sale_order from lots where sale_id = s.id;
      end if;
    elsif new.live_state = 'waiting' then
      new.live_state := null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.lot_method_rules() from public, anon, authenticated;
drop trigger if exists lot_method_rules on public.lots;
create trigger lot_method_rules before insert or update of method, sale_id, buy_now_price, live_state on public.lots
  for each row execute function public.lot_method_rules();

-- ---------------------------------------------------------------------------
-- 5. Closing: one vehicle at a time (close_one_lot), tenders revealed first, live vehicles waiting their turn skipped
-- ---------------------------------------------------------------------------
create or replace function public.close_one_lot(p_lot bigint) returns text
language plpgsql security definer set search_path = public as $$
declare l record; v_status text;
  v_days int := setting_num('auction','referral_days')::int;
  v_offer_days int := setting_num('auction','offer_days')::int;
begin
  select lots.*, p.reserve_price into l from lots left join lot_private p on p.lot_id = lots.id where lots.id = p_lot for update of lots;
  if not found or l.status <> 'live' then return null; end if;
  if l.leader_id is null then
    v_status := case when l.has_reserve then 'offers' else 'passed' end;
    update lots set status = v_status, decision_by = case when v_status = 'offers' then business_days_from(now(), v_offer_days) end,
      live_state = case when live_state is not null then 'closed' end, ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
  elsif l.reserve_price is null or l.current_bid >= l.reserve_price then
    v_status := 'sold';
    update lots set status = 'sold', winner_id = l.leader_id, sold_price = l.current_bid, sold_via = 'auction',
      live_state = case when live_state is not null then 'closed' end, ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
    perform create_invoice(l.id, l.leader_id, l.current_bid, 'auction');
  else
    v_status := 'referred';
    update lots set status = 'referred', decision_by = business_days_from(now(), v_days),
      live_state = case when live_state is not null then 'closed' end, ends_at = least(ends_at, now()), updated_at = now() where id = l.id;
  end if;
  return v_status;
end $$;
revoke execute on function public.close_one_lot(bigint) from public, anon, authenticated;
grant execute on function public.close_one_lot(bigint) to service_role;

-- A tender that has closed: the highest tender (the earliest, if two are equal) becomes the price, then the
-- vehicle closes like any other (sold if it meets the reserve, otherwise referred to the seller).
create or replace function public.reveal_tenders(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare l record; v_top uuid; v_amt numeric; v_res numeric; n int := 0; r record;
begin
  for l in select id, title, tender_count from lots
           where status = 'live' and method = 'tender' and ends_at <= now() and leader_id is null and tender_count > 0
           order by ends_at limit p_limit for update skip locked loop
    select bidder_id, max_amount into v_top, v_amt from max_bids where lot_id = l.id order by max_amount desc, updated_at asc, bidder_id limit 1;
    if v_top is null then continue; end if;
    select reserve_price into v_res from lot_private where lot_id = l.id;
    insert into lot_private (lot_id, leader_max, leader_max_at) values (l.id, v_amt, now())
      on conflict (lot_id) do update set leader_max = excluded.leader_max, leader_max_at = excluded.leader_max_at;
    insert into bids (lot_id, bidder_id, amount) values (l.id, v_top, v_amt);
    update lots set current_bid = v_amt, leader_id = v_top, bid_count = l.tender_count,
      reserve_met = (v_res is null or v_amt >= v_res), updated_at = now() where id = l.id;
    for r in select bidder_id, max_amount from max_bids where lot_id = l.id and bidder_id <> v_top loop
      perform queue_notice(r.bidder_id, 'outbid', 'Your tender for the ' || l.title || ' wasn''t the highest',
        'The tender has closed and another buyer offered more than your $' || to_char(r.max_amount, 'FM999,999,990') || '. Thanks for taking part.',
        '/lot/' || l.id, 'tender-lost:' || l.id || ':' || r.bidder_id);
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.reveal_tenders(int) from public, anon, authenticated;
grant execute on function public.reveal_tenders(int) to service_role;

create or replace function public.close_due_lots(p_limit int default 500) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0;
  v_offer_days int := setting_num('auction','offer_days')::int;
begin
  perform reveal_tenders(p_limit);
  for l in select lots.id from lots
           where status = 'live' and ends_at <= now() and live_state is distinct from 'waiting'
           order by ends_at limit p_limit
           for update of lots skip locked loop
    perform close_one_lot(l.id);
    n := n + 1;
  end loop;
  -- Seller didn't answer a referral in time: that counts as a decline, and offers open.
  update lots set status = 'offers', decision_by = business_days_from(now(), v_offer_days), updated_at = now()
    where status = 'referred' and decision_by <= now();
  update offers set status = 'lapsed', decided_at = now()
    where status = 'pending' and lot_id in (select id from lots where status = 'offers' and decision_by <= now());
  update lots set status = 'passed', updated_at = now() where status = 'offers' and decision_by <= now();
  return n;
end $$;
revoke execute on function public.close_due_lots(int) from public, anon, authenticated;
grant execute on function public.close_due_lots(int) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Live auctions
-- ---------------------------------------------------------------------------
-- What every viewer needs to follow the sale (sent on channel sale:<id>; the price comes on lot:<id>).
create or replace function public.sale_live_payload(s public.sales) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', s.id, 'slug', s.slug, 'mode', s.mode, 'live_status', s.live_status,
    'current_lot_id', s.current_lot_id, 'live_message', s.live_message, 'live_message_at', s.live_message_at,
    'starts_at', s.starts_at, 'lot_seconds', s.lot_seconds, 'extend_seconds', s.extend_seconds);
$$;

create or replace function public.broadcast_sale() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.published and new.mode = 'live' and (
     new.live_status is distinct from old.live_status or new.current_lot_id is distinct from old.current_lot_id
     or new.live_message_at is distinct from old.live_message_at or new.starts_at is distinct from old.starts_at) then
    perform realtime.send(public.sale_live_payload(new), 'sale', 'sale:' || new.id, false);
  end if;
  return null;
exception when others then
  return null; -- a live-update hiccup must never block the auctioneer
end $$;
revoke execute on function public.broadcast_sale() from public, anon, authenticated;
drop trigger if exists broadcast_sale on public.sales;
create trigger broadcast_sale after update on public.sales for each row execute function public.broadcast_sale();

-- the live price message also says whether a vehicle is up, waiting or a tender
create or replace function public.lot_live_payload(l public.lots) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', l.id, 'status', l.status, 'current_bid', l.current_bid, 'bid_count', l.bid_count,
    'ends_at', l.ends_at, 'reserve_met', l.reserve_met, 'has_reserve', l.has_reserve, 'leader_id', l.leader_id,
    'decision_by', l.decision_by, 'sold_price', l.sold_price, 'buy_now_price', l.buy_now_price,
    'method', l.method, 'live_state', l.live_state, 'tender_count', l.tender_count);
$$;
create or replace function public.broadcast_lot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and (
     new.current_bid is distinct from old.current_bid or new.bid_count is distinct from old.bid_count
     or new.ends_at is distinct from old.ends_at or new.status is distinct from old.status
     or new.reserve_met is distinct from old.reserve_met or new.buy_now_price is distinct from old.buy_now_price
     or new.live_state is distinct from old.live_state or new.tender_count is distinct from old.tender_count) then
    perform realtime.send(public.lot_live_payload(new), 'lot', 'lot:' || new.id, false);
  end if;
  return null;
exception when others then
  return null; -- a live-update hiccup must never block a bid
end $$;

-- Estimated times for the vehicles still waiting (always in the future, so early bids keep working).
create or replace function public.live_estimates(p_sale bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_base timestamptz;
begin
  select * into s from sales where id = p_sale;
  if not found or s.mode <> 'live' then return; end if;
  select greatest(s.starts_at, now(), coalesce((select ends_at from lots where id = s.current_lot_id and live_state = 'open'), now()))
    into v_base;
  with w as (
    select id, row_number() over (order by sale_order nulls last, id) rn from lots
     where sale_id = p_sale and live_state = 'waiting' and status in ('draft','scheduled','live')
  )
  update lots l set ends_at = greatest(v_base + make_interval(secs => (w.rn * (s.lot_seconds + 20))::int), now() + interval '2 minutes'), updated_at = now()
    from w where l.id = w.id and l.ends_at is distinct from greatest(v_base + make_interval(secs => (w.rn * (s.lot_seconds + 20))::int), now() + interval '2 minutes');
end $$;
revoke execute on function public.live_estimates(bigint) from public, anon, authenticated;
grant execute on function public.live_estimates(bigint) to service_role;

-- A sale switched between timed and live: its vehicles follow (not once bidding has started on any of them).
create or replace function public.sale_mode_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mode is distinct from old.mode then
    if old.live_status in ('running','paused') then raise exception 'sale_running:end the live auction first'; end if;
    if exists (select 1 from lots where sale_id = new.id and status = 'live' and (bid_count > 0 or tender_count > 0)) then
      raise exception 'sale_mode_locked:vehicles in this sale already have bids, so it can''t switch between timed and live';
    end if;
    if new.mode = 'live' then
      update lots set live_state = 'waiting', extend_seconds = null where sale_id = new.id and method = 'auction' and status in ('draft','scheduled','live');
      new.live_status := 'scheduled';
    else
      update lots set live_state = null, extend_seconds = null where sale_id = new.id and live_state is not null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.sale_mode_sync() from public, anon, authenticated;
drop trigger if exists sale_mode_sync on public.sales;
create trigger sale_mode_sync before update of mode on public.sales for each row execute function public.sale_mode_sync();

create or replace function public.sale_estimates_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mode = 'live' and (tg_op = 'INSERT' or new.mode is distinct from old.mode or new.starts_at is distinct from old.starts_at
     or new.lot_seconds is distinct from old.lot_seconds) then
    perform live_estimates(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.sale_estimates_after() from public, anon, authenticated;
drop trigger if exists sale_estimates_after on public.sales;
create trigger sale_estimates_after after insert or update of mode, starts_at, lot_seconds on public.sales
  for each row execute function public.sale_estimates_after();

-- Offer the next vehicle (or a chosen one). Internal: the console (admin_live_next/admin_live_open) and the clock use it.
create or replace function public.live_advance(p_sale bigint, p_lot bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_lot bigint;
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
  else
    select id into v_lot from lots where sale_id = p_sale and live_state = 'waiting' and status = 'live'
      order by sale_order nulls last, id limit 1 for update skip locked;
  end if;
  if v_lot is null then
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

create or replace function public.live_admin_ok() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
end $$;
revoke execute on function public.live_admin_ok() from public, anon, authenticated;
grant execute on function public.live_admin_ok() to service_role;

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
  return live_advance(p_sale, null);
end $$;

create or replace function public.admin_live_next(p_sale bigint, p_lot bigint default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale;
  if s.live_status = 'scheduled' then raise exception 'sale_not_started:start the sale first'; end if;
  -- a vehicle whose countdown has run out is closed first, so the console never has to wait for the clock
  if s.current_lot_id is not null and exists (select 1 from lots where id = s.current_lot_id and status = 'live' and live_state = 'open' and ends_at <= now()) then
    perform close_one_lot(s.current_lot_id);
  end if;
  return live_advance(p_sale, p_lot);
end $$;

-- "Fair warning", "On the market", "Last call": a short line every viewer sees.
create or replace function public.admin_live_message(p_sale bigint, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform live_admin_ok();
  update sales set live_message = nullif(left(trim(coalesce(p_message, '')), 80), ''), live_message_at = now(), updated_at = now()
    where id = p_sale and mode = 'live' and live_status in ('running','paused');
  if not found then raise exception 'sale_not_running'; end if;
end $$;

-- Pause: the countdown stops and bids on the vehicle wait (a stream or connection problem). Resume carries on.
create or replace function public.admin_live_pause(p_sale bigint, p_message text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; l lots%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found or s.live_status <> 'running' then raise exception 'sale_not_running'; end if;
  select * into l from lots where id = s.current_lot_id and status = 'live' and live_state = 'open' for update;
  if found then
    update lots set ends_at = now() + interval '6 hours', updated_at = now() where id = l.id;
  end if;
  update sales set live_status = 'paused', paused_remaining = case when l.id is not null then greatest(l.ends_at - now(), interval '10 seconds') end,
    live_message = coalesce(nullif(left(trim(coalesce(p_message, '')), 80), ''), 'Short pause. Bidding resumes in a moment.'),
    live_message_at = now(), updated_at = now() where id = p_sale;
end $$;

create or replace function public.admin_live_resume(p_sale bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found or s.live_status <> 'paused' then raise exception 'sale_not_paused'; end if;
  update lots set ends_at = now() + greatest(coalesce(s.paused_remaining, interval '0'), make_interval(secs => s.extend_seconds)), updated_at = now()
    where id = s.current_lot_id and status = 'live' and live_state = 'open';
  update sales set live_status = 'running', paused_remaining = null, live_message = 'We''re back. Bidding is open.', live_message_at = now(), updated_at = now()
    where id = p_sale;
  perform live_estimates(p_sale);
end $$;

-- More time on the vehicle that's up (up to 5 minutes at a time).
create or replace function public.admin_live_time(p_sale bigint, p_seconds int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_end timestamptz;
begin
  perform live_admin_ok();
  if p_seconds not between 5 and 300 then raise exception 'bad_seconds'; end if;
  select * into s from sales where id = p_sale;
  if not found or s.live_status <> 'running' then raise exception 'sale_not_running'; end if;
  update lots set ends_at = greatest(ends_at, now()) + make_interval(secs => p_seconds), updated_at = now()
    where id = s.current_lot_id and status = 'live' and live_state = 'open' returning ends_at into v_end;
  if v_end is null then raise exception 'no_open_lot'; end if;
  return v_end;
end $$;

-- Knock it down now: closes the vehicle that's up on the bids it has (sold if it meets the reserve, otherwise
-- referred to the seller, or open to offers if nobody bid). The same rules as every other close.
create or replace function public.admin_live_close(p_sale bigint) returns text
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found or s.live_status not in ('running','paused') then raise exception 'sale_not_running'; end if;
  if s.current_lot_id is null or not exists (select 1 from lots where id = s.current_lot_id and status = 'live' and live_state = 'open') then
    raise exception 'no_open_lot';
  end if;
  if s.live_status = 'paused' then update sales set live_status = 'running', paused_remaining = null where id = p_sale; end if;
  return close_one_lot(s.current_lot_id);
end $$;

-- Finish the sale: anything not yet offered closes on the bids it already has, like a timed auction ending.
create or replace function public.admin_live_end(p_sale bigint) returns int
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; r record; n int := 0;
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale for update;
  if not found or s.mode <> 'live' then raise exception 'not_live_sale'; end if;
  if s.live_status = 'ended' then return 0; end if;
  for r in select id from lots where sale_id = p_sale and status = 'live' and live_state in ('waiting','open') order by sale_order nulls last, id loop
    perform close_one_lot(r.id);
    n := n + 1;
  end loop;
  update sales set live_status = 'ended', live_ended_at = now(), paused_remaining = null,
    live_message = 'That''s the end of the sale. Thanks for bidding.', live_message_at = now(), updated_at = now() where id = p_sale;
  return n;
end $$;

-- A bid the auctioneer takes in the room or on the phone, for a registered, verified member (by their
-- bidder number, the payment reference on their account, or their BPAY CRN). Same checks as online.
create or replace function public.admin_floor_bid(p_sale bigint, p_bidder text, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sales%rowtype; v_user uuid; v_ref text := upper(regexp_replace(coalesce(p_bidder, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform live_admin_ok();
  select * into s from sales where id = p_sale;
  if not found or s.live_status <> 'running' then raise exception 'sale_not_running'; end if;
  if s.current_lot_id is null then raise exception 'no_open_lot'; end if;
  select id into v_user from profiles where deposit_ref = v_ref or bpay_crn = v_ref limit 1;
  if v_user is null then raise exception 'bidder_not_found:no member has that bidder number'; end if;
  return place_bid_for(v_user, s.current_lot_id, p_amount, 'floor');
end $$;

-- Put the vehicles in the order they'll be offered.
create or replace function public.admin_sale_order(p_sale bigint, p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform live_admin_ok();
  update lots l set sale_order = x.ord, updated_at = now()
    from unnest(p_ids) with ordinality as x(id, ord) where l.id = x.id and l.sale_id = p_sale;
  get diagnostics n = row_count;
  perform live_estimates(p_sale);
  return n;
end $$;

-- The clock: starts sales that run themselves at their start time, keeps them moving if the console is closed,
-- and keeps the waiting vehicles' estimated times in the future.
create or replace function public.live_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select * from sales where mode = 'live' and published and live_status in ('scheduled','running') loop
    begin
      if s.live_status = 'scheduled' and s.auto_advance and s.starts_at <= now() then
        perform live_advance(s.id, null); n := n + 1;
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

do $$
declare f text;
begin
  foreach f in array array['admin_live_start(bigint)', 'admin_live_next(bigint, bigint)', 'admin_live_message(bigint, text)',
    'admin_live_pause(bigint, text)', 'admin_live_resume(bigint)', 'admin_live_time(bigint, integer)', 'admin_live_close(bigint)',
    'admin_live_end(bigint)', 'admin_floor_bid(bigint, text, numeric)', 'admin_sale_order(bigint, bigint[])'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. The auction calendar: live sales, tenders closing and how many timed auctions end each day
-- ---------------------------------------------------------------------------
create or replace function public.auction_calendar(p_days int default 21) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select least(greatest(coalesce(p_days, 21), 1), 60) n),
  x as (
    select (l.ends_at at time zone 'Australia/Brisbane')::date as day, l.method, l.category
      from lots l, d where l.status = 'live' and l.live_state is null and l.ends_at > now() and l.ends_at < now() + make_interval(days => d.n)
  ),
  per as (
    select day, count(*) filter (where method = 'auction') timed, count(*) filter (where method = 'tender') tenders from x group by day
  ),
  cats as (
    select day, jsonb_object_agg(category, k) cats from (select day, category, count(*) k from x group by 1, 2) y group by day
  ),
  sl as (
    select s.*, (select min(ends_at) from lots where sale_id = s.id and status = 'live') first_end,
      (select max(ends_at) from lots where sale_id = s.id and status = 'live') last_end,
      (select count(*) from lots where sale_id = s.id and status = 'live') cnt
    from sales s where s.published
  )
  select jsonb_build_object(
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', sl.id, 'slug', sl.slug, 'title', sl.title, 'mode', sl.mode, 'state', sl.state,
        'starts_at', sl.starts_at, 'live_status', sl.live_status, 'seller_label', sl.seller_label,
        'first_end', sl.first_end, 'last_end', sl.last_end, 'count', sl.cnt) order by coalesce(sl.starts_at, sl.first_end))
      from sl, d where (sl.mode = 'live' and sl.live_status <> 'ended' and sl.starts_at < now() + make_interval(days => d.n))
        or (sl.mode = 'timed' and sl.cnt > 0 and sl.first_end < now() + make_interval(days => d.n))), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', per.day, 'timed', per.timed, 'tenders', per.tenders, 'cats', cats.cats) order by per.day)
      from per left join cats on cats.day = per.day), '[]'::jsonb))
$$;
grant execute on function public.auction_calendar(int) to anon, authenticated, service_role;

create or replace function public.public_function_allowlist() returns text[]
language sql immutable set search_path = public as $$
  select array['auction_calendar', 'bid_history', 'deposit_for', 'is_admin', 'lot_facets', 'lot_videos_public', 'lot_watchers', 'pay_mode',
    'price_estimate', 'sale_stats', 'search_lots']
$$;

-- ---------------------------------------------------------------------------
-- 8. Search: write-off / salvage ("wo") and how it's sold ("how"), plus the saved-search alerts
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
    if f->>'inspected' = '1' then w := array_append(w, 'l.inspected_at is not null'::text); end if;
    if f->>'wo' = 'clear' then w := array_append(w, $s$l.write_off_status = 'none'$s$::text); end if;
    if f->>'wo' = 'writeoff' then w := array_append(w, $s$l.write_off_status in ('repairable','inspected','statutory')$s$::text); end if;
    if f->>'how' = 'timed' then w := array_append(w, $s$(l.method = 'auction' and l.live_state is null)$s$::text); end if;
    if f->>'how' = 'live' then w := array_append(w, 'l.live_state is not null'::text); end if;
    if f->>'how' = 'tender' then w := array_append(w, $s$l.method = 'tender'$s$::text); end if;
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
      string_agg(l.title || ' · ' || case when l.method = 'tender' then 'tender' else '$' || to_char(greatest(l.current_bid, l.start_price), 'FM999,999,990') end,
        E'\n' order by l.ends_at) items
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
      and ((s.query->>'inspected') is distinct from '1' or l.inspected_at is not null)
      and ((s.query->>'wo') is distinct from 'clear' or l.write_off_status = 'none')
      and ((s.query->>'wo') is distinct from 'writeoff' or l.write_off_status in ('repairable','inspected','statutory'))
      and ((s.query->>'how') is distinct from 'timed' or (l.method = 'auction' and l.live_state is null))
      and ((s.query->>'how') is distinct from 'live' or l.live_state is not null)
      and ((s.query->>'how') is distinct from 'tender' or l.method = 'tender')
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
-- 9. Nothing new open to the public; new terms (live auctions, tenders, BPAY): members re-accept before bidding
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
revoke execute on function public.bpay_check_digit(text) from public, anon;
revoke execute on function public.new_bpay_crn() from public, anon, authenticated;

update public.settings set value = value || '{"buyer_version": "2026-10-21"}'::jsonb
  where key = 'terms' and value->>'buyer_version' = '2026-10-12';
