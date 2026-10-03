-- ===========================================================================
-- Search: every kind of vehicle Grays sells, Trade Me Motors-style filters,
-- one shared matcher for results, counts and saved-search alerts.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Categories: cars, utes & 4x4, vans, trucks, trailers, buses, motorbikes,
--    caravans & motorhomes, boats & jet skis, machinery & farm
-- ---------------------------------------------------------------------------
alter table public.lots drop constraint if exists lots_vehicle_type_check;
alter table public.lots add constraint lots_vehicle_type_check
  check (vehicle_type in ('car','ute','truck','van','bus','bike','caravan','boat','trailer','tractor'));
alter table public.lots drop constraint if exists lots_category_check;
alter table public.lots add constraint lots_category_check
  check (category in ('cars','utes','vans','trucks','trailers','buses','motorbikes','caravans','boats','machinery'));

alter table public.lots
  add column if not exists kind text check (kind ~ '^[a-z0-9-]{1,30}$'),          -- sub-type, e.g. dual-cab, tipper, scooter
  add column if not exists drive text check (drive in ('2WD','4WD','AWD')),
  add column if not exists engine_cc int check (engine_cc between 1 and 30000),
  add column if not exists hours int check (hours >= 0),                            -- engine hours (boats, machinery)
  add column if not exists licence_class text check (licence_class in ('C','LR','MR','HR','HC','MC')),
  add column if not exists lams boolean,
  add column if not exists berths int check (berths between 0 and 20),
  add column if not exists length_m numeric(5,2) check (length_m > 0 and length_m < 100);

-- Grouped transmission and fuel for filtering. Listings keep their own wording
-- ("18-speed manual", "Premium unleaded"), the filters use these groups.
alter table public.lots add column if not exists trans_group text generated always as (
  case when transmission is null or btrim(transmission) = '' then null
       when lower(transmission) ~ '(automat|auto|cvt|dct|dsg|tiptronic|i-shift|sequential)' then 'auto'
       when lower(transmission) ~ 'manual' then 'manual'
       else 'auto' end) stored;
alter table public.lots add column if not exists fuel_group text generated always as (
  case when fuel is null or btrim(fuel) = '' then null
       when lower(fuel) ~ '(hybrid|plug)' then 'hybrid'
       when lower(fuel) ~ '(electric|^ev$|battery)' then 'electric'
       when lower(fuel) ~ 'diesel' then 'diesel'
       when lower(fuel) ~ '(lpg|gas|cng)' then 'lpg'
       when lower(fuel) ~ '(petrol|unleaded|ulp|pulp|premium|e10|gasoline)' then 'petrol'
       else 'other' end) stored;

-- The keyword column now also covers the sub-type, category, fuel, gearbox,
-- engine, year and lot number ("diesel tipper 2014" finds it).
drop index if exists public.lots_search_trgm;
alter table public.lots drop column if exists search;
alter table public.lots add column search text generated always as (lower(
  coalesce(title,'') || ' ' || coalesce(make,'') || ' ' || coalesce(model,'') || ' ' || coalesce(variant,'') || ' ' ||
  coalesce(body,'') || ' ' || coalesce(kind,'') || ' ' || category || ' ' || coalesce(suburb,'') || ' ' || coalesce(state,'') || ' ' ||
  coalesce(colour,'') || ' ' || coalesce(fuel,'') || ' ' || coalesce(transmission,'') || ' ' || coalesce(engine,'') || ' ' ||
  coalesce(year::text,'') || ' ' || id::text)) stored;
create index lots_search_trgm on public.lots using gin (search extensions.gin_trgm_ops);

-- Every filter column is indexed for live listings
create index if not exists lots_live_cat on public.lots (category, kind) where status = 'live';
create index if not exists lots_live_make on public.lots (lower(make), lower(model)) where status = 'live';
create index if not exists lots_live_price on public.lots (current_bid) where status = 'live';
create index if not exists lots_live_year on public.lots (year) where status = 'live';
create index if not exists lots_live_odo on public.lots (odometer) where status = 'live';
create index if not exists lots_live_hours on public.lots (hours) where status = 'live' and hours is not null;
create index if not exists lots_live_state on public.lots (state) where status = 'live';
create index if not exists lots_live_specs on public.lots (fuel_group, trans_group, drive) where status = 'live';
create index if not exists lots_live_extras on public.lots (licence_class, engine_cc, berths, length_m) where status = 'live';

-- Safe number from user input: null instead of an error.
create or replace function public.f_num(t text) returns numeric
language plpgsql immutable as $$
begin
  if t ~ '^\s*\d{1,9}(\.\d{1,2})?\s*$' then return trim(t)::numeric; end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Search. Each search is planned on its own: only the filters someone has set
--    are in the query, so the database can use the indexes above and stop as
--    soon as it has a page of results. Values never go into the SQL text; every
--    condition reads them from $1 (the filters), so nothing typed can inject SQL.
--    Security invoker: row-level security still hides drafts from the public.
-- ---------------------------------------------------------------------------

-- Words typed in the search box: lower case, wildcards removed, at most six.
create or replace function public.search_words(q text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(w), '{}') from (
    select regexp_replace(w, '[%_\\]', '', 'g') w
    from regexp_split_to_table(left(lower(trim(coalesce(q, ''))), 80), '\s+') w limit 6) x
  where w <> ''
$$;

-- Adds the derived values the conditions read: _lot (a lot number) or _w (the words).
create or replace function public.search_prep(f jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare g jsonb := coalesce(f, '{}'::jsonb) - '_lot' - '_w'; q text := lower(trim(coalesce(f->>'q', '')));
begin
  if jsonb_typeof(g) <> 'object' then g := '{}'::jsonb; end if;
  if q ~ '^#?\d{5,7}$' then return g || jsonb_build_object('_lot', replace(q, '#', '')); end if;
  return g || jsonb_build_object('_w', to_jsonb(search_words(q)));
end $$;

-- The price people see: current bid (or the start price), or the sale price once sold.
create or replace function public.search_price(f jsonb) returns text
language sql immutable as $$
  select case when coalesce(nullif(f->>'view', ''), 'live') = 'live' then 'greatest(l.current_bid, l.start_price)'
              else 'coalesce(l.sold_price, greatest(l.current_bid, l.start_price))' end
$$;

-- One group of conditions as SQL text, or null when none of its filters are set.
-- Groups: view, cat, make, state, fuel, trans, drive (these have counts) and rest.
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

-- Every group except the ones named in skip, joined with "and".
create or replace function public.search_where(f jsonb, skip text[] default '{}') returns text
language sql immutable set search_path = public as $$
  select coalesce(string_agg(c, ' and '), 'true') from (
    select search_pred(f, part) c from unnest(array['view','cat','make','state','fuel','trans','drive','rest']) part
    where part <> all (skip)) x where c is not null
$$;

-- Results, with Trade Me Motors' sort orders.
create or replace function public.search_lots(f jsonb, p_limit int default 49, p_offset int default 0)
returns setof public.lots
language plpgsql stable set search_path = public as $$
declare g jsonb := search_prep(f); p text := search_price(g); ord text;
begin
  ord := case g->>'sort'
    when 'price' then p || ' asc'
    when 'price_desc' then p || ' desc'
    when 'newest' then 'l.published_at desc nulls last'
    when 'km' then 'coalesce(l.odometer, l.hours) asc nulls last'
    when 'year' then 'l.year desc nulls last'
    when 'bids' then 'l.bid_count desc'
    else case when g->>'view' = 'closed' then 'l.ends_at desc' else 'l.ends_at asc' end end;
  return query execute format('select l.* from lots l where %s order by %s, l.id limit $2 offset $3', search_where(g), ord)
    using g, least(greatest(coalesce(p_limit, 49), 1), 100), least(greatest(coalesce(p_offset, 0), 0), 5000);
end $$;

-- Counts for the filters: each group counts with every other filter applied.
create or replace function public.lot_facets(f jsonb)
returns jsonb
language plpgsql stable set search_path = public as $$
declare g jsonb := search_prep(f); r jsonb;
  fl text[] := array(select coalesce(search_pred(g, x), 'true') from unnest(array['cat','make','state','fuel','trans','drive']) x);
begin
  execute format($q$
    with b as materialized (
      select l.category, l.kind, l.make, l.model, l.state, l.fuel_group, l.trans_group, l.drive, %s as price,
        %s as m_cat, %s as m_make, %s as m_state, %s as m_fuel, %s as m_trans, %s as m_drive
      from lots l where %s)
    select jsonb_build_object(
      'total', (select count(*) from b where m_cat and m_make and m_state and m_fuel and m_trans and m_drive),
      'cats', coalesce((select jsonb_object_agg(k, n) from (select category k, count(*) n from b
                where m_make and m_state and m_fuel and m_trans and m_drive group by 1) x), '{}'::jsonb),
      'cheap', (select count(*) from b where price < 5000 and m_make and m_state and m_fuel and m_trans and m_drive),
      'types', coalesce((select jsonb_object_agg(k, n) from (select kind k, count(*) n from b
                where category = ($1->>'cat') and kind is not null and m_make and m_state and m_fuel and m_trans and m_drive group by 1) x), '{}'::jsonb),
      'makes', coalesce((select jsonb_object_agg(k, n) from (select make k, count(*) n from b
                where make is not null and m_cat and m_state and m_fuel and m_trans and m_drive group by 1 order by 2 desc limit 120) x), '{}'::jsonb),
      'models', coalesce((select jsonb_object_agg(k, n) from (select make || '|' || model k, count(*) n from b
                where make is not null and model is not null and m_cat and m_state and m_fuel and m_trans and m_drive
                  and (coalesce(trim($1->>'make'), '') = '' or lower(make) = lower(trim($1->>'make')))
                group by 1 order by 2 desc limit 400) x), '{}'::jsonb),
      'states', coalesce((select jsonb_object_agg(k, n) from (select state k, count(*) n from b
                where state is not null and m_cat and m_make and m_fuel and m_trans and m_drive group by 1) x), '{}'::jsonb),
      'fuels', coalesce((select jsonb_object_agg(k, n) from (select fuel_group k, count(*) n from b
                where fuel_group is not null and m_cat and m_make and m_state and m_trans and m_drive group by 1) x), '{}'::jsonb),
      'trans', coalesce((select jsonb_object_agg(k, n) from (select trans_group k, count(*) n from b
                where trans_group is not null and m_cat and m_make and m_state and m_fuel and m_drive group by 1) x), '{}'::jsonb),
      'drives', coalesce((select jsonb_object_agg(k, n) from (select drive k, count(*) n from b
                where drive is not null and m_cat and m_make and m_state and m_fuel and m_trans group by 1) x), '{}'::jsonb))
  $q$, search_price(g), fl[1], fl[2], fl[3], fl[4], fl[5], fl[6], search_where(g, array['cat','make','state','fuel','trans','drive']))
  into r using g;
  return r;
end $$;

-- Sorting by the price people see
create index if not exists lots_live_shown_price on public.lots ((greatest(current_bid, start_price))) where status = 'live';
create index if not exists lots_live_ends on public.lots (ends_at, id) where status = 'live';

drop function if exists public.lots_matching(jsonb);
revoke execute on function public.search_pred(jsonb, text) from public;
revoke execute on function public.search_where(jsonb, text[]) from public;
grant execute on function public.f_num(text) to anon, authenticated, service_role;
grant execute on function public.search_words(text) to anon, authenticated, service_role;
grant execute on function public.search_prep(jsonb) to anon, authenticated, service_role;
grant execute on function public.search_price(jsonb) to anon, authenticated, service_role;
grant execute on function public.search_pred(jsonb, text) to anon, authenticated, service_role;
grant execute on function public.search_where(jsonb, text[]) to anon, authenticated, service_role;
grant execute on function public.search_lots(jsonb, int, int) to anon, authenticated, service_role;
grant execute on function public.lot_facets(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Saved-search alerts understand every new filter, still in one set-based pass
-- ---------------------------------------------------------------------------
alter table public.saved_searches
  add column if not exists f_type text generated always as (nullif(query->>'type','')) stored,
  add column if not exists f_make text generated always as (nullif(lower(trim(query->>'make')),'')) stored,
  add column if not exists f_model text generated always as (nullif(lower(trim(query->>'model')),'')) stored,
  add column if not exists f_min numeric generated always as (case when (query->>'min') ~ '^[0-9]{1,9}$' then (query->>'min')::numeric end) stored,
  add column if not exists f_ymin int generated always as (case when (query->>'ymin') ~ '^[0-9]{4}$' then (query->>'ymin')::int end) stored,
  add column if not exists f_ymax int generated always as (case when (query->>'ymax') ~ '^[0-9]{4}$' then (query->>'ymax')::int end) stored,
  add column if not exists f_km int generated always as (case when (query->>'km') ~ '^[0-9]{1,8}$' then (query->>'km')::int end) stored,
  add column if not exists f_fuel text generated always as (nullif(lower(query->>'fuel'),'')) stored,
  add column if not exists f_trans text generated always as (nullif(lower(query->>'trans'),'')) stored,
  add column if not exists f_drive text generated always as (nullif(upper(query->>'drive'),'')) stored,
  add column if not exists f_extra boolean generated always as (query ?| array['lams','lic','berths','hrs','ccmin','ccmax','lenmin','lenmax','seller','grade','nores']) stored,
  add column if not exists f_words text[] generated always as (public.search_words(query->>'q')) stored;
create index if not exists saved_searches_make on public.saved_searches (f_make) where f_make is not null;

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
