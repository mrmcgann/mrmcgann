-- Fills the database to "three years after launch" size.
-- Placeholders ({{USERS}} etc.) are filled in by build.mjs.
set synchronous_commit = off;

-- 1. Accounts ------------------------------------------------------------------
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users (id, email)
select md5('u' || i)::uuid, 'u' || i || '@load.test' from generate_series(1, {{USERS}}) i;
alter table auth.users enable trigger on_auth_user_created;

insert into public.profiles (id, email, first_name, last_name, dob, mobile, mobile_verified, street, suburb, state, postcode,
  details_done, stripe_customer_id, payment_method_id, card_brand, card_last4, id_status, terms_accepted_at, terms_version, created_at)
select md5('u' || i)::uuid, 'u' || i || '@load.test',
  (array['Amy','Ben','Chloe','Dan','Emma','Finn','Grace','Harry','Isla','Jack','Kate','Liam'])[1 + i % 12],
  (array['Smith','Jones','Williams','Brown','Wilson','Taylor','Nguyen','Kelly','Martin','White','Singh','Walker'])[1 + (i / 12) % 12],
  date '1955-01-01' + (i % 18000),
  '04' || lpad((i % 100000000)::text, 8, '0'), i <= {{VERIFIED}},
  (i % 400) || ' Main St',
  (array['Eagle Farm','Toowoomba','Parramatta','Dandenong','Elizabeth','Moonah','Joondalup','Darwin','Belconnen','Geelong'])[1 + i % 10],
  (array['QLD','QLD','NSW','VIC','SA','TAS','WA','NT','ACT','VIC'])[1 + i % 10],
  lpad((2000 + i % 5000)::text, 4, '0'),
  i <= {{VERIFIED}},
  case when i <= {{VERIFIED}} then 'cus_' || i end,
  case when i <= {{VERIFIED}} then 'pm_' || i end,
  case when i <= {{VERIFIED}} then 'Visa' end,
  case when i <= {{VERIFIED}} then '4242' end,
  case when i <= {{VERIFIED}} then 'verified' when i % 7 = 0 then 'pending' else 'none' end,
  now() - (i % 1000) * interval '1 day',
  '2026-10-01',
  now() - (i % 1000) * interval '1 day'
from generate_series(1, {{USERS}}) i;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a0a0', 'admin@load.test');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a0a0';

-- 2. Vehicles --------------------------------------------------------------------
-- 1..LIVE live now, then referred, offers, drafts, then past sales.
create temporary table mk (n int, make text, model text, cat text, vt text);
insert into mk values
 (0,'Toyota','Corolla','cars','car'),(1,'Toyota','HiLux','utes','ute'),(2,'Ford','Ranger','utes','ute'),(3,'Mazda','3','cars','car'),
 (4,'Hyundai','i30','cars','car'),(5,'Holden','Commodore','cars','car'),(6,'Isuzu','NPR','trucks','truck'),(7,'Kenworth','T401','trucks','truck'),
 (8,'Mitsubishi','Triton','utes','ute'),(9,'Nissan','Navara','utes','ute'),(10,'Kia','Cerato','cars','car'),(11,'Volkswagen','Golf','cars','car'),
 (12,'Hino','300','trucks','truck'),(13,'Subaru','Forester','cars','car'),(14,'Toyota','LandCruiser','cars','car'),(15,'Mazda','BT-50','utes','ute');

insert into public.lots (id, status, title, short_title, subtitle, vehicle_type, category, year, make, model, body, engine, transmission,
  fuel, odometer, colour, seats, keys, suburb, state, postcode, backdrop, take, visual_grade, grade_paint, grade_interior, grade_tyres,
  start_price, current_bid, bid_count, buy_now_price, starts_at, ends_at, created_at, featured, winner_id, sold_price, sold_via, leader_id, decision_by)
select 100000 + i,
  case when i <= {{LIVE}} then 'live'
       when i <= {{LIVE}} + 200 then 'referred'
       when i <= {{LIVE}} + 400 then 'offers'
       when i <= {{LIVE}} + 900 then 'draft'
       when i % 5 = 0 then 'passed' else 'sold' end,
  y || ' ' || mk.make || ' ' || mk.model, y || ' ' || mk.make || ' ' || mk.model, 'Load-test vehicle ' || i,
  mk.vt, mk.cat, y, mk.make, mk.model, 'Sedan', '2.0L', 'Auto', 'Petrol', 50000 + (i * 7919) % 300000,
  (array['White','Silver','Red','Blue','Grey','Black'])[1 + i % 6], 5, 2,
  (array['Eagle Farm','Toowoomba','Parramatta','Dandenong','Elizabeth','Moonah','Joondalup','Darwin','Belconnen','Geelong'])[1 + i % 10],
  (array['QLD','QLD','NSW','VIC','SA','TAS','WA','NT','ACT','VIC'])[1 + i % 10], '4000',
  (array['sun','lime','berry','sky','tangerine','lilac','coral'])[1 + i % 7], 'A good honest vehicle.',
  (array['A','B','C','D','E'])[1 + i % 5], 'B', 'B', 'C',
  case when mk.vt = 'truck' then 5000 else 500 end,
  case when i <= {{LIVE}} then case when mk.vt = 'truck' then 5000 else 500 end else 1000 + (i * 37) % 30000 end,
  case when i <= {{LIVE}} then 0 else 20 end,
  case when i % 11 = 0 then 45000 end,
  case when i <= {{LIVE}} then now() - interval '2 days' else now() - ((i % 1000) + 7) * interval '1 day' end,
  case when i <= {{LIVE}} then now() + interval '15 minutes' + (i * 97 % (7 * 24 * 60)) * interval '1 minute'
       when i <= {{LIVE}} + 900 then now() - interval '1 day'
       else now() - (i % 1000) * interval '1 day' end,
  now() - ((i % 1000) + 8) * interval '1 day',
  i = 1,
  case when i > {{LIVE}} + 900 and i % 5 <> 0 then md5('u' || (1 + (i * 7919) % {{VERIFIED}}))::uuid end,
  case when i > {{LIVE}} + 900 and i % 5 <> 0 then 1000 + (i * 37) % 30000 end,
  case when i > {{LIVE}} + 900 and i % 5 <> 0 then 'auction' end,
  case when i > {{LIVE}} and i <= {{LIVE}} + 400 then md5('u' || (1 + (i * 7919) % {{VERIFIED}}))::uuid end,
  case when i > {{LIVE}} and i <= {{LIVE}} + 400 then now() + interval '1 day' end
from generate_series(1, {{LOTS}}) i
join mk on mk.n = i % 16
cross join lateral (select 2004 + i % 20 as y) yy;

insert into public.lot_private (lot_id, reserve_price, seller_name, seller_phone, seller_address)
select id, case when id % 5 < 3 then start_price * 6 end, 'Seller ' || id, '0400000000', id || ' Seller Rd'
from public.lots;

insert into public.lot_photos (lot_id, path, angle, sort)
select l.id, 'lots/' || l.id || '/' || s || '.jpg', null, s from public.lots l, generate_series(0, 11) s;

insert into public.lot_flaws (lot_id, title, note, sort)
select l.id, 'Flaw ' || s, 'Cosmetic.', s from public.lots l, generate_series(1, 3) s;

-- 3. Past bidding ------------------------------------------------------------------
insert into public.bids (lot_id, bidder_id, amount, is_auto, created_at)
select l.id, md5('u' || (1 + (l.id * 31 + s * 7919) % {{VERIFIED}}))::uuid, 400 + s * 100, s % 3 = 0, l.ends_at - (21 - s) * interval '1 hour'
from public.lots l, generate_series(1, 20) s
where l.status not in ('live', 'draft');

insert into public.max_bids (lot_id, bidder_id, max_amount, first_set_at, updated_at)
select lot_id, bidder_id, max(amount), min(created_at), max(created_at) from public.bids group by 1, 2;

-- 4. Invoices for past sales ---------------------------------------------------------
select public.create_invoice(id, winner_id, sold_price, 'auction') from public.lots where status = 'sold';
update public.invoices set status = case when random() < 0.97 then 'paid' when random() < 0.5 then 'payment_failed' else 'deposit_paid' end,
  paid_at = created_at, created_at = now() - random() * interval '900 days';

-- 5. Member activity ----------------------------------------------------------------------
insert into public.watchlist (user_id, lot_id, created_at)
select md5('u' || (1 + (random() * ({{USERS}} - 1))::int))::uuid,
  case when g % 2 = 0 then 100001 + (random() * ({{LIVE}} - 1))::int else 100001 + (random() * ({{LOTS}} - 1))::int end,
  now() - random() * interval '60 days'
from generate_series(1, {{WATCH}}) g
on conflict do nothing;

insert into public.saved_searches (user_id, label, query, last_notified_at, created_at)
select md5('u' || (1 + (random() * ({{USERS}} - 1))::int))::uuid, 'Search ' || g,
  jsonb_build_object('cat', (array['cars','utes','trucks','cheap'])[1 + g % 4], 'state', (array['QLD','NSW','VIC','SA','WA',''])[1 + g % 6], 'max', (5000 + g % 30000)::text),
  now() - interval '1 hour', now() - random() * interval '300 days'
from generate_series(1, {{SEARCHES}}) g;

insert into public.notifications (user_id, kind, title, body, link, channels, read_at, created_at)
select md5('u' || (1 + (random() * ({{USERS}} - 1))::int))::uuid, 'outbid', 'You''ve been outbid', 'Raise your maximum.', '/lot/100001',
  '{email}', case when g % 3 = 0 then now() end, now() - random() * interval '365 days'
from generate_series(1, {{NOTIFICATIONS}}) g;

insert into public.offers (lot_id, user_id, amount, status, created_at)
select 100000 + {{LIVE}} + 201 + (g % 199), md5('u' || (1 + (g * 7919) % {{VERIFIED}}))::uuid, 1000 + g, 'pending', now() - interval '1 hour'
from generate_series(1, 4000) g;

insert into public.inspections (lot_id, user_id, preferred_day, preferred_time, status, created_at)
select 100001 + (g % {{LIVE}}), md5('u' || (1 + (g * 13) % {{VERIFIED}}))::uuid, 'Saturday', 'Morning',
  (array['requested','confirmed','cancelled'])[1 + g % 3], now() - random() * interval '300 days'
from generate_series(1, 30000) g;

insert into public.appraisals (kind, rego, state, name, mobile, email, status, created_at)
select 'car', 'ABC' || g, 'QLD', 'Seller ' || g, '0400000000', 's' || g || '@load.test',
  (array['new','contacted','booked','listed','closed'])[1 + g % 5], now() - random() * interval '900 days'
from generate_series(1, 60000) g;

insert into public.reports (lot_id, user_id, type, details, status, created_at)
select 100001 + g % {{LOTS}}, md5('u' || (1 + g % {{USERS}}))::uuid, 'Wrong details', 'Test', (array['open','reviewed'])[1 + g % 2], now() - random() * interval '300 days'
from generate_series(1, 5000) g;

insert into public.quote_requests (lot_id, user_id, postcode, email, status, created_at)
select 100001 + g % {{LOTS}}, md5('u' || (1 + g % {{USERS}}))::uuid, '4000', 'q' || g || '@load.test', (array['new','quoted','closed'])[1 + g % 3], now() - random() * interval '300 days'
from generate_series(1, 30000) g;

select setval('public.lot_number_seq', 100000 + {{LOTS}} + 1);

-- History is already "told": alerts only go out for vehicles that close from now on.
update public.lots set notified_status = status where status in ('sold','passed','referred','offers');
