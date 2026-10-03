-- Listing videos (approved before anyone sees them), blurred bidder names, mobile inspections and
-- a named consultant instead of in-person viewing, finance and insurance partners with leads and
-- click tracking, and photo credits.

-- ---------------------------------------------------------------------------
-- 1. Photo credits (for licensed or supplied photos, e.g. sample listings)
-- ---------------------------------------------------------------------------
alter table public.lot_photos add column if not exists credit text;
alter table public.lot_photos add column if not exists credit_url text; -- source page (required for CC BY / BY-SA photos)

-- ---------------------------------------------------------------------------
-- 2. Listing videos. Sellers (and staff) upload to a private bucket; nothing is public until an
--    admin approves it, when the server copies it to the public "lot-videos" bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.lot_videos (
  id uuid primary key default gen_random_uuid(),
  lot_id bigint not null references public.lots(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  upload_path text not null,
  public_path text,
  title text not null default 'Walkaround',
  size_bytes bigint,
  mime text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','removed')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lot_videos_lot on public.lot_videos (lot_id, status);
create index if not exists lot_videos_queue on public.lot_videos (created_at) where status = 'pending';
create index if not exists lot_videos_submitter on public.lot_videos (submitted_by);
create unique index if not exists lot_videos_upload on public.lot_videos (upload_path);
alter table public.lot_videos enable row level security;
drop policy if exists lot_videos_read on public.lot_videos;
-- The uploader, the listing's seller (for videos staff add) and admins can see a request.
create policy lot_videos_read on public.lot_videos for select to authenticated
  using (submitted_by = (select auth.uid()) or (select public.is_admin())
    or exists (select 1 from public.lots l where l.id = lot_id and l.seller_id = (select auth.uid())));
-- No insert/update policies: requests go through request_lot_video(), reviews through the server.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('video-uploads', 'video-uploads', false, 262144000, array['video/mp4','video/quicktime','video/webm','video/x-m4v']),
  ('lot-videos', 'lot-videos', true, 262144000, array['video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies on purpose: uploads only happen through one-off signed links the server
-- issues after its checks, reviews use signed preview links, and the public bucket serves files by
-- URL without letting anyone list it.

-- Every upload link the server issues, so uploads that never become a video request are cleaned up.
create table if not exists public.video_upload_slots (
  path text primary key,
  user_id uuid not null,
  lot_id bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists video_upload_slots_age on public.video_upload_slots (created_at);
alter table public.video_upload_slots enable row level security; -- server only

-- Upload slots over a day old that never became a video request (the server deletes the files).
create or replace function public.video_orphans(p_limit int default 200) returns setof text
language sql stable security definer set search_path = public as $$
  select s.path from video_upload_slots s
  where s.created_at < now() - interval '1 day' and not exists (select 1 from lot_videos v where v.upload_path = s.path)
  order by s.created_at limit p_limit;
$$;
revoke execute on function public.video_orphans(int) from public, anon, authenticated;
grant execute on function public.video_orphans(int) to service_role;

-- The seller (or an admin) asks for an uploaded video to be added to a listing.
create or replace function public.request_lot_video(p_lot bigint, p_path text, p_title text, p_size bigint, p_mime text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); l record; v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select id, seller_id, status into l from lots where id = p_lot;
  if not found then raise exception 'That vehicle wasn''t found.'; end if;
  if l.seller_id is distinct from v_uid and not is_admin() then raise exception 'Only the seller can add a video to this listing.'; end if;
  if l.status not in ('draft','scheduled','live','referred','offers') then raise exception 'Videos can only be added while the vehicle is listed.'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> v_uid::text or p_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' then raise exception 'Upload the video first.'; end if;
  if exists (select 1 from lot_videos where upload_path = p_path) then raise exception 'That video has already been added.'; end if;
  if coalesce(p_mime, '') not in ('video/mp4','video/quicktime','video/webm','video/x-m4v') then raise exception 'Use an MP4, MOV or WebM video.'; end if;
  if coalesce(p_size, 0) > 262144000 then raise exception 'Videos can be up to 250 MB.'; end if;
  if (select count(*) from lot_videos where lot_id = p_lot and status in ('pending','approved')) >= 3 then
    raise exception 'A listing can have up to 3 videos. Remove one first.';
  end if;
  if (select count(*) from lot_videos where submitted_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many videos today. Please call us.';
  end if;
  insert into lot_videos (lot_id, submitted_by, upload_path, title, size_bytes, mime)
    values (p_lot, v_uid, p_path, left(coalesce(nullif(trim(p_title), ''), 'Walkaround'), 60), p_size, p_mime)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.request_lot_video(bigint, text, text, bigint, text) from public, anon;
grant execute on function public.request_lot_video(bigint, text, text, bigint, text) to authenticated, service_role;

-- Approved videos for a listing (what the public page shows).
create or replace function public.lot_videos_public(p_lot bigint)
returns table (id uuid, public_path text, title text, approved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.public_path, v.title, v.reviewed_at from lot_videos v
  where v.lot_id = p_lot and v.status = 'approved' and v.public_path is not null
  order by v.reviewed_at, v.id limit 3;
$$;
grant execute on function public.lot_videos_public(bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Bid history with blurred names. bidder_mask is a made-up, name-shaped string that's the same
--    for one bidder on one lot. Pages show it blurred, so bids from different people look like
--    different (hidden) names. It is never the bidder's real name, and because it's keyed with a
--    secret it can't be worked out from a member's id or matched across auctions.
-- ---------------------------------------------------------------------------
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security; -- no policies: readable only inside functions
insert into public.app_secrets (key, value) values ('bidder_salt', encode(sha256(gen_random_uuid()::text::bytea || clock_timestamp()::text::bytea), 'hex'))
  on conflict (key) do nothing;

create or replace function public.bidder_mask(p_bidder uuid, p_lot bigint) returns text
language sql stable security definer set search_path = public as $$
  select initcap(translate(substr(h, 1, 4 + get_byte(decode(h, 'hex'), 0) % 4), '0123456789abcdef', 'aeiourstnlmkdbch'))
      || ' ' || initcap(translate(substr(h, 9, 5 + get_byte(decode(h, 'hex'), 1) % 4), '0123456789abcdef', 'naeltroiskmhduvy'))
  from (select md5((select value from app_secrets where key = 'bidder_salt') || ':' || p_bidder::text || ':' || p_lot::text) h) x;
$$;
revoke execute on function public.bidder_mask(uuid, bigint) from public, anon, authenticated;

drop function if exists public.bid_history(bigint, int);
create function public.bid_history(p_lot bigint, p_limit int default 20)
returns table (amount numeric, created_at timestamptz, bidder_tag text, is_me boolean, is_auto boolean, bidder_mask text)
language sql stable security definer set search_path = public as $$
  select b.amount, b.created_at,
    left(bidder_mask(b.bidder_id, b.lot_id), 1) || '•••',
    b.bidder_id = auth.uid(), b.is_auto, bidder_mask(b.bidder_id, b.lot_id)
  from bids b where b.lot_id = p_lot order by b.created_at desc, b.id desc limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.bid_history(bigint, int) to anon, authenticated, service_role;

-- The seller's view of bids on their own vehicle: amounts and times, names blurred.
create or replace function public.seller_lot_bids(p_lot bigint)
returns table (amount numeric, created_at timestamptz, bidder_mask text, is_auto boolean)
language sql stable security definer set search_path = public as $$
  select b.amount, b.created_at, bidder_mask(b.bidder_id, b.lot_id), b.is_auto
  from bids b join lots l on l.id = b.lot_id
  where b.lot_id = p_lot and (l.seller_id = auth.uid() or is_admin())
  order by b.created_at desc, b.id desc limit 200;
$$;
revoke execute on function public.seller_lot_bids(bigint) from public, anon;
grant execute on function public.seller_lot_bids(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Consultants. Every listing shows a named consultant buyers can call or email.
-- ---------------------------------------------------------------------------
create table if not exists public.consultants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default 'Vehicle consultant',
  phone text,
  email text,
  photo_path text,
  is_default boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists consultants_one_default on public.consultants (is_default) where is_default;
alter table public.consultants enable row level security;
drop policy if exists consultants_read on public.consultants;
create policy consultants_read on public.consultants for select using (active or (select public.is_admin()));
drop policy if exists consultants_admin on public.consultants;
create policy consultants_admin on public.consultants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.lots add column if not exists consultant_id uuid references public.consultants(id) on delete set null;
create index if not exists lots_consultant on public.lots (consultant_id) where consultant_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Partners: car finance, car insurance and mobile inspections. Leads and clicks are recorded
--    so partners can be billed. Partners stay off (active = false) until an agreement is signed.
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('finance','insurance','inspection')),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  licence text,
  blurb text,
  logo_path text,
  rate_from numeric(5,2),
  comparison_rate numeric(5,2),
  comparison_basis text,
  establishment_fee numeric(10,2),
  monthly_fee numeric(10,2),
  min_amount numeric(12,2),
  max_amount numeric(12,2),
  min_term_months int,
  max_term_months int,
  price_from numeric(10,2),
  turnaround text,
  features jsonb not null default '{}'::jsonb,
  pds_url text,
  tmd_url text,
  privacy_url text,
  referral_url text,
  accepts_leads boolean not null default true,
  commission_note text,
  sponsored boolean not null default false,
  sample boolean not null default false,
  sort int not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Credit law: an advertised rate needs a comparison rate, and a comparison rate needs its example.
  constraint partners_finance_rates check (kind <> 'finance' or rate_from is null or comparison_rate is not null),
  constraint partners_comparison_basis check (comparison_rate is null or nullif(trim(comparison_basis), '') is not null)
);
create index if not exists partners_kind on public.partners (kind, sort) where active;
alter table public.partners enable row level security;
drop policy if exists partners_read on public.partners;
create policy partners_read on public.partners for select using (active or (select public.is_admin()));
drop policy if exists partners_admin on public.partners;
create policy partners_admin on public.partners for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Where leads go, and anything else that isn't for the public.
create table if not exists public.partner_private (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  lead_email text,
  contact_name text,
  notes text
);
alter table public.partner_private enable row level security;
drop policy if exists partner_private_admin on public.partner_private;
create policy partner_private_admin on public.partner_private for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create sequence if not exists public.lead_seq start 70001;
create table if not exists public.partner_leads (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('LD-' || nextval('public.lead_seq')),
  partner_id uuid not null references public.partners(id) on delete restrict,
  kind text not null check (kind in ('finance','insurance','inspection')),
  lot_id bigint references public.lots(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  phone text not null,
  postcode text,
  details jsonb not null default '{}'::jsonb,
  consent_text text not null,
  consent_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','sent','contacted','booked','completed','converted','lost','withdrawn')),
  sent_at timestamptz,
  price numeric(10,2),
  revenue numeric(10,2),
  report_url text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_leads_partner on public.partner_leads (partner_id, created_at desc);
create index if not exists partner_leads_status on public.partner_leads (status, created_at desc);
create index if not exists partner_leads_kind on public.partner_leads (kind, created_at desc);
create index if not exists partner_leads_user on public.partner_leads (user_id) where user_id is not null;
create index if not exists partner_leads_lot on public.partner_leads (lot_id) where lot_id is not null;
create index if not exists partner_leads_recent on public.partner_leads (lower(email), partner_id, created_at desc);
alter table public.partner_leads enable row level security;
drop policy if exists partner_leads_own on public.partner_leads;
drop policy if exists partner_leads_admin on public.partner_leads;
create policy partner_leads_admin on public.partner_leads for select to authenticated using ((select public.is_admin()));
-- Leads are created by the server (service role) after validation and rate limits. Members don't
-- read them directly (they hold internal notes and fees).

create table if not exists public.partner_clicks (
  id bigserial primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  lot_id bigint,
  user_id uuid,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists partner_clicks_partner on public.partner_clicks (partner_id, created_at desc);
alter table public.partner_clicks enable row level security; -- server only

-- Partner numbers for the admin revenue page, one row per partner.
create or replace function public.partner_stats(p_since timestamptz)
returns table (partner_id uuid, clicks bigint, leads bigint, converted bigint, revenue numeric)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select count(*) from partner_clicks c where c.partner_id = p.id and c.created_at >= p_since),
    (select count(*) from partner_leads l where l.partner_id = p.id and l.created_at >= p_since),
    (select count(*) from partner_leads l where l.partner_id = p.id and l.created_at >= p_since and l.status in ('converted','completed')),
    (select coalesce(sum(l.revenue), 0) from partner_leads l where l.partner_id = p.id and l.created_at >= p_since)
  from partners p;
$$;
revoke execute on function public.partner_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.partner_stats(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 6. No more in-person inspections. Old bookings stay for the record; nobody can make new ones.
-- ---------------------------------------------------------------------------
drop policy if exists inspections_insert on public.inspections;

-- ---------------------------------------------------------------------------
-- 7. Account deletion also clears the member's leads (finance, insurance and inspection
--    enquiries; our copies) and withdraws videos still waiting for review.
-- ---------------------------------------------------------------------------
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
  update lot_videos set status = 'removed' where submitted_by = p_user and status = 'pending';
  update partner_leads set name = 'Deleted member', email = '', phone = '', postcode = null, details = '{}'::jsonb,
    status = case when status in ('new','sent','contacted','booked') then 'withdrawn' else status end, updated_at = now()
  where user_id = p_user;
  update profiles set
    email = null, first_name = null, last_name = null, dob = null, mobile = null, mobile_verified = false,
    street = null, suburb = null, postcode = null, company_name = null, abn = null,
    payment_method_id = null, card_brand = null, card_last4 = null, id_session_id = null,
    notify = '{}'::jsonb, suspended = true, deleted_at = now()
  where id = p_user;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Settings: finance estimates on listings.
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('finance', '{"show_on_listings": true, "min_price": 3000, "term_months": 60, "deposit_pct": 0}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 9. The seller's go-live message no longer mentions buyer inspections.
-- ---------------------------------------------------------------------------
create or replace function public.notify_seller_live() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    perform queue_seller_notice(new.id, 'Your ' || new.title || ' is live',
      'Bidding is open until ' || to_char(new.ends_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') ||
      ' (Brisbane time). Keep it at the listed address, insured and in the same condition. Buyers don''t visit: if a buyer orders a mobile inspection, we''ll call you to arrange it. Follow the bids and add a video from your seller dashboard.',
      '/sell/dashboard', 'live:' || new.id);
  end if;
  return null;
end $$;
