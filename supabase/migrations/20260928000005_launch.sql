-- Pre-launch: everything Grays does that we didn't, adapted to on-behalf sales
-- (vehicles stay at the seller's place). Seller agency agreement and portal,
-- vehicle facts, collections with a release code, buyer claims, seller payouts,
-- questions, listing snapshots, terms versions, no card surcharge.

-- ---------------------------------------------------------------------------
-- 0. Settings
-- ---------------------------------------------------------------------------
-- Card surcharges on Visa, Mastercard and eftpos are banned from 1 October 2026 (RBA).
update public.settings set value = value || '{"surcharge_rate": 0, "storage_per_day": 50, "seller_fee_rate": 0, "seller_fee_min": 0, "withdrawal_fee": 250}'::jsonb
  where key = 'fees';
update public.settings set value = value || '{"claim_days": 2, "abandon_days": 10, "payout_days": 3, "exclusivity_days": 30}'::jsonb
  where key = 'auction';
insert into public.settings (key, value) values
  ('terms', '{"buyer_version": "2026-10-01", "seller_version": "2026-10-01"}'),
  ('selling', '{"require_checks": true}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Public holidays (Queensland + national) in business-day maths
-- ---------------------------------------------------------------------------
create table if not exists public.public_holidays (day date primary key, name text not null);
alter table public.public_holidays enable row level security;
create policy holidays_read on public.public_holidays for select using (true);
create policy holidays_admin on public.public_holidays for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.public_holidays (day, name) values
  ('2026-10-05','King''s Birthday (Qld)'), ('2026-12-25','Christmas Day'), ('2026-12-28','Boxing Day (observed)'),
  ('2027-01-01','New Year''s Day'), ('2027-01-26','Australia Day'), ('2027-03-26','Good Friday'), ('2027-03-27','Easter Saturday'),
  ('2027-03-29','Easter Monday'), ('2027-04-26','Anzac Day (observed)'), ('2027-05-03','Labour Day (Qld)'),
  ('2027-08-11','Royal Queensland Show (Brisbane)'), ('2027-10-04','King''s Birthday (Qld)'), ('2027-12-25','Christmas Day'),
  ('2027-12-27','Christmas Day (observed)'), ('2027-12-28','Boxing Day (observed)')
on conflict (day) do nothing;

create or replace function public.business_days_from(p_from timestamptz, p_days int) returns timestamptz
language plpgsql stable set search_path = public as $$
declare d timestamptz := p_from; n int := p_days; local_day date;
begin
  while n > 0 loop
    d := d + interval '1 day';
    local_day := (d at time zone 'Australia/Brisbane')::date;
    if extract(isodow from local_day) < 6 and not exists (select 1 from public_holidays where day = local_day) then
      n := n - 1;
    end if;
  end loop;
  return d;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Vehicle facts and seller disclosures on every listing
-- ---------------------------------------------------------------------------
alter table public.lots
  add column if not exists vin text,
  add column if not exists rego_plate text,
  add column if not exists rego_state text,
  add column if not exists rego_expiry date,
  add column if not exists build_date text,
  add column if not exists compliance_date text,
  add column if not exists gvm_kg int,
  add column if not exists write_off_status text not null default 'unknown'
    check (write_off_status in ('none','repairable','statutory','unknown')),
  add column if not exists stolen_clear boolean,
  add column if not exists ppsr_cert_no text,
  add column if not exists ppsr_checked_at timestamptz,
  add column if not exists gst_status text not null default 'private' check (gst_status in ('private','inc')),
  add column if not exists service_books boolean,
  add column if not exists video_url text,
  add column if not exists disclosures jsonb not null default '{}'::jsonb,
  add column if not exists views int not null default 0,
  add column if not exists seller_id uuid references public.profiles(id);
create index if not exists lots_seller on public.lots (seller_id) where seller_id is not null;

alter table public.lot_private
  add column if not exists seller_invite text unique default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists finance_owing numeric(12,2),
  add column if not exists lender_name text,
  add column if not exists lender_ref text,
  add column if not exists ownership_checked_at timestamptz,
  add column if not exists ownership_note text;
update public.lot_private set seller_invite = replace(gen_random_uuid()::text, '-', '') where seller_invite is null;

alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists company_name text,
  add column if not exists abn text;

-- Members may keep their own business details; terms_version is only set by the server.
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
      or new.suspended is distinct from old.suspended
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

-- Existing members who accepted the terms keep bidding (they re-accept when the version changes).
update public.profiles set terms_version = (select value->>'buyer_version' from public.settings where key = 'terms')
  where terms_accepted_at is not null and terms_version is null;

-- ---------------------------------------------------------------------------
-- 3. Bid guard: sellers can't bid on their own vehicle; current terms required
-- ---------------------------------------------------------------------------
create or replace function public.bid_guard(p_lot bigint, p_user uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_seller uuid; v_phone text; v_mobile text; v_terms text; v_current text;
begin
  select l.seller_id, regexp_replace(coalesce(p.seller_phone, ''), '\D', '', 'g')
    into v_seller, v_phone from lots l left join lot_private p on p.lot_id = l.id where l.id = p_lot;
  select regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), terms_version into v_mobile, v_terms from profiles where id = p_user;
  if v_seller = p_user or (length(v_phone) >= 9 and right(v_phone, 9) = right(v_mobile, 9)) then
    raise exception 'own_vehicle';
  end if;
  select value->>'buyer_version' into v_current from settings where key = 'terms';
  if v_current is not null and v_terms is distinct from v_current then
    raise exception 'terms_outdated';
  end if;
end $$;
revoke execute on function public.bid_guard(bigint, uuid) from public, anon, authenticated;

-- Buy Now and offers get the same guard (rules otherwise unchanged)
create or replace function public.buy_now(p_lot bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_inv uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if not can_bid(v_user) then raise exception 'not_verified'; end if;
  perform bid_guard(p_lot, v_user);
  select * into l from lots where id = p_lot for update;
  if l.status <> 'live' or l.ends_at <= now() or (l.starts_at is not null and l.starts_at > now()) then raise exception 'auction_closed'; end if;
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

create or replace function public.make_offer(p_lot bigint, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_last numeric; v_id uuid;
begin
  if v_user is null then raise exception 'not_signed_in'; end if;
  if not can_bid(v_user) then raise exception 'not_verified'; end if;
  perform bid_guard(p_lot, v_user);
  select * into l from lots where id = p_lot for update;
  if l.status <> 'offers' or l.decision_by <= now() then raise exception 'offers_closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount) or p_amount > 10000000 then raise exception 'invalid_amount'; end if;
  select max(amount) into v_last from offers where lot_id = p_lot and user_id = v_user;
  if v_last is not null and p_amount <= v_last then raise exception 'offer_not_higher:%', v_last; end if;
  update offers set status = 'lapsed', decided_at = now() where lot_id = p_lot and user_id = v_user and status = 'pending';
  insert into offers (lot_id, user_id, amount) values (p_lot, v_user, p_amount) returning id into v_id;
  insert into watchlist (user_id, lot_id) values (v_user, p_lot) on conflict do nothing;
  perform queue_seller_notice(p_lot, 'New offer on your ' || l.title,
    'A verified buyer has offered $' || to_char(p_amount, 'FM999,999,990') || '. Accept or decline in your seller dashboard before ' ||
    to_char(l.decision_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/sell/dashboard', 'offer:' || v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Seller agency agreement, bank details, decisions
-- ---------------------------------------------------------------------------
create table if not exists public.seller_agreements (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  version text not null,
  signed_name text not null,
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  reserve_price numeric(12,2),
  fees jsonb not null,
  disclosures jsonb not null,
  gst_registered boolean not null default false,
  abn text,
  owner_type text not null default 'individual' check (owner_type in ('individual','joint','company','trust')),
  doc_paths text[] not null default '{}',
  status text not null default 'signed' check (status in ('signed','superseded','withdrawn'))
);
create index if not exists seller_agreements_lot on public.seller_agreements (lot_id, status);
create index if not exists seller_agreements_seller on public.seller_agreements (seller_id);
alter table public.seller_agreements enable row level security;
create policy agreements_read on public.seller_agreements for select to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));

create table if not exists public.seller_bank (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  account_name text not null,
  bsb text not null check (bsb ~ '^[0-9]{3}-?[0-9]{3}$'),
  account_number text not null check (account_number ~ '^[0-9]{5,10}$'),
  confirmed_at timestamptz,          -- admin confirms by phoning the seller (payment-redirection scams)
  updated_at timestamptz not null default now()
);
alter table public.seller_bank enable row level security;
create policy bank_own on public.seller_bank for select to authenticated using (seller_id = (select auth.uid()) or (select public.is_admin()));

create table if not exists public.seller_decisions (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  seller_id uuid references public.profiles(id),
  action text not null check (action in ('accept_referral','decline_referral','accept_offer','decline_offer')),
  offer_id uuid references public.offers(id),
  amount numeric(12,2),
  via text not null default 'portal' check (via in ('portal','admin')),
  created_at timestamptz not null default now()
);
create index if not exists seller_decisions_lot on public.seller_decisions (lot_id);
alter table public.seller_decisions enable row level security;
create policy decisions_read on public.seller_decisions for select to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));

-- Signed by the server on the seller's behalf once it has checked who they are.
create or replace function public.sign_seller_agreement(p_user uuid, p_invite text, p_name text, p_reserve numeric,
  p_disclosures jsonb, p_gst boolean, p_abn text, p_owner_type text, p_docs text[], p_ip text, p_ua text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lot bigint; l public.lots%rowtype; v_id uuid; v_version text; v_fees jsonb;
begin
  select lot_id into v_lot from lot_private where seller_invite = p_invite;
  if v_lot is null then raise exception 'invite_not_found'; end if;
  select * into l from lots where id = v_lot for update;
  if l.seller_id is not null and l.seller_id <> p_user then raise exception 'invite_used'; end if;
  if l.status not in ('draft','scheduled') then raise exception 'already_listed'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;
  select value->>'seller_version' into v_version from settings where key = 'terms';
  select jsonb_build_object('seller_fee_rate', value->'seller_fee_rate', 'seller_fee_min', value->'seller_fee_min',
    'withdrawal_fee', value->'withdrawal_fee') into v_fees from settings where key = 'fees';
  update seller_agreements set status = 'superseded' where lot_id = v_lot and status = 'signed';
  insert into seller_agreements (lot_id, seller_id, version, signed_name, reserve_price, fees, disclosures,
    gst_registered, abn, owner_type, doc_paths, ip, user_agent)
  values (v_lot, p_user, coalesce(v_version, 'unversioned'), trim(p_name), p_reserve, v_fees, coalesce(p_disclosures, '{}'::jsonb),
    coalesce(p_gst, false), nullif(trim(coalesce(p_abn, '')), ''), coalesce(p_owner_type, 'individual'), coalesce(p_docs, '{}'), p_ip, left(p_ua, 300))
  returning id into v_id;
  update lots set seller_id = p_user,
    gst_status = case when coalesce(p_gst, false) then 'inc' else 'private' end,
    disclosures = coalesce(p_disclosures, '{}'::jsonb) - 'finance_amount' - 'lender_name' - 'lender_ref',
    write_off_status = coalesce(nullif(p_disclosures->>'write_off', ''), write_off_status),
    service_books = coalesce((p_disclosures->>'service_books')::boolean, service_books),
    keys = coalesce(nullif(p_disclosures->>'keys', '')::int, keys),
    updated_at = now()
  where id = v_lot;
  update lot_private set
    reserve_price = p_reserve,
    finance_owing = nullif(p_disclosures->>'finance_amount', '')::numeric,
    lender_name = nullif(p_disclosures->>'lender_name', ''),
    lender_ref = nullif(p_disclosures->>'lender_ref', '')
  where lot_id = v_lot;
  return v_id;
end $$;

-- Vehicles can only go live once the seller has signed, verified their ID and
-- proved ownership, and we've checked the VIN on the PPSR.
-- Runs as the caller (not security definer) so it knows who is publishing.
create or replace function public.lot_publish_check() returns trigger
language plpgsql set search_path = public as $$
declare v_req boolean;
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
        if new.stolen_clear is false then
          raise exception 'not_ready:the PPSR shows this vehicle as stolen. Do not list it; contact the police';
        end if;
      end if;
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
drop trigger if exists lot_publish_check on public.lots;
create trigger lot_publish_check before insert or update of status on public.lots
  for each row execute function public.lot_publish_check();

-- ---------------------------------------------------------------------------
-- 5. Seller notices (by account if linked, otherwise to the phone/email on file)
-- ---------------------------------------------------------------------------
create or replace function public.queue_seller_notice(p_lot bigint, p_title text, p_body text, p_link text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare v_seller uuid; pr record;
begin
  select seller_id into v_seller from lots where id = p_lot;
  if v_seller is not null then
    perform queue_notice(v_seller, 'seller', p_title, p_body, p_link, p_tag);
    return;
  end if;
  select seller_phone, seller_email into pr from lot_private where lot_id = p_lot;
  if pr.seller_phone is not null and pr.seller_phone <> '' then
    insert into outbox (channel, to_addr, kind, title, body, link, dedupe_key, priority)
      values ('sms', pr.seller_phone, 'seller', p_title, p_body, p_link, p_tag || ':seller:sms', 1) on conflict (dedupe_key) do nothing;
  end if;
  if pr.seller_email is not null and pr.seller_email <> '' then
    insert into outbox (channel, to_addr, kind, title, body, link, dedupe_key, priority)
      values ('email', pr.seller_email, 'seller', p_title, p_body, p_link, p_tag || ':seller:email', 1) on conflict (dedupe_key) do nothing;
  end if;
end $$;

-- Sellers always hear by SMS and email; so do payment and collection alerts.
create or replace function public.queue_notice(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null,
  p_meta jsonb default '{}'::jsonb, p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare p record; prefs jsonb;
begin
  select email, mobile, mobile_verified, notify into p from profiles where id = p_user;
  if not found then return; end if;
  prefs := case when p_kind in ('account','won','seller') then '{"sms":true,"email":true}'::jsonb
                else coalesce(p.notify -> p_kind, '{"sms":false,"email":true}'::jsonb) end;
  if p_dedupe is not null and exists (select 1 from outbox where dedupe_key in (p_dedupe || ':sms', p_dedupe || ':email')) then
    return;
  end if;
  insert into notifications (user_id, kind, title, body, link, channels)
    values (p_user, p_kind, p_title, p_body, p_link,
      array_remove(array[case when (prefs->>'sms')::boolean and p.mobile_verified then 'sms' end,
                         case when (prefs->>'email')::boolean and p.email is not null then 'email' end], null));
  if (prefs->>'sms')::boolean and p.mobile is not null and p.mobile_verified then
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority, expires_at)
      values (p_user, 'sms', p.mobile, p_kind, p_title, p_body, p_link, p_dedupe || ':sms', notice_priority(p_kind), p_expires) on conflict (dedupe_key) do nothing;
  end if;
  if (prefs->>'email')::boolean and p.email is not null then
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority, expires_at, meta)
      values (p_user, 'email', p.email, p_kind, p_title, p_body, p_link, p_dedupe || ':email', notice_priority(p_kind), p_expires, coalesce(p_meta, '{}'::jsonb)) on conflict (dedupe_key) do nothing;
  end if;
end $$;

-- Seller: vehicle goes live
create or replace function public.notify_seller_live() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    perform queue_seller_notice(new.id, 'Your ' || new.title || ' is live',
      'Bidding is open until ' || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') ||
      ' (Brisbane time). Keep it at the listed address, insured and in the same condition. Buyers who book an inspection will be ID-verified.',
      '/sell/dashboard', 'live:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists notify_seller_live on public.lots;
create trigger notify_seller_live after update of status on public.lots for each row execute function public.notify_seller_live();

-- Status-change alerts (buyers, watchers, bidders who missed out, and the seller)
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
        'Congratulations. We''re taking payment from the buyer now. We''ll text you the collector''s name and time once collection is booked. Don''t release the vehicle without the release code.',
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

-- ---------------------------------------------------------------------------
-- 6. Accepting a sale: admin or the seller themselves (decision is logged)
-- ---------------------------------------------------------------------------
create or replace function public.accept_sale(p_lot bigint, p_offer uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.lots%rowtype; o public.offers%rowtype; v_inv uuid;
begin
  select * into l from lots where id = p_lot for update;
  if p_offer is null then
    if l.status <> 'referred' then raise exception 'not_referred'; end if;
    if l.decision_by is not null and l.decision_by <= now() then raise exception 'referral_expired'; end if;
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
revoke execute on function public.accept_sale(bigint, uuid) from public, anon, authenticated;

create or replace function public.admin_accept(p_lot bigint, p_offer uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv uuid; v_amount numeric;
begin
  if not is_admin() and coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden'; end if;
  v_inv := accept_sale(p_lot, p_offer);
  select price into v_amount from invoices where id = v_inv;
  insert into seller_decisions (lot_id, seller_id, action, offer_id, amount, via)
    values (p_lot, (select seller_id from lots where id = p_lot), case when p_offer is null then 'accept_referral' else 'accept_offer' end, p_offer, v_amount, 'admin');
  return v_inv;
end $$;

create or replace function public.seller_decide(p_lot bigint, p_action text, p_offer uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); l public.lots%rowtype; v_inv uuid; o public.offers%rowtype; v_losers uuid[];
begin
  select * into l from lots where id = p_lot for update;
  if v_user is null or l.seller_id is distinct from v_user then raise exception 'forbidden'; end if;
  if p_action = 'accept_referral' then
    v_inv := accept_sale(p_lot, null);
    insert into seller_decisions (lot_id, seller_id, action, amount) values (p_lot, v_user, p_action, l.current_bid);
  elsif p_action = 'decline_referral' then
    if l.status <> 'referred' then raise exception 'not_referred'; end if;
    update lots set status = 'offers', decision_by = business_days_from(now(), setting_num('auction','offer_days')::int), updated_at = now()
      where id = p_lot and status = 'referred';
    if not found then raise exception 'not_referred'; end if;
    insert into seller_decisions (lot_id, seller_id, action, amount) values (p_lot, v_user, p_action, l.current_bid);
  elsif p_action = 'accept_offer' then
    select * into o from offers where id = p_offer and lot_id = p_lot;
    v_inv := accept_sale(p_lot, p_offer);
    insert into seller_decisions (lot_id, seller_id, action, offer_id, amount) values (p_lot, v_user, p_action, p_offer, o.amount);
    select array_agg(distinct user_id) into v_losers from offers where lot_id = p_lot and status = 'declined' and user_id <> o.user_id and decided_at >= now() - interval '1 minute';
    if v_losers is not null then
      perform queue_notice_many(v_losers, 'account', 'Your offer on the ' || l.title || ' wasn''t accepted',
        'The seller accepted another offer. Similar vehicles are listed every week.', '/auctions?cat=' || l.category, 'offer-lost:' || p_lot);
    end if;
  elsif p_action = 'decline_offer' then
    update offers set status = 'declined', decided_at = now() where id = p_offer and lot_id = p_lot and status = 'pending' returning * into o;
    if o.id is null then raise exception 'offer_not_pending'; end if;
    insert into seller_decisions (lot_id, seller_id, action, offer_id, amount) values (p_lot, v_user, p_action, p_offer, o.amount);
    perform queue_notice(o.user_id, 'account', 'Your offer on the ' || l.title || ' was declined',
      'The seller declined your offer of $' || to_char(o.amount, 'FM999,999,990') || '. You can make a higher offer while offers are open.',
      '/lot/' || p_lot, 'offer-declined:' || o.id);
  else
    raise exception 'bad_action';
  end if;
  return v_inv;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Invoices: GST on the vehicle for GST-registered sellers, collection clock
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists vehicle_gst numeric(12,2) not null default 0,
  add column if not exists collect_by timestamptz,
  add column if not exists claim_until timestamptz,
  add column if not exists storage_fee numeric(12,2) not null default 0,
  add column if not exists receipt_sent_at timestamptz;

create or replace function public.create_invoice(p_lot bigint, p_buyer uuid, p_price numeric, p_via text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b jsonb := price_breakdown(p_price); v_id uuid; v_gst_status text;
begin
  select gst_status into v_gst_status from lots where id = p_lot;
  insert into invoices (lot_id, buyer_id, sold_via, price, premium, gst, admin_fee, subtotal, mode,
    card_amount, surcharge, balance_due, total, due_at, vehicle_gst)
  values (p_lot, p_buyer, p_via, p_price, (b->>'premium')::numeric, (b->>'gst')::numeric,
    (b->>'admin_fee')::numeric, (b->>'subtotal')::numeric, b->>'mode', (b->>'card_amount')::numeric,
    (b->>'surcharge')::numeric, (b->>'balance_due')::numeric, (b->>'total')::numeric,
    business_days_from(now(), setting_num('auction','payment_days')::int),
    case when v_gst_status = 'inc' then round(p_price / 11, 2) else 0 end)
  returning id into v_id;
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

create table if not exists public.lot_snapshots (
  id bigint generated always as identity primary key,
  lot_id bigint not null references public.lots(id) on delete cascade,
  reason text not null,
  data jsonb not null,
  taken_at timestamptz not null default now()
);
create index if not exists lot_snapshots_lot on public.lot_snapshots (lot_id);
alter table public.lot_snapshots enable row level security;
create policy snapshots_admin on public.lot_snapshots for select to authenticated using ((select public.is_admin()));

-- When an invoice is paid in full: start the collection clock and prepare the seller's payout.
create or replace function public.on_invoice_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.lots%rowtype; pr public.lot_private%rowtype; v_fee numeric; v_rate numeric; v_min numeric;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.collect_by := coalesce(new.collect_by, business_days_from(now(), setting_num('auction','collection_days')::int));
    select * into l from lots where id = new.lot_id;
    select * into pr from lot_private where lot_id = new.lot_id;
    v_rate := coalesce(setting_num('fees','seller_fee_rate'), 0);
    v_min := coalesce(setting_num('fees','seller_fee_min'), 0);
    v_fee := greatest(v_min, round(new.price * v_rate, 2));
    insert into seller_payouts (lot_id, invoice_id, seller_id, sale_price, seller_fee, fee_gst, lender_payout, lender_name, lender_ref, net_amount, status, hold_reason)
    select new.lot_id, new.id, l.seller_id, new.price, v_fee, round(v_fee * 0.10, 2), coalesce(pr.finance_owing, 0), pr.lender_name, pr.lender_ref, x.net,
      case when x.net < 0 then 'on_hold' else 'pending' end,
      case when x.net < 0 then 'Finance owing is more than the sale price: the seller must pay the lender the shortfall before we settle' end
    from (select new.price - v_fee - round(v_fee * 0.10, 2) - coalesce(pr.finance_owing, 0) as net) x
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end $$;

create table if not exists public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id),
  invoice_id uuid not null unique references public.invoices(id),
  seller_id uuid references public.profiles(id),
  sale_price numeric(12,2) not null,
  seller_fee numeric(12,2) not null default 0,
  fee_gst numeric(12,2) not null default 0,
  lender_payout numeric(12,2) not null default 0,
  lender_name text,
  lender_ref text,
  other_deductions numeric(12,2) not null default 0,
  deductions_note text,
  net_amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','on_hold','ready','paid','cancelled')),
  hold_reason text,
  paid_at timestamptz,
  payment_ref text,
  created_at timestamptz not null default now()
);
create index if not exists payouts_status on public.seller_payouts (status, created_at);
create index if not exists payouts_seller on public.seller_payouts (seller_id);
create index if not exists payouts_lot on public.seller_payouts (lot_id);
alter table public.seller_payouts enable row level security;
create policy payouts_read on public.seller_payouts for select to authenticated using (seller_id = (select auth.uid()) or (select public.is_admin()));

drop trigger if exists on_invoice_paid on public.invoices;
create trigger on_invoice_paid before update of status on public.invoices
  for each row execute function public.on_invoice_paid();

-- ---------------------------------------------------------------------------
-- 8. Collections: book a time, release code, handover at the seller's place
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  lot_id bigint not null references public.lots(id),
  buyer_id uuid not null references public.profiles(id),
  preferred_day text not null,
  preferred_time text not null,
  collector_name text,
  collector_mobile text,
  carrier_ref text,
  status text not null default 'requested' check (status in ('requested','confirmed','collected','cancelled')),
  confirmed_for text,
  release_code text not null default lpad((floor(random() * 1000000))::int::text, 6, '0'),
  seller_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  code_attempts int not null default 0,
  handover jsonb,
  collected_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists collections_status on public.collections (status, created_at);
create index if not exists collections_buyer on public.collections (buyer_id);
alter table public.collections enable row level security;
create policy collections_own on public.collections for select to authenticated using (buyer_id = (select auth.uid()) or (select public.is_admin()));
-- Buyers see their release code but never the seller's private handover link.
revoke select on public.collections from anon, authenticated;
grant select (id, invoice_id, lot_id, buyer_id, preferred_day, preferred_time, collector_name, collector_mobile, carrier_ref,
  status, confirmed_for, release_code, code_attempts, handover, collected_at, created_at) on public.collections to authenticated;

-- The seller (via their private link) enters the code the collector gives them.
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
  update collections set status = 'collected', collected_at = now(),
    handover = jsonb_build_object('odometer', p_odometer, 'keys', p_keys, 'notes', left(coalesce(p_notes, ''), 1000), 'at', now())
  where id = c.id;
  update invoices set collected_at = now(), claim_until = v_claim where id = c.invoice_id;
  select title into v_title from lots where id = c.lot_id;
  perform queue_notice(c.buyer_id, 'account', 'Collected: ' || v_title,
    'The seller has confirmed handover. The vehicle is now your responsibility. If something is materially different from the listing, lodge a claim from your invoice by ' ||
    to_char(v_claim at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/account/invoices/' || c.invoice_id, 'collected:' || c.id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Buyer claims (material misdescription, title), which hold the seller's payout
-- ---------------------------------------------------------------------------
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  lot_id bigint not null references public.lots(id),
  buyer_id uuid not null references public.profiles(id),
  reason text not null check (reason in ('identity','transmission_fuel','write_off_stolen','finance','odometer','missing_feature','undisclosed_damage','other')),
  details text not null,
  photo_paths text[] not null default '{}',
  status text not null default 'open' check (status in ('open','upheld','rejected','withdrawn')),
  resolution text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists claims_status on public.claims (status, created_at);
create index if not exists claims_buyer on public.claims (buyer_id);
create index if not exists claims_lot on public.claims (lot_id);
alter table public.claims enable row level security;
create policy claims_own on public.claims for select to authenticated using (buyer_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.hold_payout_on_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update seller_payouts set status = 'on_hold', hold_reason = coalesce(hold_reason, 'Buyer claim open') where lot_id = new.lot_id and status in ('pending','ready','on_hold');
  elsif new.status in ('rejected','withdrawn') and not exists (select 1 from claims where lot_id = new.lot_id and status = 'open' and id <> new.id) then
    update seller_payouts set status = 'pending', hold_reason = null where lot_id = new.lot_id and status = 'on_hold' and hold_reason = 'Buyer claim open';
  end if;
  return null;
end $$;
drop trigger if exists hold_payout_on_claim on public.claims;
create trigger hold_payout_on_claim after insert or update of status on public.claims
  for each row execute function public.hold_payout_on_claim();

-- Payouts become ready once the vehicle is collected and the claim window has closed with no open claim.
create or replace function public.release_payouts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update seller_payouts p set status = 'ready'
  from invoices i
  where i.id = p.invoice_id and p.status = 'pending' and i.collected_at is not null and i.claim_until <= now()
    and not exists (select 1 from claims c where c.lot_id = p.lot_id and c.status = 'open');
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Questions about a vehicle, contact messages
-- ---------------------------------------------------------------------------
create table if not exists public.lot_questions (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  user_id uuid references public.profiles(id),
  question text not null,
  answer text,
  public boolean not null default false,
  status text not null default 'open' check (status in ('open','answered','hidden')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists questions_lot on public.lot_questions (lot_id, created_at) where public and status = 'answered';
create index if not exists questions_open on public.lot_questions (created_at) where status = 'open';
create index if not exists questions_user on public.lot_questions (user_id);
alter table public.lot_questions enable row level security;
create policy questions_read on public.lot_questions for select using (
  (public and status = 'answered') or user_id = (select auth.uid()) or (select public.is_admin()));

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now()
);
create index if not exists contact_new on public.contact_messages (created_at) where status = 'new';
alter table public.contact_messages enable row level security;
create policy contact_admin on public.contact_messages for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 11. One-call helpers for pages (fewer round trips per page view)
-- ---------------------------------------------------------------------------
create or replace function public.me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object(
    'watch_count', (select count(*) from watchlist w where w.user_id = p.id),
    'unread', (select count(*) from notifications n where n.user_id = p.id and n.read_at is null),
    'is_seller', exists (select 1 from lots l where l.seller_id = p.id),
    'terms_current', p.terms_version is not distinct from (select value->>'buyer_version' from settings where key = 'terms'))
  from profiles p where p.id = auth.uid();
$$;

create or replace function public.my_lot_state(p_lot bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'my_max', (select max_amount from max_bids where lot_id = p_lot and bidder_id = auth.uid()),
    'is_leader', (select leader_id = auth.uid() from lots where id = p_lot),
    'is_seller', (select seller_id = auth.uid() from lots where id = p_lot),
    'watched', exists (select 1 from watchlist where user_id = auth.uid() and lot_id = p_lot),
    'invoice_id', (select id from invoices where lot_id = p_lot and buyer_id = auth.uid() and status <> 'cancelled' limit 1),
    'last_offer', (select jsonb_build_object('amount', amount, 'status', status) from offers where lot_id = p_lot and user_id = auth.uid() order by created_at desc limit 1),
    'inspection', (select jsonb_build_object('day', preferred_day, 'time', preferred_time, 'status', status) from inspections
                    where lot_id = p_lot and user_id = auth.uid() and status <> 'cancelled' limit 1),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('question', question, 'answer', answer, 'status', status) order by created_at), '[]')
                    from lot_questions where lot_id = p_lot and user_id = auth.uid()))
  where auth.uid() is not null;
$$;

-- Public counts for the lot page
create or replace function public.lot_watchers(p_lot bigint) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from watchlist where lot_id = p_lot;
$$;

create or replace function public.bump_view(p_lot bigint) returns void
language sql security definer set search_path = public as $$
  update lots set views = views + 1 where id = p_lot and status <> 'draft';
$$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- My bids (including vehicles no longer watched) with won/lost/leading status
create or replace function public.my_bids(p_limit int default 100) returns table (
  lot_id bigint, title text, status text, current_bid numeric, ends_at timestamptz, cover_path text,
  my_max numeric, is_leader boolean, won boolean, sold_price numeric)
language sql stable security definer set search_path = public as $$
  select l.id, l.title, l.status, l.current_bid, l.ends_at, l.cover_path, m.max_amount,
    l.leader_id = auth.uid(), l.winner_id = auth.uid(), l.sold_price
  from max_bids m join lots l on l.id = m.lot_id
  where m.bidder_id = auth.uid()
  order by (l.status = 'live') desc, l.ends_at desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 12. Storage buckets for seller documents and claim photos (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('seller-docs', 'seller-docs', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('claim-photos', 'claim-photos', false) on conflict (id) do nothing;
create policy "seller docs upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'seller-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "seller docs read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'seller-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "claim photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "claim photos read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'claim-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));

-- ---------------------------------------------------------------------------
-- 13. Who may call what
-- ---------------------------------------------------------------------------
revoke execute on function public.sign_seller_agreement(uuid, text, text, numeric, jsonb, boolean, text, text, text[], text, text) from public, anon, authenticated;
revoke execute on function public.queue_seller_notice(bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.complete_handover(text, text, int, int, text) from public, anon, authenticated;
revoke execute on function public.release_payouts() from public, anon, authenticated;
revoke execute on function public.bump_view(bigint) from public, anon, authenticated;
revoke execute on function public.queue_notice(uuid, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.sign_seller_agreement(uuid, text, text, numeric, jsonb, boolean, text, text, text[], text, text) to service_role;
grant execute on function public.queue_seller_notice(bigint, text, text, text, text) to service_role;
grant execute on function public.complete_handover(text, text, int, int, text) to service_role;
grant execute on function public.release_payouts() to service_role;
grant execute on function public.bump_view(bigint) to service_role;
grant execute on function public.queue_notice(uuid, text, text, text, text, text, jsonb, timestamptz) to service_role;
revoke execute on function public.me() from public, anon;
revoke execute on function public.my_lot_state(bigint) from public, anon;
revoke execute on function public.my_bids(int) from public, anon;
revoke execute on function public.mark_notifications_read() from public, anon;
revoke execute on function public.seller_decide(bigint, text, uuid) from public, anon;
revoke execute on function public.accept_sale(bigint, uuid) from public, anon, authenticated;
grant execute on function public.me() to authenticated, service_role;
grant execute on function public.my_lot_state(bigint) to authenticated, service_role;
grant execute on function public.my_bids(int) to authenticated, service_role;
grant execute on function public.mark_notifications_read() to authenticated, service_role;
grant execute on function public.seller_decide(bigint, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 14. Seller portal reads (sellers see their own listings, offers and collection,
--     never the buyers' identities)
-- ---------------------------------------------------------------------------
create policy lots_seller_read on public.lots for select to authenticated using (seller_id = (select auth.uid()));

create or replace function public.seller_lot_offers(p_lot bigint)
returns table (id uuid, amount numeric, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.amount, o.status, o.created_at from offers o join lots l on l.id = o.lot_id
  where o.lot_id = p_lot and l.seller_id = auth.uid() order by o.amount desc, o.created_at;
$$;

create or replace function public.seller_lot_collection(p_lot bigint)
returns table (status text, confirmed_for text, collector text, seller_token text, collected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.status, c.confirmed_for,
    coalesce(c.collector_name, p.first_name || ' ' || left(coalesce(p.last_name, ''), 1) || '.'),
    case when c.status in ('confirmed','collected') then c.seller_token end, c.collected_at
  from collections c join lots l on l.id = c.lot_id join profiles p on p.id = c.buyer_id
  where c.lot_id = p_lot and l.seller_id = auth.uid() and c.status <> 'cancelled'
  order by c.created_at desc limit 1;
$$;
revoke execute on function public.seller_lot_offers(bigint) from public, anon;
revoke execute on function public.seller_lot_collection(bigint) from public, anon;
grant execute on function public.seller_lot_offers(bigint) to authenticated, service_role;
grant execute on function public.seller_lot_collection(bigint) to authenticated, service_role;

-- A pending invite (no signature yet) can be previewed by whoever holds the link.
create or replace function public.invite_preview(p_invite text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lot_id', l.id, 'title', l.title, 'status', l.status, 'suburb', l.suburb, 'state', l.state,
    'vin', l.vin, 'rego_plate', l.rego_plate, 'odometer', l.odometer, 'reserve_price', p.reserve_price,
    'seller_id', l.seller_id, 'signed', exists (select 1 from seller_agreements a where a.lot_id = l.id and a.status = 'signed'),
    'cover_path', l.cover_path, 'ends_at', l.ends_at)
  from lot_private p join lots l on l.id = p.lot_id where p.seller_invite = p_invite;
$$;
revoke execute on function public.invite_preview(text) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to service_role;

-- ---------------------------------------------------------------------------
-- 15. Saved-search alerts, fully set-based (250,000 matches in one pass):
--     one digest per saved search, honouring each member's settings.
-- ---------------------------------------------------------------------------
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
      and (s.f_cat is null or s.f_cat = l.category or (s.f_cat = 'cheap' and l.current_bid < 5000))
      and (s.f_state is null or s.f_state = l.state)
      and (s.f_max is null or l.current_bid <= s.f_max)
      and (s.f_q is null or l.search like '%' || s.f_q || '%')
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
-- 16. A sold, referred or offers-open vehicle can't be put back on sale by an
--     editor save (the bidding functions change these states, not the editor).
-- ---------------------------------------------------------------------------
create or replace function public.lot_status_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and old.status in ('sold', 'referred', 'offers')
     and new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'status_locked:% can''t be changed back from %', old.id, old.status;
  end if;
  if current_user in ('authenticated', 'anon') and old.status = 'sold' and new.status = 'cancelled' then
    raise exception 'status_locked:cancel the invoice instead';
  end if;
  return new;
end $$;
drop trigger if exists lot_status_guard on public.lots;
create trigger lot_status_guard before update of status on public.lots
  for each row execute function public.lot_status_guard();
