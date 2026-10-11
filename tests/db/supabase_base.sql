-- Minimal Supabase-like base: roles, auth schema, storage schema, default grants.
do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
-- two-step sign-in factors (Supabase Auth keeps these; status is an enum there)
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, friendly_name text, factor_type text not null default 'totp', status text not null default 'unverified', secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
create publication supabase_realtime;
-- Supabase's default privileges on public
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
-- Supabase extensions schema and Realtime's broadcast function (recorded to a table here)
create schema if not exists extensions;
create schema if not exists realtime;
create table if not exists realtime.sent (topic text, event text, payload jsonb, private boolean, at timestamptz default clock_timestamp());
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.sent (topic, event, payload, private) values (topic, event, payload, private) $$;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
