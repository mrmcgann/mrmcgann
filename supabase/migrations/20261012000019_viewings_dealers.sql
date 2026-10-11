-- Seeing the vehicle and trusting the listing: free video walkarounds, in-person viewings strictly by appointment
-- (only when the seller agrees), an "Inspected" badge from a mechanic's inspection before listing (the seller can
-- choose one; the fee comes out of the proceeds), dealer accounts (ABN on tax invoices, pay several invoices with
-- one transfer), Buy Now price-drop alerts, review requests after a sale, and the terms version for all of it.

-- ---------------------------------------------------------------------------
-- 1. Listings: in-person viewings allowed?  Inspected by a mechanic before listing?
-- ---------------------------------------------------------------------------
alter table public.lots add column if not exists in_person_viewing boolean not null default false;
alter table public.lots add column if not exists inspected_at date;
alter table public.lots add column if not exists inspected_by text;
alter table public.lots add column if not exists inspection_summary text;
alter table public.lot_private add column if not exists inspection_report_path text;
alter table public.lot_private add column if not exists pre_inspection_requested boolean not null default false;
create index if not exists lots_inspected on public.lots (inspected_at) where inspected_at is not null and status = 'live';
-- mechanics' reports: private, read through a 5-minute link for signed-in members (they can show the VIN)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('inspection-reports', 'inspection-reports', false, 15728640, array['application/pdf']) on conflict (id) do nothing;

-- the search filter "inspected" (keyword "inspected") and the saved-search alert sweep
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
      and ((s.query->>'inspected') is distinct from '1' or l.inspected_at is not null)
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
-- 2. Viewings: a free video walkaround (a consultant or the seller video-calls the buyer), or an in-person
--    viewing strictly by appointment. The buyer offers up to three times; staff confirm one. The address is only
--    sent once a viewing is confirmed. Members can read their own; every change goes through these functions.
-- ---------------------------------------------------------------------------
create sequence if not exists public.viewing_seq start 70001;
create table if not exists public.viewings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('VW-' || nextval('public.viewing_seq')),
  lot_id bigint not null references public.lots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('video', 'in_person')),
  slots jsonb not null default '[]'::jsonb,       -- [{"day": "2026-10-14", "part": "morning"}], up to 3
  note text,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'done', 'no_show', 'cancelled', 'declined')),
  starts_at timestamptz,
  host text check (host in ('consultant', 'seller')),
  staff_note text,
  reminded_at timestamptz,
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists viewings_lot on public.viewings (lot_id, status);
create index if not exists viewings_user on public.viewings (user_id, created_at desc);
create index if not exists viewings_open on public.viewings (created_at) where status in ('requested', 'confirmed');
create index if not exists viewings_due on public.viewings (starts_at) where status = 'confirmed' and reminded_at is null;
alter table public.viewings enable row level security;
drop policy if exists viewings_read on public.viewings;
create policy viewings_read on public.viewings for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete on public.viewings from anon, authenticated;

create or replace function public.viewing_part_label(p text) returns text language sql immutable as $$
  select case p when 'morning' then 'morning (8am to 12pm)' when 'afternoon' then 'afternoon (12pm to 4pm)' when 'evening' then 'evening (4pm to 7pm)' else p end
$$;

create or replace function public.request_viewing(p_lot bigint, p_kind text, p_slots jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := (select auth.uid()); p record; l record; v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_last date; s jsonb; v_slots jsonb := '[]'::jsonb; v_id uuid; v_ref text; v_admins uuid[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select id, suspended, mobile_verified, first_name, last_name into p from profiles where id = v_uid;
  if p.suspended then raise exception 'account_suspended'; end if;
  if not coalesce(p.mobile_verified, false) then raise exception 'viewing_needs_mobile'; end if;
  if p_kind not in ('video', 'in_person') then raise exception 'viewing_kind'; end if;
  select id, title, status, ends_at, seller_id, in_person_viewing, suburb, state into l from lots where id = p_lot;
  if not found or l.status not in ('live', 'scheduled', 'offers', 'referred') then raise exception 'viewing_closed'; end if;
  if l.seller_id = v_uid then raise exception 'viewing_own_vehicle'; end if;
  if p_kind = 'in_person' then
    if not l.in_person_viewing then raise exception 'viewing_in_person_off'; end if;
    if not can_bid(v_uid) then raise exception 'viewing_needs_id'; end if;
  end if;
  -- offered times: 1 to 3, from tomorrow, no more than 14 days out and not after bidding closes
  v_last := least(v_today + 14, case when l.status in ('live', 'scheduled') then (l.ends_at at time zone 'Australia/Brisbane')::date else v_today + 14 end);
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) not between 1 and 3 then raise exception 'viewing_times'; end if;
  for s in select * from jsonb_array_elements(p_slots) loop
    if s->>'part' not in ('morning', 'afternoon', 'evening') or (s->>'day') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'viewing_times'; end if;
    if (s->>'day')::date < v_today + 1 or (s->>'day')::date > v_last then raise exception 'viewing_times_range'; end if;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object('day', s->>'day', 'part', s->>'part'));
  end loop;
  -- one open request per vehicle and kind, five open across the site, ten requests a day
  perform pg_advisory_xact_lock(hashtext('viewing:' || v_uid::text));
  if exists (select 1 from viewings where user_id = v_uid and lot_id = p_lot and kind = p_kind and status in ('requested', 'confirmed')) then
    raise exception 'viewing_already';
  end if;
  if (select count(*) from viewings where user_id = v_uid and status in ('requested', 'confirmed')) >= 5 then raise exception 'viewing_too_many'; end if;
  if (select count(*) from viewings where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then raise exception 'viewing_too_many'; end if;
  insert into viewings (lot_id, user_id, kind, slots, note) values (p_lot, v_uid, p_kind, v_slots, left(nullif(trim(p_note), ''), 500))
    returning id, ref into v_id, v_ref;
  select array_agg(id) into v_admins from profiles where role = 'admin';
  if v_admins is not null then
    perform queue_notice_many(v_admins, 'staff',
      case when p_kind = 'video' then 'Video walkaround request ' else 'In-person viewing request ' end || v_ref,
      coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' would like ' || case when p_kind = 'video' then 'a video walkaround' else 'to view in person' end
        || ' of ' || l.title || ' (' || l.suburb || ', ' || l.state || '). Confirm a time in Admin → Viewings.',
      '/admin/viewings', 'viewing-new:' || v_id);
  end if;
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;
revoke execute on function public.request_viewing(bigint, text, jsonb, text) from public, anon;
grant execute on function public.request_viewing(bigint, text, jsonb, text) to authenticated, service_role;

create or replace function public.cancel_viewing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select w.*, l.title into v from viewings w join lots l on l.id = w.lot_id where w.id = p_id and w.user_id = (select auth.uid()) for update of w;
  if not found then raise exception 'viewing_not_found'; end if;
  if v.status not in ('requested', 'confirmed') then return; end if;
  update viewings set status = 'cancelled', status_at = now() where id = p_id;
  if v.status = 'confirmed' and v.kind = 'in_person' and v.host = 'seller' then
    perform queue_seller_notice(v.lot_id, 'Viewing cancelled: ' || v.title,
      'The buyer cancelled the viewing for ' || to_char(v.starts_at at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') || '. Nobody will come.',
      '/sell/dashboard', 'viewing-cancel:' || p_id);
  end if;
end $$;
revoke execute on function public.cancel_viewing(uuid) from public, anon;
grant execute on function public.cancel_viewing(uuid) to authenticated, service_role;

-- Staff: confirm a time (and who hosts), decline, or mark it done / no-show. Tells the buyer (and the seller when
-- they're hosting an in-person viewing). The address goes to the buyer only for a confirmed in-person viewing.
create or replace function public.admin_viewing(p_id uuid, p_action text, p_starts timestamptz default null, p_host text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v record; v_when text; v_addr text; v_ph text;
begin
  if not is_admin() and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  select w.*, l.title, l.suburb, l.state, l.status lot_status into v from viewings w join lots l on l.id = w.lot_id where w.id = p_id for update of w;
  if not found then raise exception 'viewing_not_found'; end if;
  if p_action = 'confirm' then
    if v.status not in ('requested', 'confirmed') then raise exception 'viewing_not_open'; end if;
    if p_starts is null or p_starts < now() then raise exception 'viewing_time'; end if;
    if p_host not in ('consultant', 'seller') then raise exception 'viewing_host'; end if;
    update viewings set status = 'confirmed', starts_at = p_starts, host = p_host, staff_note = coalesce(left(p_note, 500), staff_note), reminded_at = null, status_at = now() where id = p_id;
    v_when := to_char(p_starts at time zone 'Australia/Brisbane', 'FMDay FMDD FMMonth, FMHH12:MI am') || ' (Brisbane time)';
    select seller_address into v_addr from lot_private where lot_id = v.lot_id;
    select mobile into v_ph from profiles where id = v.user_id;
    if v.kind = 'video' then
      perform queue_notice(v.user_id, 'account', 'Video walkaround booked: ' || v.title,
        v_when || '. ' || case when p_host = 'seller' then 'The seller' else 'Your Tyrebiter consultant' end
          || ' will video-call you on your verified mobile (WhatsApp or FaceTime, or a phone call if those don''t work). Have your questions ready: ask them to show anything you like, start it up and run it. Reference ' || v.ref || '.'
          || coalesce(' ' || nullif(p_note, ''), ''),
        '/lot/' || v.lot_id, 'viewing-confirm:' || p_id || ':' || extract(epoch from p_starts)::bigint);
      if p_host = 'seller' then
        perform queue_seller_notice(v.lot_id, 'Video walkaround booked: ' || v.title,
          'Please video-call ' || coalesce((select first_name from profiles where id = v.user_id), 'the buyer') || ' on ' || coalesce(v_ph, 'their mobile')
            || ' at ' || v_when || ' (WhatsApp or FaceTime). Show them whatever they ask: start it up, walk around it, look underneath. Keep any talk about price on Tyrebiter.',
          '/sell/dashboard', 'viewing-seller:' || p_id || ':' || extract(epoch from p_starts)::bigint);
      end if;
    else
      perform queue_notice(v.user_id, 'account', 'Viewing booked: ' || v.title,
        v_when || ' at ' || coalesce(v_addr, v.suburb || ', ' || v.state) || '. '
          || case when p_host = 'seller' then 'The seller will meet you.' else 'Your Tyrebiter consultant will meet you.' end
          || ' Bring photo ID. Viewing only: no test drives. Please don''t share this address. If you can''t make it, cancel from the listing so nobody waits. Reference ' || v.ref || '.'
          || coalesce(' ' || nullif(p_note, ''), ''),
        '/lot/' || v.lot_id, 'viewing-confirm:' || p_id || ':' || extract(epoch from p_starts)::bigint);
      if p_host = 'seller' then
        perform queue_seller_notice(v.lot_id, 'Viewing booked: ' || v.title,
          'A verified buyer will come to view it on ' || v_when || '. Viewing only: no test drives, and they don''t need the keys for longer than starting it. They''ll show photo ID. Can''t do that time? Call us straight away.',
          '/sell/dashboard', 'viewing-seller:' || p_id || ':' || extract(epoch from p_starts)::bigint);
      end if;
    end if;
  elsif p_action = 'decline' then
    if v.status not in ('requested', 'confirmed') then return; end if;
    update viewings set status = 'declined', staff_note = left(p_note, 500), status_at = now() where id = p_id;
    perform queue_notice(v.user_id, 'account', 'We couldn''t book your ' || case when v.kind = 'video' then 'video walkaround' else 'viewing' end,
      'For ' || v.title || ': ' || coalesce(nullif(p_note, ''), 'none of the times worked.') || ' You can ask for other times on the listing, or order a mechanical inspection.',
      '/lot/' || v.lot_id, 'viewing-decline:' || p_id);
  elsif p_action in ('done', 'no_show') then
    if v.status <> 'confirmed' then raise exception 'viewing_not_confirmed'; end if;
    update viewings set status = p_action, staff_note = coalesce(left(p_note, 500), staff_note), status_at = now() where id = p_id;
  else
    raise exception 'viewing_action';
  end if;
end $$;
revoke execute on function public.admin_viewing(uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_viewing(uuid, text, timestamptz, text, text) to authenticated, service_role;

-- The clock: a reminder about an hour before, and open requests cancelled when the vehicle stops being for sale.
create or replace function public.viewing_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v record; n int := 0;
begin
  for v in select w.*, l.title from viewings w join lots l on l.id = w.lot_id
           where w.status = 'confirmed' and w.reminded_at is null and w.starts_at between now() and now() + interval '75 minutes'
           order by w.starts_at limit 200 for update of w skip locked loop
    update viewings set reminded_at = now() where id = v.id;
    perform queue_notice(v.user_id, 'account', 'Soon: your ' || case when v.kind = 'video' then 'video walkaround' else 'viewing' end || ' of ' || v.title,
      'At ' || to_char(v.starts_at at time zone 'Australia/Brisbane', 'FMHH12:MI am') || ' (Brisbane time)' || case when v.kind = 'video' then '. Keep your phone handy.' else '. Bring photo ID.' end
        || ' Can''t make it? Cancel from the listing.', '/lot/' || v.lot_id, 'viewing-remind:' || v.id);
    if v.kind = 'in_person' and v.host = 'seller' then
      perform queue_seller_notice(v.lot_id, 'Viewing soon: ' || v.title,
        'A verified buyer is coming at ' || to_char(v.starts_at at time zone 'Australia/Brisbane', 'FMHH12:MI am') || '. Viewing only, no test drives.',
        '/sell/dashboard', 'viewing-remind-seller:' || v.id);
    end if;
    n := n + 1;
  end loop;
  with gone as (
    update viewings w set status = 'cancelled', staff_note = 'The vehicle is no longer for sale', status_at = now()
    from lots l where l.id = w.lot_id and w.status in ('requested', 'confirmed')
      and l.status not in ('live', 'scheduled', 'offers', 'referred')
    returning w.id, w.user_id, w.lot_id, l.title
  )
  select n + count(*) into n from gone;
  return n;
end $$;
revoke execute on function public.viewing_sweep() from public, anon, authenticated;
grant execute on function public.viewing_sweep() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Dealer accounts: the business name and ABN (profiles.company_name / abn, which any member can add for tax
--    invoices) checked by us; dealers can pay several invoices with one transfer
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists dealer_status text not null default 'none';
alter table public.profiles drop constraint if exists profiles_dealer_status_check;
alter table public.profiles add constraint profiles_dealer_status_check check (dealer_status in ('none', 'pending', 'approved', 'declined'));
alter table public.profiles add column if not exists gst_registered boolean not null default false;
alter table public.profiles add column if not exists dealer_licence text;
alter table public.profiles add column if not exists dealer_applied_at timestamptz;
alter table public.profiles add column if not exists dealer_note text;
create index if not exists profiles_dealer_pending on public.profiles (dealer_applied_at) where dealer_status = 'pending';

-- members can't set their own dealer details (they apply through the website, staff approve)
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
      or new.terms_version is distinct from old.terms_version
      or new.dealer_status is distinct from old.dealer_status
      or new.gst_registered is distinct from old.gst_registered
      or new.dealer_licence is distinct from old.dealer_licence then
      raise exception 'protected_field';
    end if;
    if old.id_status = 'verified' and (new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name or new.dob is distinct from old.dob) then
      new.id_status := 'none';
    end if;
    if new.mobile is distinct from old.mobile then
      new.mobile_verified := false;
    end if;
    -- an approved dealer who changes their business name or ABN is checked again
    if old.dealer_status = 'approved' and (new.company_name is distinct from old.company_name or new.abn is distinct from old.abn) then
      new.dealer_status := 'pending';
    end if;
  end if;
  return new;
end $$;

alter table public.invoices add column if not exists buyer_business jsonb;
create or replace function public.invoice_buyer_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.buyer_business is null then
    -- the business details at the time of sale, so a later change doesn't rewrite an old tax invoice
    select jsonb_build_object('name', company_name, 'abn', abn, 'gst', gst_registered, 'dealer', dealer_status = 'approved') into new.buyer_business
      from profiles where id = new.buyer_id and abn is not null;
  end if;
  return new;
end $$;
drop trigger if exists invoice_buyer_business on public.invoices;
create trigger invoice_buyer_business before insert on public.invoices for each row execute function public.invoice_buyer_business();
revoke execute on function public.invoice_buyer_business() from public, anon, authenticated;

create or replace function public.admin_dealer(p_user uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'forbidden'; end if;
  update profiles set dealer_status = case when p_approve then 'approved' else 'declined' end, dealer_note = left(p_note, 500) where id = p_user and dealer_status <> 'none';
  if not found then raise exception 'dealer_not_found'; end if;
  perform queue_notice(p_user, 'account', case when p_approve then 'Your dealer account is approved' else 'Your dealer account application' end,
    case when p_approve then 'You can now pay for several vehicles with one transfer, and your business name and ABN are on every tax invoice.'
      else coalesce(nullif(p_note, ''), 'We couldn''t approve it.') || ' Reply to this message or call us if something''s changed.' end,
    '/account/dealer', 'dealer:' || p_user || ':' || extract(epoch from now())::bigint);
end $$;
revoke execute on function public.admin_dealer(uuid, boolean, text) from public, anon;
grant execute on function public.admin_dealer(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Inspection before listing (the seller's choice): the fee comes out of the proceeds when it sells
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('selling', '{}'::jsonb) on conflict (key) do nothing;
update public.settings set value = value || '{"pre_inspection_fee": 220}'::jsonb where key = 'selling' and not (value ? 'pre_inspection_fee');

create or replace function public.on_invoice_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.lots%rowtype; pr public.lot_private%rowtype; v_fee numeric; v_rate numeric; v_min numeric; v_signed jsonb; v_extra numeric;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select * into l from lots where id = new.lot_id;
    select * into pr from lot_private where lot_id = new.lot_id;
    select fees into v_signed from seller_agreements where lot_id = new.lot_id and status = 'signed' order by signed_at desc nulls last limit 1;
    v_rate := coalesce((v_signed->>'seller_fee_rate')::numeric, setting_num('fees','seller_fee_rate'), 0);
    v_min := coalesce((v_signed->>'seller_fee_min')::numeric, setting_num('fees','seller_fee_min'), 0);
    v_fee := greatest(v_min, round(new.price * v_rate, 2));
    -- the inspection before listing, if the seller chose it (GST included), comes out of the proceeds
    v_extra := greatest(coalesce((v_signed->>'pre_inspection_fee')::numeric, 0), 0);
    insert into seller_payouts (lot_id, invoice_id, seller_id, sale_price, seller_fee, fee_gst, lender_payout, lender_name, lender_ref, net_amount, status, hold_reason, other_deductions, deductions_note)
    select new.lot_id, new.id, l.seller_id, new.price, v_fee, round(v_fee * 0.10, 2), coalesce(pr.finance_owing, 0), pr.lender_name, pr.lender_ref, x.net,
      case when x.net < 0 then 'on_hold' else 'pending' end,
      case when x.net < 0 then 'Finance owing is more than the sale price: the seller must pay the lender the shortfall before we settle' end,
      v_extra, case when v_extra > 0 then 'Inspection before listing' end
    from (select new.price - v_fee - round(v_fee * 0.10, 2) - coalesce(pr.finance_owing, 0) - v_extra as net) x
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Buy Now price drops: everyone watching hears straight away (alert kind 'price_drop')
-- ---------------------------------------------------------------------------
create or replace function public.lot_price_drop() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_users uuid[]; v_all numeric;
begin
  if new.status = 'live' and old.buy_now_price is not null and new.buy_now_price is not null
     and new.buy_now_price < old.buy_now_price and new.current_bid < new.buy_now_price then
    select array_agg(user_id) into v_users from watchlist where lot_id = new.id;
    if v_users is not null then
      v_all := (lot_price_breakdown(new.id, new.buy_now_price)->>'total')::numeric;
      perform queue_notice_many(v_users, 'price_drop', 'Price drop: ' || new.title,
        'Buy Now is down to $' || to_char(new.buy_now_price, 'FM999,999,990') || ' ($' || to_char(v_all, 'FM999,999,990.00') || ' all-in with fees), from $'
          || to_char(old.buy_now_price, 'FM999,999,990') || '.',
        '/lot/' || new.id, 'pricedrop:' || new.id || ':' || new.buy_now_price::bigint);
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.lot_price_drop() from public, anon, authenticated;
drop trigger if exists lot_price_drop on public.lots;
create trigger lot_price_drop after update of buy_now_price on public.lots for each row execute function public.lot_price_drop();

-- ---------------------------------------------------------------------------
-- 6. Reviews: after collection (buyer) and after the payout (seller), everyone is asked, happy or not
--    (settings business.review_url; nothing is sent until it's set)
-- ---------------------------------------------------------------------------
create or replace function public.ask_for_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text := nullif(trim((select value->>'review_url' from settings where key = 'business')), ''); v_title text;
begin
  if v_url is null then return null; end if;
  if tg_table_name = 'invoices' and new.collected_at is not null and old.collected_at is null then
    select title into v_title from lots where id = new.lot_id;
    perform queue_notice(new.buyer_id, 'review', 'How did it go?',
      'Thanks for buying the ' || coalesce(v_title, 'vehicle') || ' through Tyrebiter. Would you tell other buyers how it went, good or bad? It takes a minute: ' || v_url,
      '/account', 'review:buyer:' || new.id);
  elsif tg_table_name = 'seller_payouts' and new.paid_at is not null and old.paid_at is null and new.kind = 'sale' and new.seller_id is not null then
    perform queue_notice(new.seller_id, 'review', 'How did we do?',
      'Your payout is on its way. Would you tell other sellers how selling with Tyrebiter went, good or bad? It takes a minute: ' || v_url,
      '/sell/dashboard', 'review:seller:' || new.id);
  end if;
  return null;
end $$;
revoke execute on function public.ask_for_review() from public, anon, authenticated;
drop trigger if exists ask_for_review on public.invoices;
create trigger ask_for_review after update of collected_at on public.invoices for each row execute function public.ask_for_review();
drop trigger if exists ask_for_review on public.seller_payouts;
create trigger ask_for_review after update of paid_at on public.seller_payouts for each row execute function public.ask_for_review();

-- ---------------------------------------------------------------------------
-- 7. Admin log and privileged functions (see 018): new tables staff edit, and nothing new open to the public
-- ---------------------------------------------------------------------------
drop trigger if exists zz_audit_admin on public.viewings;
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

-- ---------------------------------------------------------------------------
-- 8. New terms (viewings by appointment, the inspection service, dealer accounts): members re-accept before bidding
-- ---------------------------------------------------------------------------
update public.settings set value = value || '{"buyer_version": "2026-10-12"}'::jsonb
  where key = 'terms' and value->>'buyer_version' = '2026-10-11';
