-- Tyrebiter: our own free vehicle lookup (no paid data provider needed).
-- Run after 20261004000009_rego_transfer.sql.
--
-- 1. Plate memory: any vehicle we've listed is known by its plate and state.
-- 2. VIN patterns: what a VIN's first 8 characters and its model-year character (10th)
--    usually mean (make, model, variant, body, fuel...). Learned from every vehicle we
--    publish (checked by our team against the papers and the PPSR), and optionally loaded
--    from New Zealand's Motor Vehicle Register open data (CC BY 4.0; scripts/vin-data-nz.mjs).
-- Only staff-checked listings teach it, so a member can't feed it wrong details.
-- Everything here is server only.

create table if not exists public.vin_patterns (
  id bigint generated always as identity primary key,
  prefix text not null check (prefix ~ '^[A-HJ-NPR-Z0-9]{9}$'),  -- VIN characters 1-8 and 10
  source text not null check (source in ('listing','nzta','staff')),
  make text not null,
  model text not null,
  variant text,
  body text,
  fuel text,
  transmission text,
  drive text,
  engine_cc int,
  year int,
  category text,
  kind text,
  seen int not null default 1,
  updated_at timestamptz not null default now()
);
create unique index if not exists vin_patterns_key on public.vin_patterns (prefix, source, lower(make), lower(model), lower(coalesce(variant, '')));
create index if not exists vin_patterns_prefix8 on public.vin_patterns (left(prefix, 8));
alter table public.vin_patterns enable row level security;

-- Learn from a published listing (also when its VIN, make or model is corrected while live).
create or replace function public.learn_vin_pattern() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_vin text := upper(coalesce(new.vin, '')); v_prefix text;
begin
  if new.status not in ('live','sold') or v_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' or coalesce(new.make, '') = '' or coalesce(new.model, '') = '' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status in ('live','sold') and old.vin is not distinct from new.vin
     and old.make is not distinct from new.make and old.model is not distinct from new.model and old.variant is not distinct from new.variant then
    return null;
  end if;
  v_prefix := substr(v_vin, 1, 8) || substr(v_vin, 10, 1);
  insert into vin_patterns (prefix, source, make, model, variant, body, fuel, transmission, drive, engine_cc, year, category, kind)
  values (v_prefix, 'listing', new.make, new.model, nullif(new.variant, ''), nullif(new.body, ''), nullif(new.fuel, ''), nullif(new.transmission, ''),
          new.drive, new.engine_cc, new.year, new.category, new.kind)
  on conflict (prefix, source, lower(make), lower(model), lower(coalesce(variant, ''))) do update set
    seen = vin_patterns.seen + 1, body = coalesce(excluded.body, vin_patterns.body), fuel = coalesce(excluded.fuel, vin_patterns.fuel),
    transmission = coalesce(excluded.transmission, vin_patterns.transmission), drive = coalesce(excluded.drive, vin_patterns.drive),
    engine_cc = coalesce(excluded.engine_cc, vin_patterns.engine_cc), year = coalesce(excluded.year, vin_patterns.year),
    category = coalesce(excluded.category, vin_patterns.category), kind = coalesce(excluded.kind, vin_patterns.kind), updated_at = now();
  return null;
end $$;
drop trigger if exists learn_vin_pattern on public.lots;
create trigger learn_vin_pattern after insert or update of status, vin, make, model, variant on public.lots
  for each row execute function public.learn_vin_pattern();

-- What a VIN most likely is: same first 8 characters and model-year character first,
-- then the same first 8 characters in any year. Our own listings outrank imported data.
create or replace function public.vin_pattern(p_vin text)
returns table (make text, model text, variant text, body text, fuel text, transmission text, drive text, engine_cc int, year int, category text, kind text, source text, seen int, exact boolean)
language sql stable security definer set search_path = public as $$
  with v as (select upper(p_vin) vin)
  select p.make, p.model, p.variant, p.body, p.fuel, p.transmission, p.drive, p.engine_cc,
    case when p.prefix = substr(v.vin, 1, 8) || substr(v.vin, 10, 1) then p.year end,
    p.category, p.kind, p.source, p.seen, p.prefix = substr(v.vin, 1, 8) || substr(v.vin, 10, 1)
  from vin_patterns p, v
  where v.vin ~ '^[A-HJ-NPR-Z0-9]{17}$' and left(p.prefix, 8) = substr(v.vin, 1, 8)
  order by (p.prefix = substr(v.vin, 1, 8) || substr(v.vin, 10, 1)) desc, (p.source = 'listing') desc, p.seen desc
  limit 3
$$;

-- A plate we've listed before (staff-checked), most recent first.
create or replace function public.plate_memory(p_plate text, p_state text)
returns table (vin text, year int, make text, model text, variant text, body text, colour text, fuel text, transmission text, drive text,
  engine text, engine_cc int, category text, kind text, rego_expiry date, registration text, engine_no text)
language sql stable security definer set search_path = public as $$
  select l.vin, l.year, l.make, l.model, l.variant, l.body, l.colour, l.fuel, l.transmission, l.drive, l.engine, l.engine_cc,
    l.category, l.kind, l.rego_expiry, l.registration, l.engine_no
  from lots l
  where l.rego_plate = upper(p_plate) and l.rego_state = upper(p_state) and l.status <> 'draft' and coalesce(l.make, '') <> ''
  order by coalesce(l.published_at, l.created_at) desc
  limit 1
$$;

revoke execute on function public.vin_pattern(text) from public, anon, authenticated;
revoke execute on function public.plate_memory(text, text) from public, anon, authenticated;
revoke execute on function public.learn_vin_pattern() from public, anon, authenticated;
grant execute on function public.vin_pattern(text) to service_role;
grant execute on function public.plate_memory(text, text) to service_role;

create index if not exists lots_rego_plate on public.lots (rego_plate, rego_state) where rego_plate is not null;

-- Learn from everything already listed.
insert into public.vin_patterns (prefix, source, make, model, variant, body, fuel, transmission, drive, engine_cc, year, category, kind, seen)
select substr(upper(vin), 1, 8) || substr(upper(vin), 10, 1), 'listing', make, model, nullif(variant, ''), max(body), max(fuel), max(transmission), max(drive),
  max(engine_cc), max(year), max(category), max(kind), count(*)
from public.lots
where status in ('live','sold') and upper(coalesce(vin, '')) ~ '^[A-HJ-NPR-Z0-9]{17}$' and coalesce(make, '') <> '' and coalesce(model, '') <> ''
group by 1, 3, 4, 5
on conflict do nothing;
