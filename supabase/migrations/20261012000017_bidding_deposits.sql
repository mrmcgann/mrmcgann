-- How money is taken: no cards (so no chargebacks). PayID or bank transfer only. Two ways, set in Admin → Fees & settings:
--  'transfer' (the default, like Turners): anyone with a verified mobile and a verified ID can bid. No deposit and no
--     card, so buyers using finance can bid too. The winner pays the full amount by PayID or bank transfer within
--     2 business days; nothing is released until it has cleared. A buyer who doesn't pay is banned: the sale is
--     cancelled, the account is suspended, and the same person (name and date of birth, mobile or email) can't
--     open a new account to bid again.
--  'deposit' (like Copart and Manheim): bidders first pay a refundable bidding deposit, 10% of the most they want to
--     bid (minimum $500; $5,000 means no limit). It covers every vehicle they're winning at once; on a win the deposit
--     for the price goes onto the invoice and the rest is paid by transfer. Not paying: that deposit is kept (half to
--     the seller) and they're banned. They can withdraw what isn't in use, back to the account it came from.
-- The card code stays for invoices raised before this change ('card' brings it back).

-- ---------------------------------------------------------------------------
-- 1. The rules (Admin → Fees & settings). Existing values are kept.
-- ---------------------------------------------------------------------------
update public.settings
   set value = jsonb_build_object('pay_mode', 'transfer', 'deposit_rate', 0.10, 'deposit_min', 500, 'deposit_cap', 5000) || value
 where key = 'fees';

create or replace function public.pay_mode() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value->>'pay_mode' from settings where key = 'fees'), 'transfer')
$$;

-- The deposit needed to bid (or buy, or offer) a given amount.
create or replace function public.deposit_for_with(p_amount numeric, f jsonb) returns numeric
language sql immutable as $$
  select case when coalesce(p_amount, 0) <= 0 then 0::numeric else
    least(
      greatest(coalesce((f->>'deposit_min')::numeric, 500), ceil(p_amount * coalesce((f->>'deposit_rate')::numeric, 0.10))),
      case when coalesce((f->>'deposit_cap')::numeric, 0) > 0 then (f->>'deposit_cap')::numeric else 1e12 end)
  end
$$;

create or replace function public.deposit_for(p_amount numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select deposit_for_with(p_amount, coalesce((select value from settings where key = 'fees'), '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- 2. The ledger. Every dollar in or out of a bidder's deposit is a row; the balance is the sum.
--    received (+)   money that arrived by PayID or bank transfer
--    applied (-)    moved onto an invoice when they won
--    returned (+)   an applied deposit given back (a sale cancelled through no fault of theirs)
--    withdrawal (-) paid back to them (pending until our team has sent it)
--    adjustment (±) a correction by our team, with a note
-- ---------------------------------------------------------------------------
create table if not exists public.bidder_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('received','applied','returned','withdrawal','adjustment')),
  amount numeric(12,2) not null check (amount <> 0),
  status text not null default 'done' check (status in ('pending','done','cancelled')),
  invoice_id uuid references public.invoices(id),
  method text check (method in ('bank','payid')),
  reference text,
  payer_name text,
  payer_bsb text,
  payer_account text,
  provider text,
  provider_ref text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  constraint bidder_deposits_sign check (
    (kind in ('received','returned') and amount > 0) or (kind in ('applied','withdrawal') and amount < 0) or kind = 'adjustment')
);
create index if not exists bidder_deposits_user on public.bidder_deposits (user_id, created_at desc);
create index if not exists bidder_deposits_pending on public.bidder_deposits (created_at) where status = 'pending';
create unique index if not exists bidder_deposits_provider_ref on public.bidder_deposits (provider, provider_ref) where provider_ref is not null;
create unique index if not exists bidder_deposits_invoice_once on public.bidder_deposits (invoice_id, kind) where kind in ('applied','returned');
alter table public.bidder_deposits enable row level security;
drop policy if exists bidder_deposits_read on public.bidder_deposits;
create policy bidder_deposits_read on public.bidder_deposits for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Single-use PayIDs from a payments provider (optional; off until the provider is set up). Server only.
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  purpose text not null check (purpose in ('deposit','invoice')),
  invoice_id uuid references public.invoices(id),
  amount numeric(12,2) not null check (amount > 0),
  provider text not null,
  provider_id text,
  payid text,
  status text not null default 'waiting' check (status in ('waiting','complete','expired','cancelled','failed')),
  expires_at timestamptz,
  paid_at timestamptz,
  payer_name text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_requests_user on public.payment_requests (user_id, created_at desc);
create index if not exists payment_requests_invoice on public.payment_requests (invoice_id) where invoice_id is not null;
create unique index if not exists payment_requests_provider on public.payment_requests (provider, provider_id) where provider_id is not null;
alter table public.payment_requests enable row level security;
drop policy if exists payment_requests_read on public.payment_requests;
create policy payment_requests_read on public.payment_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Each member's own payment reference (letters that are hard to mix up: no 0/O or 1/I).
create or replace function public.new_deposit_ref() returns text
language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text; i int;
begin
  loop
    r := 'BID';
    for i in 1..6 loop r := r || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from profiles where deposit_ref = r);
  end loop;
  return r;
end $$;
alter table public.profiles add column if not exists deposit_ref text;
update public.profiles set deposit_ref = public.new_deposit_ref() where deposit_ref is null;
alter table public.profiles alter column deposit_ref set default public.new_deposit_ref();
create unique index if not exists profiles_deposit_ref on public.profiles (deposit_ref);

-- Invoices remember how they're paid and how much came from the deposit.
alter table public.invoices add column if not exists pay_method text not null default 'card';
alter table public.invoices drop constraint if exists invoices_pay_method_check;
alter table public.invoices add constraint invoices_pay_method_check check (pay_method in ('card','bank'));
alter table public.invoices add column if not exists deposit_applied numeric(12,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 3. Balance, what's in use, what's free
-- ---------------------------------------------------------------------------
create or replace function public.deposit_balance(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from bidder_deposits where user_id = p_user and status <> 'cancelled'
$$;

-- What the vehicles they're winning (and their open offers) hold: the deposit for their maximum on a live auction,
-- for the top bid on one waiting for the seller, and for the amount of an offer.
create or replace function public.deposit_committed(p_user uuid, p_except bigint default null) returns numeric
language sql stable security definer set search_path = public as $$
  with f as (select coalesce((select value from settings where key = 'fees'), '{}'::jsonb) v)
  select coalesce((select sum(deposit_for_with(case when l.status = 'live' then greatest(coalesce(p.leader_max, 0), l.current_bid) else l.current_bid end, f.v))
                     from lots l left join lot_private p on p.lot_id = l.id
                    where l.leader_id = p_user and l.status in ('live','referred') and l.id is distinct from p_except), 0)
       + coalesce((select sum(deposit_for_with(o.amount, f.v)) from offers o join lots l on l.id = o.lot_id
                    where o.user_id = p_user and o.status = 'pending' and l.status in ('offers','referred') and o.lot_id is distinct from p_except), 0)
  from f
$$;

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
    'rate', v_rate, 'min', v_min, 'cap', v_cap);
end $$;

-- Raises deposit_short:<needed>:<free> when the bidder's free deposit doesn't cover this amount.
-- Callers lock the vehicle first, then this takes the bidder's lock (always in that order: no deadlocks).
create or replace function public.deposit_check(p_user uuid, p_lot bigint, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_need numeric; v_have numeric;
begin
  if pay_mode() <> 'deposit' then return; end if;
  perform pg_advisory_xact_lock(hashtext('deposit:' || p_user::text));
  v_need := deposit_for(p_amount);
  v_have := deposit_balance(p_user) - deposit_committed(p_user, p_lot);
  if v_need > v_have then
    raise exception 'deposit_short:%:%', v_need, greatest(v_have, 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Who can bid: a verified mobile and ID, not suspended (and with deposits, at least the minimum deposit paid)
-- ---------------------------------------------------------------------------
-- Raises the reason someone can't bid (suspended, or not set up yet).
create or replace function public.bid_gate(p_user uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = p_user and suspended) then raise exception 'account_suspended'; end if;
  if not can_bid(p_user) then raise exception 'not_verified'; end if;
end $$;
revoke execute on function public.bid_gate(uuid) from public, anon, authenticated;

create or replace function public.can_bid(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and details_done and mobile_verified and id_status = 'verified' and not suspended
      and case pay_mode() when 'deposit' then deposit_balance(p_user) >= deposit_for(1) when 'card' then payment_method_id is not null else true end
  );
$$;

-- The price breakdown. 'transfer': the whole amount by PayID or bank transfer. 'deposit': the deposit for the price
-- comes off and the rest is paid by transfer. ('card' is the old way.) card_base is the part that comes from a deposit.
create or replace function public.price_breakdown_with(p_price numeric, f jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_premium numeric := round(p_price * coalesce((f->>'premium_rate')::numeric, 0), 2);
  v_gst numeric := round(v_premium * 0.10, 2);
  v_admin numeric := coalesce((f->>'admin_fee')::numeric, 0);
  v_sub numeric; v_mode text; v_card numeric; v_sur numeric;
begin
  v_sub := p_price + v_premium + v_gst + v_admin;
  if coalesce(f->>'pay_mode', 'transfer') = 'transfer' then
    v_mode := 'deposit'; v_card := 0; v_sur := 0;
  elsif f->>'pay_mode' = 'deposit' then
    v_mode := 'deposit';
    v_card := least(deposit_for_with(p_price, f), v_sub);
    v_sur := 0;
  else
    if v_sub < coalesce((f->>'card_limit')::numeric, 0) then
      v_mode := 'card'; v_card := v_sub;
    else
      v_mode := 'deposit';
      v_card := case when v_sub < coalesce((f->>'nrd_split')::numeric, 0) then coalesce((f->>'nrd_low')::numeric, 0)
                     else coalesce((f->>'nrd_high')::numeric, 0) end;
    end if;
    v_sur := round(v_card * coalesce((f->>'surcharge_rate')::numeric, 0), 2);
  end if;
  return jsonb_build_object(
    'price', p_price, 'premium', v_premium, 'gst', v_gst, 'admin_fee', v_admin,
    'subtotal', v_sub, 'mode', v_mode, 'card_base', v_card, 'surcharge', v_sur,
    'card_amount', v_card + v_sur, 'balance_due', v_sub - v_card, 'total', v_sub + v_sur);
end $$;

-- The deposit rules and how money is taken are the same for every vehicle (only the fees are locked per vehicle).
create or replace function public.lot_price_breakdown(p_lot bigint, p_price numeric) returns jsonb
language sql stable security definer set search_path = public as $$
  select price_breakdown_with(p_price,
    coalesce((select value from settings where key = 'fees'), '{}'::jsonb)
    || (coalesce((select fees from lots where id = p_lot), '{}'::jsonb) - 'pay_mode' - 'deposit_rate' - 'deposit_min' - 'deposit_cap'))
$$;

-- ---------------------------------------------------------------------------
-- 5. Invoices: paid by PayID or bank transfer (with deposits, the deposit for the price comes off first)
-- ---------------------------------------------------------------------------
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
  insert into invoices (lot_id, buyer_id, sold_via, price, premium, gst, admin_fee, subtotal, mode,
    card_amount, surcharge, balance_due, total, due_at, vehicle_gst, terms_version, pay_method, deposit_applied)
  values (p_lot, p_buyer, p_via, p_price, (b->>'premium')::numeric, (b->>'gst')::numeric,
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
-- 6. Bidding, Buy Now, offers and the next-bidder offer all check the deposit covers the amount
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
  perform bid_gate(v_user);
  if p_max is null or p_max <= 0 or p_max <> round(p_max) then raise exception 'invalid_amount'; end if;
  if p_max > 10000000 then raise exception 'invalid_amount'; end if;
  perform bid_guard(p_lot, v_user);

  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status <> 'live' or l.ends_at <= now() or (l.starts_at is not null and l.starts_at > now()) then
    raise exception 'auction_closed';
  end if;
  -- the bidding deposit must cover this maximum (as well as everything else they're winning)
  perform deposit_check(v_user, p_lot, p_max);
  select * into pr from lot_private where lot_id = p_lot for update;
  if not found then insert into lot_private (lot_id) values (p_lot) returning * into pr; end if;

  v_prev_leader := l.leader_id;

  if l.leader_id = v_user then
    if p_max <= pr.leader_max then raise exception 'max_not_higher'; end if;
    update lot_private set leader_max = p_max where lot_id = p_lot;
    insert into max_bids (lot_id, bidder_id, max_amount) values (p_lot, v_user, p_max)
      on conflict (lot_id, bidder_id) do update set max_amount = excluded.max_amount, updated_at = clock_timestamp();
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

  -- Tell whoever lost the lead (never the person bidding right now)
  if v_outbid is not null and v_outbid <> v_user then
    perform queue_outbid(v_outbid, p_lot, v_new);
  end if;

  return jsonb_build_object('status', v_status, 'current_bid', v_new, 'max', p_max,
    'ends_at', l.ends_at, 'extended', v_extended, 'outbid_user', v_outbid,
    'previous_leader', v_prev_leader);
end $$;

create or replace function public.buy_now(p_lot bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_inv uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  perform bid_gate(v_user);
  perform bid_guard(p_lot, v_user);
  select * into l from lots where id = p_lot for update;
  if l.status <> 'live' or l.ends_at <= now() or (l.starts_at is not null and l.starts_at > now()) then raise exception 'auction_closed'; end if;
  if l.buy_now_price is null or l.current_bid >= l.buy_now_price then raise exception 'buy_now_unavailable'; end if;
  perform deposit_check(v_user, p_lot, l.buy_now_price);
  insert into bids (lot_id, bidder_id, amount) values (p_lot, v_user, l.buy_now_price);
  update lots set status = 'sold', current_bid = buy_now_price, bid_count = bid_count + 1,
    leader_id = v_user, winner_id = v_user, sold_price = buy_now_price, sold_via = 'buy_now',
    reserve_met = true, ends_at = now(), updated_at = now()
  where id = p_lot;
  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;
  v_inv := create_invoice(p_lot, v_user, l.buy_now_price, 'buy_now');
  return v_inv;
end $$;

create or replace function public.make_offer(p_lot bigint, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_last numeric; v_id uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  perform bid_gate(v_user);
  perform bid_guard(p_lot, v_user);
  select * into l from lots where id = p_lot for update;
  if l.status <> 'offers' or l.decision_by <= now() then raise exception 'offers_closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) or p_amount > 10000000 then raise exception 'invalid_amount'; end if;
  select max(amount) into v_last from offers where lot_id = p_lot and user_id = v_user;
  if v_last is not null and p_amount <= v_last then raise exception 'offer_not_higher:%', v_last; end if;
  perform deposit_check(v_user, p_lot, p_amount);
  update offers set status = 'lapsed', decided_at = now() where lot_id = p_lot and user_id = v_user and status = 'pending';
  insert into offers (lot_id, user_id, amount) values (p_lot, v_user, p_amount) returning id into v_id;
  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;
  perform queue_seller_notice(p_lot, 'New offer on your ' || l.title,
    'A verified buyer has offered $' || to_char(p_amount, 'FM999,999,990') || '. Accept or decline in your seller dashboard before ' ||
    to_char(l.decision_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/sell/dashboard', 'offer:' || v_id);
  return v_id;
end $$;

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
  perform bid_gate(v_user);
  perform bid_guard(o.lot_id, v_user);
  select * into l from lots where id = o.lot_id for update;
  if l.status <> 'passed' then raise exception 'offer_closed:this vehicle is no longer available'; end if;
  perform deposit_check(v_user, o.lot_id, o.amount);
  update lots set status = 'sold', winner_id = v_user, sold_price = o.amount, sold_via = 'offer', updated_at = now() where id = o.lot_id;
  v_inv := create_invoice(o.lot_id, v_user, o.amount, 'offer');
  update second_chance_offers set status = 'accepted', decided_at = now() where id = p_offer;
  perform queue_seller_notice(o.lot_id, 'Sold to the next bidder',
    'The next highest bidder has bought your ' || l.title || ' for $' || to_char(o.amount, 'FM999,999,990') || '. We''re waiting on their payment now.',
    '/sell/dashboard', 'second-chance-sold:' || p_offer);
  return v_inv;
end $$;
revoke execute on function public.respond_second_chance(uuid, boolean) from public, anon;
grant execute on function public.respond_second_chance(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The member's view: me() says whether payment is set up; my_deposit() has the detail and history
-- ---------------------------------------------------------------------------
create or replace function public.me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object(
    'watch_count', (select count(*) from watchlist w where w.user_id = p.id),
    'unread', (select count(*) from notifications n where n.user_id = p.id and n.read_at is null),
    'is_seller', exists (select 1 from lots l where l.seller_id = p.id),
    'terms_current', p.terms_version is not distinct from (select value->>'buyer_version' from settings where key = 'terms'),
    'pay_mode', pay_mode(),
    'payment_ok', case pay_mode() when 'deposit' then deposit_balance(p.id) >= deposit_for(1) when 'card' then p.payment_method_id is not null else true end,
    'deposit', case when pay_mode() = 'deposit' then deposit_summary(p.id) end)
  from profiles p where p.id = auth.uid();
$$;
revoke execute on function public.me() from public, anon;
grant execute on function public.me() to authenticated, service_role;

create or replace function public.my_deposit() returns jsonb
language sql stable security definer set search_path = public as $$
  select deposit_summary(auth.uid()) || jsonb_build_object(
    'history', (select coalesce(jsonb_agg(h order by h.created_at desc), '[]') from (
      select d.id, d.kind, d.amount, d.status, d.created_at, d.done_at, d.method, d.note,
             i.ref as invoice_ref, i.id as invoice_id, i.status as invoice_status, i.cancel_reason, l.title as vehicle
        from bidder_deposits d left join invoices i on i.id = d.invoice_id left join lots l on l.id = i.lot_id
       where d.user_id = auth.uid() order by d.created_at desc limit 60) h),
    'holding', (select coalesce(jsonb_agg(x), '[]') from (
      select l.id as lot_id, l.title, l.status,
             deposit_for(case when l.status = 'live' then greatest(coalesce(p.leader_max, 0), l.current_bid) else l.current_bid end) as amount,
             case when l.status = 'live' then 'winning' else 'with the seller' end as why
        from lots l left join lot_private p on p.lot_id = l.id
       where l.leader_id = auth.uid() and l.status in ('live','referred')
      union all
      select l.id, l.title, l.status, deposit_for(o.amount), 'your offer'
        from offers o join lots l on l.id = o.lot_id
       where o.user_id = auth.uid() and o.status = 'pending' and l.status in ('offers','referred')) x),
    'unpaid', exists (select 1 from invoices where buyer_id = auth.uid() and status in ('pending_charge','charging','deposit_paid','payment_failed')),
    'refund_to', (select jsonb_build_object('name', payer_name, 'bsb', payer_bsb, 'ending', right(payer_account, 4))
                    from bidder_deposits where user_id = auth.uid() and kind = 'received' and status = 'done'
                   order by (payer_account is not null) desc, created_at desc limit 1))
  where auth.uid() is not null
$$;
revoke execute on function public.my_deposit() from public, anon;
grant execute on function public.my_deposit() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Money in and out
-- ---------------------------------------------------------------------------
-- A deposit arrived (our team, from the bank statement, or the payments provider). Idempotent on provider_ref.
create or replace function public.record_deposit(p_user uuid, p_amount numeric, p_method text, p_reference text,
  p_payer_name text, p_payer_bsb text default null, p_payer_account text default null, p_note text default null,
  p_provider text default null, p_provider_ref text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; s jsonb;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'member_not_found'; end if;
  if p_provider_ref is not null then
    select id into v_id from bidder_deposits where provider = p_provider and provider_ref = p_provider_ref;
    if v_id is not null then return v_id; end if;
  end if;
  insert into bidder_deposits (user_id, kind, amount, method, reference, payer_name, payer_bsb, payer_account, note, provider, provider_ref, created_by, done_at)
    values (p_user, 'received', round(p_amount, 2), coalesce(p_method, 'bank'), left(p_reference, 60), left(p_payer_name, 120),
      nullif(left(regexp_replace(coalesce(p_payer_bsb, ''), '\D', '', 'g'), 6), ''), nullif(left(regexp_replace(coalesce(p_payer_account, ''), '\D', '', 'g'), 12), ''),
      left(p_note, 300), p_provider, p_provider_ref, auth.uid(), now())
    returning id into v_id;
  s := deposit_summary(p_user);
  perform queue_notice(p_user, 'account', 'Your bidding deposit has arrived',
    'We''ve received $' || to_char(p_amount, 'FM999,999,990.00') || '. '
    || case when (s->>'unlimited')::boolean then 'You can bid any amount.'
            when (s->>'limit')::numeric > 0 then 'You can now bid up to $' || to_char((s->>'limit')::numeric, 'FM999,999,990') || '.'
            else 'Add a little more to reach the $' || to_char((s->>'min')::numeric, 'FM999,990') || ' minimum and start bidding.' end
    || ' It''s refundable whenever you''re not winning anything.', '/account/deposit', 'deposit-in:' || v_id);
  return v_id;
end $$;

-- The member asks for some (or all) of what's free back. It goes back to the account it came from.
create or replace function public.request_deposit_withdrawal(p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_avail numeric; v_id uuid; v_pn text; v_pb text; v_pa text;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'invalid_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('deposit:' || v_user::text));
  if exists (select 1 from invoices where buyer_id = v_user and status in ('pending_charge','charging','deposit_paid','payment_failed')) then
    raise exception 'withdraw_unpaid:pay for the vehicle you won first, then you can withdraw what''s left';
  end if;
  v_avail := deposit_balance(v_user) - deposit_committed(v_user, null);
  if p_amount > v_avail then raise exception 'withdraw_too_much:%', greatest(v_avail, 0); end if;
  select payer_name, payer_bsb, payer_account into v_pn, v_pb, v_pa from bidder_deposits
   where user_id = v_user and kind = 'received' and status = 'done' order by (payer_account is not null) desc, created_at desc limit 1;
  insert into bidder_deposits (user_id, kind, amount, status, payer_name, payer_bsb, payer_account, note, created_by)
    values (v_user, 'withdrawal', -p_amount, 'pending', v_pn, v_pb, v_pa, 'Back to the account it came from', v_user)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_deposit_withdrawal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bidder_deposits set status = 'cancelled', done_at = now()
   where id = p_id and kind = 'withdrawal' and status = 'pending'
     and (user_id = auth.uid() or is_admin() or coalesce(auth.role(), '') = 'service_role');
  if not found then raise exception 'not_pending:that refund has already been sent or cancelled'; end if;
end $$;

-- Our team has sent the money back.
create or replace function public.deposit_withdrawal_paid(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare d bidder_deposits%rowtype;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  update bidder_deposits set status = 'done', done_at = now(), reference = left(nullif(trim(p_reference), ''), 60)
   where id = p_id and kind = 'withdrawal' and status = 'pending' returning * into d;
  if not found then raise exception 'not_pending:that refund has already been sent or cancelled'; end if;
  perform queue_notice(d.user_id, 'account', 'Your deposit refund is on its way',
    'We''ve sent $' || to_char(-d.amount, 'FM999,999,990.00') || ' back to the account your deposit came from. It usually arrives within a business day.',
    '/account/deposit', 'deposit-out:' || d.id);
end $$;

create or replace function public.adjust_deposit(p_user uuid, p_amount numeric, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'invalid_amount'; end if;
  if length(coalesce(trim(p_note), '')) < 5 then raise exception 'note_needed:say why'; end if;
  insert into bidder_deposits (user_id, kind, amount, note, created_by, done_at)
    values (p_user, 'adjustment', round(p_amount, 2), left(p_note, 300), auth.uid(), now()) returning id into v_id;
  return v_id;
end $$;

-- A sale cancelled through no fault of the buyer: the deposit that went onto the invoice comes back to their deposit.
create or replace function public.return_invoice_deposit(p_invoice uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare i invoices%rowtype;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select * into i from invoices where id = p_invoice;
  if not found or i.deposit_applied <= 0 then return 0; end if;
  insert into bidder_deposits (user_id, kind, amount, invoice_id, note, created_by, done_at)
    values (i.buyer_id, 'returned', i.deposit_applied, i.id, 'Deposit returned: the sale was cancelled', auth.uid(), now())
    on conflict do nothing;
  return i.deposit_applied;
end $$;

-- What we're holding for bidders (it should match the trust account, less money still to arrive or be sent).
create or replace function public.deposit_totals() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'held', coalesce((select sum(amount) from bidder_deposits where status <> 'cancelled'), 0),
    'bidders', (select count(*) from (select user_id from bidder_deposits where status <> 'cancelled' group by user_id having sum(amount) > 0) x),
    'pending_count', (select count(*) from bidder_deposits where kind = 'withdrawal' and status = 'pending'),
    'pending_amount', coalesce((select -sum(amount) from bidder_deposits where kind = 'withdrawal' and status = 'pending'), 0),
    'received_week', coalesce((select sum(amount) from bidder_deposits where kind = 'received' and status = 'done' and created_at > now() - interval '7 days'), 0),
    'applied_unpaid', coalesce((select sum(deposit_applied) from invoices where pay_method = 'bank' and status in ('pending_charge','charging','deposit_paid')), 0))
$$;
revoke execute on function public.deposit_totals() from public, anon, authenticated;
grant execute on function public.deposit_totals() to service_role;

revoke execute on function public.deposit_balance(uuid) from public, anon, authenticated;
revoke execute on function public.deposit_committed(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.deposit_summary(uuid) from public, anon, authenticated;
revoke execute on function public.deposit_check(uuid, bigint, numeric) from public, anon, authenticated;
revoke execute on function public.record_deposit(uuid, numeric, text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.request_deposit_withdrawal(numeric) from public, anon;
revoke execute on function public.cancel_deposit_withdrawal(uuid) from public, anon;
revoke execute on function public.deposit_withdrawal_paid(uuid, text) from public, anon;
revoke execute on function public.adjust_deposit(uuid, numeric, text) from public, anon;
revoke execute on function public.return_invoice_deposit(uuid) from public, anon;
grant execute on function public.deposit_balance(uuid) to service_role;
grant execute on function public.deposit_committed(uuid, bigint) to service_role;
grant execute on function public.deposit_summary(uuid) to service_role;
grant execute on function public.record_deposit(uuid, numeric, text, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.request_deposit_withdrawal(numeric) to authenticated;
grant execute on function public.cancel_deposit_withdrawal(uuid) to authenticated, service_role;
grant execute on function public.deposit_withdrawal_paid(uuid, text) to authenticated, service_role;
grant execute on function public.adjust_deposit(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.return_invoice_deposit(uuid) to authenticated, service_role;
grant execute on function public.deposit_for(numeric) to anon, authenticated, service_role;
grant execute on function public.pay_mode() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Members can't change their own payment reference or suspension; a deposit stops an account being deleted
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.role is distinct from old.role
      or new.mobile_verified is distinct from old.mobile_verified
      or new.id_status is distinct from old.id_status
      or new.id_session_id is distinct from old.id_session_id
      or new.payment_method_id is distinct from old.payment_method_id
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.card_brand is distinct from old.card_brand
      or new.card_last4 is distinct from old.card_last4
      or new.deposit_ref is distinct from old.deposit_ref
      or new.suspended is distinct from old.suspended
      or new.suspended_reason is distinct from old.suspended_reason
      or new.suspended_at is distinct from old.suspended_at
      or new.terms_version is distinct from old.terms_version then
      raise exception 'protected_field';
    end if;
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

create or replace function public.account_deletion_blockers(p_user uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from max_bids m join lots l on l.id = m.lot_id where m.bidder_id = p_user and l.status = 'live')
      then 'You have bids on vehicles that are still live. Bids can''t be withdrawn, so wait until those auctions end.' end,
    case when exists (select 1 from lots l where l.leader_id = p_user and l.status = 'referred')
      then 'Your bid is with a seller for a decision.' end,
    case when exists (select 1 from offers o join lots l on l.id = o.lot_id where o.user_id = p_user and o.status = 'pending' and l.status = 'offers')
      then 'You have an offer waiting on a seller.' end,
    case when exists (select 1 from invoices i where i.buyer_id = p_user and i.status <> 'cancelled' and (i.status <> 'paid' or i.collected_at is null))
      then 'You have a purchase that isn''t fully paid for and collected yet.' end,
    case when exists (select 1 from claims c where c.buyer_id = p_user and c.status = 'open')
      then 'You have an open claim.' end,
    case when exists (select 1 from lots l where l.seller_id = p_user and l.status in ('draft', 'scheduled', 'live', 'referred', 'offers'))
      then 'You have a vehicle for sale with us.' end,
    case when exists (select 1 from seller_payouts s where s.seller_id = p_user and s.status not in ('paid', 'cancelled'))
      then 'You have a seller payout still to come.' end,
    case when exists (select 1 from bidder_deposits d where d.user_id = p_user and d.kind = 'withdrawal' and d.status = 'pending')
      then 'Your deposit refund is still on its way.' end,
    case when (select coalesce(sum(amount), 0) from bidder_deposits d where d.user_id = p_user and d.status <> 'cancelled') > 0
      then 'You have a bidding deposit with us. Withdraw it first (Account → Bidding deposit).' end
  ], null)
$$;
revoke execute on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

-- New members can't bid until their deposit arrives; existing members with only a card on file see the deposit step
-- next time they try to bid. Nothing else changes for them.

-- ---------------------------------------------------------------------------
-- 9b. A buyer who doesn't pay is banned, and can't come back with a new account
-- ---------------------------------------------------------------------------
-- Bidding needs a verified ID (the name and date of birth must match the licence or passport), so the person is the
-- key: we keep a one-way code (salted hash) of their name and date of birth, their mobile and their email. A new or
-- changed account that matches one is suspended as soon as it verifies. Nothing readable is kept; staff can lift it.
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;
insert into public.app_secrets (key, value) values ('identity_salt', encode(sha256(gen_random_uuid()::text::bytea || clock_timestamp()::text::bytea), 'hex'))
  on conflict (key) do nothing;

create table if not exists public.banned_identities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('person', 'mobile', 'email')),
  hash text not null,
  user_id uuid,           -- no foreign key: the ban outlives a deleted account
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index if not exists banned_identities_hash on public.banned_identities (kind, hash);
create index if not exists banned_identities_user on public.banned_identities (user_id);
alter table public.banned_identities enable row level security; -- no policies: server and functions only

-- The one-way codes. Names ignore case, spaces and punctuation; mobiles use their last 9 digits (04… and +614… match).
create or replace function public.identity_hash(p_kind text, p_value text) returns text
language sql stable security definer set search_path = public as $$
  select case when coalesce(p_value, '') = '' then null else
    encode(sha256(convert_to((select value from app_secrets where key = 'identity_salt') || ':' || p_kind || ':' || p_value, 'UTF8')), 'hex') end
$$;
create or replace function public.identity_hashes(p_first text, p_last text, p_dob date, p_mobile text, p_email text)
returns table (kind text, hash text)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('person', case when coalesce(p_last, '') <> '' and p_dob is not null
       then identity_hash('person', lower(regexp_replace(coalesce(p_first, '') || coalesce(p_last, ''), '[^[:alpha:]]', '', 'g')) || '|' || p_dob::text) end),
    ('mobile', case when length(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g')) >= 9
       then identity_hash('mobile', right(regexp_replace(p_mobile, '\D', '', 'g'), 9)) end),
    ('email', case when coalesce(p_email, '') <> '' then identity_hash('email', lower(trim(p_email))) end)
  ) v(kind, hash) where hash is not null
$$;
revoke execute on function public.identity_hash(text, text) from public, anon, authenticated;
revoke execute on function public.identity_hashes(text, text, date, text, text) from public, anon, authenticated;

-- Ban: suspend, remember who they are, and take their bids off live auctions (each price is worked out again as if
-- they'd never bid). Staff, or the server when a sale is cancelled for non-payment.
create or replace function public.ban_member(p_user uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; r record; v_removed int := 0;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into p from profiles where id = p_user for update;
  if not found then raise exception 'member_not_found'; end if;
  update profiles set suspended = true, suspended_reason = left(p_reason, 300), suspended_at = now() where id = p_user;
  insert into banned_identities (kind, hash, user_id, reason, created_by)
    select h.kind, h.hash, p_user, left(p_reason, 300), auth.uid() from identity_hashes(p.first_name, p.last_name, p.dob, p.mobile, p.email) h
    on conflict (kind, hash) do nothing;
  for r in select m.lot_id from max_bids m join lots l on l.id = m.lot_id where m.bidder_id = p_user and l.status = 'live' loop
    begin
      perform admin_remove_bidder(r.lot_id, p_user, 'Account closed: ' || left(p_reason, 200));
      v_removed := v_removed + 1;
    exception when others then null; -- the ban still stands; staff can remove that bid by hand
    end;
  end loop;
  update offers set status = 'lapsed' where user_id = p_user and status = 'pending';
  return v_removed;
end $$;
revoke execute on function public.ban_member(uuid, text) from public, anon;
grant execute on function public.ban_member(uuid, text) to authenticated, service_role;

create or replace function public.unban_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  delete from banned_identities where user_id = p_user;
  update profiles set suspended = false, suspended_reason = null, suspended_at = null where id = p_user;
end $$;
revoke execute on function public.unban_member(uuid) from public, anon;
grant execute on function public.unban_member(uuid) to authenticated, service_role;

-- A new account, a newly verified ID or mobile, or a changed email that matches a ban is suspended straight away.
-- (Named to run after the other profile triggers.)
create or replace function public.profile_ban_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reason text;
begin
  if new.suspended then return new; end if;
  if tg_op = 'UPDATE' and not ((new.id_status = 'verified' and old.id_status is distinct from 'verified')
      or (new.mobile_verified and not old.mobile_verified) or new.email is distinct from old.email
      or (new.id_status = 'verified' and (new.first_name, new.last_name, new.dob) is distinct from (old.first_name, old.last_name, old.dob))) then
    return new;
  end if;
  select b.reason into v_reason from banned_identities b
    join identity_hashes(case when new.id_status = 'verified' then new.first_name end, case when new.id_status = 'verified' then new.last_name end,
      case when new.id_status = 'verified' then new.dob end, case when new.mobile_verified then new.mobile end, new.email) h
      on h.kind = b.kind and h.hash = b.hash
   where b.user_id is distinct from new.id limit 1;
  if v_reason is not null then
    new.suspended := true; new.suspended_at := now();
    new.suspended_reason := 'Matches an account closed for: ' || left(v_reason, 240);
  end if;
  return new;
end $$;
drop trigger if exists zz_profile_ban_check on public.profiles;
create trigger zz_profile_ban_check before insert or update on public.profiles
  for each row execute function public.profile_ban_check();

-- 10. The Terms of sale now describe the bidding deposit (sections 6, 8 and 11), so members accept them again before bidding.
update public.settings set value = value || '{"buyer_version": "2026-10-11"}'::jsonb
  where key = 'terms' and value->>'buyer_version' = '2026-10-10';

-- ---------------------------------------------------------------------------
-- 11. "Members ready to bid" (Admin → Insights) follows how bidders pay (no card needed any more). Same function as migration 14, one line changed.
-- ---------------------------------------------------------------------------
create or replace function public.compute_daily_metrics(p_day date, p_traffic boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Australia/Brisbane');
  v_to timestamptz := ((p_day + 1)::timestamp at time zone 'Australia/Brisbane');
  v_today boolean := p_day = (now() at time zone 'Australia/Brisbane')::date;
  v_rows int;
begin
  delete from metric_values where day = p_day
    and (v_today or not metric_is_snapshot(metric)) and (p_traffic or not metric_is_traffic(metric));

  if to_regclass('pg_temp._m') is null then create temp table _m (metric text, dim text, value numeric) on commit drop;
  else truncate _m; end if;

  -- Listings
  insert into _m select 'lots_published', d, count(*) from lots l,
    lateral (values (''), ('cat:' || l.category), ('state:' || coalesce(l.state, '?'))) v(d)
    where l.published_at >= v_from and l.published_at < v_to group by d;
  insert into _m select m, d, count(*) from lots l,
    lateral (values ('lots_closed'), (case when l.bid_count = 0 then 'lots_closed_no_bids' end),
                    (case when l.bid_count > 0 and (l.reserve_met or not l.has_reserve) then 'lots_closed_reserve_met' end)) x(m),
    lateral (values (''), ('cat:' || l.category), ('state:' || coalesce(l.state, '?'))) v(d)
    where x.m is not null and l.ends_at >= v_from and l.ends_at < v_to and l.status in ('sold','passed','referred','offers')
    group by m, d;
  insert into _m select 'bids_on_closed', d, sum(l.bid_count) from lots l,
    lateral (values (''), ('cat:' || l.category)) v(d)
    where l.ends_at >= v_from and l.ends_at < v_to and l.status in ('sold','passed','referred','offers') group by d;

  -- Bidding
  insert into _m select 'bids', '', count(*) from bids where created_at >= v_from and created_at < v_to;
  insert into _m select 'bidders', '', count(distinct bidder_id) from bids where created_at >= v_from and created_at < v_to;
  insert into _m select 'first_time_bidders', '', count(distinct b.bidder_id) from bids b
    where b.created_at >= v_from and b.created_at < v_to
      and not exists (select 1 from bids e where e.bidder_id = b.bidder_id and e.created_at < v_from);
  insert into _m select 'offers', '', count(*) from offers where created_at >= v_from and created_at < v_to;

  -- Sales and money (sales made that day that haven't since been cancelled)
  insert into _m select m, d, val from (
    select x.m, v.d, sum(x.val) val from invoices i join lots l on l.id = i.lot_id
      left join member_attribution a on a.user_id = i.buyer_id,
      lateral (values ('sales', 1::numeric), ('gmv', i.price), ('premium', i.premium), ('admin_fees', round(i.admin_fee / 1.1, 2)),
                      ('buyer_total', i.total)) x(m, val),
      lateral (values (''), ('cat:' || l.category), ('state:' || coalesce(l.state, '?')), ('via:' || coalesce(i.sold_via, '?')),
                      ('src:' || coalesce(a.source, 'unknown'))) v(d)
     where i.created_at >= v_from and i.created_at < v_to and i.status <> 'cancelled'
     group by x.m, v.d) q;
  insert into _m select 'seller_fees', '', coalesce(sum(p.seller_fee), 0) from seller_payouts p join invoices i on i.id = p.invoice_id
    where p.kind = 'sale' and i.created_at >= v_from and i.created_at < v_to and i.status <> 'cancelled';
  insert into _m select 'forfeits_kept', '', coalesce(sum(p.sale_price - p.net_amount), 0) from seller_payouts p
    where p.kind = 'forfeit' and p.created_at >= v_from and p.created_at < v_to;
  insert into _m select 'revenue', '', coalesce(sum(value), 0) from _m where dim = '' and metric in ('premium','admin_fees','seller_fees','forfeits_kept');

  -- Payments
  insert into _m select 'paid_in_full', '', count(*) from invoices
    where coalesce(balance_paid_at, case when mode = 'card' then paid_at end) >= v_from and coalesce(balance_paid_at, case when mode = 'card' then paid_at end) < v_to;
  insert into _m select 'pay_hours_sum', '', coalesce(sum(extract(epoch from coalesce(balance_paid_at, paid_at) - created_at) / 3600), 0) from invoices
    where coalesce(balance_paid_at, case when mode = 'card' then paid_at end) >= v_from and coalesce(balance_paid_at, case when mode = 'card' then paid_at end) < v_to;
  insert into _m select 'card_failures', '', count(*) from invoices where failed_at >= v_from and failed_at < v_to;
  insert into _m select 'defaults', '', count(*) from invoices where cancelled_at >= v_from and cancelled_at < v_to and cancel_reason = 'buyer_default';
  insert into _m select 'refunds', '', count(*) from invoices where refunded_at >= v_from and refunded_at < v_to;
  insert into _m select 'refunds_amount', '', coalesce(sum(refunded_amount), 0) from invoices where refunded_at >= v_from and refunded_at < v_to;

  -- After the sale
  insert into _m select 'transfers_done', '', count(*) from ownership_transfers where completed_at >= v_from and completed_at < v_to;
  insert into _m select 'transfer_hours_sum', '', coalesce(sum(extract(epoch from completed_at - created_at) / 3600), 0)
    from ownership_transfers where completed_at >= v_from and completed_at < v_to;
  insert into _m select 'collections', '', count(*) from invoices where collected_at >= v_from and collected_at < v_to;
  insert into _m select 'claims', '', count(*) from claims where created_at >= v_from and created_at < v_to;
  insert into _m select 'claims_upheld', '', count(*) from claims where decided_at >= v_from and decided_at < v_to and status = 'upheld';
  insert into _m select 'payouts_paid', '', count(*) from seller_payouts where paid_at >= v_from and paid_at < v_to;
  insert into _m select 'payouts_paid_amount', '', coalesce(sum(net_amount), 0) from seller_payouts where paid_at >= v_from and paid_at < v_to;

  -- Members and sellers
  insert into _m select 'signups', d, count(*) from profiles p left join member_attribution a on a.user_id = p.id,
    lateral (values (''), ('src:' || coalesce(a.source, 'unknown'))) v(d)
    where p.created_at >= v_from and p.created_at < v_to group by d;
  insert into _m select 'id_verified', '', count(*) from profiles where id_verified_at >= v_from and id_verified_at < v_to;
  insert into _m select 'signups_verified', '', count(*) from profiles where created_at >= v_from and created_at < v_to and id_verified_at is not null;
  insert into _m select 'appraisals', '', count(*) from appraisals where created_at >= v_from and created_at < v_to;
  insert into _m select 'agreements_signed', '', count(*) from seller_agreements where signed_at >= v_from and signed_at < v_to and status <> 'withdrawn';
  insert into _m select 'questions', '', count(*) from lot_questions where created_at >= v_from and created_at < v_to;
  insert into _m select 'watch_adds', '', count(*) from watchlist where created_at >= v_from and created_at < v_to;
  insert into _m select 'saved_searches', '', count(*) from saved_searches where created_at >= v_from and created_at < v_to;

  -- Partners
  insert into _m select 'partner_clicks', d, count(*) from partner_clicks c join partners p on p.id = c.partner_id,
    lateral (values (''), ('kind:' || p.kind)) v(d) where c.created_at >= v_from and c.created_at < v_to group by d;
  insert into _m select 'partner_leads', d, count(*) from partner_leads l,
    lateral (values (''), ('kind:' || l.kind)) v(d) where l.created_at >= v_from and l.created_at < v_to group by d;

  -- Messages
  insert into _m select m, '', count(*) from outbox o,
    lateral (values (case when o.status = 'sent' then 'messages_sent' when o.status = 'failed' then 'messages_failed' end)) x(m)
    where x.m is not null and o.created_at >= v_from and o.created_at < v_to group by m;

  -- Traffic: one pass over the day's rows for each measure
  if p_traffic then
    insert into _m select 'views',
      case when grouping(e.source) = 0 then 'src:' || e.source when grouping(e.device) = 0 then 'dev:' || coalesce(e.device, '?')
           when grouping(e.page) = 0 then 'page:' || e.page when grouping(e.region) = 0 then 'region:' || coalesce(e.region, '?') else '' end,
      count(*)
      from web_events e where e.kind = 'view' and e.at >= v_from and e.at < v_to
     group by grouping sets ((), (e.source), (e.device), (e.page), (e.region));
    -- people, each counted once a day under where their first visit that day came from
    insert into _m select 'visitors',
      case when grouping(v.source) = 0 then 'src:' || v.source when grouping(v.device) = 0 then 'dev:' || coalesce(v.device, '?')
           when grouping(v.region) = 0 then 'region:' || coalesce(v.region, '?') else '' end,
      count(*)
      from web_visitors v where v.day = p_day
     group by grouping sets ((), (v.source), (v.device), (v.region));
    -- tagged sources with hardly any visitors are folded into "other" (keeps junk tags out of the store)
    update _m set dim = 'src:other' where metric in ('views','visitors') and dim like 'src:%'
      and substr(dim, 5) not in ('google','bing','other-search','facebook','instagram','tiktok','youtube','linkedin','reddit','x','email','sms','newsletter','app','referral','direct')
      and dim in (select x.dim from _m x where x.metric = 'visitors' and x.dim like 'src:%' and x.value < 3);
    insert into _m select x.m, '', x.n from (
      select count(*) filter (where kind = 'view' and page = 'lot') lv, count(*) filter (where kind = 'search') s,
             count(*) filter (where kind = 'search' and results = 0) sz
        from web_events where at >= v_from and at < v_to) q,
      lateral (values ('lot_views', q.lv), ('searches', q.s), ('searches_zero', q.sz)) x(m, n);
    -- what was searched: only terms at least 2 different visitors searched, the top 200 a day
    insert into _m select 'search_terms', 'q:' || t, n from (
      select left(lower(trim(query)), 120) t, count(*) n, count(distinct visitor) v from web_events
       where kind = 'search' and coalesce(trim(query), '') <> '' and at >= v_from and at < v_to group by 1) x
     where v >= 2 order by n desc limit 200;
    insert into _m select 'search_terms_zero', 'q:' || t, n from (
      select left(lower(trim(query)), 120) t, count(*) n, count(distinct visitor) v from web_events
       where kind = 'search' and results = 0 and coalesce(trim(query), '') <> '' and at >= v_from and at < v_to group by 1) x
     where v >= 2 order by n desc limit 200;
  end if;

  -- Stock levels (today only)
  if v_today then
    insert into _m select 'live_lots', d, count(*) from lots l, lateral (values (''), ('cat:' || l.category)) v(d) where l.status = 'live' group by d;
    insert into _m select 'scheduled_lots', '', count(*) from lots where status = 'scheduled';
    insert into _m select 'draft_lots', '', count(*) from lots where status = 'draft';
    insert into _m select 'members_total', '', count(*) from profiles;
    if pay_mode() = 'deposit' then
      insert into _m select 'members_verified', '', count(*) from profiles p
        join (select user_id from bidder_deposits where status <> 'cancelled' group by user_id having sum(amount) >= deposit_for(1)) d on d.user_id = p.id
        where p.id_status = 'verified' and p.mobile_verified;
    elsif pay_mode() = 'card' then
      insert into _m select 'members_verified', '', count(*) from profiles where id_status = 'verified' and mobile_verified and payment_method_id is not null;
    else
      insert into _m select 'members_verified', '', count(*) from profiles where id_status = 'verified' and mobile_verified and not suspended;
    end if;
    insert into _m select 'open_claims', '', count(*) from claims where status = 'open';
    insert into _m select 'balances_due', '', count(*) from invoices where status = 'deposit_paid';
    insert into _m select 'balances_due_amount', '', coalesce(sum(balance_due), 0) from invoices where status = 'deposit_paid';
    insert into _m select 'payouts_ready_amount', '', coalesce(sum(net_amount), 0) from seller_payouts where status = 'ready';
    insert into _m select 'watchers_live', '', count(*) from watchlist w join lots l on l.id = w.lot_id where l.status = 'live';
  end if;

  insert into metric_values (day, metric, dim, value)
    select p_day, metric, dim, sum(value) from _m where value is not null group by metric, dim
    on conflict (day, metric, dim) do update set value = excluded.value;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke execute on function public.compute_daily_metrics(date, boolean) from public, anon, authenticated;
grant execute on function public.compute_daily_metrics(date, boolean) to service_role;
