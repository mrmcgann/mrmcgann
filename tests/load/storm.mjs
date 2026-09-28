// Load test against the full-size database: a busy sale day, a last-second snipe,
// thousands of auctions closing at once, a sign-up rush and the message queue.
// Usage: node tests/load/storm.mjs   (env: CONC=150 SECONDS=60 USERS_LIVE=10000)
import { pool, client, stats, save, rnd, uid } from './lib.mjs';
import { SIZE_FROM_DB } from './size.mjs';

const CONC = Number(process.env.CONC || 150);          // database connections in use at once
const SECONDS = Number(process.env.SECONDS || 60);
const USERS_LIVE = Number(process.env.USERS_LIVE || 10000);
const p = pool(CONC);
const c = await client();
const S = await SIZE_FROM_DB(c);
const ONLY = (process.env.ONLY || '1,2,3,4,5,6,7').split(',');
const out = { conc: CONC, seconds: SECONDS, usersLive: USERS_LIVE };
const liveUsers = Array.from({ length: USERS_LIVE }, (_, i) => uid(1 + ((i * 7919) % S.VERIFIED)));
const LIVE0 = 100001;
const HOT = Math.min(300, S.LIVE);
const inc = (a) => (a < 5000 ? 100 : a < 20000 ? 250 : 500);

// One request the way the Data API runs it: its own transaction, role and claims.
async function req(who, sql, params = []) {
  const cl = await p.connect();
  const t = performance.now();
  try {
    const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
    const claims = who === 'anon' ? { role: 'anon' } : who === 'service' ? { role: 'service_role' } : { sub: who, role: 'authenticated' };
    await cl.query('begin');
    await cl.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`, [role, JSON.stringify(claims)]);
    const r = await cl.query(sql, params);
    await cl.query('commit');
    return { rows: r.rows, ms: performance.now() - t };
  } catch (e) {
    await cl.query('rollback').catch(() => {});
    return { error: e.message, code: e.code, ms: performance.now() - t };
  } finally { cl.release(); }
}

const NORMAL = /too_low|max_not_higher|auction_closed/; // everyday bid refusals, not faults
function tally() { return { lat: {}, count: {}, refused: 0, faults: {}, }; }
function rec(T, op, r) {
  (T.lat[op] ||= []).push(r.ms);
  T.count[op] = (T.count[op] || 0) + 1;
  if (r.error) {
    if (NORMAL.test(r.error)) T.refused++;
    else T.faults[`${op}: ${r.error.slice(0, 80)}`] = (T.faults[`${op}: ${r.error.slice(0, 80)}`] || 0) + 1;
  }
}
const pickHot = () => LIVE0 + Math.floor(HOT * Math.pow(Math.random(), 2.2)); // most attention on a few cars
const pickAny = () => LIVE0 + rnd(S.LIVE);
const user = () => liveUsers[rnd(liveUsers.length)];

async function bidOn(T, lot, u) {
  const cur = await req('anon', `select current_bid, bid_count from lots where id=$1`, [lot]);
  rec(T, 'read price', cur);
  const row = cur.rows?.[0];
  if (!row) return;
  const now = Number(row.current_bid);
  const min = row.bid_count === 0 ? Math.max(now, 500) : now + inc(now);
  const max = min + inc(min) * rnd(6);
  rec(T, 'place bid', await req(u, `select place_bid($1, $2) r`, [lot, max]));
}

// ---------------------------------------------------------------------------
// 1. Busy sale day: 10,000 members browsing and bidding at full speed
// ---------------------------------------------------------------------------
if (ONLY.includes('1')) {
  console.log(`\n1. Sale day: ${USERS_LIVE.toLocaleString()} members, ${CONC} connections, ${SECONDS}s, every page view hitting the database (no cache)`);
  const T = tally();
  const end = Date.now() + SECONDS * 1000;
  let ops = 0;
  async function worker() {
    while (Date.now() < end) {
      const x = Math.random();
      const lot = Math.random() < 0.7 ? pickHot() : pickAny();
      if (x < 0.45) {
        rec(T, 'view vehicle', await req('anon', `select * from lots where id=$1`, [lot]));
        rec(T, 'view photos', await req('anon', `select * from lot_photos where lot_id=$1 order by sort`, [lot]));
        rec(T, 'view bid history', await req('anon', `select * from bid_history($1, 8)`, [lot]));
      } else if (x < 0.55) {
        rec(T, 'browse auctions', await req('anon', `select * from lots where status='live' order by ends_at limit 60`));
      } else if (x < 0.62) {
        const u = user();
        rec(T, 'my position', await req(u, `select * from my_position($1)`, [lot]));
        rec(T, 'header count', await req(u, `select count(*) from watchlist where user_id=$1`, [u]));
      } else if (x < 0.90) {
        await bidOn(T, lot, user());
      } else if (x < 0.95) {
        const u = user();
        rec(T, 'watch', await req(u, `insert into watchlist (user_id, lot_id) values ($1,$2) on conflict do nothing`, [u, lot]));
      } else {
        const u = user();
        rec(T, 'watchlist page', await req(u, `select w.lot_id, (select row_to_json(l) from lots l where l.id=w.lot_id) from watchlist w where w.user_id=$1`, [u]));
      }
      ops++;
    }
  }
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, worker));
  const secs = (Date.now() - t0) / 1000;
  const requests = Object.values(T.count).reduce((a, b) => a + b, 0);
  const lat = Object.fromEntries(Object.entries(T.lat).map(([k, v]) => [k, stats(v)]));
  out.saleDay = { secs, requests, perSecond: Math.round(requests / secs), bids: T.count['place bid'] || 0,
    bidsPerSecond: Math.round((T.count['place bid'] || 0) / secs), refusedNormal: T.refused, faults: T.faults, lat };
  console.log(`   ${requests.toLocaleString()} requests in ${secs.toFixed(0)}s = ${out.saleDay.perSecond}/s; ${out.saleDay.bids.toLocaleString()} bids (${out.saleDay.bidsPerSecond}/s); faults: ${JSON.stringify(T.faults)}`);
  for (const [k, v] of Object.entries(lat)) console.log(`   ${k.padEnd(18)} p50 ${v.p50} ms  p95 ${v.p95} ms  p99 ${v.p99} ms  (n=${v.n})`);
}

// ---------------------------------------------------------------------------
// 2. The snipe: 2,000 people bid on one car in its final 30 seconds
// ---------------------------------------------------------------------------
if (ONLY.includes('2')) {
  const lot = LIVE0 + S.LIVE - 1;
  const N = Number(process.env.SNIPERS || 2000);
  console.log(`\n2. Snipe: ${N.toLocaleString()} bidders on lot ${lot} in its last 30 seconds`);
  await c.query(`update lots set ends_at = now() + interval '30 seconds' where id=$1`, [lot]);
  const T = tally();
  const bidders = Array.from({ length: N }, (_, i) => uid(1 + ((i * 104729) % S.VERIFIED)));
  const t0 = Date.now();
  let k = 0;
  async function sniper() { while (k < bidders.length) { const u = bidders[k++]; await bidOn(T, lot, u); if (Math.random() < 0.5) await bidOn(T, lot, u); } }
  await Promise.all(Array.from({ length: CONC }, sniper));
  const secs = (Date.now() - t0) / 1000;
  const { rows: [l] } = await c.query(`select l.*, p.leader_max, (select max(created_at) from bids where lot_id=l.id) last_bid,
    (select count(*) from bids where lot_id=l.id)::int nbids, (select max(amount) from bids where lot_id=l.id) top_bid,
    (select max(max_amount) from max_bids where lot_id=l.id) top_max from lots l join lot_private p on p.lot_id=l.id where l.id=$1`, [lot]);
  out.snipe = { bidders: N, secs, accepted: (T.count['place bid'] || 0) - T.refused, refusedNormal: T.refused, faults: T.faults,
    lat: stats(T.lat['place bid'] || []), final: { current_bid: Number(l.current_bid), bid_count: l.bid_count, bids_rows: l.nbids,
      ends_at: l.ends_at, last_bid: l.last_bid, extendedPastLastBid: (new Date(l.ends_at) - new Date(l.last_bid)) / 60000 } };
  console.log(`   ${out.snipe.accepted} bids accepted, ${T.refused} refused as too low (normal), ${Object.keys(T.faults).length} fault types in ${secs.toFixed(1)}s; p95 ${out.snipe.lat.p95} ms`);
  console.log(`   final bid $${l.current_bid}, ${l.nbids} bids, auction now ends ${(out.snipe.final.extendedPastLastBid).toFixed(2)} min after the last bid`);
}

// ---------------------------------------------------------------------------
// 3. Every auction checked for correctness after the storm
// ---------------------------------------------------------------------------
if (ONLY.includes('3')) {
  const { rows } = await c.query(`
    with m as (select lot_id, max(max_amount) top, (array_agg(bidder_id order by max_amount desc, first_set_at))[1] top_bidder,
                      (array_agg(max_amount order by max_amount desc))[2] runner_up from max_bids where lot_id between $1 and $2 - 1 group by lot_id),
         b as (select lot_id, count(*)::int n, max(amount) top_bid from bids where lot_id between $1 and $2 - 1 group by lot_id)
    select l.id, l.current_bid, l.bid_count, l.leader_id, p.leader_max, p.reserve_price, m.top, m.top_bidder, m.runner_up, b.n, b.top_bid
    from lots l join lot_private p on p.lot_id=l.id join m on m.lot_id=l.id join b on b.lot_id=l.id`, [LIVE0, LIVE0 + S.LIVE]);
  const bad = [];
  for (const r of rows) {
    const cb = Number(r.current_bid), lm = Number(r.leader_max), top = Number(r.top), second = r.runner_up == null ? null : Number(r.runner_up);
    if (lm !== top) bad.push([r.id, 'leader max is not the highest max']);
    if (r.bid_count !== r.n) bad.push([r.id, `bid_count ${r.bid_count} vs ${r.n} bid rows`]);
    if (cb !== Number(r.top_bid)) bad.push([r.id, `current bid ${cb} vs top bid ${r.top_bid}`]);
    if (cb > lm) bad.push([r.id, 'visible bid above leader max']);
    if (second != null && cb < second) bad.push([r.id, `visible bid ${cb} below runner-up max ${second}`]);
  }
  out.integrity = { lotsChecked: rows.length, problems: bad.length, examples: bad.slice(0, 10) };
  console.log(`\n3. Integrity: ${rows.length} auctions with bids checked, ${bad.length} problems ${bad.length ? JSON.stringify(bad.slice(0, 5)) : ''}`);
}

// ---------------------------------------------------------------------------
// 4. 2,000 auctions close in the same minute; alerts queued; charges claimed
// ---------------------------------------------------------------------------
if (ONLY.includes('4')) {
  const CLOSE = Math.min(2000, S.LIVE - 1);
  console.log(`\n4. Close: ${CLOSE.toLocaleString()} auctions end at once`);
  await c.query(`update lots set ends_at = now() - interval '1 second' where id between $1 and $2`, [LIVE0, LIVE0 + CLOSE - 1]);
  const before = Number((await c.query(`select count(*) from outbox`)).rows[0].count);
  let t = Date.now(), closed = 0, n;
  do { n = Number((await req('service', `select close_due_lots(500) n`)).rows[0].n); closed += n; } while (n > 0);
  const closeMs = Date.now() - t;
  t = Date.now(); let notices = 0;
  do { n = Number((await req('service', `select queue_status_notices(200) n`)).rows[0].n); notices += n; } while (n > 0);
  const noticeMs = Date.now() - t;
  const queued = Number((await c.query(`select count(*) from outbox`)).rows[0].count) - before;
  t = Date.now(); let claimed = 0;
  do { n = (await req('service', `select id from claim_invoice_charges(25)`)).rows.length; claimed += n; } while (n > 0);
  const claimMs = Date.now() - t;
  const dup = Number((await c.query(`select count(*) from (select lot_id from invoices group by lot_id having count(*) > 1) x`)).rows[0].count);
  out.close = { auctions: closed, closeMs, statusNotices: notices, noticeMs, messagesQueued: queued, invoicesClaimed: claimed, claimMs, duplicateInvoices: dup };
  console.log(`   closed ${closed} in ${closeMs} ms; alerts for ${notices} lots queued ${queued.toLocaleString()} messages in ${noticeMs} ms; ${claimed} invoices claimed for charging in ${claimMs} ms; duplicate invoices: ${dup}`);
}

// ---------------------------------------------------------------------------
// 5. Watchlist reminders + saved-search alerts (set-based)
// ---------------------------------------------------------------------------
if (ONLY.includes('5')) {
  await c.query(`update lots set ends_at = now() + interval '30 minutes' where id between $1 and $2 and status='live'`, [LIVE0 + 2000, LIVE0 + 2400]);
  await c.query(`update lots set published_at = now() where id between $1 and $2 and status='live'`, [LIVE0 + 2400, LIVE0 + 2450]);
  let t = Date.now();
  const rem = Number((await req('service', `select queue_ending_reminders(50000) n`)).rows[0].n);
  const remMs = Date.now() - t;
  t = Date.now();
  const srch = Number((await req('service', `select queue_search_alerts() n`)).rows[0].n);
  const srchMs = Date.now() - t;
  out.alerts = { reminders: rem, remindersMs: remMs, searchAlerts: srch, searchAlertsMs: srchMs };
  console.log(`\n5. Alerts: ${rem.toLocaleString()} one-hour reminders queued in ${remMs} ms; ${srch.toLocaleString()} saved-search matches (50 new vehicles × 250,000 searches) in ${srchMs} ms`);
}

// ---------------------------------------------------------------------------
// 6. Message queue: how fast the database can hand out and close off messages
// ---------------------------------------------------------------------------
if (ONLY.includes('6')) {
  const total = Number((await c.query(`select count(*) from outbox where status='queued'`)).rows[0].count);
  const t = Date.now(); let n, done = 0;
  const senders = Array.from({ length: 8 }, async () => {
    while (true) {
      const r = await req('service', `select id from claim_outbox(200)`);
      if (!r.rows?.length) break;
      await req('service', `select finish_outbox($1::bigint[])`, [r.rows.map((x) => x.id)]);
      done += r.rows.length;
    }
  });
  await Promise.all(senders);
  const ms = Date.now() - t;
  const dupSent = Number((await c.query(`select count(*) from (select dedupe_key from outbox where dedupe_key is not null group by 1 having count(*)>1) x`)).rows[0].count);
  out.queue = { messages: done, ms, perSecond: Math.round(done / (ms / 1000)), duplicates: dupSent, of: total };
  console.log(`\n6. Queue: 8 parallel senders took ${done.toLocaleString()} messages through the queue in ${ms} ms (${out.queue.perSecond.toLocaleString()}/s), duplicates: ${dupSent}`);
}

// ---------------------------------------------------------------------------
// 7. Sign-up rush: 5,000 new accounts in a burst
// ---------------------------------------------------------------------------
if (ONLY.includes('7')) {
  const N = 5000, base = Date.now();
  const lat = [];
  let k = 0;
  const t = Date.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (k < N) {
      const i = k++;
      const r = await req('service', `insert into auth.users (id, email) values (gen_random_uuid(), $1)`, [`rush${base}-${i}@load.test`]);
      lat.push(r.ms);
    }
  }));
  const ms = Date.now() - t;
  out.signups = { accounts: N, ms, perSecond: Math.round(N / (ms / 1000)), lat: stats(lat) };
  console.log(`\n7. Sign-ups: ${N.toLocaleString()} accounts (with profiles) in ${ms} ms = ${out.signups.perSecond}/s, p95 ${out.signups.lat.p95} ms`);
}

save(process.env.ONLY ? `storm-${ONLY.join('')}` : 'storm', out);
await p.end(); await c.end();
