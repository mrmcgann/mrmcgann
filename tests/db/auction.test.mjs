import pg from 'pg';
import fs from 'fs';
import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const M = ROOT + '/supabase/';
const PG = { host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres' };
const admin = new pg.Client({ ...PG, database: 'postgres' });
await admin.connect();
await admin.query('drop database if exists tyrebiter_test'); await admin.query('create database tyrebiter_test'); await admin.end();
const c = new pg.Client({ ...PG, database: 'tyrebiter_test' });
await c.connect();
await c.query(fs.readFileSync(ROOT + '/tests/db/supabase_base.sql', 'utf8'));
for (const f of fs.readdirSync(M + 'migrations').sort()) { await c.query(fs.readFileSync(M + 'migrations/' + f, 'utf8')); }
await c.query(fs.readFileSync(M + 'seed.sql', 'utf8'));

let pass = 0, failN = 0; const fails = [];
const ok = (name, cond, extra='') => { if (cond) pass++; else { failN++; fails.push(name + ' ' + extra); } };
const U = { A: '11111111-1111-1111-1111-111111111111', B: '22222222-2222-2222-2222-222222222222', ADM: '33333333-3333-3333-3333-333333333333', NEW: '44444444-4444-4444-4444-444444444444' };
await c.query(`insert into auth.users (id,email) values ('${U.A}','a@x.au'),('${U.B}','b@x.au'),('${U.ADM}','admin@x.au'),('${U.NEW}','new@x.au')`);
// Verify A and B as the service role would; make ADM admin via SQL editor (postgres)
await c.query(`update profiles set details_done=true, first_name='Amy', last_name='Ash', mobile='0411111111', mobile_verified=true, payment_method_id='pm_a', card_brand='Visa', card_last4='4242', id_status='verified', terms_version='2026-10-01' where id in ('${U.A}','${U.B}')`);
await c.query(`update profiles set role='admin' where id='${U.ADM}'`);

// Run a query as a role with JWT claims, inside a transaction (like PostgREST)
async function as(who, sql, params = []) {
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  const claims = who === 'anon' ? { role: 'anon' } : who === 'service' ? { role: 'service_role' } : { sub: U[who], role: 'authenticated' };
  await c.query('begin');
  try {
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const r = await c.query(sql, params);
    await c.query('commit');
    return { rows: r.rows, count: r.rowCount };
  } catch (e) { await c.query('rollback'); return { error: e.message }; }
}

// ---------- anonymous visitor ----------
let r = await as('anon', `select id, status from lots`);
ok('anon reads live lots', r.rows?.length === 10);
await c.query(`insert into lots (id,status,title) values (10999,'draft','Secret draft')`);
r = await as('anon', `select id from lots where id=10999`); ok('anon cannot see drafts', r.rows?.length === 0);
r = await as('anon', `select * from lot_private`); ok('anon cannot read reserves/seller details', r.rows?.length === 0);
r = await as('anon', `select * from bids`); ok('anon cannot read raw bids', r.rows?.length === 0 || r.error);
r = await as('anon', `select * from bid_history(10432)`); ok('anon can read masked bid history', !r.error);
r = await as('anon', `select place_bid(10432, 1000)`); ok('anon cannot bid', r.error?.includes('not_signed_in'), r.error);
r = await as('anon', `select close_due_lots()`); ok('anon cannot run the auction clock', !!r.error, JSON.stringify(r));
r = await as('anon', `select create_invoice(10432,'${U.A}',1,'auction')`); ok('anon cannot create invoices', !!r.error);
r = await as('anon', `insert into appraisals (rego,state,name,mobile) values ('ABC123','QLD','Sam','0400000000')`); ok('anon can request an appraisal', !r.error, r.error);
r = await as('anon', `select * from appraisals`); ok('anon cannot read appraisals', r.rows?.length === 0);
r = await as('anon', `select * from profiles`); ok('anon cannot read profiles', r.rows?.length === 0);
r = await as('anon', `update lots set current_bid = 1 where id=10432`); ok('anon cannot edit lots', r.count === 0 || r.error);
r = await as('anon', `select * from settings where key='fees'`); ok('anon can read fees', r.rows?.length === 1);

// ---------- new member, not yet verified ----------
r = await as('NEW', `select id, email from profiles`); ok('member sees only own profile', r.rows?.length === 1 && r.rows[0].id === U.NEW);
r = await as('NEW', `update profiles set first_name='Nat', last_name='New', dob='1990-01-01', mobile='0422222222' where id='${U.NEW}'`); ok('member can edit own details', !r.error, r.error);
r = await as('NEW', `update profiles set mobile_verified=true where id='${U.NEW}'`); ok('member cannot self-verify mobile', r.error?.includes('protected_field'));
r = await as('NEW', `update profiles set role='admin' where id='${U.NEW}'`); ok('member cannot make themselves admin', r.error?.includes('protected_field'));
r = await as('NEW', `update profiles set id_status='verified' where id='${U.NEW}'`); ok('member cannot self-verify ID', r.error?.includes('protected_field'));
r = await as('NEW', `update profiles set payment_method_id='pm_fake' where id='${U.NEW}'`); ok('member cannot fake a card', r.error?.includes('protected_field'));
r = await as('NEW', `update profiles set first_name='Hack' where id='${U.A}'`); ok('member cannot edit another profile', r.count === 0);
r = await as('NEW', `select place_bid(10432, 1000)`); ok('unverified member cannot bid', r.error?.includes('not_verified'));
r = await as('NEW', `insert into inspections (lot_id,user_id,preferred_day,preferred_time) values (10432,'${U.NEW}','Sat','Morning')`); ok('unverified member cannot book inspections', !!r.error);
r = await as('NEW', `select buy_now(10633)`); ok('unverified member cannot Buy Now', r.error?.includes('not_verified'));
// service role verifies them (as the API routes do)
r = await as('service', `update profiles set details_done=true, mobile_verified=true, payment_method_id='pm_n', id_status='verified' where id='${U.NEW}'`); ok('service role can verify members', !r.error, r.error);
r = await as('A', `update profiles set mobile='0499999999' where id='${U.A}'`);
r = await as('service', `select mobile_verified from profiles where id='${U.A}'`); ok('changing mobile resets verification', r.rows?.[0]?.mobile_verified === false);
await c.query(`update profiles set mobile='0411111111', mobile_verified=true where id='${U.A}'`);
r = await as('A', `update profiles set last_name='Other' where id='${U.A}'`);
r = await as('service', `select id_status from profiles where id='${U.A}'`); ok('changing legal name resets ID check', r.rows?.[0]?.id_status === 'none');
await c.query(`update profiles set last_name='Ash', id_status='verified' where id='${U.A}'`);

// ---------- bidding ----------
r = await as('A', `select place_bid(10432, 1500) r`); ok('A bids', r.rows?.[0]?.r?.status === 'leading' && Number(r.rows[0].r.current_bid) === 500, JSON.stringify(r));
r = await as('B', `select place_bid(10432, 600) r`); ok('B at the minimum is outbid by A proxy', r.rows?.[0]?.r?.status === 'outbid' && Number(r.rows[0].r.current_bid) === 700, JSON.stringify(r));
r = await as('B', `select place_bid(10432, 1500) r`); ok('tie goes to earlier max (A)', r.rows?.[0]?.r?.status === 'outbid' && Number(r.rows[0].r.current_bid) === 1500, JSON.stringify(r));
r = await as('B', `select place_bid(10432, 2000) r`); ok('B takes lead one increment over A max', r.rows?.[0]?.r?.status === 'leading' && Number(r.rows[0].r.current_bid) === 1600 && r.rows[0].r.outbid_user === U.A, JSON.stringify(r));
r = await as('A', `select * from max_bids`); ok('A sees only own max', r.rows?.length === 1 && r.rows[0].bidder_id === U.A);
r = await as('A', `select * from lot_private`); ok('member cannot read reserve or leader max', r.rows?.length === 0);
r = await as('A', `select reserve_met, has_reserve from lots where id=10432`); ok('reserve not met shown', r.rows?.[0]?.reserve_met === false && r.rows[0].has_reserve === true);
r = await as('B', `select place_bid(10432, 3500) r`); ok('leader raising past reserve jumps to reserve', Number(r.rows?.[0]?.r?.current_bid) === 3200, JSON.stringify(r));
r = await as('A', `select reserve_met from lots where id=10432`); ok('reserve now met', r.rows?.[0]?.reserve_met === true);
r = await as('B', `select place_bid(10432, 3400) r`); ok('leader cannot lower max', r.error?.includes('max_not_higher'));
r = await as('A', `select place_bid(10432, 1234.5) r`); ok('cents rejected', r.error?.includes('invalid_amount'));
r = await as('A', `select * from bid_history(10432)`); ok('history masks bidders, marks own', r.rows?.length >= 4 && r.rows.some((x) => x.is_me) && r.rows.every((x) => /•••/.test(x.bidder_tag)));
r = await as('A', `select * from watchlist`); ok('bidding adds to watchlist', r.rows?.some((x) => Number(x.lot_id) === 10432));
// extension
await c.query(`update lots set ends_at = now() + interval '3 minutes' where id=10620`);
r = await as('A', `select place_bid(10620, 700) r`); ok('late bid extends by 10 minutes', r.rows?.[0]?.r?.extended === true);
r = await as('service', `select extract(epoch from ends_at - now()) s from lots where id=10620`); ok('now ~10 minutes left', r.rows?.[0]?.s > 590 && r.rows[0].s <= 601, r.rows?.[0]?.s);
// closed lot
await c.query(`update lots set ends_at = now() - interval '1 second' where id=10611`);
r = await as('A', `select place_bid(10611, 900) r`); ok('cannot bid after the end', r.error?.includes('auction_closed'));

// ---------- closing, invoices ----------
await c.query(`update lots set ends_at = now() - interval '1 second' where id in (10432, 10620)`);
r = await as('B', `select close_due_lots()`); ok('member cannot run clock', !!r.error);
r = await as('service', `select close_due_lots() n`); ok('clock closes due lots', Number(r.rows?.[0]?.n) === 3, JSON.stringify(r));
r = await as('service', `select id, status, winner_id, sold_price from lots where id in (10432,10611,10620) order by id`);
const st = Object.fromEntries((r.rows || []).map((x) => [x.id, x]));
ok('10432 sold to B at 3200', st['10432']?.status === 'sold' && st['10432'].winner_id === U.B && Number(st['10432'].sold_price) === 3200, JSON.stringify(st['10432']));
ok('10620 (no reserve) sold to A', st['10620']?.status === 'sold' && st['10620'].winner_id === U.A);
ok('10611 no bids, no reserve -> passed', st['10611']?.status === 'passed');
r = await as('service', `select * from invoices where lot_id=10432`);
const inv = r.rows?.[0];
ok('invoice created pending charge', inv?.status === 'pending_charge' && inv.mode === 'card');
ok('fees: 10% premium, 10% GST, $99 admin, no card surcharge (RBA ban from 1 Oct 2026)', Number(inv?.premium) === 320 && Number(inv?.gst) === 32 && Number(inv?.admin_fee) === 99 && Number(inv?.subtotal) === 3651 && Number(inv?.surcharge) === 0 && Number(inv?.total) === 3651, JSON.stringify(inv));
r = await as('A', `select * from invoices`); ok("A cannot see B's invoice", !r.rows?.some((x) => x.buyer_id === U.B));
r = await as('B', `select * from invoices`); ok('B sees own invoice', r.rows?.some((x) => Number(x.lot_id) === 10432));
r = await as('B', `update invoices set status='paid'`); ok('member cannot mark own invoice paid', r.count === 0 || !!r.error);

// ---------- deposit tier, Buy Now ----------
r = await as('A', `select buy_now(10633) id`); ok('Buy Now works for verified member', !!r.rows?.[0]?.id, r.error);
r = await as('service', `select mode, card_amount, balance_due, total from invoices where lot_id=10633`);
ok('$8,900 Buy Now -> $500 deposit, no surcharge', r.rows?.[0]?.mode === 'deposit' && Number(r.rows[0].card_amount) === 500 && Number(r.rows[0].balance_due) === 9478, JSON.stringify(r.rows));
r = await as('B', `select buy_now(10633)`); ok('Buy Now only once', r.error?.includes('auction_closed'));
r = await as('B', `select place_bid(10590, 60000) r`);
r = await as('service', `select mode, card_amount from price_breakdown(60000) as t(mode text, card_amount numeric)`).catch(()=>({}));
r = await as('service', `select price_breakdown(60000) b`);
ok('$60,000 -> $1,000 deposit', Number(r.rows?.[0]?.b?.card_base) === 1000 && r.rows[0].b.mode === 'deposit', JSON.stringify(r.rows?.[0]));

// ---------- referral and offers ----------
r = await as('A', `select place_bid(10588, 10000) r`); ok('A bids below reserve on tipper', r.rows?.[0]?.r?.status === 'leading');
await c.query(`update lots set ends_at = now() - interval '1 second' where id=10588`);
await as('service', `select close_due_lots()`);
r = await as('service', `select status, decision_by is not null d from lots where id=10588`); ok('below reserve -> referred with deadline', r.rows?.[0]?.status === 'referred' && r.rows[0].d);
r = await as('A', `select admin_accept(10588)`); ok('member cannot accept referrals', r.error?.includes('forbidden'));
r = await as('B', `select make_offer(10588, 20000)`); ok('no offers while referred', r.error?.includes('offers_closed'));
r = await as('ADM', `select admin_decline_referral(10588)`); ok('admin declines referral', !r.error, r.error);
r = await as('service', `select status from lots where id=10588`); ok('offers open', r.rows?.[0]?.status === 'offers');
r = await as('B', `select make_offer(10588, 20000) id`); ok('B offers', !!r.rows?.[0]?.id, r.error);
r = await as('B', `select make_offer(10588, 19000)`); ok('lower repeat offer rejected', r.error?.includes('offer_not_higher'));
r = await as('B', `select make_offer(10588, 21000) id`); ok('higher offer accepted', !!r.rows?.[0]?.id);
r = await as('A', `select make_offer(10588, 20500) id`); ok('A offers', !!r.rows?.[0]?.id);
r = await as('A', `select * from offers`); ok("A can't see B's offers", r.rows?.every((x) => x.user_id === U.A));
r = await as('service', `select id from offers where user_id='${U.B}' and status='pending'`); const offerB = r.rows?.[0]?.id;
ok('only newest offer pending', r.rows?.length === 1);
r = await as('ADM', `select admin_accept(10588, '${offerB}') inv`); ok('admin accepts B offer', !!r.rows?.[0]?.inv, r.error);
r = await as('service', `select status, winner_id, sold_price, sold_via from lots where id=10588`); ok('sold via offer to B', r.rows?.[0]?.sold_via === 'offer' && r.rows[0].winner_id === U.B && Number(r.rows[0].sold_price) === 21000);
r = await as('service', `select status from offers where user_id='${U.A}' and lot_id=10588`); ok("A's offer declined", r.rows?.[0]?.status === 'declined');

// ---------- admin powers ----------
r = await as('ADM', `select * from lot_private where lot_id=10432`); ok('admin reads seller details', r.rows?.length === 1);
r = await as('ADM', `insert into lots (status,title) values ('draft','New car') returning id`); ok('admin creates lots', !!r.rows?.[0]?.id, r.error);
r = await as('ADM', `insert into lot_private (lot_id, reserve_price) values (${r.rows?.[0]?.id}, 5000)`); 
r = await as('service', `select has_reserve, reserve_met from lots where title='New car'`); ok('reserve syncs to public flags', r.rows?.[0]?.has_reserve === true && r.rows[0].reserve_met === false);
r = await as('A', `insert into lots (status,title) values ('live','Fake')`); ok('member cannot create lots', !!r.error);
r = await as('ADM', `update profiles set suspended=true where id='${U.NEW}'`); ok('admin can suspend', !r.error, r.error);
r = await as('NEW', `select place_bid(10599, 6000)`); ok('suspended member cannot bid', r.error?.includes('not_verified'));
r = await as('A', `insert into reports (lot_id,user_id,type) values (10599,'${U.A}','Suspicious bidding')`); ok('member can report', !r.error, r.error);
r = await as('A', `select * from reports`); ok('member cannot read reports', r.rows?.length === 0);
r = await as('A', `insert into quote_requests (lot_id,postcode,email) values (10599,'4000','a@x.au')`); ok('quotes inserted only via server', !!r.error || r.count === 0);

// ---------- scale: live updates, queue, charging, rate limits ----------
r = { rows: (await c.query(`select count(*)::int n from realtime.sent where topic='lot:10599'`)).rows }; ok('bids broadcast live updates on lot:<id>', r.rows?.[0]?.n > 0, JSON.stringify(r));
r = await as('service', `select count(*)::int n from outbox where kind='outbid'`); ok('outbid alerts queued by the bidding engine', r.rows?.[0]?.n > 0);
r = await as('A', `select * from outbox`); ok('members cannot read the message queue', r.rows?.length === 0 || !!r.error);
r = await as('service', `select count(*)::int n from claim_invoice_charges(100)`); const firstClaim = r.rows?.[0]?.n;
r = await as('service', `select count(*)::int n from claim_invoice_charges(100)`); ok('an invoice can only be claimed for charging once', firstClaim >= 1 && r.rows?.[0]?.n === 0, `${firstClaim} then ${r.rows?.[0]?.n}`);
r = await as('service', `select hit_rate_limit('t:1', 2, 60) a, hit_rate_limit('t:1', 2, 60) b, hit_rate_limit('t:1', 2, 60) c`);
ok('rate limit allows 2 then blocks', r.rows?.[0]?.a === true && r.rows[0].b === true && r.rows[0].c === false, JSON.stringify(r.rows));
r = await as('anon', `select hit_rate_limit('t:2', 2, 60)`); ok('anon cannot touch rate limits', !!r.error);
r = await as('A', `select me() m`); ok('me() returns own profile with counts', r.rows?.[0]?.m?.id === U.A && typeof r.rows[0].m.watch_count === 'number', JSON.stringify(r.rows?.[0]));
r = await as('A', `select my_lot_state(10599) s`); ok('my_lot_state works', r.rows?.[0]?.s && 'my_max' in r.rows[0].s, JSON.stringify(r));
r = await as('A', `select * from my_bids()`); ok('my bids lists every lot bid on', r.rows?.length >= 1, r.error);

// ---------- terms version ----------
await c.query(`update profiles set terms_version='2020-01-01' where id='${U.A}'`);
r = await as('A', `select place_bid(10611, 900000)`); ok('outdated terms block bidding', r.error?.includes('terms_outdated'), r.error);
await c.query(`update profiles set terms_version='2026-10-01' where id='${U.A}'`);
r = await as('A', `update profiles set terms_version='x' where id='${U.A}'`); ok('members cannot set terms version themselves', r.error?.includes('protected_field'), r.error);

// ---------- seller agency agreement, publish gate, seller can't bid ----------
const S = '55555555-5555-5555-5555-555555555555';
U.S = S;
await c.query(`insert into auth.users (id,email) values ('${S}','seller@x.au')`);
await c.query(`update profiles set details_done=true, first_name='Sam', last_name='Seller', mobile='0499999999', mobile_verified=true, id_status='verified', terms_version='2026-10-01', payment_method_id='pm_s' where id='${S}'`);
r = await as('ADM', `insert into lots (status,title,ends_at,start_price) values ('draft','Seller car', now()+interval '2 days', 500) returning id`); const SL = r.rows?.[0]?.id;
await as('ADM', `insert into lot_private (lot_id, seller_phone, seller_email) values (${SL}, '0499 999 999', 'seller@x.au')`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('cannot publish before the seller signs', r.error?.includes('not_ready'), r.error);
r = await as('service', `select seller_invite from lot_private where lot_id=${SL}`); const invite = r.rows?.[0]?.seller_invite;
ok('each listing gets a private seller link', /^[0-9a-f]{32}$/.test(invite || ''));
r = await as('S', `select sign_seller_agreement('${S}','${invite}','Sam Seller',8000,'{}'::jsonb,false,null,'individual','{}','1.1.1.1','ua')`); ok('sellers cannot call the signing function directly', !!r.error);
r = await as('service', `select sign_seller_agreement('${S}','${invite}','Sam Seller',8000,'{"keys":"2","write_off":"none","finance_amount":"3000","lender_name":"Big Bank","accident":"no"}'::jsonb,false,null,'individual','{}','1.1.1.1','ua') id`);
ok('seller signs the agency agreement', !!r.rows?.[0]?.id, r.error);
r = await as('service', `select l.seller_id, l.keys, l.disclosures, p.reserve_price, p.finance_owing from lots l join lot_private p on p.lot_id=l.id where l.id=${SL}`);
ok('signing links the seller, sets reserve and finance payout', r.rows?.[0]?.seller_id === S && Number(r.rows[0].reserve_price) === 8000 && Number(r.rows[0].finance_owing) === 3000 && r.rows[0].keys === 2, JSON.stringify(r.rows));
ok('finance amount stays private (not in public disclosures)', r.rows?.[0]?.disclosures && !('finance_amount' in r.rows[0].disclosures));
r = await as('service', `select sign_seller_agreement('${U.B}','${invite}','Bob',1,'{}'::jsonb,false,null,'individual','{}','','') id`); ok("someone else can't take over a signed listing", r.error?.includes('invite_used'), r.error);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('still blocked until ownership is checked', r.error?.includes('ownership'), r.error);
await as('ADM', `update lot_private set ownership_checked_at=now() where lot_id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('still blocked until VIN + PPSR', r.error?.includes('VIN'), r.error);
await as('ADM', `update lots set vin='JTDBR32E720000000', ppsr_checked_at=now(), ppsr_cert_no='123' where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('registration: must say registered or unregistered', r.error?.includes('registered or unregistered'), r.error);
await as('ADM', `update lots set registration='registered' where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('registration: registered needs plate, state and expiry', r.error?.includes('rego plate'), r.error);
await as('ADM', `update lots set rego_plate='ABC123', rego_state='QLD', rego_expiry=current_date - 1 where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('registration: expired rego cannot be listed as registered', r.error?.includes('expired'), r.error);
await as('ADM', `update lots set rego_expiry=current_date + 90 where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('publishes once every check is done', !r.error, r.error);
r = await as('service', `select published_at is not null p from lots where id=${SL}`); ok('published time recorded', r.rows?.[0]?.p === true);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'live:${SL}%'`); ok('seller told their vehicle is live', r.rows?.[0]?.n >= 1);
r = await as('S', `select place_bid(${SL}, 1000)`); ok("seller can't bid on their own vehicle", r.error?.includes('own_vehicle'), r.error);
await c.query(`update profiles set mobile='0499999999' where id='${U.NEW}'`);
r = await as('A', `select * from seller_agreements`); ok("buyers can't see seller agreements", r.rows?.length === 0);
r = await as('S', `select * from seller_agreements`); ok('seller sees their own agreement', r.rows?.length === 1);
await as('B', `select place_bid(${SL}, 4000) r`);
r = await as('A', `select place_bid(${SL}, 5000) r`); ok('A bids below reserve', r.rows?.[0]?.r?.status === 'leading' && Number(r.rows[0].r.current_bid) === 4100, JSON.stringify(r));
await c.query(`update lots set ends_at = now() - interval '1 second' where id=${SL}`);
await as('service', `select close_due_lots()`);
await as('service', `select queue_status_notices()`);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'seller-referred:${SL}%'`); ok('seller told a decision is needed', r.rows?.[0]?.n >= 1);
r = await as('B', `select seller_decide(${SL}, 'accept_referral')`); ok('only the seller can decide', r.error?.includes('forbidden'), r.error);
r = await as('S', `select seller_decide(${SL}, 'accept_referral') inv`); const SINV = r.rows?.[0]?.inv; ok('seller accepts the referred bid', !!SINV, r.error);
r = await as('service', `select action, via from seller_decisions where lot_id=${SL}`); ok('seller decision logged', r.rows?.[0]?.action === 'accept_referral' && r.rows[0].via === 'portal');
r = await as('service', `select count(*)::int n from lot_snapshots where lot_id=${SL}`); ok('listing frozen at the moment of sale', r.rows?.[0]?.n === 1);

// ---------- payment -> payout; collection with release code; claims ----------
await as('service', `update invoices set status='paid', paid_at=now() where id='${SINV}'`);
r = await as('service', `select collect_by is not null c from invoices where id='${SINV}'`); ok('collection deadline set when paid', r.rows?.[0]?.c === true);
r = await as('service', `select * from seller_payouts where invoice_id='${SINV}'`);
ok('seller payout prepared (finance paid out first)', Number(r.rows?.[0]?.lender_payout) === 3000 && Number(r.rows[0].net_amount) === 1100 && r.rows[0].status === 'pending', JSON.stringify(r.rows));
r = await as('A', `select * from seller_payouts`); ok("buyers can't see payouts", r.rows?.length === 0);
r = await as('S', `select * from seller_payouts`); ok('seller sees their payout', r.rows?.length === 1);
// ---------- transfer of ownership before collection (registered vehicle) ----------
r = await as('service', `select status, registration, rego_state from ownership_transfers where invoice_id='${SINV}'`);
ok('transfer: starts when paid in full', r.rows?.[0]?.status === 'waiting' && r.rows[0].registration === 'registered' && r.rows[0].rego_state === 'QLD', JSON.stringify(r.rows));
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-start:${SINV}%'`); ok('transfer: buyer told what happens next', r.rows?.[0]?.n >= 1);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-seller:${SINV}%'`); ok('transfer: seller told to lodge their part', r.rows?.[0]?.n >= 1);
r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${SINV}', ${SL}, '${U.A}', 'Sat', 'Morning')`);
ok('transfer: no collection booking (or address) until ownership is done', r.error?.includes('transfer_not_done'), r.error);
r = await as('A', `select status from ownership_transfers`); ok('transfer: buyer sees their transfer', r.rows?.length === 1);
r = await as('B', `select * from ownership_transfers`); ok("transfer: others can't see it", r.rows?.length === 0);
r = await as('anon', `select * from ownership_transfers`); ok("transfer: anon can't see it", r.rows?.length === 0 || !!r.error);
r = await as('S', `select * from ownership_transfers`); ok("transfer: seller can't read the buyer's documents", r.rows?.length === 0);
r = await as('S', `select status, seller_done_at from seller_lot_transfer(${SL})`); ok('transfer: seller sees where it is up to', r.rows?.[0]?.status === 'waiting', JSON.stringify(r));
r = await as('B', `select * from seller_lot_transfer(${SL})`); ok('transfer: other members see nothing', r.rows?.length === 0);
r = await as('B', `select transfer_seller_done(${SL}, 'x')`); ok("transfer: only the seller marks the seller's part", r.error?.includes('forbidden'), r.error);
r = await as('S', `select transfer_seller_done(${SL}, 'NOD-1234')`); ok('transfer: seller marks their part done', !r.error, r.error);
r = await as('B', `select transfer_submit('${SINV}', 'transfer', null, 'X1', '{}')`); ok("transfer: someone else can't submit it", r.error?.includes('not_found'), r.error);
r = await as('A', `select transfer_submit('${SINV}', 'transfer', null, '', '{}')`); ok('transfer: needs proof or a receipt number', r.error?.includes('proof_needed'), r.error);
r = await as('A', `select transfer_submit('${SINV}', 'transfer', null, '', '{"other/11111111-1111-1111-1111-111111111111.jpg"}')`); ok("transfer: only files uploaded for this invoice", r.error?.includes('bad_files'), r.error);
r = await as('A', `select transfer_submit('${SINV}', 'transfer', null, 'TR-998', '{"${SINV}/11111111-2222-3333-4444-555555555555.jpg"}') s`); ok('transfer: buyer uploads the confirmation', r.rows?.[0]?.s === 'submitted', r.error);
r = await as('A', `update ownership_transfers set status='complete'`); ok("transfer: buyer can't mark it complete", !!r.error || r.count === 0);
r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${SINV}', ${SL}, '${U.A}', 'Sat', 'Morning')`);
ok('transfer: still no collection while it is being checked', r.error?.includes('transfer_not_done'), r.error);
r = await as('service', `select id from ownership_transfers where invoice_id='${SINV}'`); const TID = r.rows?.[0]?.id;
r = await as('A', `select admin_transfer_review('${TID}', true, null)`); ok('transfer: only staff can approve it', r.error?.includes('forbidden'), r.error);
r = await as('ADM', `select admin_transfer_review('${TID}', false, '')`); ok('transfer: sending it back needs a note', r.error?.includes('note_needed'), r.error);
r = await as('ADM', `select admin_transfer_review('${TID}', false, 'The photo is blurry. Please upload it again.') s`); ok('transfer: staff send it back with a note', r.rows?.[0]?.s === 'waiting', r.error);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-back:${TID}%'`); ok('transfer: buyer told what is needed', r.rows?.[0]?.n >= 1);
await as('A', `select transfer_submit('${SINV}', 'transfer', null, 'TR-998', '{"${SINV}/11111111-2222-3333-4444-666666666666.jpg"}')`);
await c.query(`update invoices set collect_by = now() - interval '1 day' where id='${SINV}'`);
r = await as('ADM', `select admin_transfer_review('${TID}', true, 'Checked with TMR') s`); ok('transfer: staff approve it', r.rows?.[0]?.s === 'complete', r.error);
r = await as('service', `select collect_by > now() c from invoices where id='${SINV}'`); ok('transfer: the collection window starts once ownership is done', r.rows?.[0]?.c === true);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-done:${TID}%'`); ok('transfer: buyer told to book collection', r.rows?.[0]?.n >= 1);
r = await as('A', `select transfer_submit('${SINV}', 'transfer', null, 'again', '{}')`); ok('transfer: nothing changes once complete', r.error?.includes('already_done'), r.error);
r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${SINV}', ${SL}, '${U.A}', 'Sat', 'Morning') returning seller_token, release_code`);
const tok = r.rows?.[0]?.seller_token, code = r.rows?.[0]?.release_code;
ok('release code is 6 digits', /^\d{6}$/.test(code || ''));
r = await as('service', `select complete_handover('${tok}', '${code}', 100000, 2, '')`); ok('no handover before the time is confirmed', r.error?.includes('not_confirmed'));
await as('service', `update collections set status='confirmed', confirmed_for='Sat 10am' where seller_token='${tok}'`);
r = await as('service', `select complete_handover('${tok}', '${code === '000000' ? '111111' : '000000'}', 100000, 2, '') h`); ok('wrong release code refused', r.rows?.[0]?.h?.ok === false && r.rows[0].h.error === 'wrong_code', JSON.stringify(r));
r = await as('service', `select code_attempts from collections where seller_token='${tok}'`); ok('wrong codes are counted (not rolled back)', r.rows?.[0]?.code_attempts === 1, JSON.stringify(r.rows));
r = await as('A', `select seller_token from collections`); ok("buyer can't read the seller's handover link", !!r.error, JSON.stringify(r));
r = await as('A', `select release_code from collections`); ok('buyer can read their own release code', r.rows?.length === 1, r.error);
r = await as('A', `select complete_handover('${tok}', '${code}', 100000, 2, '')`); ok('buyers cannot call handover directly', !!r.error);
r = await as('service', `select complete_handover('${tok}', '${code}', 100000, 2, 'all good') h`); ok('handover with the right code', r.rows?.[0]?.h?.ok === true, r.error);
r = await as('service', `select collected_at is not null c, claim_until is not null w from invoices where id='${SINV}'`); ok('collection starts the claim window', r.rows?.[0]?.c && r.rows[0].w);
await as('service', `insert into claims (invoice_id, lot_id, buyer_id, reason, details) values ('${SINV}', ${SL}, '${U.A}', 'odometer', 'Odometer reads 180,000 not 100,000')`);
r = await as('service', `select status from seller_payouts where invoice_id='${SINV}'`); ok('an open claim holds the payout', r.rows?.[0]?.status === 'on_hold');
await as('service', `update claims set status='rejected' where lot_id=${SL}`);
await as('service', `update invoices set claim_until = now() - interval '1 minute' where id='${SINV}'`);
r = await as('service', `select release_payouts() n`); r = await as('service', `select status from seller_payouts where invoice_id='${SINV}'`);
ok('payout ready once collected, window closed, no open claim', r.rows?.[0]?.status === 'ready', JSON.stringify(r.rows));
r = await as('A', `select * from claims`); ok('buyer sees own claims', r.rows?.length === 1);
r = await as('B', `select * from claims`); ok("others can't see claims", r.rows?.length === 0);
r = await as('anon', `select * from collections`); ok("anon can't see collections", r.rows?.length === 0 || !!r.error);
r = await as('B', `select release_code from collections`); ok("others can't see release codes", r.rows?.length === 0, JSON.stringify(r));

// ---------- questions ----------
await as('service', `insert into lot_questions (lot_id, user_id, question, answer, public, status) values (10599, '${U.A}', 'Towbar rating?', '3,500 kg', true, 'answered'), (10599, '${U.B}', 'Private question', null, false, 'open')`);
r = await as('anon', `select question from lot_questions where lot_id=10599`); ok('public answered questions are visible to all, private ones are not', r.rows?.length === 1 && r.rows[0].question === 'Towbar rating?', JSON.stringify(r.rows));
r = await as('B', `select question from lot_questions where lot_id=10599`); ok('asker sees their own unanswered question', r.rows?.length === 2);

// ---------- review fixes ----------
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('a sold vehicle cannot be put back on sale by an editor save', r.error?.includes('status_locked'), r.error);
await c.query(`insert into lots (id,status,title,start_price,buy_now_price,starts_at,ends_at) values (10901,'live','Future car',500,9000, now()+interval '1 day', now()+interval '3 days')`);
r = await as('A', `select buy_now(10901)`); ok('no Buy Now before the auction opens', r.error?.includes('auction_closed'), r.error);
await c.query(`insert into lots (id,status,title,start_price,current_bid,bid_count,leader_id,decision_by,ends_at) values (10902,'referred','Late referral',500,4000,3,'${U.A}', now()-interval '1 hour', now()-interval '3 days')`);
await c.query(`insert into lot_private (lot_id, reserve_price) values (10902, 9000)`);
r = await as('ADM', `select admin_accept(10902)`); ok('an expired referral cannot be accepted', r.error?.includes('referral_expired'), r.error);
await as('service', `select close_due_lots()`);
r = await as('service', `select status from lots where id=10902`); ok('an unanswered referral turns into offers', r.rows?.[0]?.status === 'offers', JSON.stringify(r.rows));
for (let i = 0; i < 5; i++) await as('service', `select complete_handover('${tok}', 'x', 1, 1, '')`);
r = await as('anon', `select me()`); ok('anon cannot call me()', !!r.error);

// ---------- search: every category, Trade Me-style filters, counts, alerts ----------
await c.query(`insert into lots (id,status,title,category,vehicle_type,kind,make,model,year,odometer,hours,transmission,fuel,drive,engine_cc,lams,licence_class,berths,length_m,state,suburb,start_price,current_bid,has_reserve,reserve_met,buy_now_price,gst_status,visual_grade,published_at,ends_at) values
 (10950,'live','Searchtest 2018 Toyota HiLux SR5','utes','ute','dual-cab','Toyota','HiLux',2018,98000,null,'Automatic','Diesel','4WD',null,null,null,null,null,'QLD','Mackay',20000,24500,true,false,36000,'private','B', now(), now()+interval '2 hours'),
 (10951,'live','Searchtest 2012 Toyota HiLux Workmate','utes','ute','single-cab','Toyota','HiLux',2012,240000,null,'5-speed manual','Diesel','2WD',null,null,null,null,null,'NSW','Dubbo',8000,9000,false,true,null,'inc','C', now(), now()+interval '20 hours'),
 (10952,'live','Searchtest 2020 Yamaha MT-07','motorbikes','bike','road','Yamaha','MT-07',2020,12000,null,'Manual','Petrol',null,689,true,null,null,null,'VIC','Geelong',5000,6200,false,true,null,'private','A', now(), now()+interval '30 hours'),
 (10953,'live','Searchtest 2016 Jayco Starcraft','caravans','caravan','pop-top','Jayco','Starcraft',2016,null,null,null,null,null,null,null,null,4,5.6,'QLD','Toowoomba',15000,18000,true,true,null,'private','B', now(), now()+interval '3 days'),
 (10954,'live','Searchtest 2014 Isuzu NPR Tipper','trucks','truck','tipper','Isuzu','NPR',2014,312000,null,'Manual','Diesel',null,null,null,'LR',null,null,'QLD','Ipswich',20000,28500,true,false,null,'inc','B', now(), now()+interval '5 hours'),
 (10955,'live','Searchtest 2019 Quintrex Hornet','boats','boat','tinny','Quintrex','Hornet',2019,null,140,null,'Petrol',null,null,null,null,null,4.2,'WA','Bunbury',9000,9500,false,true,null,'private','B', now(), now()+interval '4 days'),
 (10956,'live','Searchtest 2017 Kubota M7040','machinery','tractor','tractor','Kubota','M7040',2017,null,2100,'Manual','Diesel','4WD',null,null,null,null,null,'NSW','Tamworth',30000,31000,false,true,null,'inc','C', now(), now()+interval '6 days'),
 (10957,'draft','Searchtest hidden draft HiLux','utes','ute','dual-cab','Toyota','HiLux',2021,10000,null,'Automatic','Diesel','4WD',null,null,null,null,null,'QLD','Brisbane',30000,30000,false,true,null,'private','A', now(), now()+interval '2 days')`);
const SQ = (f, extra = '') => as('anon', `select id from search_lots($1::jsonb, 100, 0) ${extra}`, [JSON.stringify({ q: 'searchtest', ...f })]);
const ids = (r) => (r.rows || []).map((x) => Number(x.id)).sort();
r = await SQ({}); ok('search: all live categories, drafts hidden', JSON.stringify(ids(r)) === JSON.stringify([10950,10951,10952,10953,10954,10955,10956]), JSON.stringify(ids(r)) + (r.error || ''));
r = await SQ({ cat: 'motorbikes' }); ok('search: category motorbikes', JSON.stringify(ids(r)) === '[10952]', JSON.stringify(ids(r)));
r = await SQ({ cat: 'utes', type: 'dual-cab' }); ok('search: category + sub-type', JSON.stringify(ids(r)) === '[10950]', JSON.stringify(ids(r)));
r = await SQ({ make: 'toyota', model: 'hilux' }); ok('search: make + model (any case)', JSON.stringify(ids(r)) === '[10950,10951]', JSON.stringify(ids(r)));
r = await SQ({ make: 'Toyota', ymin: '2015' }); ok('search: year from', JSON.stringify(ids(r)) === '[10950]');
r = await SQ({ min: '9000', max: '20000' }); ok('search: price range uses the current bid', JSON.stringify(ids(r)) === '[10951,10953,10955]', JSON.stringify(ids(r)));
r = await SQ({ km: '100000' }); ok('search: kilometres under', JSON.stringify(ids(r)) === '[10950,10952]', JSON.stringify(ids(r)));
r = await SQ({ hrs: '500' }); ok('search: engine hours under', JSON.stringify(ids(r)) === '[10955]', JSON.stringify(ids(r)));
r = await SQ({ trans: 'manual' }); ok('search: "5-speed manual" counts as manual', JSON.stringify(ids(r)) === '[10951,10952,10954,10956]', JSON.stringify(ids(r)));
r = await SQ({ trans: 'auto' }); ok('search: automatic', JSON.stringify(ids(r)) === '[10950]', JSON.stringify(ids(r)));
r = await SQ({ fuel: 'diesel', drive: '4WD' }); ok('search: fuel + drive', JSON.stringify(ids(r)) === '[10950,10956]', JSON.stringify(ids(r)));
r = await SQ({ state: 'qld' }); ok('search: state', JSON.stringify(ids(r)) === '[10950,10953,10954]', JSON.stringify(ids(r)));
r = await SQ({ lams: '1' }); ok('search: LAMS-approved bikes', JSON.stringify(ids(r)) === '[10952]');
r = await SQ({ ccmin: '600', ccmax: '700' }); ok('search: engine size', JSON.stringify(ids(r)) === '[10952]');
r = await SQ({ lic: 'C' }); ok('search: a car licence excludes LR trucks', !ids(r).includes(10954));
r = await SQ({ lic: 'MR' }); ok('search: an MR licence covers LR trucks', ids(r).includes(10954));
r = await SQ({ berths: '4', lenmax: '6' }); ok('search: caravan berths and length', JSON.stringify(ids(r)) === '[10953]');
r = await SQ({ nores: '1' }); ok('search: no reserve (or reserve met) only', !ids(r).includes(10950) && !ids(r).includes(10954) && ids(r).includes(10953), JSON.stringify(ids(r)));
r = await SQ({ buynow: '1' }); ok('search: Buy Now available', JSON.stringify(ids(r)) === '[10950]');
r = await SQ({ seller: 'business' }); ok('search: business (GST) sellers', JSON.stringify(ids(r)) === '[10951,10954,10956]', JSON.stringify(ids(r)));
r = await SQ({ grade: 'B' }); ok('search: visual grade B or better', !ids(r).includes(10951) && ids(r).includes(10952));
r = await SQ({ ending: 'today' }); ok('search: ending within 24 hours', JSON.stringify(ids(r)) === '[10950,10951,10954]', JSON.stringify(ids(r)));
r = await as('anon', `select id from search_lots($1::jsonb, 10, 0)`, [JSON.stringify({ q: 'searchtest diesel mackay' })]); ok('search: every keyword must match (fuel and suburb are searchable)', JSON.stringify(ids(r)) === '[10950]', JSON.stringify(ids(r)));
r = await as('anon', `select id from search_lots($1::jsonb, 10, 0)`, [JSON.stringify({ q: '10953' })]); ok('search: lot number', JSON.stringify(ids(r)) === '[10953]');
r = await as('anon', `select id from search_lots($1::jsonb, 10, 0)`, [JSON.stringify({ q: "50%_' or 1=1 --", min: 'abc', ymin: '20x', lic: 'ZZ', grade: 'Q' })]); ok('search: junk input is harmless', !r.error, r.error);
r = await SQ({ sort: 'price' }); ok('search: sort by lowest price', ids(r).length === 7 && Number(r.rows[0].id) === 10952 && Number(r.rows[6].id) === 10956, JSON.stringify(r.rows));
r = await SQ({ sort: 'year' }); ok('search: sort by newest year', Number(r.rows?.[0]?.id) === 10952, JSON.stringify(r.rows));
r = await as('anon', `select lot_facets($1::jsonb) f`, [JSON.stringify({ q: 'searchtest', make: 'Toyota' })]);
const F = r.rows?.[0]?.f || {};
ok('facets: total with all filters', F.total === 2, JSON.stringify(F));
ok('facets: make counts ignore the make filter', F.makes?.Toyota === 2 && F.makes?.Yamaha === 1, JSON.stringify(F.makes));
ok('facets: category counts apply the make filter', F.cats?.utes === 2 && !F.cats?.motorbikes, JSON.stringify(F.cats));
ok('facets: models for the chosen make', F.models?.['Toyota|HiLux'] === 2, JSON.stringify(F.models));
ok('facets: fuel and gearbox groups', F.fuels?.diesel === 2 && F.trans?.auto === 1 && F.trans?.manual === 1, JSON.stringify([F.fuels, F.trans]));
r = await as('anon', `select lot_facets($1::jsonb) f`, [JSON.stringify({ q: 'searchtest', cat: 'trucks' })]);
ok('facets: sub-type counts for the chosen category', r.rows?.[0]?.f?.types?.tipper === 1, JSON.stringify(r.rows?.[0]?.f?.types));
r = await as('anon', `select lot_facets('{}'::jsonb) f`); ok('facets: drafts never counted', !JSON.stringify(r.rows?.[0]?.f || {}).includes('hidden'));
r = await as('service', `insert into lots (id,status,title,category) values (10958,'draft','Bad category','spaceships')`); ok('categories are limited to the ten vehicle kinds', !!r.error);
r = await as('service', `update lots set search = 'x' where id = 10950`); ok('the keyword column cannot be written directly', !!r.error);
// saved-search alerts with the new filters
await c.query(`delete from saved_searches; delete from outbox where kind = 'searches'; delete from notifications where kind = 'searches'`);
await c.query(`update lots set published_at = now() where id between 10950 and 10956`);
await c.query(`insert into saved_searches (user_id, label, query, last_notified_at) values
  ('${U.A}', 'HiLux auto', '{"make":"Toyota","model":"HiLux","trans":"auto"}', now() - interval '1 hour'),
  ('${U.A}', 'LAMS bikes', '{"cat":"motorbikes","lams":"1"}', now() - interval '1 hour'),
  ('${U.B}', 'Cheap trucks MR', '{"cat":"trucks","max":"10000","lic":"MR"}', now() - interval '1 hour'),
  ('${U.B}', 'Diesel 4WD under 30k', '{"fuel":"diesel","drive":"4WD","max":"30000","q":"searchtest"}', now() - interval '1 hour')`);
r = await as('service', `select queue_search_alerts() n`);
r = await as('service', `select s.label, n.body from notifications n join saved_searches s on n.title like '%' || s.label || '%' where n.kind = 'searches' order by s.label`);
const got = Object.fromEntries((r.rows || []).map((x) => [x.label, x.body]));
ok('alerts: make + model + gearbox', got['HiLux auto']?.includes('HiLux SR5') && !got['HiLux auto']?.includes('Workmate'), JSON.stringify(got));
ok('alerts: LAMS bikes', got['LAMS bikes']?.includes('MT-07'), JSON.stringify(got));
ok('alerts: nothing when the price is above the max', !got['Cheap trucks MR'], JSON.stringify(got));
ok('alerts: fuel + drive + price + keyword', got['Diesel 4WD under 30k']?.includes('HiLux SR5') && !got['Diesel 4WD under 30k']?.includes('Kubota'), JSON.stringify(got));


// ---------- apps: push notifications ----------
{
  const T1 = 'ExponentPushToken[aaaaaaaaaaaaaaaa]', T2 = 'ExponentPushToken[bbbbbbbbbbbbbbbb]';
  r = await as('A', `insert into push_devices (user_id, token, platform) values ('${U.A}', '${T1}', 'ios')`); ok('push: members cannot write devices directly', !!r.error);
  r = await as('A', `select register_push_device('${U.A}', '${T1}', 'ios', '1.0.0')`); ok('push: members cannot call register directly', !!r.error);
  r = await as('service', `select register_push_device('${U.A}', '${T1}', 'ios', '1.0.0')`); ok('push: register a device', !r.error, r.error);
  r = await as('service', `select register_push_device('${U.A}', '${T2}', 'android', '1.0.0')`);
  r = await as('A', `select token from push_devices`); ok('push: member sees own devices', r.rows?.length === 2, JSON.stringify(r));
  r = await as('B', `select token from push_devices`); ok('push: others cannot see them', r.rows?.length === 0);
  const pushes = async (title) => (await as('service', `select channel, to_addr, priority, link, kind from outbox where channel = 'push' and title = $1`, [title])).rows || [];
  await as('service', `select queue_notice('${U.A}', 'outbid', 'Push outbid', 'Another bidder is ahead', '/lot/10432', 'pt1')`);
  let p = await pushes('Push outbid');
  ok('push: an alert queues one push per member (sent to all their devices)', p.length === 1 && p[0].to_addr === U.A && p[0].priority === 1 && p[0].link === '/lot/10432', JSON.stringify(p));
  await as('service', `select queue_notice('${U.B}', 'outbid', 'Push B', 'x', null, 'pt2')`);
  ok('push: none for a member without the app', (await pushes('Push B')).length === 0);
  await c.query(`update profiles set notify = jsonb_set(notify, '{outbid}', coalesce(notify->'outbid','{}') || '{"push":false}') where id='${U.A}'`);
  await as('service', `select queue_notice('${U.A}', 'outbid', 'Push off', 'x', null, 'pt3')`);
  ok('push: respects the member turning outbid push off', (await pushes('Push off')).length === 0);
  await as('service', `select queue_notice('${U.A}', 'won', 'Push won', 'x', '/account/invoices/x', 'pt4')`);
  ok('push: wins and payments always push', (await pushes('Push won')).length === 1);
  await as('service', `select queue_notice('${U.A}', 'marketing', 'Push promo', 'x', null, 'pt5')`);
  ok('push: marketing needs an opt-in', (await pushes('Push promo')).length === 0);
  await as('service', `select queue_notice_many(array['${U.A}','${U.B}']::uuid[], 'ending', 'Push many', 'x', '/lot/10432', 'pt6')`);
  p = await pushes('Push many');
  ok('push: bulk alerts push to app users only, in one statement', p.length === 1 && p[0].to_addr === U.A, JSON.stringify(p));
  r = await as('service', `select expires_at < now() + interval '3 hours' x from outbox where channel='push' and title='Push many'`);
  ok('push: ending-soon pushes expire quickly', r.rows?.[0]?.x === true);
  r = await as('service', `select * from push_targets(array['${U.A}','${U.B}']::uuid[])`); ok('push: targets list every device', r.rows?.length === 2);
  await as('service', `select disable_push_tokens(array['${T1}','${T2}'])`);
  await as('service', `select queue_notice('${U.A}', 'won', 'Push gone', 'x', null, 'pt7')`);
  ok('push: none once the app is removed', (await pushes('Push gone')).length === 0);
  await as('service', `select register_push_device('${U.A}', '${T1}', 'ios', '1.0.1')`);
  r = await as('service', `select disabled_at is null x, app_version from push_devices where token='${T1}'`); ok('push: reinstall re-enables the token', r.rows?.[0]?.x === true && r.rows[0].app_version === '1.0.1');
  await as('service', `select register_push_device('${U.B}', '${T1}', 'ios', '1.0.1')`);
  r = await as('service', `select user_id from push_devices where token='${T1}'`); ok('push: a phone moves to whoever signs in on it', r.rows?.[0]?.user_id === U.B);
  r = await as('service', `select count(*)::int n from claim_outbox(500) where channel = 'push'`); ok('push: the sender claims push rows', r.rows?.[0]?.n >= 3, JSON.stringify(r));
  r = await as('service', `insert into outbox (channel, to_addr, kind, title) values ('fax', 'x', 'account', 'x')`); ok('push: unknown channels are refused', !!r.error);
}

// ---------- apps: delete my account ----------
{
  const D1 = 'd1d1d1d1-0000-4000-8000-000000000001', D2 = 'd2d2d2d2-0000-4000-8000-000000000002', D3 = 'd3d3d3d3-0000-4000-8000-000000000003';
  U.D1 = D1;
  await c.query(`insert into auth.users (id,email) values ('${D1}','d1@x.au'),('${D2}','d2@x.au'),('${D3}','d3@x.au')`);
  await c.query(`update profiles set first_name='Dee', last_name='Lete', mobile='0433333333', dob='1990-01-01', street='1 Way', details_done=true where id in ('${D1}','${D2}','${D3}')`);
  const live = (await c.query(`select id from lots where status='live' order by id limit 1`)).rows[0].id;
  await c.query(`insert into watchlist (user_id, lot_id) values ('${D1}', ${live})`);
  await c.query(`insert into saved_searches (user_id, label, query) values ('${D1}', 'Utes', '{"cat":"utes"}')`);
  await as('service', `select register_push_device('${D1}', 'ExponentPushToken[dddddddddddddddd]', 'android', '1.0.0')`);
  r = await as('D1', `select delete_account('${D1}')`); ok('delete: members cannot call it directly (only through the checked API)', !!r.error);
  r = await as('A', `select account_deletion_blockers('${U.B}')`); ok('delete: members cannot look up another member', !!r.error);
  r = await as('service', `select delete_account('${D1}') r`);
  ok('delete: a member with nothing in progress is deleted', r.rows?.[0]?.r?.ok === true, JSON.stringify(r));
  r = await as('service', `select email, first_name, mobile, dob, street, suspended, deleted_at is not null d from profiles where id='${D1}'`);
  const pd = r.rows?.[0] || {};
  ok('delete: personal details removed', pd.email === null && pd.first_name === null && pd.mobile === null && pd.dob === null && pd.street === null && pd.suspended === true && pd.d === true, JSON.stringify(pd));
  r = await as('service', `select (select count(*) from watchlist where user_id='${D1}') + (select count(*) from saved_searches where user_id='${D1}') + (select count(*) from push_devices where user_id='${D1}') n`);
  ok('delete: watchlist, searches and devices removed', Number(r.rows?.[0]?.n) === 0);
  r = await as('service', `select delete_account('${D1}') r`); ok('delete: twice is refused politely', r.rows?.[0]?.r?.ok === false);
  await c.query(`insert into max_bids (lot_id, bidder_id, max_amount) values (${live}, '${D2}', 999999)`);
  r = await as('service', `select delete_account('${D2}') r`);
  ok('delete: blocked while bids are live', r.rows?.[0]?.r?.ok === false && JSON.stringify(r.rows[0].r.blockers).includes('bids'), JSON.stringify(r.rows?.[0]?.r));
  r = await as('service', `select first_name from profiles where id='${D2}'`); ok('delete: nothing removed when blocked', r.rows?.[0]?.first_name === 'Dee');
  await c.query(`update lots set seller_id='${D3}' where id=${live}`);
  r = await as('service', `select account_deletion_blockers('${D3}') b`); ok('delete: sellers with a live listing are blocked', JSON.stringify(r.rows?.[0]?.b).includes('for sale'), JSON.stringify(r.rows?.[0]?.b));
  await c.query(`update lots set seller_id=null where id=${live}`);
}

// ---------- listing videos: every video is approved before anyone sees it ----------
{
  const lot = 10660, path = `${U.A}/walkaround-1.mp4`;
  await c.query(`update lots set seller_id='${U.A}' where id=${lot}`);
  r = await as('B', `select request_lot_video(${lot}, '${U.B}/x.mp4', 'Walkaround', 1000, 'video/mp4')`); ok('video: only the seller can add one', r.error?.includes('Only the seller'), r.error);
  r = await as('anon', `select request_lot_video(${lot}, 'x/y.mp4', 'x', 1, 'video/mp4')`); ok('video: anon cannot request', !!r.error);
  r = await as('A', `select request_lot_video(${lot}, '${U.B}/x.mp4', 'Walkaround', 1000, 'video/mp4')`); ok("video: can't claim someone else's upload", r.error?.includes('Upload the video first'), r.error);
  r = await as('A', `select request_lot_video(${lot}, '${path}', 'Walkaround', 1000, 'application/pdf')`); ok('video: only video files', r.error?.includes('MP4'), r.error);
  r = await as('A', `select request_lot_video(${lot}, '${path}', 'Walkaround', 300000000, 'video/mp4')`); ok('video: size limit', r.error?.includes('250 MB'), r.error);
  r = await as('A', `select request_lot_video(${lot}, '${path}', 'Walkaround', 1000, 'video/mp4') id`); ok('video: seller requests a video', !!r.rows?.[0]?.id, r.error);
  const vid = r.rows?.[0]?.id;
  r = await as('anon', `select * from lot_videos_public(${lot})`); ok('video: pending videos are not public', r.rows?.length === 0);
  r = await as('B', `select * from lot_videos`); ok('video: others cannot see the request', r.rows?.length === 0);
  r = await as('A', `select status from lot_videos`); ok('video: seller sees it pending', r.rows?.length === 1 && r.rows[0].status === 'pending');
  r = await as('A', `update lot_videos set status='approved' where id='${vid}'`); ok('video: seller cannot approve their own', r.error || r.count === 0);
  r = await as('A', `select count(*)::int n from lot_videos where status='approved'`); ok('video: still pending after the attempt', r.rows?.[0]?.n === 0);
  await as('service', `update lot_videos set status='approved', public_path='${lot}/${vid}.mp4', reviewed_at=now() where id='${vid}'`);
  r = await as('anon', `select public_path, title from lot_videos_public(${lot})`); ok('video: approved video is public', r.rows?.length === 1 && r.rows[0].public_path === `${lot}/${vid}.mp4`, JSON.stringify(r));
  r = await as('A', `select request_lot_video(${lot}, '${U.A}/w2.mp4', 'Cold start', 1000, 'video/mp4')`); ok('video: one per listing', r.error?.includes('one video'), r.error);
  // 10 photos and videos in total: the video counts as one.
  await c.query(`delete from lot_photos where lot_id=${lot}`);
  for (let k = 0; k < 9; k++) await c.query(`insert into lot_photos (lot_id, path, sort) values (${lot}, '${lot}/p${k}.jpg', ${k})`);
  r = await as('ADM', `insert into lot_photos (lot_id, path, sort) values (${lot}, '${lot}/p9.jpg', 9)`); ok('media: a 10th photo is refused when there is a video', r.error?.includes('media_limit'), r.error);
  await as('service', `update lot_videos set status='removed' where lot_id=${lot}`);
  r = await as('ADM', `insert into lot_photos (lot_id, path, sort) values (${lot}, '${lot}/p9.jpg', 9)`); ok('media: up to 10 photos', !r.error, r.error);
  r = await as('ADM', `insert into lot_photos (lot_id, path, sort) values (${lot}, '${lot}/p10.jpg', 10)`); ok('media: no 11th', r.error?.includes('media_limit'), r.error);
  r = await as('A', `select request_lot_video(${lot}, '${U.A}/w3.mp4', 'Engine', 1000, 'video/mp4')`); ok('media: no video when there are already 10 photos', r.error?.includes('10 photos and videos'), r.error);
  await c.query(`delete from lot_photos where lot_id=${lot}`);
  r = await as('A', `insert into storage.objects (bucket_id, name) values ('video-uploads', '${U.A}/w5.mp4')`); ok('video: no direct uploads (only signed links from the server)', !!r.error);
  r = await as('A', `insert into storage.objects (bucket_id, name) values ('lot-videos', '${lot}/x.mp4')`); ok('video: nobody but the server writes public videos', !!r.error);
  r = await as('anon', `select name from storage.objects where bucket_id in ('lot-videos','video-uploads')`); ok('video: buckets cannot be listed', r.rows?.length === 0 || !!r.error);
  r = await as('A', `select request_lot_video(${lot}, '${path}', 'Again', 1000, 'video/mp4')`); ok('video: the same upload cannot be added twice', !!r.error, r.error);
  await c.query(`update lots set status='sold' where id=${lot}`);
  r = await as('A', `select request_lot_video(${lot}, '${U.A}/w6.mp4', 'Late', 1000, 'video/mp4')`); ok('video: not after the sale', r.error?.includes('while the vehicle is listed'), r.error);
  await c.query(`update lots set status='live', seller_id=null where id=${lot}`);
}

// ---------- bid history with blurred names; sellers see bids, not bidders ----------
{
  const lot = (await c.query(`select lot_id from bids group by lot_id having count(distinct bidder_id) > 1 order by lot_id limit 1`)).rows[0]?.lot_id;
  r = await as('anon', `select bidder_mask, bidder_tag from bid_history(${lot}, 50)`);
  const masks = (r.rows || []).map((x) => x.bidder_mask);
  const names = (await c.query(`select distinct p.first_name, p.last_name from bids b join profiles p on p.id = b.bidder_id where b.lot_id = ${lot}`)).rows;
  ok('history: every bid has a name-shaped mask', masks.length > 0 && masks.every((m) => /^[A-Z][a-z]{3,7} [A-Z][a-z]{4,8}$/.test(m)), JSON.stringify(masks));
  ok('history: masks are never real names', !masks.some((m) => names.some((n) => m.includes(n.first_name || '#') || m.includes(n.last_name || '#'))));
  ok('history: different bidders get different masks', new Set(masks).size > 1);
  r = await as('anon', `select count(*)::int n from bid_history(${lot}, 100000)`); ok('history: capped at 100 rows', r.rows?.[0]?.n <= 100);
  r = await as('anon', `select bidder_mask('${U.A}', ${lot})`); ok('history: masks cannot be computed by the public', !!r.error);
  r = await as('A', `select bidder_mask('${U.A}', ${lot})`); ok('history: nor by members', !!r.error);
  r = await as('anon', `select value from app_secrets`); ok('history: the mask key is private', r.rows?.length === 0 || !!r.error);
  r = await as('anon', `select bidder_tag from bid_history(${lot}, 50)`);
  ok('history: tags no longer carry a per-member suffix', (r.rows || []).every((x) => /^[A-Z]•••$/.test(x.bidder_tag)), JSON.stringify(r.rows?.slice(0, 3)));
  await c.query(`update lots set seller_id='${U.NEW}' where id=${lot}`);
  r = await as('NEW', `select * from seller_lot_bids(${lot})`); ok('seller bids: seller sees every bid with blurred names', r.rows?.length >= 2 && r.rows.every((x) => x.bidder_mask && !('bidder_id' in x)), JSON.stringify(r.rows?.[0]));
  r = await as('B', `select * from seller_lot_bids(${lot})`); ok('seller bids: other members see nothing', r.rows?.length === 0);
  r = await as('anon', `select * from seller_lot_bids(${lot})`); ok('seller bids: anon cannot call it', !!r.error);
  await c.query(`update lots set seller_id=null where id=${lot}`);
}

// ---------- consultants, partners, leads; no in-person inspections ----------
{
  r = await as('ADM', `insert into consultants (name, phone, email) values ('Casey Consultant', '0400111222', 'casey@x.au') returning id`); ok('consultants: admin adds one', !r.error, r.error);
  r = await as('ADM', `insert into consultants (name, is_default) values ('Second', true)`); ok('consultants: only one default (the sample one is already default)', !!r.error);
  r = await as('anon', `select name, phone from consultants`); ok('consultants: public can read active consultants', r.rows?.some((x) => x.name === 'Casey Consultant'));
  r = await as('A', `insert into consultants (name) values ('Me')`); ok('consultants: members cannot add', !!r.error);
  r = await as('ADM', `insert into partners (kind, slug, name, rate_from) values ('finance', 'bad-rate', 'Bad', 7.5)`); ok('partners: a finance rate needs a comparison rate', !!r.error);
  r = await as('ADM', `insert into partners (kind, slug, name, rate_from, comparison_rate) values ('finance', 'bad-basis', 'Bad', 7.5, 8.0)`); ok('partners: a comparison rate needs its example', !!r.error);
  await as('ADM', `insert into partners (kind, slug, name, licence, rate_from, comparison_rate, comparison_basis, active) values ('finance', 'lender-on', 'Lender On', 'ACL 1', 7.5, 8.1, '$30,000 secured loan over 5 years', true), ('finance', 'lender-off', 'Lender Off', 'ACL 2', 6.5, 7.0, '$30,000 secured loan over 5 years', false)`);
  r = await as('anon', `select slug from partners where kind='finance'`); ok('partners: public sees only active partners', r.rows?.length >= 1 && r.rows.every((x) => x.slug !== 'lender-off'), JSON.stringify(r.rows));
  const pid = (await c.query(`select id from partners where slug='lender-on'`)).rows[0].id;
  await as('ADM', `insert into partner_private (partner_id, lead_email) values ('${pid}', 'leads@lender.example')`);
  r = await as('anon', `select * from partner_private`); ok('partners: lead emails are private', r.rows?.length === 0);
  r = await as('A', `select * from partner_private`); ok('partners: members cannot read lead emails', r.rows?.length === 0);
  r = await as('anon', `insert into partner_leads (partner_id, kind, name, email, phone, consent_text) values ('${pid}', 'finance', 'x', 'x@x', '1', 'x')`); ok('leads: only the server creates leads', !!r.error);
  await as('service', `insert into partner_leads (partner_id, kind, user_id, name, email, phone, consent_text) values ('${pid}', 'finance', '${U.A}', 'Amy Ash', 'a@x.au', '0411111111', 'I agree'), ('${pid}', 'finance', '${U.B}', 'Bo', 'b@x.au', '0422', 'I agree')`);
  r = await as('A', `select name from partner_leads`); ok("leads: members can't read leads directly (they hold internal notes)", r.rows?.length === 0);
  r = await as('ADM', `select count(*)::int n from partner_leads`); ok('leads: admins see all', r.rows?.[0]?.n >= 2);
  await as('service', `insert into partner_clicks (partner_id, source) values ('${pid}', 'lot')`);
  r = await as('service', `select clicks, leads from partner_stats(now() - interval '1 day') where partner_id='${pid}'`); ok('partners: stats count clicks and leads', Number(r.rows?.[0]?.clicks) === 1 && Number(r.rows?.[0]?.leads) === 2, JSON.stringify(r.rows));
  r = await as('A', `select * from partner_stats(now())`); ok('partners: stats are server only', !!r.error);
  r = await as('A', `insert into inspections (lot_id, user_id, preferred_day, preferred_time) values (10432, '${U.A}', 'Mon', 'AM')`); ok('inspections: in-person bookings are switched off', !!r.error);
  const D4 = 'd4d4d4d4-0000-4000-8000-000000000004';
  await c.query(`insert into auth.users (id,email) values ('${D4}','d4@x.au')`);
  await as('service', `insert into partner_leads (partner_id, kind, user_id, name, email, phone, consent_text) values ('${pid}', 'insurance', '${D4}', 'Dee Four', 'd4@x.au', '0444', 'I agree')`);
  r = await as('service', `select delete_account('${D4}') r`); ok('leads: account deletion still works', r.rows?.[0]?.r?.ok === true, JSON.stringify(r));
  r = await as('service', `select name, email, status from partner_leads where user_id='${D4}'`); ok('leads: deleting an account clears its leads', r.rows?.[0]?.name === 'Deleted member' && r.rows[0].email === '' && r.rows[0].status === 'withdrawn', JSON.stringify(r.rows));
  r = await as('anon', `select key from settings where key='finance'`); ok('settings: finance settings are public', r.rows?.length === 1);
}

// ---------- unregistered sale: certificate of sale and how it's moved; registration search; lookups ----------
{
  const lot = 10662;
  r = await as('service', `select registration from lots where id=${lot}`); ok('seed: the boat is listed unregistered', r.rows?.[0]?.registration === 'unregistered');
  r = await as('service', `select create_invoice(${lot}, '${U.B}', 1000, 'auction') id`); const inv = r.rows?.[0]?.id; ok('unregistered: invoice created', !!inv, r.error);
  await as('service', `update invoices set status='paid', paid_at=now() where id='${inv}'`);
  r = await as('B', `select registration, status from ownership_transfers where invoice_id='${inv}'`); ok('unregistered: transfer step starts', r.rows?.[0]?.registration === 'unregistered' && r.rows[0].status === 'waiting', JSON.stringify(r));
  r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-seller:${inv}%'`); ok('unregistered: nothing for the seller to lodge', r.rows?.[0]?.n === 0);
  r = await as('B', `select transfer_submit('${inv}', null, null, null, '{}')`); ok('unregistered: buyer says how it will be moved', r.error?.includes('transport_needed'), r.error);
  r = await as('B', `select transfer_submit('${inv}', null, 'carrier', null, '{}') s`); ok('unregistered: complete once the buyer confirms', r.rows?.[0]?.s === 'complete', r.error);
  r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${inv}', ${lot}, '${U.B}', 'Mon', 'Morning')`); ok('unregistered: collection can then be booked', !r.error, r.error);
  r = await as('anon', `select count(*)::int n, bool_and(registration = 'registered') u from search_lots('{"rego":"registered"}'::jsonb, 50, 0)`); ok('search: registered filter', r.rows?.[0]?.n > 0 && r.rows[0].u === true, JSON.stringify(r));
  r = await as('anon', `select count(*)::int n from search_lots('{"rego":"nonsense"}'::jsonb, 50, 0)`); const all = (await as('anon', `select count(*)::int n from search_lots('{}'::jsonb, 50, 0)`)).rows?.[0]?.n;
  ok('search: unknown registration values are ignored', r.rows?.[0]?.n === all, JSON.stringify(r));
  await as('service', `insert into rego_lookups (plate, state, vin, provider, found, vehicle) values ('ABC123', 'QLD', 'JTDBR32E720000000', 'test', true, '{"make":"Toyota"}')`);
  r = await as('anon', `select * from rego_lookups`); ok("lookups: the public can't read lookups", r.rows?.length === 0 || !!r.error);
  r = await as('A', `select * from rego_lookups`); ok("lookups: members can't read lookups (full VINs)", r.rows?.length === 0 || !!r.error);
  r = await as('A', `select prune_rego_lookups()`); ok('lookups: only the server prunes them', !!r.error);
  r = await as('anon', `insert into appraisals (state, name, mobile, registration) values ('QLD', 'Una', '0400000001', 'unregistered')`); ok('appraisal: unregistered vehicles need no plate', !r.error, r.error);
  r = await as('anon', `select * from transfer_completed('00000000-0000-0000-0000-000000000000')`); ok('transfer: internal step not callable', !!r.error);
}

// ---------- free lookup: our own plate memory and VIN patterns ----------
{
  r = await as('service', `select make, model, exact, source from vin_pattern('JTNBV58E09J000999')`); ok('vin: same first 8 and year character finds the model', r.rows?.[0]?.make === 'Toyota' && r.rows[0].model === 'Corolla' && r.rows[0].exact === true && r.rows[0].source === 'listing', JSON.stringify(r));
  r = await as('service', `select make, model, exact, year from vin_pattern('JTNBV58E0AJ000111')`); ok('vin: another year still finds the model (year left out)', r.rows?.[0]?.model === 'Corolla' && r.rows[0].exact === false && r.rows[0].year === null, JSON.stringify(r));
  r = await as('service', `select count(*)::int n from vin_pattern('ZZZZZZZZZZZZZZZZZ')`); ok('vin: unknown VIN finds nothing', r.rows?.[0]?.n === 0);
  r = await as('service', `select count(*)::int n from vin_pattern('short')`); ok('vin: invalid VIN finds nothing', r.rows?.[0]?.n === 0);
  r = await as('service', `select make, model, vin from plate_memory('smpl32', 'qld')`); ok('plate: a plate we have listed is remembered', r.rows?.[0]?.make === 'Toyota' && r.rows[0].vin === 'JTNBV58E09J000432', JSON.stringify(r));
  r = await as('service', `select count(*)::int n from plate_memory('NOPE99', 'QLD')`); ok('plate: unknown plate finds nothing', r.rows?.[0]?.n === 0);
  r = await as('anon', `select * from vin_pattern('JTNBV58E09J000999')`); ok('vin: the public cannot query patterns', !!r.error);
  r = await as('A', `select * from plate_memory('SMPL32', 'QLD')`); ok('plate: members cannot query plate memory', !!r.error);
  r = await as('A', `select * from vin_patterns`); ok('vin: members cannot read patterns', r.rows?.length === 0 || !!r.error);
  await c.query(`insert into lots (id, status, title, make, model, vin) values (10997, 'draft', 'Draft ute', 'Toyota', 'HiLux', 'MR0FB22G400000997')`);
  r = await as('service', `select count(*)::int n from vin_pattern('MR0FB22G400000123')`); ok('vin: drafts do not teach', r.rows?.[0]?.n === 0);
  await c.query(`update lots set status = 'live' where id = 10997`);
  r = await as('service', `select make, model from vin_pattern('MR0FB22G400000123')`); ok('vin: publishing a listing teaches its VIN pattern', r.rows?.[0]?.model === 'HiLux', JSON.stringify(r));
  await c.query(`update lots set model = 'HiLux SR5' where id = 10997`);
  r = await as('service', `select string_agg(model, ',' order by model) m from vin_patterns where left(prefix, 8) = 'MR0FB22G'`); ok('vin: a corrected model is learned too', r.rows?.[0]?.m === 'HiLux,HiLux SR5', JSON.stringify(r));
}

console.log(`\n${pass} passed, ${failN} failed`);
fails.forEach((f) => console.log('FAIL:', f));
await c.end();
process.exit(failN ? 1 : 0);
