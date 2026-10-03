-- Tyrebiter apps (iOS and Android): push notifications and account deletion.
--
-- Push rides on the existing outbox. Every alert already creates an in-app
-- notification row; one statement-level trigger turns each batch of new
-- notifications into 'push' outbox rows for members who have the app and want
-- that kind of alert. Set-based, so a 30,000-member search-alert sweep is one
-- insert, not 30,000. The sender (src/lib/push.ts) sends to every device the
-- member has, 100 per request to Expo's push service.

-- ---------------------------------------------------------------------------
-- 1. Devices
-- ---------------------------------------------------------------------------
create table if not exists public.push_devices (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 10 and 300),
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index if not exists push_devices_user on public.push_devices (user_id) where disabled_at is null;
alter table public.push_devices enable row level security;
-- Members can see their own devices; registering goes through /api/push (service role).
create policy push_devices_own_read on public.push_devices for select to authenticated using (user_id = (select auth.uid()));

-- Register (or move) a device token for the signed-in member. Called by /api/push.
create or replace function public.register_push_device(p_user uuid, p_token text, p_platform text, p_version text)
returns void language sql security definer set search_path = public as $$
  insert into push_devices (user_id, token, platform, app_version)
  values (p_user, p_token, p_platform, left(p_version, 20))
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
    app_version = excluded.app_version, last_seen_at = now(), disabled_at = null;
$$;

-- ---------------------------------------------------------------------------
-- 2. Push alerts from notifications
-- ---------------------------------------------------------------------------
alter table public.outbox drop constraint if exists outbox_channel_check;
alter table public.outbox add constraint outbox_channel_check check (channel in ('sms', 'email', 'push'));

-- Push is on by default for alerts members already get, off for marketing until they opt in.
-- Payments, wins, account and selling updates always go.
create or replace function public.push_wanted(p_notify jsonb, p_kind text) returns boolean
language sql immutable as $$
  select case when p_kind in ('account', 'won', 'seller') then true
              when p_kind = 'marketing' then coalesce((p_notify -> 'marketing' ->> 'push')::boolean, false)
              else coalesce((p_notify -> p_kind ->> 'push')::boolean, true) end
$$;

create or replace function public.queue_push_from_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority, expires_at, meta)
  select n.user_id, 'push', n.user_id::text, n.kind, n.title, coalesce(n.body, ''), n.link, 'push:' || n.id,
         notice_priority(n.kind),
         now() + case n.kind when 'ending' then interval '2 hours' when 'outbid' then interval '6 hours' else interval '3 days' end,
         jsonb_build_object('notification_id', n.id)
  from new_rows n
  join profiles p on p.id = n.user_id
  where push_wanted(p.notify, n.kind)
    and exists (select 1 from push_devices d where d.user_id = n.user_id and d.disabled_at is null)
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  referencing new table as new_rows for each statement execute function public.queue_push_from_notifications();

-- Devices for a batch of members (the sender looks them up once per batch).
create or replace function public.push_targets(p_users uuid[])
returns table (user_id uuid, token text) language sql stable security definer set search_path = public as $$
  select d.user_id, d.token from push_devices d where d.user_id = any(p_users) and d.disabled_at is null
$$;

-- Expo says a token is no longer valid (app deleted, permission turned off): stop using it.
create or replace function public.disable_push_tokens(p_tokens text[])
returns void language sql security definer set search_path = public as $$
  update push_devices set disabled_at = now() where token = any(p_tokens) and disabled_at is null;
$$;

-- Unread count for the app icon badge (one indexed count).
create index if not exists notifications_unread on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- 3. Account deletion (App Store and Google Play require it in the app)
-- ---------------------------------------------------------------------------
-- Members can delete their account themselves once nothing is in progress.
-- Tax invoices and sale records are kept as long as the law requires, with
-- the personal details removed from the account. Anything still in progress is
-- listed so the member knows what to finish first (or to call us).
alter table public.profiles add column if not exists deleted_at timestamptz;

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
      then 'You have a seller payout still to come.' end
  ], null)
$$;

-- Removes the member's personal details and everything only they use. Records of
-- sales (bids, invoices, payouts, claims) stay, linked to an anonymous account.
-- The auth user is then soft-deleted by /api/account/delete (email freed, can't sign in).
create or replace function public.delete_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b text[] := account_deletion_blockers(p_user);
begin
  if not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('This account has already been deleted.'));
  end if;
  if cardinality(b) > 0 then return jsonb_build_object('ok', false, 'blockers', to_jsonb(b)); end if;
  delete from watchlist where user_id = p_user;
  delete from saved_searches where user_id = p_user;
  delete from push_devices where user_id = p_user;
  delete from notifications where user_id = p_user;
  delete from outbox where user_id = p_user and status in ('queued', 'sending');
  update profiles set
    email = null, first_name = null, last_name = null, dob = null, mobile = null, mobile_verified = false,
    street = null, suburb = null, postcode = null, company_name = null, abn = null,
    payment_method_id = null, card_brand = null, card_last4 = null, id_session_id = null,
    notify = '{}'::jsonb, suspended = true, deleted_at = now()
  where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.register_push_device(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.push_targets(uuid[]) from public, anon, authenticated;
revoke execute on function public.disable_push_tokens(text[]) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
revoke execute on function public.queue_push_from_notifications() from public, anon, authenticated;
grant execute on function public.register_push_device(uuid, text, text, text) to service_role;
grant execute on function public.push_targets(uuid[]) to service_role;
grant execute on function public.disable_push_tokens(text[]) to service_role;
grant execute on function public.delete_account(uuid) to service_role;
revoke execute on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;
