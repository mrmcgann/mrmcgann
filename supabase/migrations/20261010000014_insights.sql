-- The information machine: first-party traffic data (no cookies, no IP addresses kept), a daily store of
-- every business metric, the insights feed, and the tables the SEO engine uses.
-- Everything here is server only (row-level security on, no policies): admin pages read it with the
-- service role after checking the admin.

-- ---------------------------------------------------------------------------
-- 1. Traffic: page views, searches and clicks from the website and the app
-- ---------------------------------------------------------------------------
create table if not exists public.web_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('view','search','click')),
  path text,                       -- path only, never the query string
  page text not null default 'other', -- home, lot, auctions, for-sale, sold, sell, sales, help, legal, account, join, other
  lot_id bigint,
  visitor text not null,           -- anonymous code that changes every day (hash of browser + network + day + secret)
  source text not null default 'direct',
  medium text,
  campaign text,
  referrer text,                   -- referring site's host name only
  device text,                     -- mobile, tablet, desktop, ios-app, android-app
  region text,                     -- Australian state from the host's location header, 'overseas', or null
  query text,                      -- what was searched (search events)
  results int,
  member boolean not null default false
);
create index if not exists web_events_at on public.web_events using brin (at);
create index if not exists web_events_lot on public.web_events (lot_id, at) where lot_id is not null;
alter table public.web_events enable row level security;

-- One row per visitor per day (with where that day's first visit came from), kept as views arrive, so counting
-- people is a quick count rather than a sort through every page view.
create table if not exists public.web_visitors (
  day date not null,
  visitor text not null,
  source text not null,
  device text,
  region text,
  primary key (day, visitor)
);
alter table public.web_visitors enable row level security;
create or replace function public.web_visitor_seen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into web_visitors (day, visitor, source, device, region)
    values ((new.at at time zone 'Australia/Brisbane')::date, new.visitor, new.source, new.device, new.region)
    on conflict do nothing;
  return null;
end $$;
drop trigger if exists web_visitor_seen on public.web_events;
create trigger web_visitor_seen after insert on public.web_events
  for each row when (new.kind = 'view') execute function public.web_visitor_seen();

-- Where each member first came from (first visit's source), recorded once when they join.
create table if not exists public.member_attribution (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source text not null,
  medium text,
  campaign text,
  landing text,
  referrer text,
  created_at timestamptz not null default now()
);
create index if not exists member_attribution_source on public.member_attribution (source);
alter table public.member_attribution enable row level security;

-- When a member's ID was verified (for the funnel). Only the system sets it.
alter table public.profiles add column if not exists id_verified_at timestamptz;
update public.profiles set id_verified_at = created_at where id_status = 'verified' and id_verified_at is null;
create index if not exists profiles_id_verified_at on public.profiles (id_verified_at) where id_verified_at is not null;
create or replace function public.profile_id_verified_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id_status = 'verified' and old.id_status is distinct from 'verified' then new.id_verified_at := now();
  else new.id_verified_at := old.id_verified_at; end if;
  return new;
end $$;
drop trigger if exists profile_id_verified_at on public.profiles;
create trigger profile_id_verified_at before update on public.profiles
  for each row execute function public.profile_id_verified_at();

-- When a sale was cancelled (for the payments metrics).
alter table public.invoices add column if not exists cancelled_at timestamptz;
create or replace function public.invoice_cancelled_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
  return new;
end $$;
drop trigger if exists invoice_cancelled_at on public.invoices;
create trigger invoice_cancelled_at before update of status on public.invoices
  for each row execute function public.invoice_cancelled_at();
update public.invoices set cancelled_at = coalesce(refunded_at, created_at) where status = 'cancelled' and cancelled_at is null;
create index if not exists invoices_paid_at on public.invoices (paid_at) where paid_at is not null;
create index if not exists invoices_collected_at on public.invoices (collected_at) where collected_at is not null;
create index if not exists bids_created on public.bids using brin (created_at);
create index if not exists lots_published_all on public.lots (published_at) where published_at is not null;
create index if not exists outbox_created on public.outbox using brin (created_at);

-- ---------------------------------------------------------------------------
-- 2. The metric store: one row per day, metric and breakdown (dim '' = the total)
-- ---------------------------------------------------------------------------
create table if not exists public.metric_values (
  day date not null,
  metric text not null,
  dim text not null default '',
  value numeric not null,
  primary key (day, metric, dim)
);
create index if not exists metric_values_metric on public.metric_values (metric, day);
alter table public.metric_values enable row level security;

-- Stock levels (a count at a moment) are only recorded for today; flows are recomputed for any day.
create or replace function public.metric_is_snapshot(p_metric text) returns boolean
language sql immutable as $$
  select p_metric in ('live_lots','scheduled_lots','draft_lots','members_total','members_verified','open_claims',
                      'balances_due','balances_due_amount','payouts_ready_amount','watchers_live')
$$;

create or replace function public.metric_is_traffic(p_metric text) returns boolean
language sql immutable as $$
  select p_metric in ('views','visitors','lot_views','searches','searches_zero','search_terms','search_terms_zero')
$$;

-- p_traffic: count the traffic too (only needed for today and yesterday: raw traffic doesn't change after the day).
create or replace function public.compute_daily_metrics(p_day date, p_traffic boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Australia/Brisbane');
  v_to timestamptz := ((p_day + 1)::timestamp at time zone 'Australia/Brisbane');
  v_today boolean := p_day = (now() at time zone 'Australia/Brisbane')::date;
  v_rows int;
begin
  delete from metric_values where day = p_day
    and (v_today or not metric_is_snapshot(metric)) and (p_traffic or not metric_is_traffic(metric));

  if to_regclass('pg_temp._m') is null then create temp table _m (metric text, dim text, value numeric) on commit drop;
  else truncate _m; end if;

  -- Listings
  insert into _m select 'lots_published', d, count(*) from lots l,
    lateral (values (''), ('cat:' || l.category), ('state:' || coalesce(l.state, '?'))) v(d)
    where l.published_at >= v_from and l.published_at < v_to group by d;
  insert into _m select m, d, count(*) from lots l,
    lateral (values ('lots_closed'), (case when l.bid_count = 0 then 'lots_closed_no_bids' end),
                    (case when l.bid_count > 0 and (l.reserve_met or not l.has_reserve) then 'lots_closed_reserve_met' end)) x(m),
    lateral (values (''), ('cat:' || l.category), ('state:' || coalesce(l.state, '?'))) v(d)
    where x.m is not null and l.ends_at >= v_from and l.ends_at < v_to and l.status in ('sold','passed','referred','offers')
    group by m, d;
  insert into _m select 'bids_on_closed', d, sum(l.bid_count) from lots l,
    lateral (values (''), ('cat:' || l.category)) v(d)
    where l.ends_at >= v_from and l.ends_at < v_to and l.status in ('sold','passed','referred','offers') group by d;

  -- Bidding
  insert into _m select 'bids', '', count(*) from bids where created_at >= v_from and created_at < v_to;
  insert into _m select 'bidders', '', count(distinct bidder_id) from bids where created_at >= v_from and created_at < v_to;
  insert into _m select 'first_time_bidders', '', count(distinct b.bidder_id) from bids b
    where b.created_at >= v_from and b.created_at < v_to
      and not exists (select 1 from bids e where e.bidder_id = b.bidder_id and e.created_at < v_from);
  insert into _m select 'offers', '', count(*) from offers where created_at >= v_from and created_at < v_to;

  -- Sales and money (sales made that day that haven't since been cancelled)
  insert into _m select m, d, val from (
    select x.m, v.d, sum(x.val) val from invoices i join lots l on l.id = i.lot_id
      left join member_attribution a on a.user_id = i.buyer_id,
      lateral (values ('sales', 1::numeric), ('gmv', i.price), ('premium', i.premium), ('admin_fees', round(i.admin_fee / 1.1, 2)),
                      ('buyer_total', i.total)) x(m, val),
      lateral (values (''), ('cat:' || l.category), ('state:' || coalesce(l.state, '?')), ('via:' || coalesce(i.sold_via, '?')),
                      ('src:' || coalesce(a.source, 'unknown'))) v(d)
     where i.created_at >= v_from and i.created_at < v_to and i.status <> 'cancelled'
     group by x.m, v.d) q;
  insert into _m select 'seller_fees', '', coalesce(sum(p.seller_fee), 0) from seller_payouts p join invoices i on i.id = p.invoice_id
    where p.kind = 'sale' and i.created_at >= v_from and i.created_at < v_to and i.status <> 'cancelled';
  insert into _m select 'forfeits_kept', '', coalesce(sum(p.sale_price - p.net_amount), 0) from seller_payouts p
    where p.kind = 'forfeit' and p.created_at >= v_from and p.created_at < v_to;
  insert into _m select 'revenue', '', coalesce(sum(value), 0) from _m where dim = '' and metric in ('premium','admin_fees','seller_fees','forfeits_kept');

  -- Payments
  insert into _m select 'paid_in_full', '', count(*) from invoices
    where coalesce(balance_paid_at, case when mode = 'card' then paid_at end) >= v_from and coalesce(balance_paid_at, case when mode = 'card' then paid_at end) < v_to;
  insert into _m select 'pay_hours_sum', '', coalesce(sum(extract(epoch from coalesce(balance_paid_at, paid_at) - created_at) / 3600), 0) from invoices
    where coalesce(balance_paid_at, case when mode = 'card' then paid_at end) >= v_from and coalesce(balance_paid_at, case when mode = 'card' then paid_at end) < v_to;
  insert into _m select 'card_failures', '', count(*) from invoices where failed_at >= v_from and failed_at < v_to;
  insert into _m select 'defaults', '', count(*) from invoices where cancelled_at >= v_from and cancelled_at < v_to and cancel_reason = 'buyer_default';
  insert into _m select 'refunds', '', count(*) from invoices where refunded_at >= v_from and refunded_at < v_to;
  insert into _m select 'refunds_amount', '', coalesce(sum(refunded_amount), 0) from invoices where refunded_at >= v_from and refunded_at < v_to;

  -- After the sale
  insert into _m select 'transfers_done', '', count(*) from ownership_transfers where completed_at >= v_from and completed_at < v_to;
  insert into _m select 'transfer_hours_sum', '', coalesce(sum(extract(epoch from completed_at - created_at) / 3600), 0)
    from ownership_transfers where completed_at >= v_from and completed_at < v_to;
  insert into _m select 'collections', '', count(*) from invoices where collected_at >= v_from and collected_at < v_to;
  insert into _m select 'claims', '', count(*) from claims where created_at >= v_from and created_at < v_to;
  insert into _m select 'claims_upheld', '', count(*) from claims where decided_at >= v_from and decided_at < v_to and status = 'upheld';
  insert into _m select 'payouts_paid', '', count(*) from seller_payouts where paid_at >= v_from and paid_at < v_to;
  insert into _m select 'payouts_paid_amount', '', coalesce(sum(net_amount), 0) from seller_payouts where paid_at >= v_from and paid_at < v_to;

  -- Members and sellers
  insert into _m select 'signups', d, count(*) from profiles p left join member_attribution a on a.user_id = p.id,
    lateral (values (''), ('src:' || coalesce(a.source, 'unknown'))) v(d)
    where p.created_at >= v_from and p.created_at < v_to group by d;
  insert into _m select 'id_verified', '', count(*) from profiles where id_verified_at >= v_from and id_verified_at < v_to;
  insert into _m select 'signups_verified', '', count(*) from profiles where created_at >= v_from and created_at < v_to and id_verified_at is not null;
  insert into _m select 'appraisals', '', count(*) from appraisals where created_at >= v_from and created_at < v_to;
  insert into _m select 'agreements_signed', '', count(*) from seller_agreements where signed_at >= v_from and signed_at < v_to and status <> 'withdrawn';
  insert into _m select 'questions', '', count(*) from lot_questions where created_at >= v_from and created_at < v_to;
  insert into _m select 'watch_adds', '', count(*) from watchlist where created_at >= v_from and created_at < v_to;
  insert into _m select 'saved_searches', '', count(*) from saved_searches where created_at >= v_from and created_at < v_to;

  -- Partners
  insert into _m select 'partner_clicks', d, count(*) from partner_clicks c join partners p on p.id = c.partner_id,
    lateral (values (''), ('kind:' || p.kind)) v(d) where c.created_at >= v_from and c.created_at < v_to group by d;
  insert into _m select 'partner_leads', d, count(*) from partner_leads l,
    lateral (values (''), ('kind:' || l.kind)) v(d) where l.created_at >= v_from and l.created_at < v_to group by d;

  -- Messages
  insert into _m select m, '', count(*) from outbox o,
    lateral (values (case when o.status = 'sent' then 'messages_sent' when o.status = 'failed' then 'messages_failed' end)) x(m)
    where x.m is not null and o.created_at >= v_from and o.created_at < v_to group by m;

  -- Traffic: one pass over the day's rows for each measure
  if p_traffic then
    insert into _m select 'views',
      case when grouping(e.source) = 0 then 'src:' || e.source when grouping(e.device) = 0 then 'dev:' || coalesce(e.device, '?')
           when grouping(e.page) = 0 then 'page:' || e.page when grouping(e.region) = 0 then 'region:' || coalesce(e.region, '?') else '' end,
      count(*)
      from web_events e where e.kind = 'view' and e.at >= v_from and e.at < v_to
     group by grouping sets ((), (e.source), (e.device), (e.page), (e.region));
    -- people, each counted once a day under where their first visit that day came from
    insert into _m select 'visitors',
      case when grouping(v.source) = 0 then 'src:' || v.source when grouping(v.device) = 0 then 'dev:' || coalesce(v.device, '?')
           when grouping(v.region) = 0 then 'region:' || coalesce(v.region, '?') else '' end,
      count(*)
      from web_visitors v where v.day = p_day
     group by grouping sets ((), (v.source), (v.device), (v.region));
    -- tagged sources with hardly any visitors are folded into "other" (keeps junk tags out of the store)
    update _m set dim = 'src:other' where metric in ('views','visitors') and dim like 'src:%'
      and substr(dim, 5) not in ('google','bing','other-search','facebook','instagram','tiktok','youtube','linkedin','reddit','x','email','sms','newsletter','app','referral','direct')
      and dim in (select x.dim from _m x where x.metric = 'visitors' and x.dim like 'src:%' and x.value < 3);
    insert into _m select x.m, '', x.n from (
      select count(*) filter (where kind = 'view' and page = 'lot') lv, count(*) filter (where kind = 'search') s,
             count(*) filter (where kind = 'search' and results = 0) sz
        from web_events where at >= v_from and at < v_to) q,
      lateral (values ('lot_views', q.lv), ('searches', q.s), ('searches_zero', q.sz)) x(m, n);
    -- what was searched: only terms at least 2 different visitors searched, the top 200 a day
    insert into _m select 'search_terms', 'q:' || t, n from (
      select left(lower(trim(query)), 120) t, count(*) n, count(distinct visitor) v from web_events
       where kind = 'search' and coalesce(trim(query), '') <> '' and at >= v_from and at < v_to group by 1) x
     where v >= 2 order by n desc limit 200;
    insert into _m select 'search_terms_zero', 'q:' || t, n from (
      select left(lower(trim(query)), 120) t, count(*) n, count(distinct visitor) v from web_events
       where kind = 'search' and results = 0 and coalesce(trim(query), '') <> '' and at >= v_from and at < v_to group by 1) x
     where v >= 2 order by n desc limit 200;
  end if;

  -- Stock levels (today only)
  if v_today then
    insert into _m select 'live_lots', d, count(*) from lots l, lateral (values (''), ('cat:' || l.category)) v(d) where l.status = 'live' group by d;
    insert into _m select 'scheduled_lots', '', count(*) from lots where status = 'scheduled';
    insert into _m select 'draft_lots', '', count(*) from lots where status = 'draft';
    insert into _m select 'members_total', '', count(*) from profiles;
    insert into _m select 'members_verified', '', count(*) from profiles where id_status = 'verified' and mobile_verified and payment_method_id is not null;
    insert into _m select 'open_claims', '', count(*) from claims where status = 'open';
    insert into _m select 'balances_due', '', count(*) from invoices where status = 'deposit_paid';
    insert into _m select 'balances_due_amount', '', coalesce(sum(balance_due), 0) from invoices where status = 'deposit_paid';
    insert into _m select 'payouts_ready_amount', '', coalesce(sum(net_amount), 0) from seller_payouts where status = 'ready';
    insert into _m select 'watchers_live', '', count(*) from watchlist w join lots l on l.id = w.lot_id where l.status = 'live';
  end if;

  insert into metric_values (day, metric, dim, value)
    select p_day, metric, dim, sum(value) from _m where value is not null group by metric, dim
    on conflict (day, metric, dim) do update set value = excluded.value;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke execute on function public.compute_daily_metrics(date, boolean) from public, anon, authenticated;
grant execute on function public.compute_daily_metrics(date, boolean) to service_role;

-- Today every 15 minutes, and the last few days again (late payments, cancellations) once a night.
create or replace function public.refresh_metrics(p_days int default 0) returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Australia/Brisbane')::date; n int := 0; i int;
begin
  for i in 0 .. greatest(p_days, 0) loop
    n := n + compute_daily_metrics(d - i, i <= 1);
  end loop;
  return n;
end $$;
revoke execute on function public.refresh_metrics(int) from public, anon, authenticated;
grant execute on function public.refresh_metrics(int) to service_role;

-- Totals over a range (flows summed; stock levels from the latest day that has them).
create or replace function public.metrics_range(p_from date, p_to date, p_like text default null)
returns table (metric text, dim text, total numeric, latest numeric)
language sql stable security definer set search_path = public as $$
  select m.metric, m.dim, sum(m.value),
         (array_agg(m.value order by m.day desc))[1]
    from metric_values m
   where m.day between p_from and p_to and (p_like is null or m.metric like p_like)
   group by m.metric, m.dim
$$;
revoke execute on function public.metrics_range(date, date, text) from public, anon, authenticated;
grant execute on function public.metrics_range(date, date, text) to service_role;

-- The same totals as one JSON value (no row limit from the API), without the search terms.
create or replace function public.metrics_totals(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sum', coalesce(jsonb_object_agg(k, total), '{}'::jsonb),
    'latest', coalesce(jsonb_object_agg(k, latest), '{}'::jsonb))
  from (select case when dim = '' then metric else metric || '|' || dim end k, total, latest
          from metrics_range(p_from, p_to, null) where metric not like 'search_terms%') x
$$;
revoke execute on function public.metrics_totals(date, date) from public, anon, authenticated;
grant execute on function public.metrics_totals(date, date) to service_role;

-- The most searched terms over a range (search_terms or search_terms_zero).
create or replace function public.search_terms_top(p_from date, p_to date, p_metric text, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(term, n) order by n desc), '[]'::jsonb) from (
    select substr(dim, 3) term, sum(value) n from metric_values
     where day between p_from and p_to and metric = p_metric and p_metric in ('search_terms','search_terms_zero')
     group by dim order by sum(value) desc limit p_limit) x
$$;
revoke execute on function public.search_terms_top(date, date, text, int) from public, anon, authenticated;
grant execute on function public.search_terms_top(date, date, text, int) to service_role;

-- Daily values for charts as one JSON value: {"metric": {"2026-10-01": 12, ...}}.
create or replace function public.metrics_series(p_from date, p_to date, p_metrics text[], p_dim text default '')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(metric, days), '{}'::jsonb) from (
    select metric, jsonb_object_agg(day::text, value) days from metric_values
     where day between p_from and p_to and metric = any(p_metrics) and dim = p_dim group by metric) x
$$;
revoke execute on function public.metrics_series(date, date, text[], text) from public, anon, authenticated;
grant execute on function public.metrics_series(date, date, text[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Insights: what the machine noticed, with what to do about it
-- ---------------------------------------------------------------------------
create table if not exists public.insights (
  id bigint generated always as identity primary key,
  key text not null,
  day date not null,
  severity text not null check (severity in ('good','info','watch','act')),
  area text not null,
  title text not null,
  body text not null,
  action text,
  link text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz not null default now(),
  unique (key, day)
);
create index if not exists insights_open on public.insights (status, day desc);
alter table public.insights enable row level security;

-- Daily and weekly briefings go to admins by email only (never SMS or push unless they turn push on).
create or replace function public.push_wanted(p_notify jsonb, p_kind text) returns boolean
language sql immutable as $$
  select case when p_kind in ('account', 'won', 'seller') then true
              when p_kind in ('marketing', 'insights') then coalesce((p_notify -> p_kind ->> 'push')::boolean, false)
              else coalesce((p_notify -> p_kind ->> 'push')::boolean, true) end
$$;

insert into public.settings (key, value) values
  ('insights', '{"daily": false, "weekly": true, "hour": 7, "weekday": 1}'),
  ('seo', '{"indexnow": true}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. SEO: Google Search Console data (when connected) and the nightly audit's findings
-- ---------------------------------------------------------------------------
create table if not exists public.seo_search_daily (
  day date not null,
  query text not null,
  page text not null,
  clicks int not null default 0,
  impressions int not null default 0,
  position numeric(6,2),
  primary key (day, query, page)
);
create index if not exists seo_search_daily_day on public.seo_search_daily (day);
alter table public.seo_search_daily enable row level security;

create table if not exists public.seo_issues (
  id bigint generated always as identity primary key,
  key text not null unique,         -- kind + target, so a fixed issue closes and a new one opens
  kind text not null,
  target text not null,             -- a URL, or 'lot:<id>'
  lot_id bigint,
  severity text not null check (severity in ('act','watch','info')),
  message text not null,
  fix text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists seo_issues_open on public.seo_issues (severity, last_seen desc) where resolved_at is null;
alter table public.seo_issues enable row level security;

-- When a listing's page last changed in a way search engines care about (not every bid).
alter table public.lots add column if not exists seo_changed_at timestamptz;
create or replace function public.lot_seo_changed() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.status, new.title, new.subtitle, new.take, new.cover_path, new.sold_price, new.corrected_at, new.published_at, new.year, new.make, new.model, new.odometer, new.buy_now_price)
     is distinct from (old.status, old.title, old.subtitle, old.take, old.cover_path, old.sold_price, old.corrected_at, old.published_at, old.year, old.make, old.model, old.odometer, old.buy_now_price) then
    new.seo_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists lot_seo_changed on public.lots;
create trigger lot_seo_changed before insert or update on public.lots for each row execute function public.lot_seo_changed();
update public.lots set seo_changed_at = coalesce(published_at, created_at) where seo_changed_at is null;
create index if not exists lots_seo_changed on public.lots (seo_changed_at);

-- Lots whose pages changed since the last search engine ping (IndexNow), oldest first.
create or replace function public.seo_changed_lots(p_since timestamptz, p_limit int default 5000)
returns table (id bigint, status text, changed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.status, l.seo_changed_at from lots l
   where l.seo_changed_at > p_since and l.status in ('live','referred','offers','sold','passed')
   order by l.seo_changed_at limit p_limit
$$;
revoke execute on function public.seo_changed_lots(timestamptz, int) from public, anon, authenticated;
grant execute on function public.seo_changed_lots(timestamptz, int) to service_role;

-- Raw traffic is kept for 90 days; the daily metrics are kept for good.
create or replace function public.prune_web_events(p_days int default 90) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from web_events where id in (select id from web_events where at < now() - make_interval(days => p_days) limit 50000);
  get diagnostics n = row_count;
  delete from web_visitors where day < current_date - p_days;
  return n;
end $$;
revoke execute on function public.prune_web_events(int) from public, anon, authenticated;
grant execute on function public.prune_web_events(int) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Questions the insights engine asks the data
-- ---------------------------------------------------------------------------
-- Google search terms worth working on: plenty of impressions, ranking on page 1-2 but not at the top,
-- or a click-through rate well below what that position usually gets.
create or replace function public.seo_opportunities(p_days int default 28, p_limit int default 20)
returns table (query text, page text, impressions bigint, clicks bigint, "position" numeric, ctr numeric)
language sql stable security definer set search_path = public as $$
  with q as (
    select s.query, sum(s.impressions)::bigint imp, sum(s.clicks)::bigint clk,
           round(sum(s.position * s.impressions) / nullif(sum(s.impressions), 0), 1) pos,
           (array_agg(s.page order by s.impressions desc))[1] top_page
      from seo_search_daily s where s.day >= current_date - p_days group by s.query)
  select q.query, q.top_page, q.imp, q.clk, q.pos, round(q.clk::numeric / nullif(q.imp, 0), 4)
    from q where q.imp >= 30 and q.pos between 3.5 and 20
   order by q.imp desc limit p_limit
$$;
revoke execute on function public.seo_opportunities(int, int) from public, anon, authenticated;
grant execute on function public.seo_opportunities(int, int) to service_role;

-- How far below the reserve bidding finished on vehicles that didn't meet it (reserves are private:
-- only this summary leaves the database).
create or replace function public.reserve_gap(p_days int default 30)
returns table (lots bigint, avg_gap numeric, category text)
language sql stable security definer set search_path = public as $$
  select count(*), round(avg((p.reserve_price - l.current_bid) / nullif(l.current_bid, 0)), 3), coalesce(l.category, '')
    from lots l join lot_private p on p.lot_id = l.id
   where l.ends_at >= now() - make_interval(days => p_days) and l.ends_at < now()
     and l.bid_count > 0 and p.reserve_price is not null and l.current_bid < p.reserve_price
     and l.status in ('referred','offers','passed','sold')
   group by rollup (l.category)
$$;
revoke execute on function public.reserve_gap(int) from public, anon, authenticated;
grant execute on function public.reserve_gap(int) to service_role;

-- Page views in the last few days for a set of vehicles (for "ending soon with no bids").
create or replace function public.lot_recent_views(p_ids bigint[], p_days int default 7)
returns table (lot_id bigint, views bigint)
language sql stable security definer set search_path = public as $$
  select e.lot_id, count(*) from web_events e
   where e.lot_id = any(p_ids) and e.kind = 'view' and e.at >= now() - make_interval(days => p_days)
   group by e.lot_id
$$;
revoke execute on function public.lot_recent_views(bigint[], int) from public, anon, authenticated;
grant execute on function public.lot_recent_views(bigint[], int) to service_role;

-- What the nightly SEO audit needs to know about every live listing, in one query.
create or replace function public.seo_lot_audit(p_limit int default 20000)
returns table (id bigint, title text, category text, year int, make text, model text, odometer int, hours int,
               take_len int, subtitle text, cover_path text, photos int, videos int, suburb text, state text, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.title, l.category, l.year, l.make, l.model, l.odometer, l.hours,
         coalesce(length(l.take), 0), l.subtitle, l.cover_path,
         (select count(*)::int from lot_photos p where p.lot_id = l.id),
         (select count(*)::int from lot_videos v where v.lot_id = l.id and v.status = 'approved'),
         l.suburb, l.state, l.ends_at
    from lots l where l.status = 'live' order by l.ends_at limit p_limit
$$;
revoke execute on function public.seo_lot_audit(int) from public, anon, authenticated;
grant execute on function public.seo_lot_audit(int) to service_role;

-- Search Console totals by query or by page, for the SEO page.
create or replace function public.seo_top(p_days int default 28, p_by text default 'query', p_limit int default 25)
returns table (key text, clicks bigint, impressions bigint, ctr numeric, "position" numeric)
language sql stable security definer set search_path = public as $$
  select case when p_by = 'page' then s.page else s.query end k, sum(s.clicks)::bigint, sum(s.impressions)::bigint,
         round(sum(s.clicks)::numeric / nullif(sum(s.impressions), 0), 4),
         round(sum(s.position * s.impressions) / nullif(sum(s.impressions), 0), 1)
    from seo_search_daily s where s.day >= current_date - p_days
   group by k order by sum(s.clicks) desc, sum(s.impressions) desc limit p_limit
$$;
revoke execute on function public.seo_top(int, text, int) from public, anon, authenticated;
grant execute on function public.seo_top(int, text, int) to service_role;
