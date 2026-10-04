-- Tyrebiter: registration on every listing, one video inside 10 photos and videos,
-- plate lookups for the sell form, and the transfer of ownership between payment and collection.
-- Run after 20261003000008_media_partners.sql.

-- ---------------------------------------------------------------------------
-- 1. Registered or unregistered: required on every listing (like Grays).
-- ---------------------------------------------------------------------------
alter table public.lots
  add column if not exists registration text check (registration in ('registered','unregistered')),
  add column if not exists engine_no text;
update public.lots set registration = case
    when coalesce(rego_plate, '') <> '' and (rego_expiry is null or rego_expiry >= current_date) then 'registered'
    else 'unregistered' end
  where registration is null;
create index if not exists lots_live_rego on public.lots (registration) where status = 'live';

-- Publishing needs it: registered vehicles also need the plate, state and a current expiry date.
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
        if new.registration is null then
          raise exception 'not_ready:say whether the vehicle is registered or unregistered';
        end if;
        if new.registration = 'registered' and (coalesce(new.rego_plate, '') = '' or new.rego_state is null or new.rego_expiry is null) then
          raise exception 'not_ready:add the rego plate, state and expiry date';
        end if;
        if new.registration = 'registered' and new.rego_expiry < current_date then
          raise exception 'not_ready:the registration has expired. Renew it, or list the vehicle as unregistered';
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

-- Search filter "rego" (registered / unregistered), and saved-search alerts for it.
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
    if upper(f->>'lic') in ('C','LR','MR','HR','HC','MC') then
      w := array_append(w, $s$array_position(array['C','LR','MR','HR','HC','MC'], l.licence_class) <= array_position(array['C','LR','MR','HR','HC','MC'], upper($1->>'lic'))$s$::text);
    end if;
    if f->>'lams' = '1' then w := array_append(w, 'l.lams'::text); end if;
    if f->>'nores' = '1' then w := array_append(w, '(not l.has_reserve or l.reserve_met)'::text); end if;
    if f->>'buynow' = '1' then w := array_append(w, '(l.buy_now_price is not null and l.current_bid < l.buy_now_price)'::text); end if;
    if f->>'rego' in ('registered','unregistered') then w := array_append(w, $s$l.registration = ($1->>'rego')$s$::text); end if;
    if f->>'seller' = 'private' then w := array_append(w, $s$l.gst_status = 'private'$s$::text); end if;
    if f->>'seller' = 'business' then w := array_append(w, $s$l.gst_status = 'inc'$s$::text); end if;
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
        and (s.query->>'seller' is null or (s.query->>'seller' = 'private' and l.gst_status = 'private') or (s.query->>'seller' = 'business' and l.gst_status = 'inc'))
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
-- 2. Up to 10 photos and videos per listing, at most one of them a video.
-- ---------------------------------------------------------------------------
create or replace function public.lot_media_count(p_lot bigint) returns int
language sql stable security definer set search_path = public as $$
  select ((select count(*) from lot_photos where lot_id = p_lot)
        + (select count(*) from lot_videos where lot_id = p_lot and status in ('pending','approved')))::int
$$;
grant execute on function public.lot_media_count(bigint) to authenticated, service_role;

create or replace function public.lot_photo_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('lot-media:' || new.lot_id));
  if lot_media_count(new.lot_id) >= 10 then
    raise exception 'media_limit:A listing can have 10 photos and videos in total. Remove one first.';
  end if;
  return new;
end $$;
drop trigger if exists lot_photo_limit on public.lot_photos;
create trigger lot_photo_limit before insert on public.lot_photos for each row execute function public.lot_photo_limit();

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
  -- One video per listing, inside the listing's 10 photos and videos.
  perform pg_advisory_xact_lock(hashtext('lot-media:' || p_lot));
  if exists (select 1 from lot_videos where lot_id = p_lot and status in ('pending','approved')) then
    raise exception 'A listing can have one video. Remove the current one first.';
  end if;
  if lot_media_count(p_lot) >= 10 then
    raise exception 'A listing can have 10 photos and videos in total. Remove a photo first.';
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

-- ---------------------------------------------------------------------------
-- 3. Plate lookups for the sell form (paid per lookup, so results are kept for 90 days
--    and reused). Server only: the full VIN never goes to the browser.
-- ---------------------------------------------------------------------------
create table if not exists public.rego_lookups (
  id uuid primary key default gen_random_uuid(),
  plate text,
  state text,
  vin text,
  provider text not null,
  found boolean not null,
  vehicle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rego_lookups_plate on public.rego_lookups (plate, state, created_at desc) where plate is not null;
create index if not exists rego_lookups_vin on public.rego_lookups (vin, created_at desc) where vin is not null;
create index if not exists rego_lookups_created on public.rego_lookups (created_at);
alter table public.rego_lookups enable row level security;

create or replace function public.prune_rego_lookups() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from rego_lookups where created_at < now() - interval '90 days'
    and not exists (select 1 from appraisals a where a.lookup_id = rego_lookups.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.prune_rego_lookups() from public, anon, authenticated;
grant execute on function public.prune_rego_lookups() to service_role;

-- Appraisal requests now carry what the lookup found and what the seller told us.
alter table public.appraisals alter column rego drop not null;
alter table public.appraisals
  add column if not exists registration text check (registration in ('registered','unregistered')),
  add column if not exists vin text,
  add column if not exists vehicle jsonb not null default '{}'::jsonb,
  add column if not exists lookup_id uuid references public.rego_lookups(id) on delete set null,
  add column if not exists description text;

-- ---------------------------------------------------------------------------
-- 4. Transfer of ownership: after payment in full and before collection.
--    Registered: the seller lodges their part, the buyer transfers the registration
--    into their name and uploads the confirmation, we check it.
--    Unregistered: the buyer confirms the certificate of sale and how they'll move it.
--    Collection can only be booked (and the address released) once this is complete.
-- ---------------------------------------------------------------------------
create table if not exists public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  lot_id bigint not null references public.lots(id),
  buyer_id uuid not null references public.profiles(id),
  registration text not null check (registration in ('registered','unregistered')),
  rego_state text,
  status text not null default 'waiting' check (status in ('waiting','submitted','complete')),
  buyer_choice text check (buyer_choice in ('transfer','unregistered')),
  transport text check (transport in ('drive','carrier','trailer','permit')),
  reference text,
  proof_paths text[] not null default '{}',
  submitted_at timestamptz,
  seller_done_at timestamptz,
  seller_reference text,
  review_note text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ownership_transfers_open on public.ownership_transfers (status, created_at) where status <> 'complete';
create index if not exists ownership_transfers_buyer on public.ownership_transfers (buyer_id);
create index if not exists ownership_transfers_lot on public.ownership_transfers (lot_id);
alter table public.ownership_transfers enable row level security;
drop policy if exists ownership_transfers_read on public.ownership_transfers;
create policy ownership_transfers_read on public.ownership_transfers for select to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_admin()));

-- Proof of transfer and permits (private; read through short-lived signed links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transfer-docs', 'transfer-docs', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

-- Paid in full: start the transfer and tell both sides what happens next.
create or replace function public.start_ownership_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record; v_reg text; n int;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select title, registration, rego_plate, rego_state, state into l from lots where id = new.lot_id;
    v_reg := coalesce(l.registration, case when coalesce(l.rego_plate, '') <> '' then 'registered' else 'unregistered' end);
    insert into ownership_transfers (invoice_id, lot_id, buyer_id, registration, rego_state)
      values (new.id, new.lot_id, new.buyer_id, v_reg, coalesce(l.rego_state, l.state))
      on conflict (invoice_id) do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      perform queue_notice(new.buyer_id, 'account', 'Paid in full. Next: transfer of ownership',
        case when v_reg = 'registered'
          then 'Before you collect the ' || l.title || ', the registration is transferred into your name. Your invoice has the steps for ' || coalesce(l.rego_state, l.state) || '.'
          else 'The ' || l.title || ' is sold unregistered. Confirm the certificate of sale and how you''ll move it, then book your collection.' end,
        '/account/invoices/' || new.id, 'transfer-start:' || new.id);
      if v_reg = 'registered' then
        perform queue_seller_notice(new.lot_id, 'Paid in full. Next: the registration transfer',
          'The buyer has paid for the ' || l.title || '. Lodge your part of the registration transfer in ' || coalesce(l.rego_state, l.state) ||
          '. The steps are in your seller dashboard, and your consultant will call you.', '/sell/dashboard', 'transfer-seller:' || new.id);
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists start_ownership_transfer on public.invoices;
create trigger start_ownership_transfer after insert or update of status on public.invoices
  for each row execute function public.start_ownership_transfer();

-- Ownership done: the collection window starts now, and the buyer is told to book a time.
create or replace function public.transfer_completed(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.ownership_transfers%rowtype; v_title text;
begin
  select * into t from ownership_transfers where id = p_id;
  if not found then return; end if;
  update invoices set collect_by = greatest(coalesce(collect_by, now()), business_days_from(now(), setting_num('auction','collection_days')::int))
    where id = t.invoice_id;
  select title into v_title from lots where id = t.lot_id;
  perform queue_notice(t.buyer_id, 'account', 'Ownership done. Book your collection',
    'Pick a time to collect the ' || v_title || '. We confirm it with the seller, then send you the address and your release code.',
    '/account/invoices/' || t.invoice_id, 'transfer-done:' || t.id);
  perform queue_seller_notice(t.lot_id, 'Ownership transferred',
    'The transfer for the ' || v_title || ' is complete. The buyer will now book a collection time; we''ll confirm it with you.',
    '/sell/dashboard', 'transfer-done-seller:' || t.id);
end $$;
revoke execute on function public.transfer_completed(uuid) from public, anon, authenticated;
grant execute on function public.transfer_completed(uuid) to service_role;

-- The buyer's part. Registered: transfer it (proof or receipt number), or take it unregistered
-- (the seller cancels the rego and keeps the plates; we arrange it). Unregistered: how it will be moved.
create or replace function public.transfer_submit(p_invoice uuid, p_choice text, p_transport text, p_reference text, p_proof text[])
returns text language plpgsql security definer set search_path = public as $$
declare t public.ownership_transfers%rowtype; v_status text;
begin
  select * into t from ownership_transfers where invoice_id = p_invoice for update;
  if not found or t.buyer_id is distinct from auth.uid() then raise exception 'not_found'; end if;
  if t.status = 'complete' then raise exception 'already_done'; end if;
  if not exists (select 1 from invoices where id = p_invoice and status = 'paid') then raise exception 'not_paid'; end if;
  p_proof := coalesce(p_proof, '{}');
  if cardinality(p_proof) > 5 or exists (select 1 from unnest(p_proof) x
      where x !~ ('^' || p_invoice::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|pdf)$')) then
    raise exception 'bad_files';
  end if;
  if t.registration = 'unregistered' then p_choice := 'unregistered'; end if;
  if p_choice is null or p_choice not in ('transfer','unregistered') then raise exception 'choose'; end if;
  if p_choice = 'transfer' then
    if cardinality(p_proof) = 0 and coalesce(trim(p_reference), '') = '' then raise exception 'proof_needed'; end if;
    p_transport := 'drive';
  elsif coalesce(p_transport, '') not in ('carrier','trailer','permit') then
    raise exception 'transport_needed';
  end if;
  v_status := case when t.registration = 'unregistered' then 'complete' else 'submitted' end;
  update ownership_transfers set buyer_choice = p_choice, transport = p_transport,
    reference = left(nullif(trim(coalesce(p_reference, '')), ''), 60), proof_paths = p_proof,
    submitted_at = now(), status = v_status, review_note = null,
    completed_at = case when v_status = 'complete' then now() end
  where id = t.id;
  if v_status = 'complete' then perform transfer_completed(t.id); end if;
  return v_status;
end $$;
revoke execute on function public.transfer_submit(uuid, text, text, text, text[]) from public, anon;
grant execute on function public.transfer_submit(uuid, text, text, text, text[]) to authenticated, service_role;

-- The seller's part (notice of disposal / starting the transfer), from their dashboard or by staff.
create or replace function public.transfer_seller_done(p_lot bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from lots where id = p_lot and seller_id = auth.uid()) and not is_admin() then raise exception 'forbidden'; end if;
  select t.id into v_id from ownership_transfers t join invoices i on i.id = t.invoice_id
    where t.lot_id = p_lot and i.status = 'paid' and t.registration = 'registered' order by t.created_at desc limit 1;
  if v_id is null then raise exception 'not_found'; end if;
  update ownership_transfers set seller_done_at = coalesce(seller_done_at, now()),
    seller_reference = coalesce(left(nullif(trim(coalesce(p_reference, '')), ''), 60), seller_reference)
  where id = v_id;
end $$;
revoke execute on function public.transfer_seller_done(bigint, text) from public, anon;
grant execute on function public.transfer_seller_done(bigint, text) to authenticated, service_role;

-- Staff: accept the proof (or complete it after sorting it out by phone), or send it back with a note.
create or replace function public.admin_transfer_review(p_id uuid, p_ok boolean, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare t public.ownership_transfers%rowtype;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select * into t from ownership_transfers where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if t.status = 'complete' then return 'complete'; end if;
  if p_ok then
    update ownership_transfers set status = 'complete', completed_at = now(), completed_by = auth.uid(),
      review_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    perform transfer_completed(p_id);
    return 'complete';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'note_needed'; end if;
  update ownership_transfers set status = 'waiting', review_note = left(trim(p_note), 500) where id = p_id;
  perform queue_notice(t.buyer_id, 'account', 'Transfer of ownership: one more thing', left(trim(p_note), 500),
    '/account/invoices/' || t.invoice_id, 'transfer-back:' || p_id || ':' || floor(extract(epoch from now()))::bigint);
  return 'waiting';
end $$;
revoke execute on function public.admin_transfer_review(uuid, boolean, text) from public, anon;
grant execute on function public.admin_transfer_review(uuid, boolean, text) to authenticated, service_role;

-- What the seller sees: the state of the transfer, never the buyer's documents.
create or replace function public.seller_lot_transfer(p_lot bigint)
returns table (registration text, rego_state text, status text, buyer_choice text, seller_done_at timestamptz, seller_reference text)
language sql stable security definer set search_path = public as $$
  select t.registration, t.rego_state, t.status, t.buyer_choice, t.seller_done_at, t.seller_reference
  from ownership_transfers t join lots l on l.id = t.lot_id join invoices i on i.id = t.invoice_id
  where t.lot_id = p_lot and (l.seller_id = auth.uid() or is_admin()) and i.status = 'paid'
  order by t.created_at desc limit 1
$$;
revoke execute on function public.seller_lot_transfer(bigint) from public, anon;
grant execute on function public.seller_lot_transfer(bigint) to authenticated, service_role;

-- No collection booking (so no address) until ownership is done.
create or replace function public.collection_needs_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ownership_transfers where invoice_id = new.invoice_id and status = 'complete') then
    raise exception 'transfer_not_done';
  end if;
  return new;
end $$;
drop trigger if exists collection_needs_transfer on public.collections;
create trigger collection_needs_transfer before insert on public.collections
  for each row execute function public.collection_needs_transfer();

-- Sales already paid before this step existed carry on as before.
insert into public.ownership_transfers (invoice_id, lot_id, buyer_id, registration, rego_state, status, completed_at, review_note)
select i.id, i.lot_id, i.buyer_id, coalesce(l.registration, 'unregistered'), coalesce(l.rego_state, l.state), 'complete', now(),
  'Paid before the transfer step was added'
from public.invoices i join public.lots l on l.id = i.lot_id
where i.status = 'paid'
on conflict (invoice_id) do nothing;
