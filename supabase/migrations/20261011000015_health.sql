-- Site health: errors from the website, the server, the clock and the app (grouped, counted, never with
-- personal details), the result of every infrastructure check, a log of every change, the clock's heartbeat,
-- and the fixes handed to Claude Code. Everything here is server only (row-level security on, no policies):
-- the admin pages read it with the service role after checking the admin.

-- ---------------------------------------------------------------------------
-- 1. Errors, grouped by a fingerprint (type + cleaned message + where), with hourly counts
-- ---------------------------------------------------------------------------
create table if not exists public.app_errors (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  source text not null check (source in ('web','server','app','clock')),
  name text,                          -- TypeError, PostgrestError, ...
  message text not null,              -- cleaned: no emails, phone or card numbers, tokens or query strings
  stack text,
  path text,                          -- page or API path (private tokens removed)
  route text,                         -- route pattern, or the clock step
  release text,                       -- the deploy it was last seen on
  first_release text,
  context jsonb not null default '{}'::jsonb, -- the latest sample: device, method, status, digest
  count bigint not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','fixed','ignored')),
  status_at timestamptz,
  status_by uuid references public.profiles(id) on delete set null,
  regressed boolean not null default false,  -- came back after being marked fixed
  diagnosis text,                     -- Claude's latest explanation
  diagnosed_at timestamptz
);
create index if not exists app_errors_open on public.app_errors (last_seen desc) where status = 'open';
create index if not exists app_errors_last on public.app_errors (last_seen desc);
create index if not exists app_errors_first on public.app_errors (first_seen desc);
alter table public.app_errors enable row level security;

create table if not exists public.app_error_hours (
  error_id bigint not null references public.app_errors(id) on delete cascade,
  hour timestamptz not null,
  n int not null default 0,
  primary key (error_id, hour)
);
create index if not exists app_error_hours_hour on public.app_error_hours (hour);
alter table public.app_error_hours enable row level security;

-- Record one error (or a batch of the same one: p_count). Browser and app reports can't flood the table: after
-- 300 different new errors in an hour, the rest are counted in one "too many different errors" row.
create or replace function public.record_error(p_fingerprint text, p_source text, p_name text, p_message text, p_stack text,
  p_path text, p_route text, p_release text, p_context jsonb default '{}'::jsonb, p_count int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_status text; v_new boolean := false; v_reopened boolean := false; v_fp text := left(p_fingerprint, 80);
  v_msg text := left(coalesce(nullif(p_message, ''), 'Unknown error'), 1000); v_n int := greatest(1, least(coalesce(p_count, 1), 100000));
begin
  if p_source not in ('web','server','app','clock') then raise exception 'bad_source'; end if;
  select id, status into v_id, v_status from app_errors where fingerprint = v_fp for update;
  if not found and p_source in ('web','app')
     and (select count(*) from app_errors where first_seen > now() - interval '1 hour' and source in ('web','app')) >= 300 then
    v_fp := 'overflow:' || p_source;
    v_msg := 'Too many different errors in one hour (the rest are counted here)';
    select id, status into v_id, v_status from app_errors where fingerprint = v_fp for update;
  end if;
  if not found then
    insert into app_errors (fingerprint, source, name, message, stack, path, route, release, first_release, context, count)
      values (v_fp, p_source, left(p_name, 120), v_msg, left(p_stack, 4000), left(p_path, 200), left(p_route, 200), left(p_release, 40),
              left(p_release, 40), coalesce(p_context, '{}'::jsonb), v_n)
      on conflict (fingerprint) do update set count = app_errors.count + v_n, last_seen = now()
      returning id, (xmax = 0) into v_id, v_new;
  else
    v_reopened := v_status = 'fixed';
    update app_errors set count = count + v_n, last_seen = now(), message = v_msg,
        -- browser and app reports can be sent by anyone, so their first stack is kept; server and clock ones update
        stack = case when p_source in ('web','app') then coalesce(stack, left(p_stack, 4000)) else coalesce(left(p_stack, 4000), stack) end,
        path = coalesce(left(p_path, 200), path), release = coalesce(left(p_release, 40), release),
        context = coalesce(p_context, context),
        status = case when status = 'fixed' then 'open' else status end,
        status_at = case when status = 'fixed' then now() else status_at end,
        regressed = regressed or status = 'fixed'
      where id = v_id;
  end if;
  insert into app_error_hours (error_id, hour, n) values (v_id, date_trunc('hour', now()), v_n)
    on conflict (error_id, hour) do update set n = app_error_hours.n + v_n;
  return jsonb_build_object('id', v_id, 'new', v_new, 'reopened', v_reopened);
end $$;
revoke execute on function public.record_error(text, text, text, text, text, text, text, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.record_error(text, text, text, text, text, text, text, text, jsonb, int) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Checks: the latest result of each one, and a log of every change of status
-- ---------------------------------------------------------------------------
create table if not exists public.health_checks (
  key text primary key,
  area text not null,
  status text not null check (status in ('ok','warn','fail','off')),
  title text not null,
  detail text,
  fix text,
  action text,                        -- the quick fix offered with it
  value numeric,
  checked_at timestamptz not null default now(),
  since timestamptz not null default now(),   -- when it went into this status
  alerted_at timestamptz              -- when admins were last told it failed
);
alter table public.health_checks enable row level security;

create table if not exists public.health_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  key text not null,
  area text,
  from_status text,
  to_status text not null,
  title text not null,
  detail text
);
create index if not exists health_events_at on public.health_events (at desc);
alter table public.health_events enable row level security;

-- Small markers other parts of the site leave for the checks (last good Stripe webhook, last self-test, ...).
create table if not exists public.health_marks (
  key text primary key,
  at timestamptz not null default now(),
  value jsonb not null default '{}'::jsonb
);
alter table public.health_marks enable row level security;

-- Save a run of checks (every check, every time). Returns the ones whose status changed (the caller sends the
-- alerts); a check that's no longer produced is removed.
create or replace function public.save_health(p_checks jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; o record; v_changes jsonb := '[]'::jsonb;
begin
  for c in select * from jsonb_to_recordset(p_checks) as x(key text, area text, status text, title text, detail text, fix text, action text, value numeric) loop
    select status, alerted_at into o from health_checks where key = c.key for update;
    if not found then
      insert into health_checks (key, area, status, title, detail, fix, action, value)
        values (c.key, c.area, c.status, c.title, c.detail, c.fix, c.action, c.value);
      if c.status in ('warn','fail') then
        insert into health_events (key, area, from_status, to_status, title, detail) values (c.key, c.area, null, c.status, c.title, c.detail);
        v_changes := v_changes || jsonb_build_object('key', c.key, 'area', c.area, 'from', null, 'to', c.status, 'title', c.title, 'detail', c.detail, 'alerted', false);
      end if;
    else
      update health_checks set area = c.area, status = c.status, title = c.title, detail = c.detail, fix = c.fix, action = c.action,
          value = c.value, checked_at = now(), since = case when o.status is distinct from c.status then now() else since end
        where key = c.key;
      if o.status is distinct from c.status then
        insert into health_events (key, area, from_status, to_status, title, detail) values (c.key, c.area, o.status, c.status, c.title, c.detail);
        v_changes := v_changes || jsonb_build_object('key', c.key, 'area', c.area, 'from', o.status, 'to', c.status, 'title', c.title, 'detail', c.detail,
          'alerted', o.alerted_at is not null);
      end if;
    end if;
  end loop;
  delete from health_checks where key not in (select x.key from jsonb_to_recordset(p_checks) as x(key text));
  return v_changes;
end $$;
revoke execute on function public.save_health(jsonb) from public, anon, authenticated;
grant execute on function public.save_health(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The clock's heartbeat: one row per run (written when it starts, finished when it ends)
-- ---------------------------------------------------------------------------
create table if not exists public.clock_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('process','send')),
  started_at timestamptz not null default now(),
  ms int,                             -- null: still running, or it never finished (timed out or crashed)
  ok boolean not null default true,
  failed text[] not null default '{}',
  stats jsonb not null default '{}'::jsonb
);
create index if not exists clock_runs_job on public.clock_runs (job, started_at desc);
alter table public.clock_runs enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Fixes handed to Claude Code (a GitHub issue it works on; a person approves the change)
-- ---------------------------------------------------------------------------
create table if not exists public.fix_requests (
  id bigint generated always as identity primary key,
  error_id bigint references public.app_errors(id) on delete set null,
  check_key text,
  title text not null,
  brief text not null,                -- exactly what was sent
  status text not null default 'sent' check (status in ('sent','working','ready','pr','merged','closed','failed')),
  issue_number int,
  issue_url text,
  branch text,
  pr_number int,
  pr_url text,
  last_update text,                   -- Claude Code's latest comment (shortened)
  last_update_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merged_by uuid references public.profiles(id) on delete set null,
  merged_at timestamptz,
  replied_at timestamptz              -- the admin's last reply (Claude Code's older comments no longer count)
);
create index if not exists fix_requests_open on public.fix_requests (updated_at desc) where status not in ('merged','closed');
create index if not exists fix_requests_error on public.fix_requests (error_id);
alter table public.fix_requests enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Measurements the checks need, in one call (each one bounded by an index)
-- ---------------------------------------------------------------------------
create or replace function public.health_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v jsonb; v_recent numeric; v_base numeric; v_hours numeric;
begin
  select coalesce(sum(h.n), 0) into v_recent from app_error_hours h join app_errors e on e.id = h.error_id
    where h.hour >= date_trunc('hour', now() - interval '1 hour') and e.status <> 'ignored';
  select coalesce(sum(h.n), 0) into v_base from app_error_hours h join app_errors e on e.id = h.error_id
    where h.hour >= date_trunc('hour', now() - interval '25 hours') and h.hour < date_trunc('hour', now() - interval '1 hour') and e.status <> 'ignored';
  v_hours := greatest(1, extract(epoch from now() - date_trunc('hour', now() - interval '1 hour')) / 3600);
  select jsonb_build_object(
    'now', now(),
    'clock', (select coalesce(jsonb_object_agg(job, x), '{}'::jsonb) from (
        select distinct on (job) job, jsonb_build_object('started_at', started_at, 'ms', ms, 'ok', ok, 'failed', failed) x
        from clock_runs where started_at > now() - interval '2 days' order by job, started_at desc) t),
    'clock_last_done', (select max(started_at) from clock_runs where job = 'process' and ms is not null and started_at > now() - interval '2 days'),
    'clock_unfinished', (select count(*) from clock_runs where job = 'process' and ms is null
        and started_at between now() - interval '1 hour' and now() - interval '6 minutes'),
    'clock_failed_hour', (select count(*) from clock_runs where job = 'process' and not ok and started_at > now() - interval '1 hour'),
    'clock_runs_hour', (select count(*) from clock_runs where job = 'process' and started_at > now() - interval '1 hour'),
    'clock_slow_ms', (select max(ms) from clock_runs where job = 'process' and started_at > now() - interval '1 hour'),
    'auctions_overdue', (select count(*) from lots where status = 'live' and ends_at < now() - interval '3 minutes'),
    'auctions_overdue_since', (select min(ends_at) from lots where status = 'live' and ends_at < now() - interval '3 minutes'),
    'offers_overdue', (select count(*) from lots where status = 'offers' and decision_by < now() - interval '15 minutes'),
    'charges_waiting', (select count(*) from invoices where status = 'pending_charge' and created_at < now() - interval '10 minutes'),
    'charges_stuck', (select count(*) from invoices where status = 'charging' and charging_at < now() - interval '20 minutes'),
    'invoices_day', (select count(*) from invoices where created_at > now() - interval '1 day'),
    'invoices_failed_day', (select count(*) from invoices where created_at > now() - interval '1 day' and status = 'payment_failed'),
    'outbox_late', (select count(*) from outbox where status = 'queued' and run_after < now() - interval '10 minutes'
        and (expires_at is null or expires_at > now())),
    'outbox_oldest', (select min(run_after) from outbox where status = 'queued' and (expires_at is null or expires_at > now())),
    'outbox_stuck', (select count(*) from outbox where status = 'sending' and locked_at < now() - interval '15 minutes'),
    'outbox_hour', (select coalesce(jsonb_object_agg(channel, x), '{}'::jsonb) from (
        select channel, jsonb_build_object('sent', count(*) filter (where status = 'sent'), 'failed', count(*) filter (where status = 'failed'),
          'retrying', count(*) filter (where status = 'queued' and attempts > 0),
          'error', (array_agg(last_error order by id desc) filter (where last_error is not null and status in ('failed','queued')))[1]) x
        from outbox where created_at > now() - interval '1 hour' group by channel) t),
    'db_connections', (select count(*) from pg_stat_activity),
    'db_max_connections', current_setting('max_connections')::int,
    'db_long_queries', (select count(*) from pg_stat_activity where state = 'active' and backend_type = 'client backend'
        and pid <> pg_backend_pid() and query_start < now() - interval '2 minutes'),
    'db_longest_s', (select coalesce(max(extract(epoch from now() - query_start))::int, 0) from pg_stat_activity
        where state = 'active' and backend_type = 'client backend' and pid <> pg_backend_pid()),
    'db_idle_tx', (select count(*) from pg_stat_activity where state like 'idle in transaction%' and state_change < now() - interval '5 minutes'),
    'db_bytes', pg_database_size(current_database()),
    'no_rls', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity),
    'open_views', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v','m')
          and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
          and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
    'errors_recent', v_recent,
    'errors_recent_hours', round(v_hours, 2),
    'errors_base_hourly', round(v_base / 24, 2),
    'errors_by_source', (select coalesce(jsonb_object_agg(source, n), '{}'::jsonb) from (
        select e.source, sum(h.n) n from app_error_hours h join app_errors e on e.id = h.error_id
        where h.hour >= date_trunc('hour', now() - interval '1 hour') and e.status <> 'ignored' group by e.source) t),
    'errors_new_hour', (select count(*) from app_errors where first_seen > now() - interval '1 hour' and status <> 'ignored'),
    'errors_open', (select count(*) from app_errors where status = 'open'),
    'errors_regressed', (select count(*) from app_errors where status = 'open' and regressed and status_at > now() - interval '1 day'),
    'jobs', coalesce((select value from settings where key = 'jobs'), '{}'::jsonb),
    'seo_act', (select count(*) from seo_issues where resolved_at is null and severity = 'act'),
    'marks', (select coalesce(jsonb_object_agg(key, jsonb_build_object('at', at, 'value', value)), '{}'::jsonb) from health_marks),
    'settings', coalesce((select value from settings where key = 'health'), '{}'::jsonb),
    'fixes_open', (select count(*) from fix_requests where status not in ('merged','closed'))
  ) into v;
  return v;
end $$;
revoke execute on function public.health_snapshot() from public, anon, authenticated;
grant execute on function public.health_snapshot() to service_role;

-- Errors per hour (all sources, or one error) for the charts.
create or replace function public.error_hours(p_hours int default 48, p_error bigint default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(to_char(hour at time zone 'Australia/Brisbane', 'YYYY-MM-DD"T"HH24'), n), '{}'::jsonb) from (
    select h.hour, sum(h.n) n from app_error_hours h join app_errors e on e.id = h.error_id
    where h.hour >= date_trunc('hour', now()) - make_interval(hours => greatest(1, least(p_hours, 24 * 30)) - 1)
      and (p_error is null or h.error_id = p_error) and (p_error is not null or e.status <> 'ignored')
    group by h.hour) t
$$;
revoke execute on function public.error_hours(int, bigint) from public, anon, authenticated;
grant execute on function public.error_hours(int, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Alerts to admins (email and app always; SMS too when it's urgent and SMS alerts are on)
-- ---------------------------------------------------------------------------
create index if not exists profiles_admins on public.profiles (id) where role = 'admin';

create or replace function public.queue_health_alert(p_title text, p_body text, p_link text, p_dedupe text, p_urgent boolean)
returns int language plpgsql security definer set search_path = public as $$
declare a record; s jsonb; v_sms boolean; n int := 0;
begin
  select value into s from settings where key = 'health';
  if coalesce((s ->> 'alerts')::boolean, true) = false then return 0; end if;
  for a in select id, email, mobile, mobile_verified from profiles where role = 'admin' order by id limit 20 loop
    if exists (select 1 from outbox where dedupe_key in (p_dedupe || ':' || a.id || ':email', p_dedupe || ':' || a.id || ':sms')) then continue; end if;
    v_sms := p_urgent and coalesce((s ->> 'sms')::boolean, true) and a.mobile is not null and a.mobile_verified;
    insert into notifications (user_id, kind, title, body, link, channels)
      values (a.id, 'health', p_title, p_body, p_link, array_remove(array[case when v_sms then 'sms' end, case when a.email is not null then 'email' end], null));
    if a.email is not null then
      insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
        values (a.id, 'email', a.email, 'health', p_title, p_body, p_link, p_dedupe || ':' || a.id || ':email', 1) on conflict (dedupe_key) do nothing;
    end if;
    if v_sms then
      insert into outbox (user_id, channel, to_addr, kind, title, body, link, dedupe_key, priority)
        values (a.id, 'sms', a.mobile, 'health', p_title, p_body, p_link, p_dedupe || ':' || a.id || ':sms', 1) on conflict (dedupe_key) do nothing;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.queue_health_alert(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.queue_health_alert(text, text, text, text, boolean) to service_role;

insert into public.settings (key, value) values ('health', '{"alerts": true, "sms": true, "db_limit_gb": 8}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Housekeeping (daily, from the clock)
-- ---------------------------------------------------------------------------
create or replace function public.prune_health()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_runs int; v_hours int; v_errors int; v_events int; v_quiet int;
begin
  delete from clock_runs where started_at < now() - interval '14 days';
  get diagnostics v_runs = row_count;
  delete from app_error_hours where hour < now() - interval '30 days';
  get diagnostics v_hours = row_count;
  -- errors not seen for 30 days are treated as fixed; fixed or ignored ones not seen for 90 days are deleted
  update app_errors set status = 'fixed', status_at = now() where status = 'open' and last_seen < now() - interval '30 days';
  get diagnostics v_quiet = row_count;
  delete from app_errors where status <> 'open' and last_seen < now() - interval '90 days'
    and not exists (select 1 from fix_requests f where f.error_id = app_errors.id and f.status not in ('merged','closed'));
  get diagnostics v_errors = row_count;
  delete from health_events where at < now() - interval '180 days';
  get diagnostics v_events = row_count;
  return jsonb_build_object('runs', v_runs, 'hours', v_hours, 'quiet', v_quiet, 'errors', v_errors, 'events', v_events);
end $$;
revoke execute on function public.prune_health() from public, anon, authenticated;
grant execute on function public.prune_health() to service_role;

-- ---------------------------------------------------------------------------
-- 8. Quick fixes and what Claude can look at (read-only, cleaned)
-- ---------------------------------------------------------------------------
-- Send again the messages that gave up in the last day (still useful ones only).
create or replace function public.retry_failed_messages(p_hours int default 24)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update outbox set status = 'queued', attempts = 0, run_after = now(), locked_at = null
    where status = 'failed' and created_at > now() - make_interval(hours => greatest(1, least(p_hours, 72)))
      and (expires_at is null or expires_at > now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.retry_failed_messages(int) from public, anon, authenticated;
grant execute on function public.retry_failed_messages(int) to service_role;

-- What the database is busy with right now (query text cut short; the caller cleans it before anyone sees it).
create or replace function public.db_activity()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(jsonb_agg(x order by (x ->> 'seconds')::numeric desc), '[]'::jsonb) from (
    select jsonb_build_object('state', state, 'seconds', round(extract(epoch from now() - coalesce(query_start, state_change))::numeric, 1),
      'waiting', wait_event_type, 'query', left(regexp_replace(query, '\s+', ' ', 'g'), 300)) x
    from pg_stat_activity
    where backend_type = 'client backend' and pid <> pg_backend_pid() and state is distinct from 'idle'
    order by coalesce(query_start, state_change) limit 15) t
$$;
revoke execute on function public.db_activity() from public, anon, authenticated;
grant execute on function public.db_activity() to service_role;
