-- Security: two-step sign-in for admins (enforced by the database itself), an append-only log of everything admins
-- do, an alert to every admin when someone is made an admin, and internal settings kept out of public view.

-- ---------------------------------------------------------------------------
-- 1. Admins need two-step sign-in (an authenticator app code) for admin rights to work at all
-- ---------------------------------------------------------------------------
-- Supabase marks a session that has passed an authenticator-app code as "aal2". With this on (the default), an
-- admin's password alone gets them nothing an ordinary member doesn't have: no admin pages, no admin API, and no
-- admin rights in the database (every admin-only rule goes through is_admin()). Staff can switch it off in
-- Admin → Security only from a session that has already passed two-step.
insert into public.settings (key, value) values ('security', '{"admin_mfa": true}'::jsonb)
on conflict (key) do nothing;

create or replace function public.admin_mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'admin_mfa')::boolean from settings where key = 'security'), true)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
     and (not public.admin_mfa_required() or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2')
$$;

-- What the website needs to know: is this person an admin, and have they passed two-step this session?
create or replace function public.admin_access() returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin') then 'no'
    when public.is_admin() then 'ok'
    else 'mfa' end
$$;
revoke execute on function public.admin_access() from public, anon;
grant execute on function public.admin_access() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The admin log: who did what, to what, when, from where. Rows can be added, never changed or removed.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,                -- the admin (no foreign key: the record outlives the account)
  actor_email text,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  outcome text,              -- 'ok', or the error status
  ip text,
  user_agent text
);
create index if not exists admin_audit_at on public.admin_audit (at desc);
create index if not exists admin_audit_actor on public.admin_audit (actor, at desc);
alter table public.admin_audit enable row level security;
drop policy if exists admin_audit_read on public.admin_audit;
create policy admin_audit_read on public.admin_audit for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete, truncate on public.admin_audit from anon, authenticated;

create or replace function public.admin_audit_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'admin_audit_is_append_only';
end $$;
drop trigger if exists admin_audit_append_only on public.admin_audit;
create trigger admin_audit_append_only before update or delete on public.admin_audit
  for each row execute function public.admin_audit_append_only();
drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_truncate before truncate on public.admin_audit
  for each statement execute function public.admin_audit_append_only();

-- The server's way in (it knows the admin, the network and the device)
create or replace function public.audit_admin(p_actor uuid, p_action text, p_target text, p_detail jsonb, p_outcome text, p_ip text, p_user_agent text)
returns void language sql security definer set search_path = public as $$
  insert into admin_audit (actor, actor_email, action, target, detail, outcome, ip, user_agent)
  values (p_actor, (select email from profiles where id = p_actor), left(p_action, 80), left(p_target, 200),
    coalesce(p_detail, '{}'::jsonb), left(p_outcome, 40), left(p_ip, 64), left(p_user_agent, 300))
$$;
revoke execute on function public.audit_admin(uuid, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.audit_admin(uuid, text, text, jsonb, text, text, text) to service_role;

-- Changes admins make straight to the database from the admin pages (the vehicle editor, partners, consultants,
-- settings): which table, which row, which fields. Writes by the server itself are logged by the server.
create or replace function public.audit_admin_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_keys text[]; v_id text;
begin
  if (select auth.uid()) is null or coalesce((select auth.role()), '') = 'service_role'
     or not exists (select 1 from profiles where id = (select auth.uid()) and role = 'admin') then return coalesce(new, old); end if;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_new) k where v_new -> k is distinct from v_old -> k and k not in ('updated_at');
    if v_keys is null then return new; end if;
  end if;
  v_id := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');
  insert into admin_audit (actor, actor_email, action, target, detail, outcome)
  values ((select auth.uid()), (select email from profiles where id = (select auth.uid())), lower(tg_op) || ' ' || tg_table_name,
    tg_table_name || ':' || coalesce(v_id, '?'), jsonb_build_object('fields', coalesce(to_jsonb(v_keys), '[]'::jsonb)), 'ok');
  return coalesce(new, old);
end $$;
revoke execute on function public.audit_admin_write() from public, anon, authenticated;

do $$
declare t text; k text;
begin
  for t, k in select * from (values ('lots', 'id'), ('lot_private', 'lot_id'), ('lot_photos', 'id'), ('lot_flaws', 'id'), ('settings', 'key'),
      ('partners', 'id'), ('partner_private', 'partner_id'), ('consultants', 'id'), ('sales', 'id')) v(t, k) loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists zz_audit_admin on public.%I', t);
      execute format('create trigger zz_audit_admin after insert or update or delete on public.%I for each row execute function public.audit_admin_write(%L)', t, k);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Someone made an admin (or an admin removed): logged, and every admin is told straight away
-- ---------------------------------------------------------------------------
create or replace function public.profile_role_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and (new.role = 'admin' or old.role = 'admin') then
    insert into admin_audit (actor, actor_email, action, target, detail, outcome)
    values ((select auth.uid()), (select email from profiles where id = (select auth.uid())),
      case when new.role = 'admin' then 'admin added' else 'admin removed' end, 'profile:' || new.id,
      jsonb_build_object('email', new.email, 'from', old.role, 'to', new.role), 'ok');
    perform queue_health_alert(
      case when new.role = 'admin' then 'New admin: ' || coalesce(new.email, new.id::text) else 'Admin removed: ' || coalesce(new.email, new.id::text) end,
      case when new.role = 'admin'
        then 'This account now has full admin access to Tyrebiter. If you didn''t expect this, remove it in Admin → Members straight away and change your password.'
        else 'This account no longer has admin access.' end,
      '/admin/security', 'role:' || new.id || ':' || new.role || ':' || extract(epoch from now())::bigint, new.role = 'admin');
  end if;
  return new;
end $$;
revoke execute on function public.profile_role_alert() from public, anon, authenticated;
drop trigger if exists profile_role_alert on public.profiles;
create trigger profile_role_alert after update of role on public.profiles
  for each row execute function public.profile_role_alert();

-- ---------------------------------------------------------------------------
-- 4. Admin → Security: every admin, whether they've set up two-step, when they last signed in
-- ---------------------------------------------------------------------------
create or replace function public.admin_security() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'mfa_required', admin_mfa_required(),
    'admins', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), 'email', p.email,
        'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status::text = 'verified'),
        'last_sign_in', (select u.last_sign_in_at from auth.users u where u.id = p.id)) order by p.created_at)
      from profiles p where p.role = 'admin'), '[]'::jsonb));
end $$;
revoke execute on function public.admin_security() from public, anon;
grant execute on function public.admin_security() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Settings: the public can read only what the site shows; internal ones (health, jobs, insights…) are staff-only
-- ---------------------------------------------------------------------------
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select
  using (key in ('fees', 'auction', 'selling', 'terms', 'finance', 'business', 'app'));

-- ---------------------------------------------------------------------------
-- 6. Privileged functions: only a short, reviewed list can be called by anyone on the internet
-- ---------------------------------------------------------------------------
-- Postgres lets everyone (PUBLIC) call a new function unless told otherwise. Most of ours check who's calling, but
-- belt and braces: every privileged (security definer) function is closed to the public and to signed-out
-- visitors, except the ones the public site uses. Members keep the grants they were given. A database test fails
-- if a new privileged function is open to the public without being added to this list.
create or replace function public.public_function_allowlist() returns text[]
language sql immutable set search_path = public as $$
  select array['bid_history', 'deposit_for', 'is_admin', 'lot_facets', 'lot_videos_public', 'lot_watchers', 'pay_mode',
    'price_estimate', 'sale_stats', 'search_lots']
$$;

do $$
declare f record;
  open_ok text[] := public.public_function_allowlist();
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    if not (f.proname = any(open_ok)) then
      execute format('revoke execute on function %s from public, anon', f.sig);
    end if;
  end loop;
end $$;
-- internal helpers members don't need either
revoke execute on function public.setting_num(text, text) from authenticated;
revoke execute on function public.admin_mfa_required() from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Site health watches security too (Admin → Site health, every minute)
-- ---------------------------------------------------------------------------
alter function public.health_snapshot() rename to health_snapshot_core;
revoke execute on function public.health_snapshot_core() from public, anon, authenticated;

create or replace function public.health_snapshot()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select public.health_snapshot_core() || jsonb_build_object(
    'admin_mfa', public.admin_mfa_required(),
    'admins', (select count(*) from profiles where role = 'admin'),
    'admins_no_two_step', (select count(*) from profiles p where p.role = 'admin'
        and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status::text = 'verified')),
    'admins_added_day', (select count(*) from admin_audit where action = 'admin added' and at > now() - interval '1 day'),
    'admin_refused_hour', (select count(*) from admin_audit where action like 'refused:%' and at > now() - interval '1 hour'),
    'open_functions', (select coalesce(jsonb_agg(distinct p.proname order by p.proname), '[]'::jsonb) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
          and not (p.proname = any(public.public_function_allowlist()))))
$$;
revoke execute on function public.health_snapshot() from public, anon, authenticated;
grant execute on function public.health_snapshot() to service_role;
