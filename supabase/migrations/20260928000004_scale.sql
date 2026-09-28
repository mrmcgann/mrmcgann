-- Scale: built and measured against 1,000,000 accounts and 60,000 vehicles
-- (see tests/load). Indexes, faster security rules, live updates by Broadcast,
-- a message queue for SMS/email, rate limits and safe payment claiming.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Indexes for every screen and job
-- ---------------------------------------------------------------------------
create index if not exists lot_photos_lot on public.lot_photos (lot_id, sort);
create index if not exists lot_flaws_lot on public.lot_flaws (lot_id, sort);
create index if not exists bids_bidder on public.bids (bidder_id, created_at desc);
create index if not exists max_bids_bidder on public.max_bids (bidder_id);
create index if not exists watchlist_lot on public.watchlist (lot_id);
create index if not exists saved_searches_user on public.saved_searches (user_id, created_at desc);
create index if not exists offers_lot on public.offers (lot_id, status);
create index if not exists offers_user on public.offers (user_id, lot_id, created_at desc);
create index if not exists invoices_buyer on public.invoices (buyer_id, created_at desc);
create index if not exists invoices_lot on public.invoices (lot_id);
create index if not exists invoices_created on public.invoices (created_at desc);
create index if not exists invoices_status on public.invoices (status, created_at desc) where status in ('pending_charge','charging','payment_failed','deposit_paid');
create index if not exists inspections_lot_user on public.inspections (lot_id, user_id);
create index if not exists inspections_user on public.inspections (user_id);
create index if not exists inspections_created on public.inspections (created_at desc);
create index if not exists inspections_requested on public.inspections (created_at) where status = 'requested';
create index if not exists appraisals_created on public.appraisals (created_at desc);
create index if not exists appraisals_user on public.appraisals (user_id);
create index if not exists appraisals_new on public.appraisals (created_at) where status = 'new';
create index if not exists reports_created on public.reports (created_at desc);
create index if not exists reports_open on public.reports (created_at) where status = 'open';
create index if not exists reports_user on public.reports (user_id);
create index if not exists quotes_created on public.quote_requests (created_at desc);
create index if not exists quotes_new on public.quote_requests (created_at) where status = 'new';
create index if not exists quotes_user on public.quote_requests (user_id);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread on public.notifications (user_id) where read_at is null;
create index if not exists profiles_created on public.profiles (created_at desc);
create index if not exists profiles_email_trgm on public.profiles using gin (email extensions.gin_trgm_ops);
create index if not exists profiles_last_trgm on public.profiles using gin (last_name extensions.gin_trgm_ops);
create index if not exists profiles_mobile_trgm on public.profiles using gin (mobile extensions.gin_trgm_ops);
create index if not exists lots_created on public.lots (created_at desc);
create index if not exists lots_closed_ends on public.lots (ends_at desc) where status in ('sold','passed','offers','referred');
create index if not exists lots_live_cat on public.lots (category, ends_at) where status = 'live';
create index if not exists lots_featured on public.lots (ends_at) where status = 'live' and featured;
create index if not exists lots_decisions on public.lots (decision_by) where status in ('referred','offers');
create index if not exists lots_winner on public.lots (winner_id) where winner_id is not null;
create index if not exists lots_leader on public.lots (leader_id) where leader_id is not null;

-- One searchable text per vehicle, with a trigram index so "hilux" or "toowoomba" is instant.
alter table public.lots add column if not exists search text generated always as (
  lower(coalesce(title,'') || ' ' || coalesce(make,'') || ' ' || coalesce(model,'') || ' ' || coalesce(variant,'') || ' ' ||
        coalesce(body,'') || ' ' || coalesce(suburb,'') || ' ' || coalesce(state,'') || ' ' || coalesce(colour,''))) stored;
create index if not exists lots_search_trgm on public.lots using gin (search extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Cover photo on the vehicle row (listing pages no longer load every photo)
-- ---------------------------------------------------------------------------
alter table public.lots add column if not exists cover_path text;
update public.lots l set cover_path = p.path
  from (select distinct on (lot_id) lot_id, path from public.lot_photos order by lot_id, sort, created_at) p
  where p.lot_id = l.id;

create or replace function public.sync_cover() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lot bigint := coalesce(new.lot_id, old.lot_id);
begin
  update lots set cover_path = (select path from lot_photos where lot_id = v_lot order by sort, created_at limit 1)
    where id = v_lot;
  return null;
end $$;
drop trigger if exists sync_cover on public.lot_photos;
create trigger sync_cover after insert or update of sort, path or delete on public.lot_photos
  for each row execute function public.sync_cover();

-- When a vehicle first goes live (drives saved-search alerts)
alter table public.lots add column if not exists published_at timestamptz;
update public.lots set published_at = coalesce(starts_at, created_at) where status <> 'draft' and published_at is null;
create index if not exists lots_published on public.lots (published_at) where status = 'live';

-- ---------------------------------------------------------------------------
-- 3. Security rules, evaluated once per query instead of once per row.
--    (auth.uid() and is_admin() wrapped in a sub-select; roles targeted.)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

drop policy if exists settings_read on public.settings;
drop policy if exists settings_admin on public.settings;
create policy settings_read on public.settings for select using (true);
create policy settings_admin on public.settings for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin())) with check (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists lots_public_read on public.lots;
drop policy if exists lots_admin_write on public.lots;
create policy lots_public_read on public.lots for select using (status <> 'draft' or (select public.is_admin()));
create policy lots_admin_insert on public.lots for insert to authenticated with check ((select public.is_admin()));
create policy lots_admin_update on public.lots for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy lots_admin_delete on public.lots for delete to authenticated using ((select public.is_admin()));

drop policy if exists lot_private_admin on public.lot_private;
create policy lot_private_admin on public.lot_private for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists photos_read on public.lot_photos;
drop policy if exists photos_admin on public.lot_photos;
create policy photos_read on public.lot_photos for select using (
  (select public.is_admin()) or exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'draft'));
create policy photos_admin_insert on public.lot_photos for insert to authenticated with check ((select public.is_admin()));
create policy photos_admin_update on public.lot_photos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy photos_admin_delete on public.lot_photos for delete to authenticated using ((select public.is_admin()));

drop policy if exists flaws_read on public.lot_flaws;
drop policy if exists flaws_admin on public.lot_flaws;
create policy flaws_read on public.lot_flaws for select using (
  (select public.is_admin()) or exists (select 1 from public.lots l where l.id = lot_id and l.status <> 'draft'));
create policy flaws_admin_insert on public.lot_flaws for insert to authenticated with check ((select public.is_admin()));
create policy flaws_admin_update on public.lot_flaws for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy flaws_admin_delete on public.lot_flaws for delete to authenticated using ((select public.is_admin()));

drop policy if exists bids_own on public.bids;
create policy bids_own on public.bids for select to authenticated using (bidder_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists max_bids_own on public.max_bids;
create policy max_bids_own on public.max_bids for select to authenticated using (bidder_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists watch_own on public.watchlist;
create policy watch_own on public.watchlist for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists searches_own on public.saved_searches;
create policy searches_own on public.saved_searches for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists offers_own on public.offers;
create policy offers_own on public.offers for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists invoices_own on public.invoices;
drop policy if exists invoices_admin on public.invoices;
create policy invoices_own on public.invoices for select to authenticated using (buyer_id = (select auth.uid()) or (select public.is_admin()));
create policy invoices_admin on public.invoices for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists inspections_own on public.inspections;
drop policy if exists inspections_insert on public.inspections;
drop policy if exists inspections_admin on public.inspections;
create policy inspections_own on public.inspections for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy inspections_insert on public.inspections for insert to authenticated with check (user_id = (select auth.uid()) and public.can_bid((select auth.uid())));
create policy inspections_admin on public.inspections for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists appraisals_insert on public.appraisals;
drop policy if exists appraisals_read on public.appraisals;
drop policy if exists appraisals_admin on public.appraisals;
create policy appraisals_insert on public.appraisals for insert with check (user_id is null or user_id = (select auth.uid()));
create policy appraisals_read on public.appraisals for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy appraisals_admin on public.appraisals for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists reports_insert on public.reports;
drop policy if exists reports_admin on public.reports;
drop policy if exists reports_admin_update on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy reports_admin on public.reports for select to authenticated using ((select public.is_admin()));
create policy reports_admin_update on public.reports for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists notifications_own on public.notifications;
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists quotes_own on public.quote_requests;
drop policy if exists quotes_admin on public.quote_requests;
create policy quotes_own on public.quote_requests for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy quotes_admin on public.quote_requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4. Live bid updates by Broadcast (one message per change, fanned out by
--    Supabase), instead of Postgres Changes (one database check per viewer).
-- ---------------------------------------------------------------------------
create or replace function public.lot_live_payload(l public.lots) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', l.id, 'status', l.status, 'current_bid', l.current_bid, 'bid_count', l.bid_count,
    'ends_at', l.ends_at, 'reserve_met', l.reserve_met, 'has_reserve', l.has_reserve, 'leader_id', l.leader_id,
    'decision_by', l.decision_by, 'sold_price', l.sold_price, 'buy_now_price', l.buy_now_price);
$$;

create or replace function public.broadcast_lot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and (
     new.current_bid is distinct from old.current_bid or new.bid_count is distinct from old.bid_count
     or new.ends_at is distinct from old.ends_at or new.status is distinct from old.status
     or new.reserve_met is distinct from old.reserve_met or new.buy_now_price is distinct from old.buy_now_price) then
    perform realtime.send(public.lot_live_payload(new), 'lot', 'lot:' || new.id, false);
  end if;
  return null;
exception when others then
  return null; -- a live-update hiccup must never block a bid
end $$;

drop trigger if exists broadcast_lot on public.lots;
create trigger broadcast_lot after update on public.lots
  for each row execute function public.broadcast_lot();

do $$ begin
  alter publication supabase_realtime drop table public.lots;
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. Message queue (outbox). Alerts are queued in the database in one step,
--    however many people they go to, and sent in batches by the app.
-- ---------------------------------------------------------------------------
create table if not exists public.outbox (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('sms','email')),
  to_addr text not null,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  dedupe_key text unique,
  priority int not null default 5,          -- 1 payments/outbid, 5 reminders, 9 search alerts & marketing
  expires_at timestamptz,                   -- don't send after this (e.g. "ending soon" once it has ended)
  meta jsonb not null default '{}'::jsonb,  -- e.g. {"invoice_id": ...} to attach the tax invoice
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outbox_due on public.outbox (priority, run_after, id) where status = 'queued';
create index if not exists outbox_stuck on public.outbox (locked_at) where status = 'sending';
create index if not exists outbox_expiring on public.outbox (expires_at) where status = 'queued' and expires_at is not null;
create index if not exists outbox_user on public.outbox (user_id, created_at desc);
alter table public.outbox enable row level security; -- no policies: server only

create or replace function public.notice_priority(p_kind text) returns int language sql immutable as $$
  select case when p_kind in ('account','won','outbid','seller') then 1 when p_kind = 'ending' then 5 else 9 end;
$$;

-- Queue one alert for one member, honouring their SMS/email settings.
-- 'account' alerts (payments, collections, inspections) always go by both.
create or replace function public.queue_notice(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null,
  p_meta jsonb default '{}'::jsonb, p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare p record; prefs jsonb;
begin
  select email, mobile, mobile_verified, notify into p from profiles where id = p_user;
  if not found then return; end if;
  prefs := case when p_kind in ('account','won') then '{"sms":true,"email":true}'::jsonb
                else coalesce(p.notify -> p_kind, '{"sms":false,"email":true}'::jsonb) end;
  if p_dedupe is not null and exists (select 1 from outbox where dedupe_key in (p_dedupe || ':sms', p_dedupe || ':email', p_dedupe || ':app')) then
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

-- Queue the same alert for many members at once (set-based: 50,000 people is one statement).
create or replace function public.queue_notice_many(p_users uuid[], p_kind text, p_title text, p_body text, p_link text, p_tag text,
  p_expires timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with t as (
    select p.id, p.email, p.mobile, p.mobile_verified,
      coalesce(p.notify -> p_kind, '{"sms":false,"email":true}'::jsonb) prefs
    from profiles p where p.id = any(p_users) and not p.suspended
  ), app as (
    insert into notifications (user_id, kind, title, body, link, channels)
    select id, p_kind, p_title, p_body, p_link,
      array_remove(array[case when (prefs->>'sms')::boolean and mobile_verified then 'sms' end,
                         case when (prefs->>'email')::boolean and email is not null then 'email' end], null)
    from t where not exists (select 1 from outbox o where o.dedupe_key in (p_tag || ':' || t.id || ':sms', p_tag || ':' || t.id || ':email'))
    returning 1
  ), sms as (
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority, expires_at)
    select id, 'sms', mobile, p_kind, p_title, p_body, p_link, p_tag || ':' || id || ':sms', notice_priority(p_kind), p_expires
    from t where (prefs->>'sms')::boolean and mobile is not null and mobile_verified
    on conflict (dedupe_key) do nothing returning 1
  ), em as (
    insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority, expires_at)
    select id, 'email', email, p_kind, p_title, p_body, p_link, p_tag || ':' || id || ':email', notice_priority(p_kind), p_expires
    from t where (prefs->>'email')::boolean and email is not null
    on conflict (dedupe_key) do nothing returning 1
  )
  select (select count(*) from app) into n;
  return n;
end $$;

-- Hand the sender a batch to send. Safe with several senders at once (skip locked).
create or replace function public.claim_outbox(p_limit int default 200, p_ids bigint[] default null)
returns setof public.outbox language plpgsql security definer set search_path = public as $$
begin
  -- rescue anything a crashed sender left half-done
  update outbox set status = 'queued', locked_at = null
    where status = 'sending' and locked_at < now() - interval '5 minutes';
  -- too late to be useful: mark skipped instead of sending
  update outbox set status = 'skipped', last_error = 'expired'
    where id in (select id from outbox where status = 'queued' and expires_at < now() limit 5000);
  return query
  update outbox o set status = 'sending', locked_at = now(), attempts = o.attempts + 1
  where o.id in (
    select id from outbox
    where status = 'queued' and run_after <= now() and (p_ids is null or id = any(p_ids))
      and (expires_at is null or expires_at > now())
    order by priority, run_after, id limit p_limit
    for update skip locked)
  returning o.*;
end $$;

create or replace function public.finish_outbox(p_sent bigint[], p_failed jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update outbox set status = 'sent', sent_at = now(), locked_at = null where id = any(p_sent);
  -- failures retry with back-off (1, 4, 9, 16 minutes), then give up
  update outbox o set
    status = case when o.attempts >= 5 then 'failed' else 'queued' end,
    run_after = now() + make_interval(mins => o.attempts * o.attempts),
    last_error = left(f.err, 500), locked_at = null
  from jsonb_to_recordset(p_failed) as f(id bigint, err text)
  where o.id = f.id;
end $$;

-- Outbid alerts come straight from the bidding engine, at most one per lot every 2 minutes per person.
create or replace function public.queue_outbid(p_user uuid, p_lot bigint, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if p_user is null then return; end if;
  select title into v_title from lots where id = p_lot;
  perform queue_notice(p_user, 'outbid', 'You''ve been outbid on the ' || v_title,
    'The current bid is $' || to_char(p_amount, 'FM999,999,990') || '. Raise your maximum to get back in front.',
    '/lot/' || p_lot, 'outbid:' || p_lot || ':' || p_user || ':' || floor(extract(epoch from now()) / 120)::bigint);
end $$;

-- Extra checks before any bid, Buy Now or offer (filled in by later migrations:
-- sellers can't bid on their own vehicle, current terms accepted).
create or replace function public.bid_guard(p_lot bigint, p_user uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  return;
end $$;
revoke execute on function public.bid_guard(bigint, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The bidding engine, unchanged rules, now queues the outbid alert itself
--    (one round trip per bid; the alert can't be lost if the app is slow).
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
  if p_max > 10000000 then raise exception 'invalid_amount'; end if;
  perform bid_guard(p_lot, v_user);

  select * into l from lots where id = p_lot for update;
  if not found then raise exception 'lot_not_found'; end if;
  if l.status <> 'live' or l.ends_at <= now() or (l.starts_at is not null and l.starts_at > now()) then
    raise exception 'auction_closed';
  end if;
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

-- ---------------------------------------------------------------------------
-- 7. The clock, in batches, plus set-based alerts
-- ---------------------------------------------------------------------------
create or replace function public.close_due_lots(p_limit int default 500) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0;
  v_days int := setting_num('auction','referral_days')::int;
  v_offer_days int := setting_num('auction','offer_days')::int;
begin
  for l in select lots.*, p.reserve_price from lots left join lot_private p on p.lot_id = lots.id
           where status = 'live' and ends_at <= now()
           order by ends_at limit p_limit
           for update of lots skip locked loop
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
  update offers set status = 'lapsed', decided_at = now()
    where status = 'pending' and lot_id in (select id from lots where status = 'offers' and decision_by <= now());
  update lots set status = 'passed', updated_at = now() where status = 'offers' and decision_by <= now();
  return n;
end $$;
revoke execute on function public.close_due_lots(int) from public, anon, authenticated;
grant execute on function public.close_due_lots(int) to service_role;
drop function if exists public.close_due_lots();

-- Status-change alerts: referral, offers open, you didn't win. Runs in batches.
create index if not exists lots_unnotified on public.lots (id) where status in ('referred','offers','sold','passed') and notified_status is distinct from status;

update public.lots set notified_status = status where status in ('sold','passed') and notified_status is distinct from status;

create or replace function public.queue_status_notices(p_limit int default 200) returns int
language plpgsql security definer set search_path = public as $$
declare l record; n int := 0; v_users uuid[];
begin
  for l in select * from lots where status in ('referred','offers','sold','passed') and notified_status is distinct from status
           order by id limit p_limit for update skip locked loop
    if l.status = 'referred' and l.leader_id is not null then
      perform queue_notice(l.leader_id, 'account', 'Your bid on the ' || l.title || ' is with the seller',
        'Bidding ended below the reserve. Your bid of $' || to_char(l.current_bid, 'FM999,999,990') ||
        ' has gone to the seller, who has until ' || to_char(l.decision_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') ||
        ' (Brisbane time) to accept. Your bid stays binding until then.', '/lot/' || l.id, 'referred:' || l.id);
    elsif l.status = 'offers' then
      select array_agg(user_id) into v_users from watchlist where lot_id = l.id;
      if v_users is not null then
        perform queue_notice_many(v_users, 'ending', 'Make an offer on the ' || l.title,
          'The auction closed below the reserve. You can make an offer until ' ||
          to_char(l.decision_by at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth') || '.', '/lot/' || l.id, 'offers:' || l.id);
      end if;
    elsif l.status = 'sold' then
      -- everyone who bid but didn't win
      select array_agg(bidder_id) into v_users from max_bids where lot_id = l.id and bidder_id is distinct from l.winner_id;
      if v_users is not null then
        perform queue_notice_many(v_users, 'outbid', 'The ' || l.title || ' has sold',
          'Thanks for bidding. This one went to another bidder for $' || to_char(l.sold_price, 'FM999,999,990') ||
          '. Similar vehicles are listed every week.', '/auctions?cat=' || l.category, 'lost:' || l.id);
      end if;
    end if;
    update lots set notified_status = l.status where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- One-hour reminders for watched vehicles, all in one statement.
create index if not exists watchlist_remind on public.watchlist (lot_id) where remind and reminded_at is null;

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
    select upd.lot_id, upd.title, array_agg(upd.user_id) users, max(l.ends_at) ends_at
    from upd join lots l on l.id = upd.lot_id group by upd.lot_id, upd.title
  loop
    n := n + queue_notice_many(r.users, 'ending', 'Ending within the hour: ' || r.title,
      'A vehicle on your watchlist ends within the hour.', '/lot/' || r.lot_id, 'ending:' || r.lot_id, r.ends_at);
  end loop;
  return n;
end $$;

-- Saved-search alerts: new vehicles matched against every saved search in one pass.
alter table public.saved_searches add column if not exists f_cat text generated always as (nullif(query->>'cat','')) stored;
alter table public.saved_searches add column if not exists f_state text generated always as (nullif(query->>'state','')) stored;
alter table public.saved_searches add column if not exists f_max numeric generated always as (
  case when (query->>'max') ~ '^[0-9]+$' then (query->>'max')::numeric end) stored;
alter table public.saved_searches add column if not exists f_q text generated always as (nullif(lower(trim(query->>'q')),'')) stored;
create index if not exists saved_searches_match on public.saved_searches (f_cat, f_state);

create or replace function public.queue_search_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
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
    )
    select * from upd
  loop
    perform queue_notice(r.user_id, 'searches',
      r.cnt || ' new match' || case when r.cnt > 1 then 'es' else '' end || ' for “' || r.label || '”',
      r.items, '/watchlist#searches', 'search:' || r.id || ':' || floor(extract(epoch from now()) / 60)::bigint);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Payments: an invoice can only be charged once, even if two clocks overlap.
-- ---------------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('pending_charge','charging','paid','deposit_paid','payment_failed','cancelled'));
alter table public.invoices add column if not exists charge_attempts int not null default 0;
alter table public.invoices add column if not exists charging_at timestamptz;

create or replace function public.claim_invoice_charges(p_limit int default 25, p_id uuid default null) returns setof public.invoices
language plpgsql security definer set search_path = public as $$
begin
  -- a charge that never reported back after 10 minutes is retried with the same Stripe key (no double charge)
  update invoices set status = 'pending_charge', charge_attempts = charge_attempts - 1
    where status = 'charging' and charging_at < now() - interval '10 minutes';
  return query
  update invoices i set status = 'charging', charging_at = now(), charge_attempts = i.charge_attempts + 1
  where i.id in (select id from invoices where status = 'pending_charge' and (p_id is null or id = p_id)
                 order by created_at limit p_limit for update skip locked)
  returning i.*;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Rate limits (SMS codes, forms). Shared by every server instance.
-- ---------------------------------------------------------------------------
create unlogged table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);
alter table public.rate_limits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- Server-only functions
revoke execute on function public.queue_notice(uuid, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.queue_notice_many(uuid[], text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.queue_outbid(uuid, bigint, numeric) from public, anon, authenticated;
revoke execute on function public.claim_outbox(int, bigint[]) from public, anon, authenticated;
revoke execute on function public.finish_outbox(bigint[], jsonb) from public, anon, authenticated;
revoke execute on function public.queue_status_notices(int) from public, anon, authenticated;
revoke execute on function public.queue_ending_reminders(int) from public, anon, authenticated;
revoke execute on function public.queue_search_alerts() from public, anon, authenticated;
revoke execute on function public.claim_invoice_charges(int, uuid) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.queue_notice(uuid, text, text, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.queue_notice_many(uuid[], text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.queue_outbid(uuid, bigint, numeric) to service_role;
grant execute on function public.claim_outbox(int, bigint[]) to service_role;
grant execute on function public.finish_outbox(bigint[], jsonb) to service_role;
grant execute on function public.queue_status_notices(int) to service_role;
grant execute on function public.queue_ending_reminders(int) to service_role;
grant execute on function public.queue_search_alerts() to service_role;
grant execute on function public.claim_invoice_charges(int, uuid) to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

analyze;
