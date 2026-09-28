// Times every database query the site makes, as the right role with security rules on,
// against the full-size database. Usage: node tests/load/bench.mjs <label>
import { client, as, stats, save, rnd, uid } from './lib.mjs';
import { SIZE_FROM_DB } from './size.mjs';

const label = process.argv[2] || 'run';
const RUNS = Number(process.env.RUNS || 25);
const c = await client();
const S = await SIZE_FROM_DB(c);
const U = () => uid(1 + rnd(S.VERIFIED));
const L = () => 100001 + rnd(S.LIVE);
const ADMIN = '00000000-0000-0000-0000-00000000a0a0';
const ids60 = () => Array.from({ length: 60 }, L);

const hasCol = async (t, col) => (await c.query(`select 1 from information_schema.columns where table_name=$1 and column_name=$2`, [t, col])).rowCount > 0;
const hasCover = await hasCol('lots', 'cover_path');
const hasSearch = await hasCol('lots', 'search');

// [name, who ('anon' | 'user' | 'admin' | 'service'), sql, params()]
const Q = [
  // Public pages (anyone)
  ['home: ending soon', 'anon', `select * from lots where status='live' order by ends_at limit 8`],
  ['home: featured', 'anon', `select * from lots where status='live' and featured order by ends_at limit 1`],
  ['auctions: all live', 'anon', `select * from lots where status='live' order by ends_at limit 60`],
  ['auctions: utes in QLD under $20k', 'anon', `select * from lots where status='live' and category='utes' and state='QLD' and current_bid <= 20000 order by ends_at limit 60`],
  ['auctions: search "hilux"', 'anon', hasSearch ? `select * from lots where status='live' and search ilike '%hilux%' order by ends_at limit 60` : `select * from lots where status='live' and (title ilike '%hilux%' or suburb ilike '%hilux%' or make ilike '%hilux%' or model ilike '%hilux%' or body ilike '%hilux%') order by ends_at limit 60`],
  ['auctions: past results', 'anon', `select * from lots where status in ('sold','passed','offers','referred') order by ends_at desc limit 60`],
  ['auctions: cover photos for 60 cards', 'anon', hasCover ? `select id, cover_path from lots where id = any($1)` : `select lot_id, path, sort from lot_photos where lot_id = any($1) order by sort`, () => [ids60()]],
  ['lot page: vehicle', 'anon', `select * from lots where id=$1`, () => [L()]],
  ['lot page: photos', 'anon', `select * from lot_photos where lot_id=$1 order by sort`, () => [L()]],
  ['lot page: flaws', 'anon', `select * from lot_flaws where lot_id=$1 order by sort`, () => [L()]],
  ['lot page: bid history', 'anon', `select * from bid_history($1, 8)`, () => [100000 + S.LIVE + 1000 + rnd(S.LOTS - S.LIVE - 1000)]],
  ['lot page: similar vehicles', 'anon', `select * from lots where status='live' and category='cars' and id <> $1 order by ends_at limit 4`, () => [L()]],
  ['fees', 'anon', `select value from settings where key='fees'`],
  // Signed-in member
  ['member: profile', 'user', `select * from profiles where id=$1`, (u) => [u]],
  ['member: watchlist count (header)', 'user', `select count(*) from watchlist where user_id=$1`, (u) => [u]],
  ['member: watched ids', 'user', `select lot_id from watchlist where user_id=$1`, (u) => [u]],
  ['member: my position on a lot', 'user', `select * from my_position($1)`, () => [L()]],
  ['member: my invoice for a lot', 'user', `select id from invoices where lot_id=$1 and buyer_id=$2 and status <> 'cancelled'`, (u) => [L(), u]],
  ['member: my offer on a lot', 'user', `select amount, status from offers where lot_id=$1 and user_id=$2 order by created_at desc limit 1`, (u) => [L(), u]],
  ['member: my inspection', 'user', `select * from inspections where lot_id=$1 and user_id=$2 and status <> 'cancelled' limit 1`, (u) => [L(), u]],
  ['member: watchlist page', 'user', `select w.lot_id, w.remind, (select row_to_json(l) from lots l where l.id = w.lot_id) from watchlist w where w.user_id=$1`, (u) => [u]],
  ['member: my maximum bids', 'user', `select lot_id, max_amount from max_bids where bidder_id=$1`, (u) => [u]],
  ['member: saved searches', 'user', `select * from saved_searches where user_id=$1 order by created_at desc`, (u) => [u]],
  ['member: invoices', 'user', `select i.*, (select row_to_json(x) from (select title from lots where id=i.lot_id) x) from invoices i where buyer_id=$1 order by created_at desc`, (u) => [u]],
  ['member: notifications', 'user', `select * from notifications where user_id=$1 order by created_at desc limit 20`, (u) => [u]],
  ['member: bid history (own bids marked)', 'user', `select * from bid_history($1, 20)`, () => [100000 + S.LIVE + 1000 + rnd(S.LOTS - S.LIVE - 1000)]],
  // Admin screens
  ['admin: dashboard counts (11)', 'service', `select
    (select count(*) from lots where status='live'), (select count(*) from lots where status='live' and ends_at between now() and now()+interval '1 day'),
    (select count(*) from lots where status='referred'), (select count(*) from offers where status='pending'),
    (select count(*) from invoices where status='payment_failed'), (select count(*) from invoices where status='deposit_paid'),
    (select count(*) from appraisals where status='new'), (select count(*) from inspections where status='requested'),
    (select count(*) from reports where status='open'), (select count(*) from lots where status='draft'), (select count(*) from quote_requests where status='new')`],
  ['admin: newest members', 'service', `select * from profiles order by created_at desc limit 200`],
  ['admin: find a member', 'service', `select * from profiles where email ilike '%u123456%' or last_name ilike '%u123456%' or mobile ilike '%u123456%' order by created_at desc limit 200`],
  ['admin: invoices', 'service', `select i.*, (select title from lots where id=i.lot_id), (select row_to_json(p) from (select first_name,last_name,mobile,email from profiles where id=i.buyer_id) p) from invoices i order by created_at desc limit 200`],
  ['admin: failed payments', 'service', `select * from invoices where status='payment_failed' order by created_at desc limit 200`],
  ['admin: vehicles', 'service', `select id, title, status from lots order by created_at desc limit 200`],
  ['admin: find a vehicle', 'service', `select id, title, status from lots where title ilike '%landcruiser%' order by created_at desc limit 200`],
  ['admin: inspections', 'service', `select * from inspections where status <> 'cancelled' order by created_at desc limit 200`],
  ['admin: appraisals', 'service', `select * from appraisals order by created_at desc limit 200`],
  ['admin: referrals & offers', 'service', `select id, title, status from lots where status in ('referred','offers') order by decision_by`],
  ['admin (editor): vehicles via security rules', 'admin', `select * from lots order by created_at desc limit 50`],
  ['admin (editor): photos via security rules', 'admin', `select * from lot_photos where lot_id=$1 order by sort`, () => [L()]],
  // The clock (runs every minute)
  ['clock: find auctions to close', 'service', `select lots.id from lots left join lot_private p on p.lot_id = lots.id where status='live' and ends_at <= now()`],
  ['clock: invoices to charge', 'service', `select id from invoices where status='pending_charge' limit 50`],
  ['clock: watchlist reminders', 'service', `select w.user_id, w.lot_id from watchlist w join lots l on l.id=w.lot_id where w.remind and w.reminded_at is null and l.status='live' and l.ends_at <= now()+interval '1 hour' and l.ends_at > now() limit 200`],
  ['clock: saved-search sweep (1 search)', 'service', `select * from lots where status='live' and category='utes' and state='QLD' and current_bid <= 15000 and created_at > now() - interval '15 minutes' order by ends_at limit 60`],
];

const results = [];
for (const [name, who, sql, params] of Q) {
  const times = [];
  let err = null;
  for (let i = 0; i < RUNS; i++) {
    const u = U();
    const role = who === 'user' ? u : who === 'admin' ? ADMIN : who;
    const r = await as(c, role, sql, params ? params(u) : []);
    if (r.error) { err = r.error; break; }
    times.push(r.ms);
  }
  const s = stats(times);
  results.push({ name, who, ...s, error: err });
  console.log(`${String(s.p50 ?? '-').padStart(8)} ms p50 ${String(s.p95 ?? '-').padStart(8)} ms p95  ${name}${err ? '  ERROR ' + err : ''}`);
}
save(`bench-${label}`, results);
await c.end();
