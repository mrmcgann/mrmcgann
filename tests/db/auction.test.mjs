import pg from 'pg';
import fs from 'fs';
import path from 'path';
// In CI, a crash shows as an annotation on the run (the full log isn't always at hand)
if (process.env.GITHUB_ACTIONS) process.on('uncaughtException', (e) => { console.log('::error title=Database test crashed::' + String(e?.stack || e).replace(/\n/g, ' | ').slice(0, 1500)); process.exit(1); });
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
// Most checks below were written before every vehicle was sold in a live auction (auction.live_only, on by default), so
// they run with it off, and the seed keeps its sample vehicles as timed auctions; the live-only checks at the end switch
// it back on (and the seed's sample live auction is checked there too).
await c.query(`update settings set value = value || '{"live_only": false}' where key = 'auction'`);
await c.query(fs.readFileSync(M + 'seed.sql', 'utf8'));
// The checks below were written for card payments; the bidding-deposit checks at the end switch to deposits (the default).
await c.query(`update settings set value = value || '{"pay_mode": "card"}' where key = 'fees'`);
// They were also written before the transport to our depot was part of the buyer's premium: the sample vehicles carry
// none here, and the depot checks set their own amounts.
await c.query(`alter table lots disable trigger lot_transport_lock`);
await c.query(`update lots set transport_fee = 0, fees = case when fees is null then null else fees || '{"transport": 0}' end`);
await c.query(`alter table lots enable trigger lot_transport_lock`);

let pass = 0, failN = 0; const fails = [];
const ok = (name, cond, extra='') => { if (cond) pass++; else { failN++; fails.push(name + ' ' + extra); } };
const U = { A: '11111111-1111-1111-1111-111111111111', B: '22222222-2222-2222-2222-222222222222', ADM: '33333333-3333-3333-3333-333333333333', NEW: '44444444-4444-4444-4444-444444444444',
  C: 'c0c0c0c0-0000-4000-8000-00000000000c', D: 'd0d0d0d0-0000-4000-8000-00000000000d' };
await c.query(`insert into auth.users (id,email) values ('${U.A}','a@x.au'),('${U.B}','b@x.au'),('${U.ADM}','admin@x.au'),('${U.NEW}','new@x.au')`);
// Verify A and B as the service role would; make ADM admin via SQL editor (postgres)
await c.query(`update profiles set details_done=true, first_name='Amy', last_name='Ash', mobile='0411111111', mobile_verified=true, payment_method_id='pm_a', card_brand='Visa', card_last4='4242', id_status='verified', terms_version='2026-10-27' where id in ('${U.A}','${U.B}')`);
await c.query(`update profiles set role='admin' where id='${U.ADM}'`);

// Run a query as a role with JWT claims, inside a transaction (like PostgREST)
async function as(who, sql, params = []) {
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  // admins sign in with two-step (aal2); 'ADM_PW' is the same admin with only a password (aal1)
  const claims = who === 'anon' ? { role: 'anon' } : who === 'service' ? { role: 'service_role' }
    : who === 'ADM_PW' ? { sub: U.ADM, role: 'authenticated', aal: 'aal1' } : { sub: U[who], role: 'authenticated', aal: who === 'ADM' ? 'aal2' : 'aal1' };
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
r = await as('anon', `select place_bid(10432, 1000)`); ok('anon cannot bid (the function is closed to signed-out visitors)', r.error?.includes('permission denied') || r.error?.includes('not_signed_in'), r.error);
r = await as('anon', `select close_due_lots()`); ok('anon cannot run the auction clock', !!r.error, JSON.stringify(r));
r = await as('anon', `select create_invoice(10432,'${U.A}',1,'auction')`); ok('anon cannot create invoices', !!r.error);
r = await as('anon', `insert into appraisals (rego,state,name,mobile) values ('ABC123','QLD','Sam','0400000000')`); ok('appraisal requests only come through the website form (not straight into the database)', !!r.error, JSON.stringify(r));
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
r = await as('NEW', `select place_bid(10599, 6000)`); ok('suspended member cannot bid (and is told why)', r.error?.includes('account_suspended'), r.error);
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
await c.query(`update profiles set terms_version='2026-10-27' where id='${U.A}'`);
r = await as('A', `update profiles set terms_version='x' where id='${U.A}'`); ok('members cannot set terms version themselves', r.error?.includes('protected_field'), r.error);

// ---------- seller agency agreement, publish gate, seller can't bid ----------
const S = '55555555-5555-5555-5555-555555555555';
U.S = S;
await c.query(`insert into auth.users (id,email) values ('${S}','seller@x.au')`);
await c.query(`update profiles set details_done=true, first_name='Sam', last_name='Seller', mobile='0499999999', mobile_verified=true, id_status='verified', terms_version='2026-10-27', payment_method_id='pm_s' where id='${S}'`);
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
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('accuracy: must say whether it starts and drives', r.error?.includes('starts and drives'), r.error);
await as('ADM', `update lots set runs='drives' where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('depot: a listing needs the depot the buyer collects from', r.error?.includes('depot'), r.error);
const DEP = (await c.query(`select id from depots where suburb = 'Eagle Farm'`)).rows[0]?.id;
await as('ADM', `update lots set suburb='Paddington', state='QLD', postcode='4064' where id=${SL}`);
r = await as('ADM', `update lots set depot_id='${DEP}' where id=${SL}`); ok('depot: staff choose the depot', !r.error, r.error);
r = await as('service', `select suburb, state, postcode from lots where id=${SL}`);
ok("depot: the listing shows the depot's suburb, never the seller's", r.rows?.[0]?.suburb === 'Eagle Farm' && r.rows[0].state === 'QLD' && r.rows[0].postcode === '4009', JSON.stringify(r.rows));
await as('ADM', `update lots set suburb='Paddington' where id=${SL}`);
r = await as('service', `select suburb from lots where id=${SL}`); ok("depot: the location can't be typed over while a depot is chosen", r.rows?.[0]?.suburb === 'Eagle Farm', JSON.stringify(r.rows));
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('transport: the transport amount must be set before bidding opens', r.error?.includes('transport amount'), r.error);
await as('ADM', `update lots set transport_fee=300 where id=${SL}`);
r = await as('service', `select lot_price_breakdown(${SL}, 4100) b`); ok('transport: a draft previews the amount entered so far', Number(r.rows?.[0]?.b?.transport) === 300 && Number(r.rows[0].b.premium) === 710, JSON.stringify(r.rows?.[0]?.b));
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('pickup: the pickup address must be recorded', r.error?.includes('pickup address'), r.error);
await as('ADM', `update lot_private set seller_address='1 Sample St, Paddington QLD 4064' where lot_id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('statutory warranty: it must be stated before bidding opens', r.error?.includes('statutory warranty'), r.error);
await as('ADM', `update lots set statutory_warranty=false where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('accuracy: every listing check must be ticked', r.error?.includes('listing check') && r.error?.includes('odometer'), r.error);
await as('ADM', `update lots set verified=array['vin','year','odometer','transmission','fuel','features','warning_lights','runs','damage'] where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('accuracy: says which check is missing', r.error?.includes('photos') && !r.error?.includes('odometer'), r.error);
ok('privacy: checking nothing identifies the seller is one of the listing checks', r.error?.includes('privacy'), r.error);
await as('ADM', `update lots set write_off_status='statutory', verified=listing_check_keys(), verified_at=now() where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok("accuracy: a statutory write-off can't be listed as registered", r.error?.includes('statutory'), r.error);
await as('ADM', `update lots set write_off_status='unknown' where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('accuracy: the written-off check must be recorded', r.error?.includes('written-off'), r.error);
await as('ADM', `update lots set write_off_status='none' where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok("roadworthy: a car registered in Queensland needs the seller's safety certificate on file", r.error?.includes('safety certificate'), r.error);
await as('ADM', `update lots set roadworthy_issued_on = current_date - 100 where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok("roadworthy: a Queensland certificate more than 2 months old by the auction won't do", r.error?.includes('2 months'), r.error);
await as('ADM', `update lots set roadworthy_issued_on = (now() at time zone 'Australia/Brisbane')::date + 1 where id=${SL}`);  // tomorrow in Brisbane, whatever the server's time zone
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok("roadworthy: the date can't be in the future", r.error?.includes('future'), r.error);
await as('ADM', `update lots set roadworthy_issued_on = current_date - 3 where id=${SL}`);
r = await as('ADM', `update lots set status='live' where id=${SL}`); ok('publishes once every check is done', !r.error, r.error);
r = await as('service', `select published_at is not null p from lots where id=${SL}`); ok('published time recorded', r.rows?.[0]?.p === true);
r = await as('service', `select (fees->>'transport')::numeric t from lots where id=${SL}`); ok('transport: locked into the fees when it goes live', Number(r.rows?.[0]?.t) === 300, JSON.stringify(r.rows));
r = await as('ADM', `update lots set transport_fee=900 where id=${SL}`); ok("transport: it can't change once bidding is open", r.error?.includes('transport_locked'), r.error);
r = await as('service', `select body from outbox where dedupe_key like 'live:${SL}%' limit 1`); ok('seller told buyers never visit and the pickup comes after payment', /never visit/.test(r.rows?.[0]?.body || '') && /picks it up/.test(r.rows[0].body), r.rows?.[0]?.body);
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
r = await as('service', `select collect_by is null c from invoices where id='${SINV}'`); ok('no collection deadline (or storage) until ownership is transferred', r.rows?.[0]?.c === true);
r = await as('service', `select * from seller_payouts where invoice_id='${SINV}'`);
ok('seller payout prepared (finance paid out first)', Number(r.rows?.[0]?.lender_payout) === 3000 && Number(r.rows[0].net_amount) === 1100 && r.rows[0].status === 'pending', JSON.stringify(r.rows));
r = await as('A', `select * from seller_payouts`); ok("buyers can't see payouts", r.rows?.length === 0);
r = await as('S', `select * from seller_payouts`); ok('seller sees their payout', r.rows?.length === 1);
// ---------- transfer of ownership before collection (registered vehicle) ----------
r = await as('service', `select status, registration, rego_state from ownership_transfers where invoice_id='${SINV}'`);
ok('transfer: starts when paid in full', r.rows?.[0]?.status === 'waiting' && r.rows[0].registration === 'registered' && r.rows[0].rego_state === 'QLD', JSON.stringify(r.rows));
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-start:${SINV}%'`); ok('transfer: buyer told what happens next', r.rows?.[0]?.n >= 1);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transfer-seller:${SINV}%'`); ok('transfer: seller told to lodge their part', r.rows?.[0]?.n >= 1);
r = await as('service', `select premium, transport, gst, total from invoices where id='${SINV}'`);
ok('transport: in the buyer\'s premium on the invoice (10% + $300, GST on all of it)', Number(r.rows?.[0]?.premium) === 710 && Number(r.rows[0].transport) === 300 && Number(r.rows[0].gst) === 71 && Number(r.rows[0].total) === 4980, JSON.stringify(r.rows));
r = await as('service', `select id, ref, status, depot_id from transport_jobs where invoice_id='${SINV}'`); const JOB = r.rows?.[0];
ok('pickup: a transport job starts when it is paid in full', JOB?.status === 'to_book' && JOB.depot_id === DEP && /^TR-\d+$/.test(JOB.ref), JSON.stringify(r.rows));
r = await as('service', `select count(*)::int n from notifications where user_id='${U.ADM}' and kind='staff' and title like 'Book a pickup:%'`); ok('pickup: our team is told to book it', r.rows?.[0]?.n >= 1);
r = await as('service', `select body from outbox where dedupe_key like 'transfer-start:${SINV}%' limit 1`); ok('pickup: the buyer is told it goes to the depot', /Eagle Farm/.test(r.rows?.[0]?.body || ''), r.rows?.[0]?.body);
r = await as('A', `select * from transport_jobs`); ok("pickup: buyers can't read transport jobs", (r.rows || []).length === 0);
r = await as('A', `select * from invoice_transport('${SINV}')`);
ok('pickup: the buyer sees where it is up to and the depot, not the address yet', r.rows?.[0]?.status === 'to_book' && r.rows[0].depot_suburb === 'Eagle Farm' && r.rows[0].depot_address === null && !('ref' in r.rows[0]), JSON.stringify(r.rows));
r = await as('B', `select * from invoice_transport('${SINV}')`); ok("pickup: others see nothing", (r.rows || []).length === 0);
r = await as('S', `select * from seller_lot_transport(${SL})`); ok('pickup: the seller sees the pickup', r.rows?.[0]?.status === 'to_book' && r.rows[0].ref === JOB.ref, JSON.stringify(r.rows));
r = await as('A', `select * from seller_lot_transport(${SL})`); ok("pickup: buyers can't see the seller's pickup", (r.rows || []).length === 0);
r = await as('A', `select admin_transport('${JOB.id}', 'book', '{}')`); ok('pickup: only staff book it', r.error?.includes('forbidden'), r.error);
r = await as('ADM_PW', `select admin_transport('${JOB.id}', 'book', '{}')`); ok('pickup: booking needs two-step', r.error?.includes('forbidden'), r.error);
r = await as('ADM', `select admin_transport('${JOB.id}', 'book', '{"day": "2020-01-01"}')`); ok('pickup: not in the past', r.error?.includes('transport_day'), r.error);
const tomorrow = (await c.query(`select ((now() at time zone 'Australia/Brisbane')::date + 1)::text d`)).rows[0].d;
r = await as('ADM', `select admin_transport('${JOB.id}', 'at_depot', '{}')`); ok("pickup: can't be at the depot before it's picked up", r.error?.includes('transport_step'), r.error);
r = await as('ADM', `select admin_transport('${JOB.id}', 'book', $1::jsonb) s`, [JSON.stringify({ day: tomorrow, window: 'morning', carrier_ref: 'CAR-1' })]); ok('pickup: staff book it', r.rows?.[0]?.s === 'booked', r.error);
r = await as('service', `select body from outbox where dedupe_key like 'transport-booked:${JOB.id}%' limit 1`);
ok('pickup: the seller gets the time and the booking reference the driver quotes', (r.rows?.[0]?.body || '').includes(JOB.ref) && /morning/.test(r.rows[0].body), r.rows?.[0]?.body);
r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${SINV}', ${SL}, '${U.A}', 'Sat', 'Morning')`);
ok('collection: nothing can be booked (or released) until it is at the depot', r.error?.includes('not_at_depot'), r.error);
r = await as('ADM', `select admin_transport('${JOB.id}', 'picked_up', '{"odometer": "100020", "keys": "2", "ok": true}') s`); ok('pickup: picked up, checked against the listing', r.rows?.[0]?.s === 'picked_up', r.error);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transport-picked:${JOB.id}%'`); ok('pickup: the buyer hears it is on its way', r.rows?.[0]?.n >= 1);
r = await as('ADM', `select admin_transport('${JOB.id}', 'at_depot', '{}') s`); ok('pickup: at the depot', r.rows?.[0]?.s === 'at_depot', r.error);
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'transport-depot:${JOB.id}%'`); ok('pickup: the buyer is told to finish the transfer first', r.rows?.[0]?.n >= 1);
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
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'collect-ready:${SINV}%'`); ok('transfer: at the depot and in their name, the buyer is told to book', r.rows?.[0]?.n >= 1);
r = await as('A', `select transfer_submit('${SINV}', 'transfer', null, 'again', '{}')`); ok('transfer: nothing changes once complete', r.error?.includes('already_done'), r.error);
r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${SINV}', ${SL}, '${U.A}', 'Sat', 'Morning') returning seller_token, release_code`);
const tok = r.rows?.[0]?.seller_token, code = r.rows?.[0]?.release_code;
ok('release code is 6 digits', /^\d{6}$/.test(code || ''));
r = await as('service', `select complete_handover('${tok}', '${code}', 100000, 2, '')`); ok('no handover before the time is confirmed', r.error?.includes('not_confirmed'));
r = await as('A', `select depot_address from invoice_transport('${SINV}')`); ok('collection: no depot address before the time is confirmed', r.rows?.[0]?.depot_address === null, JSON.stringify(r.rows));
await as('service', `update collections set status='confirmed', confirmed_for='Sat 10am' where seller_token='${tok}'`);
r = await as('A', `select depot_address from invoice_transport('${SINV}')`); ok('collection: the depot address once the time is confirmed', /Sample yard, Eagle Farm/.test(r.rows?.[0]?.depot_address || ''), JSON.stringify(r.rows));
r = await as('S', `select collector, seller_token from seller_lot_collection(${SL})`); ok("collection: the seller never sees who collects or the handover link", r.rows?.[0] && r.rows[0].collector === null && r.rows[0].seller_token === null, JSON.stringify(r.rows));
r = await as('service', `select complete_handover('${tok}', '${code === '000000' ? '111111' : '000000'}', 100000, 2, '') h`); ok('wrong release code refused', r.rows?.[0]?.h?.ok === false && r.rows[0].h.error === 'wrong_code', JSON.stringify(r));
r = await as('service', `select code_attempts from collections where seller_token='${tok}'`); ok('wrong codes are counted (not rolled back)', r.rows?.[0]?.code_attempts === 1, JSON.stringify(r.rows));
r = await as('A', `select seller_token from collections`); ok("buyer can't read the seller's handover link", !!r.error, JSON.stringify(r));
r = await as('A', `select release_code from collections`); ok('buyer can read their own release code', r.rows?.length === 1, r.error);
r = await as('A', `select complete_handover('${tok}', '${code}', 100000, 2, '')`); ok('buyers cannot call handover directly', !!r.error);
r = await as('service', `select complete_handover('${tok}', '${code}', 100000, 2, 'all good') h`); ok('handover with the right code', r.rows?.[0]?.h?.ok === true, r.error);
r = await as('service', `select collected_at is not null c, claim_until is not null w from invoices where id='${SINV}'`); ok('collection starts the claim window', r.rows?.[0]?.c && r.rows[0].w);
r = await as('service', `select status, released_at is not null x from transport_jobs where id='${JOB.id}'`); ok('collection: the depot has released it', r.rows?.[0]?.status === 'released' && r.rows[0].x, JSON.stringify(r.rows));
r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'collected-seller:%' and title like '%Seller car%'`); ok('collection: the seller hears it has been collected', r.rows?.[0]?.n >= 1);
r = await as('service', `select body from notifications where user_id='${U.A}' and title like 'Collected:%' order by created_at desc limit 1`); ok('collection: handed over at our depot', /our depot/.test(r.rows?.[0]?.body || ''), r.rows?.[0]?.body);
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
  r = await as('service', `select body from outbox where dedupe_key like 'transfer-seller:${inv}%'`); ok('unregistered: the seller hears about the pickup, with nothing to lodge', (r.rows || []).every((x) => /pick it up/.test(x.body) && !/registration transfer/.test(x.body)), JSON.stringify(r.rows));
  r = await as('B', `select transfer_submit('${inv}', null, null, null, '{}')`); ok('unregistered: buyer says how it will be moved', r.error?.includes('transport_needed'), r.error);
  r = await as('B', `select transfer_submit('${inv}', null, 'carrier', null, '{}') s`); ok('unregistered: complete once the buyer confirms', r.rows?.[0]?.s === 'complete', r.error);
  const UJ = (await c.query(`select id from transport_jobs where invoice_id = '${inv}'`)).rows[0]?.id;
  await c.query(`update transport_jobs set status = 'at_depot', at_depot_at = now() where id = '${UJ}'`);
  r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${inv}', ${lot}, '${U.B}', 'Mon', 'Morning')`); ok('unregistered: collection can then be booked (once it is at the depot)', !r.error, r.error);
  r = await as('anon', `select count(*)::int n, bool_and(registration = 'registered') u from search_lots('{"rego":"registered"}'::jsonb, 50, 0)`); ok('search: registered filter', r.rows?.[0]?.n > 0 && r.rows[0].u === true, JSON.stringify(r));
  r = await as('anon', `select count(*)::int n from search_lots('{"rego":"nonsense"}'::jsonb, 50, 0)`); const all = (await as('anon', `select count(*)::int n from search_lots('{}'::jsonb, 50, 0)`)).rows?.[0]?.n;
  ok('search: unknown registration values are ignored', r.rows?.[0]?.n === all, JSON.stringify(r));
  await as('service', `insert into rego_lookups (plate, state, vin, provider, found, vehicle) values ('ABC123', 'QLD', 'JTDBR32E720000000', 'test', true, '{"make":"Toyota"}')`);
  r = await as('anon', `select * from rego_lookups`); ok("lookups: the public can't read lookups", r.rows?.length === 0 || !!r.error);
  r = await as('A', `select * from rego_lookups`); ok("lookups: members can't read lookups (full VINs)", r.rows?.length === 0 || !!r.error);
  r = await as('A', `select prune_rego_lookups()`); ok('lookups: only the server prunes them', !!r.error);
  r = await as('service', `insert into appraisals (state, name, mobile, registration) values ('QLD', 'Una', '0400000001', 'unregistered')`); ok('appraisal: unregistered vehicles need no plate', !r.error, r.error);
  // the signed sell form
  r = await as('service', `insert into appraisals (state, rego, name, mobile, registration, reserve_type, reserve_amount, details, disclosures, signed_name, signed_at, agreement_version)
    values ('QLD', 'SELL01', 'Sam Driver', '0400000002', 'registered', 'reserve', 32500, '{"condition":"good"}', '{"accident":"no"}', 'Sam Driver', now(), 'v') returning ref`);
  ok('sell form: a signed form with a reserve is saved', !r.error && /^AP-/.test(r.rows?.[0]?.ref || ''), r.error || JSON.stringify(r.rows));
  r = await as('service', `insert into appraisals (state, name, mobile, reserve_type) values ('QLD', 'X Y', '0400000003', 'reserve')`); ok('sell form: a reserve needs an amount', !!r.error);
  r = await as('service', `insert into appraisals (state, name, mobile, reserve_type) values ('QLD', 'X Y', '0400000003', 'maybe')`); ok('sell form: reserve or no reserve only', !!r.error);
  r = await as('service', `insert into appraisals (state, name, mobile, reserve_type, reserve_amount) values ('QLD', 'X Y', '0400000003', 'reserve', -5)`); ok('sell form: reserve must be positive', !!r.error);
  r = await as('service', `insert into appraisals (state, name, mobile, reserve_type) values ('QLD', 'X Y', '0400000003', 'none')`); ok('sell form: no reserve needs no amount', !r.error, r.error);
  r = await as('A', `select signed_ip from appraisals`); ok("sell form: members can't read signed forms", r.rows?.length === 0 || !!r.error);
  r = await c.query(`select file_size_limit, allowed_mime_types from storage.buckets where id = 'appraisal-photos'`);
  ok('sell form: photo bucket takes photos only, up to 12 MB', r.rows[0]?.file_size_limit === '12582912' && r.rows[0]?.allowed_mime_types?.includes('image/jpeg') && !r.rows[0].allowed_mime_types.includes('application/pdf'), JSON.stringify(r.rows));
  r = await c.query(`select column_name from information_schema.columns where table_name = 'seller_agreements' and column_name = 'signature_path'`); ok('sell form: agreements keep the drawn signature', r.rows.length === 1);
  r = await as('anon', `select * from transfer_completed('00000000-0000-0000-0000-000000000000')`); ok('transfer: internal step not callable', !!r.error);
}

// ---------- free lookup: our own plate memory and VIN patterns ----------
{
  r = await as('service', `select make, model, exact, source from vin_pattern('JTNBV58E09J000999')`); ok('vin: same first 8 and year character finds the model', r.rows?.[0]?.make === 'Toyota' && r.rows[0].model === 'Corolla' && r.rows[0].exact === true && r.rows[0].source === 'listing', JSON.stringify(r));
  r = await as('service', `select make, model, exact, year from vin_pattern('JTNBV58E0AJ000111')`); ok('vin: another year still finds the model (year left out)', r.rows?.[0]?.model === 'Corolla' && r.rows[0].exact === false && r.rows[0].year === null, JSON.stringify(r));
  r = await as('service', `insert into vin_patterns (prefix, source, make, model) values ('JTNBV58E9', 'nzta', 'Toyota', 'Corolla')`); ok('vin: only our own Australian listings can teach it', !!r.error, r.error);
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

// ---------- listing accuracy: corrections, removing bids ----------
{
  await c.query(`insert into lots (id, status, title, make, model, year, odometer, transmission, start_price, ends_at, registration, runs, verified, published_at)
    values (10960, 'live', 'Correction test ute', 'Ford', 'Ranger', 2018, 85000, 'Manual', 1000, now() + interval '2 hours', 'unregistered', 'drives', listing_check_keys(), now())`);
  await c.query(`insert into lot_private (lot_id) values (10960)`);
  r = await as('A', `select place_bid(10960, 2000) r`); ok('corrections: A bids', r.rows?.[0]?.r?.status === 'leading', JSON.stringify(r));
  await c.query(`insert into watchlist (user_id, lot_id) values ('${U.ADM}', 10960) on conflict do nothing`);
  r = await as('service', `select count(*)::int n from lot_corrections where lot_id = 10960`); ok('corrections: bidding is not a correction', r.rows?.[0]?.n === 0);
  r = await as('ADM', `update lots set odometer = 58000, transmission = 'Automatic' where id = 10960`); ok('corrections: staff correct the listing', !r.error, r.error);
  r = await as('anon', `select field, before, after from lot_corrections where lot_id = 10960 order by field`);
  ok('corrections: shown publicly with before and after', r.rows?.length === 2 && r.rows[0].before === '85,000 km' && r.rows[0].after === '58,000 km' && r.rows[1].after === 'Automatic', JSON.stringify(r.rows));
  r = await as('service', `select ends_at > now() + interval '23 hours' e, corrected_at is not null c from lots where id = 10960`); ok('corrections: at least 24 hours of bidding left', r.rows?.[0]?.e === true && r.rows[0].c === true, JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and title like 'Correction to a vehicle you bid on%'`); ok('corrections: bidders are told', r.rows?.[0]?.n === 1);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.ADM}' and title like 'Correction to a vehicle you''re watching%'`); ok('corrections: watchers are told', r.rows?.[0]?.n === 1);
  r = await as('ADM', `update lots set disclosures = disclosures || '{"accident":"Yes: rear bar replaced"}' where id = 10960`);
  r = await as('anon', `select label, after from lot_corrections where lot_id = 10960 and field = 'disclosures.accident'`); ok('corrections: seller declarations are tracked', r.rows?.[0]?.after === 'Yes: rear bar replaced', JSON.stringify(r.rows));
  r = await as('A', `insert into lot_corrections (lot_id, field, label) values (10960, 'x', 'x')`); ok("corrections: members can't write them", !!r.error);

  r = await as('B', `select place_bid(10960, 3000) r`); ok('remove bids: B takes the lead', r.rows?.[0]?.r?.status === 'leading', JSON.stringify(r));
  r = await as('B', `select admin_remove_bidder(10960, '${U.B}', 'asked out')`); ok('remove bids: staff only', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_remove_bidder(10960, '${U.B}', '')`); ok('remove bids: needs a reason', r.error?.includes('reason_required'), r.error);
  r = await as('ADM', `select admin_remove_bidder(10960, '${U.B}', 'Bid before the odometer correction and asked out') r`); ok('remove bids: staff remove B', !r.error, r.error);
  r = await as('service', `select current_bid, leader_id, bid_count, (select count(*)::int from bids where lot_id = 10960 and bidder_id = '${U.B}') b, (select max(amount) from bids where lot_id = 10960) top from lots where id = 10960`);
  ok('remove bids: price worked out again without them', Number(r.rows?.[0]?.current_bid) === 1000 && r.rows[0].leader_id === U.A && r.rows[0].b === 0 && Number(r.rows[0].top) === 1000, JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and title like 'You''re the highest bidder again%'`); ok('remove bids: the new leader is told', r.rows?.[0]?.n === 1);
  r = await as('B', `select place_bid(10960, 1500) r`); ok('remove bids: bidding carries on normally', r.rows?.[0]?.r?.status === 'outbid' && Number(r.rows[0].r.current_bid) === 1600, JSON.stringify(r));
}

// ---------- relisting and offers to the next bidder ----------
{
  await c.query(`insert into lots (id, status, title, make, model, start_price, ends_at, registration, runs, verified, ppsr_checked_at, vin, has_reserve)
    values (10961, 'live', 'Relist test car', 'Mazda', 'CX-5', 1000, now() + interval '1 day', 'unregistered', 'drives', listing_check_keys(), now(), 'JM0KF4W7A00000961', true)`);
  await c.query(`insert into lot_private (lot_id, reserve_price, seller_name) values (10961, 9000, 'Rae Seller')`);
  await c.query(`insert into lot_photos (lot_id, path, sort) values (10961, 'x/1.jpg', 0), (10961, 'x/2.jpg', 1)`);
  await as('A', `select place_bid(10961, 5000)`);
  await as('B', `select place_bid(10961, 4000)`);
  await c.query(`update lots set ends_at = now() - interval '1 second' where id = 10961`);
  await as('service', `select close_due_lots()`);
  // seller accepts the referred bid, then the buyer doesn't pay
  r = await as('ADM', `select admin_accept(10961, null) i`); const RINV = r.rows?.[0]?.i; ok('next bidder: sale made', !!RINV, r.error);
  await c.query(`update invoices set status = 'cancelled' where id = '${RINV}'`);
  await c.query(`update lots set status = 'passed' where id = 10961`);
  r = await as('A', `select admin_offer_next_bidder(10961)`); ok('next bidder: staff only', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_offer_next_bidder(10961)`); ok('next bidder: below the reserve needs the seller to agree', r.error?.includes('below_reserve'), r.error);
  r = await as('ADM', `select admin_offer_next_bidder(10961, 24, true) o`); const OFF = r.rows?.[0]?.o;
  ok('next bidder: offered to the next highest bidder at their highest bid', OFF && Number(OFF.amount) === 4000, JSON.stringify(r));
  r = await as('service', `select user_id from second_chance_offers where id = '${OFF?.id}'`); ok('next bidder: not the buyer who did not pay', r.rows?.[0]?.user_id === U.B);
  r = await as('ADM', `select admin_offer_next_bidder(10961, 24, true)`); ok('next bidder: one offer open at a time', r.error?.includes('offer_open'), r.error);
  r = await as('A', `select * from second_chance_offers`); ok("next bidder: others can't see the offer", r.rows?.length === 0);
  r = await as('A', `select respond_second_chance('${OFF?.id}', true)`); ok("next bidder: only they can answer", r.error?.includes('offer_not_found'), r.error);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.B}' and title like 'You can still buy%'`); ok('next bidder: they are told', r.rows?.[0]?.n === 1);
  r = await as('B', `select respond_second_chance('${OFF?.id}', true) i`); const SCI = r.rows?.[0]?.i; ok('next bidder: accepting makes the sale', !!SCI, r.error);
  r = await as('service', `select l.status, l.winner_id, l.sold_price, i.price from lots l join invoices i on i.lot_id = l.id and i.id = '${SCI}' where l.id = 10961`);
  ok('next bidder: invoice at their bid', r.rows?.[0]?.status === 'sold' && r.rows[0].winner_id === U.B && Number(r.rows[0].price) === 4000, JSON.stringify(r.rows));
  r = await as('B', `select respond_second_chance('${OFF?.id}', true)`); ok('next bidder: can only be answered once', r.error?.includes('offer_closed'), r.error);

  // relist a vehicle that didn't sell
  await c.query(`insert into lots (id, status, title, make, model, start_price, ends_at, registration, runs, verified, ppsr_checked_at, vin)
    values (10962, 'passed', 'Unsold boat', 'Quintrex', '420', 500, now() - interval '1 day', 'unregistered', 'untested', listing_check_keys(), now(), 'AUQXN42000000962')`);
  await c.query(`insert into lot_private (lot_id, seller_name) values (10962, 'Bo Seller')`);
  await c.query(`insert into lot_photos (lot_id, path, sort) values (10962, 'y/1.jpg', 0)`);
  await c.query(`insert into watchlist (user_id, lot_id) values ('${U.A}', 10962)`);
  r = await as('A', `select admin_relist(10962)`); ok('relist: staff only', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_relist(10961)`); ok('relist: not a sold vehicle', r.error?.includes('not_relistable'), r.error);
  r = await as('ADM', `select admin_relist(10962) id`); const NEWL = r.rows?.[0]?.id; ok('relist: copies to a new draft', !!NEWL, r.error);
  r = await as('service', `select status, relisted_from, title, ppsr_checked_at, verified, (select count(*)::int from lot_photos where lot_id = ${NEWL}) ph, (select seller_name from lot_private where lot_id = ${NEWL}) sn from lots where id = ${NEWL}`);
  ok('relist: draft with photos and seller details, PPSR and checks to redo', r.rows?.[0]?.status === 'draft' && Number(r.rows[0].relisted_from) === 10962 && r.rows[0].ph === 1 && r.rows[0].sn === 'Bo Seller' && r.rows[0].ppsr_checked_at === null && r.rows[0].verified.length === 0, JSON.stringify(r.rows));
  r = await as('ADM', `select admin_relist(10962)`); ok('relist: only once', r.error?.includes('already_relisted'), r.error);
  await c.query(`update lots set status = 'live', ends_at = now() + interval '3 days' where id = ${NEWL}`);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and title = 'Back for auction: Unsold boat'`); ok('relist: past watchers told when it is back', r.rows?.[0]?.n === 1);
}

// ---------- fleet sales, search filters, seller type ----------
{
  r = await as('A', `insert into sales (slug, title) values ('my-sale', 'My sale')`); ok("sales: members can't create sales", !!r.error);
  r = await as('ADM', `insert into sales (slug, title, seller_label, published) values ('council-fleet', 'Ex-council fleet', 'Local council', false) returning id`); const SID = r.rows?.[0]?.id; ok('sales: staff create a sale', !!SID, r.error);
  r = await as('anon', `select * from sales`); ok('sales: hidden until published', r.rows?.length === 0);
  await c.query(`insert into lots (id, status, title, sale_id, start_price, ends_at, runs, registration) values
    (10963, 'live', 'Fleet ute 1', ${SID}, 1000, now() + interval '3 days', 'drives', 'registered'),
    (10964, 'draft', 'Fleet ute 2', ${SID}, 1000, now() + interval '3 days', 'starts', 'unregistered'),
    (10965, 'draft', 'Fleet ute 3', ${SID}, 1000, now() + interval '3 days', 'no_start', 'unregistered')`);
  await as('ADM', `update sales set published = true where id = ${SID}`);
  r = await as('anon', `select title from sales`); ok('sales: shown once published', r.rows?.length === 1);
  r = await as('anon', `select sale_stats(${SID}) s`); ok('sales: stats count live vehicles', r.rows?.[0]?.s?.live === 1, JSON.stringify(r.rows));
  r = await as('anon', `select count(*)::int n from search_lots('{"sale":"${SID}"}'::jsonb, 50, 0)`); ok('search: sale filter', r.rows?.[0]?.n === 1, JSON.stringify(r));
  r = await as('A', `select admin_stagger_sale(${SID}, now() + interval '2 days', 3)`); ok('sales: staff only stagger end times', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_stagger_sale(${SID}, now() + interval '2 days', 3) n`); ok('sales: end times staggered', r.rows?.[0]?.n === 3, r.error);
  r = await as('service', `select extract(epoch from (max(ends_at) - min(ends_at)))::int s from lots where sale_id = ${SID}`); ok('sales: one closes every 3 minutes', r.rows?.[0]?.s === 360, JSON.stringify(r.rows));
  r = await as('anon', `select count(*)::int n, bool_and(runs = 'drives') d from search_lots('{"runs":"drives"}'::jsonb, 50, 0)`); ok('search: starts-and-drives filter', r.rows?.[0]?.n > 0 && r.rows[0].d === true, JSON.stringify(r));
  await c.query(`update lots set status = 'draft' where id = 10963`);
  await c.query(`update lots set disclosures = '{"business":"yes"}' where id = 10964`);
  r = await as('service', `select seller_type from lots where id = 10964`); ok('seller type: business when the seller says so', r.rows?.[0]?.seller_type === 'business');
  await c.query(`update lots set disclosures = '{"business":"no"}', gst_status = 'inc' where id = 10965`);
  r = await as('service', `select seller_type from lots where id = 10965`); ok('seller type: GST-registered sellers are business sellers', r.rows?.[0]?.seller_type === 'business');
  r = await as('anon', `select count(*)::int n, bool_and(seller_type = 'private') p from search_lots('{"seller":"private"}'::jsonb, 50, 0)`); ok('search: private seller filter uses seller type', r.rows?.[0]?.p === true, JSON.stringify(r));
}

// ---------- price ranges, notes, partners, audits, newsletter ----------
{
  await c.query(`insert into lots (id, status, title, make, model, year, sold_price, ends_at) values
    (10970, 'sold', 'Sold 1', 'Isuzu', 'D-Max', 2019, 20000, now() - interval '10 days'),
    (10971, 'sold', 'Sold 2', 'Isuzu', 'D-Max', 2020, 24000, now() - interval '20 days')`);
  r = await as('anon', `select price_estimate('isuzu', 'd-max', 2019) e`); ok('estimate: needs at least 3 sales', r.rows?.[0]?.e?.count === 2 && r.rows[0].e.mid === undefined, JSON.stringify(r.rows));
  await c.query(`insert into lots (id, status, title, make, model, year, sold_price, ends_at) values (10972, 'sold', 'Sold 3', 'Isuzu', 'D-Max', 2021, 28000, now() - interval '30 days')`);
  r = await as('anon', `select price_estimate('Isuzu', 'D-Max', 2020) e`); ok('estimate: range from our own sales', r.rows?.[0]?.e?.count === 3 && Number(r.rows[0].e.mid) === 24000 && Number(r.rows[0].e.low) <= Number(r.rows[0].e.high), JSON.stringify(r.rows));

  await c.query(`insert into watchlist (user_id, lot_id) values ('${U.B}', 10432) on conflict do nothing`);
  r = await as('A', `update watchlist set note = 'Check the tow bar' where lot_id = 10962 returning note`); ok('notes: members add a note to a watched vehicle', r.rows?.[0]?.note === 'Check the tow bar', r.error);
  r = await as('A', `update watchlist set note = 'mine now' where user_id = '${U.B}'`); ok("notes: can't touch someone else's", r.count === 0);

  r = await as('ADM', `insert into partners (kind, slug, name) values ('transport', 'test-carrier', 'Test Carrier'), ('warranty', 'test-warranty', 'Test Warranty')`); ok('partners: transport and warranty partners', !r.error, r.error);
  r = await as('ADM', `insert into partners (kind, slug, name) values ('bogus', 'bogus-kind', 'Bogus')`); ok('partners: unknown kinds refused', !!r.error);

  r = await as('A', `insert into listing_audits (lot_id, ok) values (10432, true)`); ok("audits: members can't record audits", !!r.error);
  r = await as('ADM', `insert into listing_audits (lot_id, checks, ok, note) values (10432, '{"odometer":true}', true, 'Matches') returning id`); ok('audits: staff record audits', !r.error, r.error);
  r = await as('A', `select * from listing_audits`); ok("audits: members can't read them", r.rows?.length === 0);

  await c.query(`update profiles set notify = notify || '{"marketing":{"sms":false,"email":true}}' where id = '${U.A}'`);
  r = await as('A', `select queue_newsletter('News', 'Body', '/auctions', 'nl:test')`); ok('newsletter: only the server sends it', !!r.error);
  r = await as('service', `select queue_newsletter('This week at Tyrebiter', 'New vehicles', '/auctions', 'nl:test') n`); ok('newsletter: only to members who opted in', r.rows?.[0]?.n === 1, JSON.stringify(r));
  r = await as('service', `select queue_newsletter('This week at Tyrebiter', 'New vehicles', '/auctions', 'nl:test') n`); ok('newsletter: never sent twice', r.rows?.[0]?.n === 0);
  r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'nl:test:%' and user_id = '${U.B}'`); ok('newsletter: nothing for members who did not opt in', r.rows?.[0]?.n === 0);
}

// ---------- terms of sale (version 10 October 2026): fees locked, failed charges, late bids, reserve, corrections ----------
{
  await c.query(`insert into lots (id, status, title, start_price, ends_at, runs, registration) values
    (10980, 'live', 'Fee lock ute', 1000, now() + interval '3 days', 'drives', 'unregistered')`);
  r = await as('service', `select (fees->>'premium_rate')::numeric p from lots where id = 10980`); ok('fees: locked when a vehicle goes live', r.rows?.[0]?.p != null, JSON.stringify(r.rows));
  const before = (await as('service', `select (lot_price_breakdown(10980, 10000)->>'total')::numeric t`)).rows?.[0]?.t;
  await c.query(`update settings set value = value || '{"premium_rate": 0.2}' where key = 'fees'`);
  r = await as('service', `select (lot_price_breakdown(10980, 10000)->>'total')::numeric t, (price_breakdown(10000)->>'total')::numeric n`);
  ok('fees: a fee change never applies to a vehicle already live', Number(r.rows?.[0]?.t) === Number(before) && Number(r.rows[0].n) > Number(before), JSON.stringify(r.rows));
  r = await as('service', `select create_invoice(10980, '${U.B}', 10000, 'auction') id`); const FI = r.rows?.[0]?.id;
  r = await as('service', `select total from invoices where id = '${FI}'`); ok('fees: the invoice uses the fees locked on the vehicle', Number(r.rows?.[0]?.total) === Number(before), JSON.stringify(r.rows));
  r = await as('service', `select terms_version from invoices where id = '${FI}'`); ok('terms: each invoice records the terms version the buyer accepted', r.rows?.[0]?.terms_version === '2026-10-27', JSON.stringify(r.rows));
  await c.query(`insert into lots (id, status, title, start_price, ends_at) values (10981, 'live', 'New fees ute', 1000, now() + interval '3 days')`);
  r = await as('service', `select (fees->>'premium_rate')::numeric p from lots where id = 10981`); ok('fees: vehicles listed after the change get the new fees', Number(r.rows?.[0]?.p) === 0.2);
  await c.query(`update settings set value = value || '{"premium_rate": 0.1}' where key = 'fees'`);
  await c.query(`update lots set status = 'draft' where id = 10981`);
  r = await as('service', `select fees from lots where id = 10981`); ok('fees: a draft (or relisted copy) starts from current fees again', r.rows?.[0]?.fees === null);

  await as('service', `update invoices set status = 'payment_failed' where id = '${FI}'`);
  r = await as('service', `select failed_at is not null f from invoices where id = '${FI}'`); ok('payments: the time a card charge failed is recorded', r.rows?.[0]?.f === true);

  // a leader raising their maximum to meet the reserve in the closing minutes extends bidding
  await c.query(`insert into lots (id, status, title, start_price, ends_at, has_reserve) values (10982, 'live', 'Late reserve ute', 1000, now() + interval '2 minutes', true)`);
  await c.query(`insert into lot_private (lot_id, reserve_price) values (10982, 5000)`);
  r = await as('A', `select place_bid(10982, 2000) r`); ok('late bids: first bid placed', r.rows?.[0]?.r?.status === 'leading', r.error);
  await c.query(`update lots set ends_at = now() + interval '2 minutes' where id = 10982`);
  r = await as('A', `select place_bid(10982, 6000) r`);
  r = await as('service', `select current_bid, ends_at > now() + interval '9 minutes' x from lots where id = 10982`);
  ok('late bids: a jump to the reserve extends the auction too', Number(r.rows?.[0]?.current_bid) === 5000 && r.rows[0].x === true, JSON.stringify(r.rows));

  r = await as('ADM', `update lot_private set reserve_price = 7000 where lot_id = 10982`); ok("reserve: can't be raised once there are bids", r.error?.includes('reserve_locked'), r.error);
  r = await as('ADM', `update lot_private set reserve_price = 4500 where lot_id = 10982 returning reserve_price`); ok('reserve: can be lowered', Number(r.rows?.[0]?.reserve_price) === 4500, r.error);
  r = await as('ADM', `update lot_private set reserve_price = null where lot_id = 10982 returning lot_id`); ok('reserve: can be removed', r.rows?.length === 1, r.error);
  r = await as('ADM', `update lot_private set reserve_price = 9000 where lot_id = 10982`); ok("reserve: can't be added back once there are bids", r.error?.includes('reserve_locked'), r.error);

  r = await as('ADM', `update lots set title = 'Late reserve ute (dual cab)' where id = 10982`);
  r = await as('service', `select count(*)::int n from lot_corrections where lot_id = 10982 and field = 'title'`); ok('corrections: a title change is a correction', r.rows?.[0]?.n === 1, r.error);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and title = 'Correction to a vehicle you bid on: Late reserve ute (dual cab)'`); ok('corrections: bidders told', r.rows?.[0]?.n === 1, JSON.stringify(r));

  r = await as('ADM', `insert into lot_flaws (lot_id, title, note) values (10982, 'Dent', 'Rear door') returning id`); const FL = r.rows?.[0]?.id; ok('flaws: staff add a flaw to a live listing', !!FL, r.error);
  await as('ADM', `update lot_flaws set note = 'Rear left door, 5 cm' where id = '${FL}'`);
  r = await as('service', `select announce_flaw_changes(interval '1 hour') n`); ok('flaws: nothing announced while staff are still editing', r.rows?.[0]?.n === 0, r.error);
  r = await as('service', `select announce_flaw_changes(interval '0 seconds') n`); ok('flaws: announced once editing stops', r.rows?.[0]?.n === 1, r.error);
  r = await as('service', `select before, after from lot_corrections where lot_id = 10982 and field = 'flaws'`);
  ok('flaws: one correction showing before and after', r.rows?.length === 1 && r.rows[0].before === 'none listed' && r.rows[0].after === 'Dent: Rear left door, 5 cm', JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and body like '%Damage and flaws: Dent%'`); ok('flaws: bidders told', r.rows?.[0]?.n === 1, JSON.stringify(r));
  r = await as('service', `select ends_at > now() + interval '23 hours' x from lots where id = 10982`); ok('flaws: at least 24 hours of bidding left', r.rows?.[0]?.x === true);
  r = await as('service', `select announce_flaw_changes(interval '0 seconds') n`); ok('flaws: announced only once', r.rows?.[0]?.n === 0);
}

// ---------- the information machine: traffic, the metric store, insights and SEO tables ----------
{
  await c.query(`insert into web_events (kind, path, page, lot_id, visitor, source, device, region, query, results) values
    ('view', '/', 'home', null, 'v1', 'google', 'mobile', 'QLD', null, null),
    ('view', '/lot/10432', 'lot', 10432, 'v1', 'google', 'mobile', 'QLD', null, null),
    ('view', '/lot/10432', 'lot', 10432, 'v2', 'direct', 'desktop', 'NSW', null, null),
    ('search', '/auctions', 'auctions', null, 'v2', 'direct', 'desktop', 'NSW', 'Toyota LandCruiser 79', 0),
    ('search', '/auctions', 'auctions', null, 'v1', 'google', 'mobile', 'QLD', 'Toyota LandCruiser 79', 0),
    ('search', '/auctions', 'auctions', null, 'v1', 'google', 'mobile', 'QLD', 'Utes in QLD', 14),
    ('search', '/auctions', 'auctions', null, 'v1', 'google', 'mobile', 'QLD', 'my name is joe bloggs', 0),
    ('view', '/', 'home', null, 'v9', 'spamtag', 'desktop', null, null, null)`);
  await c.query(`insert into web_events (at, kind, path, page, visitor, source, device) values (now() - interval '100 days', 'view', '/', 'home', 'old', 'direct', 'desktop')`);
  r = await as('service', `select compute_daily_metrics((now() at time zone 'Australia/Brisbane')::date) n`); ok('metrics: computed for today', r.rows?.[0]?.n > 20, r.error);
  const m = async (metric, dim = '') => Number((await as('service', `select value from metric_values where day = (now() at time zone 'Australia/Brisbane')::date and metric = '${metric}' and dim = '${dim}'`)).rows?.[0]?.value ?? -1);
  ok('metrics: page views', await m('views') === 4);
  ok('metrics: visitors are distinct people', await m('visitors') === 3);
  ok('metrics: rare unknown sources folded into "other"', await m('visitors', 'src:other') === 1 && await m('visitors', 'src:spamtag') === -1);
  ok('metrics: visitors by source', await m('visitors', 'src:google') === 1 && await m('views', 'src:google') === 2);
  ok('metrics: by device and state', await m('visitors', 'dev:mobile') === 1 && await m('visitors', 'region:NSW') === 1);
  ok('metrics: vehicle page views', await m('lot_views') === 2);
  ok('metrics: searches and searches with no results', await m('searches') === 4 && await m('searches_zero') === 3);
  ok('metrics: what was searched by 2+ people (lower case)', await m('search_terms_zero', 'q:toyota landcruiser 79') === 2 && await m('search_terms', 'q:toyota landcruiser 79') === 2);
  ok('metrics: a search only one person made is never kept', await m('search_terms', 'q:utes in qld') === -1 && await m('search_terms_zero', 'q:my name is joe bloggs') === -1);
  r = await as('service', `select coalesce(sum(price), 0) g, count(*)::int n from invoices where status <> 'cancelled' and (created_at at time zone 'Australia/Brisbane')::date = (now() at time zone 'Australia/Brisbane')::date`);
  ok('metrics: sales and vehicle sales match the invoices', await m('sales') === r.rows[0].n && await m('gmv') === Number(r.rows[0].g), JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from lots where status = 'live'`);
  ok('metrics: live now (a stock level)', await m('live_lots') === r.rows[0].n);
  r = await as('service', `select coalesce(sum(premium), 0) + coalesce(sum(round(admin_fee / 1.1, 2)), 0) v from invoices where status <> 'cancelled' and (created_at at time zone 'Australia/Brisbane')::date = (now() at time zone 'Australia/Brisbane')::date`);
  ok('metrics: revenue includes premium and admin fees ex GST', await m('revenue') >= Number(r.rows[0].v), `${await m('revenue')} vs ${r.rows[0].v}`);
  r = await as('service', `select total, latest from metrics_range((now() at time zone 'Australia/Brisbane')::date - 6, (now() at time zone 'Australia/Brisbane')::date, 'views') where dim = ''`);
  ok('metrics: totals over a range', Number(r.rows?.[0]?.total) === 4, JSON.stringify(r));
  r = await as('service', `select metrics_totals((now() at time zone 'Australia/Brisbane')::date - 6, (now() at time zone 'Australia/Brisbane')::date) t`);
  ok('metrics: all totals as one value (no API row limit), search terms left out', Number(r.rows?.[0]?.t?.sum?.views) === 4 && Number(r.rows[0].t.sum['visitors|src:google']) === 1 && !Object.keys(r.rows[0].t.sum).some((k) => k.startsWith('search_terms')), JSON.stringify(r).slice(0, 300));
  r = await as('service', `select search_terms_top((now() at time zone 'Australia/Brisbane')::date - 6, (now() at time zone 'Australia/Brisbane')::date, 'search_terms_zero', 5) t`);
  ok('metrics: top searches that found nothing', JSON.stringify(r.rows?.[0]?.t) === JSON.stringify([['toyota landcruiser 79', 2]]), JSON.stringify(r.rows));
  r = await as('service', `select metrics_series((now() at time zone 'Australia/Brisbane')::date - 6, (now() at time zone 'Australia/Brisbane')::date, array['views','visitors'], '') s`);
  ok('metrics: daily series for charts', Object.values(r.rows?.[0]?.s?.views || {}).map(Number).includes(4), JSON.stringify(r.rows));
  r = await as('service', `select refresh_metrics(2) n`); ok('metrics: refresh the last few days', r.rows?.[0]?.n > 20, r.error);
  ok('metrics: recomputing replaces, never doubles', await m('views') === 4);
  r = await as('service', `select compute_daily_metrics((now() at time zone 'Australia/Brisbane')::date, false) n`);
  ok('metrics: recomputing without traffic keeps the traffic numbers', await m('views') === 4 && await m('visitors', 'src:google') === 1);
  r = await as('service', `select count(*)::int n from profiles where created_at >= ((now() at time zone 'Australia/Brisbane')::date)::timestamp at time zone 'Australia/Brisbane' and id_verified_at is not null`);
  ok('metrics: of today\'s new members, how many verified', await m('signups_verified') === r.rows[0].n, JSON.stringify(r.rows));

  for (const who of ['anon', 'A', 'ADM']) {
    r = await as(who, `select count(*)::int n from web_events`); ok(`privacy: ${who} can't read raw traffic`, !!r.error || r.rows?.[0]?.n === 0);
    r = await as(who, `select count(*)::int n from metric_values`); ok(`privacy: ${who} can't read the metric store directly`, !!r.error || r.rows?.[0]?.n === 0);
  }
  r = await as('A', `select compute_daily_metrics(current_date)`); ok("privacy: members can't run the metrics", !!r.error);
  r = await as('A', `select * from reserve_gap(30)`); ok("privacy: reserves stay private (members can't ask)", !!r.error);
  r = await as('A', `insert into web_events (kind, visitor) values ('view', 'x')`); ok("privacy: members can't write traffic rows", !!r.error);
  r = await as('A', `select * from insights`); ok("privacy: members can't read insights", !!r.error || r.rows?.length === 0);
  r = await as('A', `select * from seo_issues`); ok("privacy: members can't read SEO findings", !!r.error || r.rows?.length === 0);

  r = await as('service', `select prune_web_events(90) n`); ok('traffic: rows older than 90 days deleted', r.rows?.[0]?.n === 1);
  r = await as('service', `select count(*)::int n from web_events`); ok('traffic: recent rows kept', r.rows?.[0]?.n === 8);

  await c.query(`update profiles set id_status = 'pending', id_verified_at = null where id = '${U.NEW}'`);
  await c.query(`update profiles set id_status = 'verified' where id = '${U.NEW}'`);
  r = await as('service', `select id_verified_at is not null v from profiles where id = '${U.NEW}'`); ok('funnel: the time an ID is verified is recorded', r.rows?.[0]?.v === true);
  r = await as('NEW', `update profiles set id_verified_at = now() - interval '1 year' where id = '${U.NEW}' returning id_verified_at > now() - interval '1 day' fresh`); ok("funnel: members can't change it", r.rows?.[0]?.fresh === true || !!r.error, JSON.stringify(r));
  r = await as('service', `select count(*)::int n from invoices where status = 'cancelled' and cancelled_at is null`); ok('payments: every cancelled sale has a cancelled time', r.rows?.[0]?.n === 0);
  r = await as('service', `select push_wanted('{}'::jsonb, 'insights') a, push_wanted('{"insights":{"push":true}}'::jsonb, 'insights') b, push_wanted('{}'::jsonb, 'won') w`);
  ok('briefings: email only unless push is turned on', r.rows?.[0]?.a === false && r.rows[0].b === true && r.rows[0].w === true);
  r = await as('service', `select value from settings where key = 'insights'`); ok('briefings: weekly on by default', r.rows?.[0]?.value?.weekly === true && r.rows[0].value.daily === false);

  await c.query(`insert into seo_search_daily (day, query, page, clicks, impressions, position) values
    (current_date - 3, 'ute auction brisbane', '/for-sale/utes/qld', 2, 300, 7.2), (current_date - 2, 'ute auction brisbane', '/for-sale/utes/qld', 1, 200, 6.8),
    (current_date - 2, 'tyrebiter', '/', 40, 60, 1.0)`);
  r = await as('service', `select * from seo_opportunities(28, 10)`);
  ok('seo: searches we could win (page 1-2, not the top)', r.rows?.length === 1 && r.rows[0].query === 'ute auction brisbane' && Number(r.rows[0].impressions) === 500 && Number(r.rows[0].position) === 7.0, JSON.stringify(r.rows));
  r = await as('service', `select * from seo_top(28, 'query', 5)`); ok('seo: top searches by clicks', r.rows?.[0]?.key === 'tyrebiter', JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from seo_lot_audit(100)`); const liveN = (await as('service', `select count(*)::int n from lots where status = 'live'`)).rows[0].n;
  ok('seo: the audit sees every live listing', r.rows?.[0]?.n === liveN, JSON.stringify(r));
  r = await as('service', `select count(*)::int n from seo_changed_lots(now() - interval '1 hour', 100)`); ok('seo: recently changed listings for the search engine ping', r.rows?.[0]?.n > 0);
  await c.query(`update lots set seo_changed_at = now() - interval '2 hours' where id = 10982`);
  r = await as('B', `select place_bid(10982, 9000) r`);
  r = await as('service', `select count(*)::int n from seo_changed_lots(now() - interval '1 hour', 100) where id = 10982`); ok("seo: a bid alone doesn't re-send the page to search engines", r.rows?.[0]?.n === 0, JSON.stringify(r));
  await as('ADM', `update lots set title = 'Late reserve ute (dual cab, towbar)' where id = 10982`);
  r = await as('service', `select count(*)::int n from seo_changed_lots(now() - interval '1 hour', 100) where id = 10982`); ok('seo: an edit does', r.rows?.[0]?.n === 1);
  await c.query(`insert into lots (id, status, title, start_price, ends_at, bid_count, current_bid, has_reserve, category) values (10990, 'passed', 'Gap ute', 1000, now() - interval '1 day', 3, 40000, true, 'utes')`);
  await c.query(`insert into lot_private (lot_id, reserve_price) values (10990, 50000)`);
  r = await as('service', `select avg_gap from reserve_gap(30) where category = 'utes'`); ok('insights: reserve gap measured against the final bid (50k reserve, 40k bid = 25%)', Number(r.rows?.[0]?.avg_gap) === 0.25, JSON.stringify(r.rows));
  r = await as('service', `select * from lot_recent_views(array[10432]::bigint[], 7)`); ok('insights: recent views per vehicle', Number(r.rows?.[0]?.views) === 2, JSON.stringify(r.rows));
}

// ---------- site health: errors, checks, the clock's heartbeat, alerts and Claude Code fixes ----------
{
  // nobody but the server can touch any of it
  for (const t of ['app_errors', 'app_error_hours', 'health_checks', 'health_events', 'health_marks', 'clock_runs', 'fix_requests']) {
    r = await as('anon', `select * from ${t}`); ok(`health: anon can't read ${t}`, r.rows?.length === 0 || !!r.error, JSON.stringify(r));
    r = await as('A', `select * from ${t}`); ok(`health: members can't read ${t}`, r.rows?.length === 0 || !!r.error);
  }
  for (const f of [`record_error('x','web','E','m',null,null,null,null,'{}',1)`, 'health_snapshot()', `save_health('[]')`, 'prune_health()', 'retry_failed_messages(24)', 'db_activity()', `queue_health_alert('t','b','/','d',true)`, 'error_hours(48, null)']) {
    r = await as('anon', `select ${f}`); ok(`health: anon can't run ${f.split('(')[0]}`, !!r.error);
    r = await as('ADM', `select ${f}`); ok(`health: even admins can't run ${f.split('(')[0]} directly (server only)`, !!r.error);
  }
  // errors are grouped and counted, with hourly buckets
  r = await as('service', `select record_error('web:abc','web','TypeError','x is undefined','at a','/lot/1','/lot/:id','abc1234','{"browser":"Safari"}',1) j`);
  const e1 = r.rows?.[0]?.j; ok('errors: first report is new', e1?.new === true && e1?.reopened === false, JSON.stringify(r));
  r = await as('service', `select record_error('web:abc','web','TypeError','x is undefined','at a','/lot/2','/lot/:id','def5678','{}',4) j`);
  ok('errors: same fingerprint counted', r.rows?.[0]?.j?.new === false && r.rows?.[0]?.j?.id === e1.id);
  r = await c.query(`select count, release, first_release, path from app_errors where id = $1`, [e1.id]);
  ok('errors: count, latest and first release', Number(r.rows[0].count) === 5 && r.rows[0].release === 'def5678' && r.rows[0].first_release === 'abc1234' && r.rows[0].path === '/lot/2', JSON.stringify(r.rows));
  r = await c.query(`select sum(n)::int n from app_error_hours where error_id = $1`, [e1.id]); ok('errors: hourly buckets', r.rows[0].n === 5);
  r = await as('service', `select error_hours(48, null) j`); ok('errors: hourly totals for the chart', Object.values(r.rows?.[0]?.j || {}).reduce((a, b) => a + b, 0) >= 5, JSON.stringify(r.rows));
  // a fixed error that comes back reopens itself
  await c.query(`update app_errors set status = 'fixed', status_at = now() where id = $1`, [e1.id]);
  r = await as('service', `select record_error('web:abc','web','TypeError','x is undefined',null,null,'/lot/:id',null,'{}',1) j`);
  ok('errors: fixed error that comes back reopens', r.rows?.[0]?.j?.reopened === true);
  r = await c.query(`select status, regressed, stack from app_errors where id = $1`, [e1.id]); ok('errors: marked as came back, stack kept', r.rows[0].status === 'open' && r.rows[0].regressed === true && r.rows[0].stack === 'at a');
  // ignored stays ignored
  await c.query(`update app_errors set status = 'ignored' where id = $1`, [e1.id]);
  await as('service', `select record_error('web:abc','web','TypeError','x is undefined',null,null,'/lot/:id',null,'{}',1)`);
  r = await c.query(`select status from app_errors where id = $1`, [e1.id]); ok('errors: ignored errors stay ignored', r.rows[0].status === 'ignored');
  r = await as('service', `select record_error('x','nowhere','E','m',null,null,null,null,'{}',1)`); ok('errors: unknown source refused', !!r.error);
  // browser reports can't flood the table with new kinds of error
  await c.query(`insert into app_errors (fingerprint, source, message, first_seen) select 'flood:' || g, 'web', 'f', now() from generate_series(1, 300) g`);
  r = await as('service', `select record_error('web:one-too-many','web','E','another new one',null,null,null,null,'{}',1) j`);
  r = await c.query(`select fingerprint, message from app_errors where id = $1`, [r.rows?.[0]?.j?.id]);
  ok('errors: past 300 new kinds an hour, the rest are counted together', r.rows[0]?.fingerprint === 'overflow:web' && /Too many different errors/.test(r.rows[0]?.message), JSON.stringify(r.rows));
  r = await as('service', `select record_error('server:new','server','E','server errors are always kept',null,null,null,null,'{}',1) j`);
  r = await c.query(`select fingerprint from app_errors where id = $1`, [r.rows?.[0]?.j?.id]); ok('errors: server errors are never lumped together', r.rows[0]?.fingerprint === 'server:new');
  await c.query(`delete from app_errors where fingerprint like 'flood:%'`);

  // the snapshot the checks read
  await c.query(`insert into clock_runs (job, started_at, ms, ok, failed) values ('process', now() - interval '90 seconds', 2100, true, '{}'), ('process', now() - interval '30 seconds', 1900, false, '{"charge winners"}'), ('process', now() - interval '20 minutes', null, true, '{}'), ('send', now() - interval '40 seconds', 900, true, '{}')`);
  r = await as('service', `select health_snapshot() j`); const snap = r.rows?.[0]?.j;
  ok('snapshot: runs', !!snap && !r.error, r.error);
  ok('snapshot: latest clock run per job', snap?.clock?.process?.failed?.[0] === 'charge winners' && snap?.clock?.send?.ms === 900, JSON.stringify(snap?.clock));
  ok('snapshot: unfinished runs counted', snap?.clock_unfinished === 1);
  ok('snapshot: failed runs this hour', snap?.clock_failed_hour === 1);
  ok('snapshot: every table has row-level security', Array.isArray(snap?.no_rls) && snap.no_rls.length === 0, JSON.stringify(snap?.no_rls));
  ok('snapshot: no open views', Array.isArray(snap?.open_views) && snap.open_views.length === 0);
  ok('snapshot: database size and connections', Number(snap?.db_bytes) > 0 && Number(snap?.db_max_connections) > 0);
  ok('snapshot: error counts', Number(snap?.errors_recent) >= 1 && snap?.errors_by_source?.server >= 1, JSON.stringify([snap?.errors_recent, snap?.errors_by_source]));
  ok('snapshot: settings', snap?.settings?.db_limit_gb === 8);
  await c.query(`create table public.oops_no_rls (id int)`);
  r = await as('service', `select health_snapshot() j`); ok('snapshot: a table without row-level security is spotted', r.rows?.[0]?.j?.no_rls?.includes('oops_no_rls'));
  await c.query(`drop table public.oops_no_rls`);
  await c.query(`create view public.oops_view as select id from lots`);
  r = await as('service', `select health_snapshot() j`); ok('snapshot: a view anyone can read is spotted', r.rows?.[0]?.j?.open_views?.includes('oops_view'));
  await c.query(`drop view public.oops_view`);
  // overdue auctions and waiting charges
  await c.query(`insert into lots (id, status, title, start_price, ends_at) values (10995, 'live', 'Overdue ute', 1000, now() - interval '10 minutes')`);
  r = await as('service', `select health_snapshot() j`); ok('snapshot: overdue auctions', Number(r.rows?.[0]?.j?.auctions_overdue) >= 1);
  await c.query(`update lots set status = 'passed' where id = 10995`);

  // saving checks logs changes and reports them for alerts
  const ck = (status, title) => JSON.stringify([{ key: 'clock.running', area: 'Auction clock', status, title, detail: 'd', fix: 'f', action: 'run-clock', value: 1 }]);
  r = await as('service', `select save_health($1) j`, [ck('ok', 'Running')]); ok('checks: a new OK check is not a change', Array.isArray(r.rows?.[0]?.j) && r.rows[0].j.length === 0, JSON.stringify(r));
  r = await as('service', `select save_health($1) j`, [ck('ok', 'Running')]); ok('checks: no change, nothing reported', r.rows?.[0]?.j?.length === 0);
  r = await as('service', `select save_health($1) j`, [ck('fail', 'Stopped')]); const ch = r.rows?.[0]?.j?.[0];
  ok('checks: change reported', ch?.from === 'ok' && ch?.to === 'fail' && ch?.alerted === false, JSON.stringify(r.rows));
  r = await c.query(`select status, since > now() - interval '5 seconds' fresh from health_checks where key = 'clock.running'`); ok('checks: saved with when it started', r.rows[0].status === 'fail' && r.rows[0].fresh);
  r = await c.query(`select from_status, to_status from health_events where key = 'clock.running' order by id desc limit 1`); ok('checks: change logged', r.rows[0]?.from_status === 'ok' && r.rows[0]?.to_status === 'fail');
  await c.query(`insert into health_checks (key, area, status, title) values ('old.check', 'Old', 'fail', 'Gone')`);
  await as('service', `select save_health($1)`, [ck('fail', 'Stopped')]);
  r = await c.query(`select count(*)::int n from health_checks where key = 'old.check'`); ok('checks: a check no longer produced is removed (never stuck as broken)', r.rows[0].n === 0);
  // ignored errors don't count towards "errors recently"
  r = await as('service', `select health_snapshot() j`); const before = Number(r.rows?.[0]?.j?.errors_recent);
  await c.query(`update app_errors set status = 'ignored' where fingerprint = 'server:new'`);
  r = await as('service', `select health_snapshot() j`); ok('snapshot: ignored errors not counted', Number(r.rows?.[0]?.j?.errors_recent) === before - 1, JSON.stringify([before, r.rows?.[0]?.j?.errors_recent]));
  // alerts go to admins only, by email and app, and by SMS when urgent
  r = await as('service', `select queue_health_alert('Tyrebiter problem: clock', 'body', '/admin/health', 'health:test:1', true) n`);
  ok('alerts: queued for each admin', Number(r.rows?.[0]?.n) === 1, JSON.stringify(r));
  r = await c.query(`select channel, priority, kind from outbox where dedupe_key like 'health:test:1:%' order by channel`);
  ok('alerts: email to the admin, top priority', r.rows.some((x) => x.channel === 'email' && x.priority === 1 && x.kind === 'health'), JSON.stringify(r.rows));
  r = await c.query(`select count(*)::int n from notifications where kind = 'health' and user_id = '${U.ADM}' and title not like 'New admin%'`); ok('alerts: in the admin\'s notifications (and app)', r.rows[0].n === 1);
  r = await c.query(`select count(*)::int n from notifications where kind = 'health' and user_id <> '${U.ADM}'`); ok('alerts: members never get them', r.rows[0].n === 0);
  r = await as('service', `select queue_health_alert('again', 'body', '/admin/health', 'health:test:1', true) n`); ok('alerts: the same alert is never sent twice', Number(r.rows?.[0]?.n) === 0);
  await c.query(`update profiles set mobile = '0433333333', mobile_verified = true where id = '${U.ADM}'`);
  await as('service', `select queue_health_alert('urgent', 'b', '/', 'health:test:2', true)`);
  await as('service', `select queue_health_alert('not urgent', 'b', '/', 'health:test:3', false)`);
  r = await c.query(`select dedupe_key from outbox where channel = 'sms' and dedupe_key like 'health:test:%'`);
  ok('alerts: SMS only for urgent ones', r.rows.length === 1 && r.rows[0].dedupe_key.startsWith('health:test:2'), JSON.stringify(r.rows));
  await c.query(`update settings set value = value || '{"sms": false}' where key = 'health'`);
  await as('service', `select queue_health_alert('urgent2', 'b', '/', 'health:test:4', true)`);
  r = await c.query(`select count(*)::int n from outbox where channel = 'sms' and dedupe_key like 'health:test:4%'`); ok('alerts: SMS can be switched off', r.rows[0].n === 0);
  await c.query(`update settings set value = value || '{"alerts": false}' where key = 'health'`);
  r = await as('service', `select queue_health_alert('off', 'b', '/', 'health:test:5', true) n`); ok('alerts: can be switched off', Number(r.rows?.[0]?.n) === 0);
  await c.query(`update settings set value = '{"alerts": true, "sms": true, "db_limit_gb": 8}' where key = 'health'`);
  // retrying failed messages: only recent, still useful ones
  await c.query(`insert into outbox (user_id, channel, to_addr, kind, title, status, attempts, last_error, created_at, dedupe_key) values
    ('${U.A}', 'email', 'a@x.au', 'account', 'Recent', 'failed', 5, 'Resend 500', now() - interval '1 hour', 'retry-test-1'),
    ('${U.A}', 'email', 'a@x.au', 'account', 'Old', 'failed', 5, 'Resend 500', now() - interval '3 days', 'retry-test-2')`);
  await c.query(`insert into outbox (user_id, channel, to_addr, kind, title, status, attempts, expires_at, dedupe_key) values ('${U.A}', 'email', 'a@x.au', 'ending', 'Expired', 'failed', 5, now() - interval '1 minute', 'retry-test-3')`);
  r = await as('service', `select retry_failed_messages(24) n`); ok('retry: only the recent failure', Number(r.rows?.[0]?.n) === 1, JSON.stringify(r));
  r = await c.query(`select status, attempts from outbox where dedupe_key = 'retry-test-1'`); ok('retry: queued again with fresh attempts', r.rows[0].status === 'queued' && r.rows[0].attempts === 0);
  // fix requests keep their error link; prune keeps errors with open fixes
  r = await c.query(`insert into fix_requests (error_id, title, brief, status) values ($1, 'Fix: x', 'task', 'working') returning id`, [e1.id]);
  await c.query(`update app_errors set status = 'fixed', last_seen = now() - interval '100 days' where id = $1`, [e1.id]);
  await c.query(`insert into app_errors (fingerprint, source, message, status, last_seen) values ('old:fixed', 'web', 'old', 'fixed', now() - interval '100 days'), ('old:open', 'web', 'quiet', 'open', now() - interval '40 days')`);
  await c.query(`insert into clock_runs (job, started_at, ms) values ('process', now() - interval '20 days', 1)`);
  r = await as('service', `select prune_health() j`); const pr = r.rows?.[0]?.j;
  ok('prune: runs', !!pr, r.error);
  r = await c.query(`select fingerprint, status from app_errors where fingerprint in ('old:fixed', 'old:open', 'web:abc') order by fingerprint`);
  ok('prune: old fixed errors deleted, quiet ones marked fixed, ones with open fixes kept',
    JSON.stringify(r.rows) === JSON.stringify([{ fingerprint: 'old:open', status: 'fixed' }, { fingerprint: 'web:abc', status: 'fixed' }]), JSON.stringify(r.rows));
  r = await c.query(`select count(*)::int n from clock_runs where started_at < now() - interval '14 days'`); ok('prune: old clock runs deleted', r.rows[0].n === 0);
  r = await as('service', `select db_activity() j`); ok('db activity: readable by the server', Array.isArray(r.rows?.[0]?.j), r.error);
}

// ---------- the safest way to take money: a refundable bidding deposit by PayID or bank transfer, no cards ----------
{
  await c.query(`update settings set value = value || '{"pay_mode": "deposit", "deposit_rate": 0.10, "deposit_min": 500, "deposit_cap": 5000}' where key = 'fees'`);
  await c.query(`insert into auth.users (id,email) values ('${U.C}','c@x.au'),('${U.D}','d@x.au')`);
  await c.query(`update profiles set details_done=true, first_name='Cal', last_name='Cole', mobile='0433333333', mobile_verified=true, id_status='verified', terms_version='2026-10-27' where id = '${U.C}'`);
  await c.query(`update profiles set details_done=true, first_name='Dee', last_name='Dunn', mobile='0444444444', mobile_verified=true, id_status='verified', terms_version='2026-10-27' where id = '${U.D}'`);
  await c.query(`insert into lots (id, status, title, start_price, ends_at, buy_now_price) values
    (20001, 'live', 'Deposit ute one', 1000, now() + interval '3 days', null),
    (20002, 'live', 'Deposit ute two', 1000, now() + interval '3 days', null),
    (20003, 'live', 'Deposit truck', 1000, now() + interval '3 days', 30000),
    (20004, 'live', 'Deposit van', 1000, now() + interval '3 days', null)`);
  r = await as('service', `select deposit_for(1000) a, deposit_for(5000) b, deposit_for(5001) c, deposit_for(12000) d, deposit_for(80000) e`);
  ok('deposit: 10% of the amount, at least $500, at most $5,000', JSON.stringify(r.rows?.[0]) === JSON.stringify({ a: '500', b: '500', c: '501', d: '1200', e: '5000' }), JSON.stringify(r.rows));
  r = await as('C', `select me() j`); const meC = r.rows?.[0]?.j;
  ok('deposit: a new bidder has a payment reference and no deposit yet', /^BID[A-Z2-9]{6}$/.test(meC?.deposit_ref || '') && meC?.payment_ok === false && Number(meC?.deposit?.balance) === 0 && meC?.pay_mode === 'deposit', JSON.stringify(meC));
  r = await as('C', `select place_bid(20001, 2000)`); ok("deposit: can't bid without one", r.error?.includes('not_verified'), r.error);
  r = await as('C', `update profiles set deposit_ref = 'BIDAAAAAA' where id = '${U.C}'`); ok("deposit: members can't change their payment reference", r.error?.includes('protected_field'), r.error);
  r = await as('C', `select record_deposit('${U.C}', 5000, 'bank', 'x', 'Cal Cole')`); ok("deposit: members can't record their own deposit", r.error?.includes('forbidden'), r.error);
  r = await as('C', `insert into bidder_deposits (user_id, kind, amount) values ('${U.C}', 'received', 5000)`); ok("deposit: members can't write to the ledger", !!r.error);
  r = await as('ADM', `select record_deposit('${U.C}', 500, 'bank', '${meC?.deposit_ref}', 'CAL COLE', '062-000', '1234 5678') id`); const DEP1 = r.rows?.[0]?.id;
  ok('deposit: our team records a transfer that arrived', !!DEP1, r.error);
  r = await as('service', `select payer_bsb, payer_account from bidder_deposits where id = '${DEP1}'`); ok('deposit: the account it came from is kept (digits only)', r.rows?.[0]?.payer_bsb === '062000' && r.rows[0].payer_account === '12345678', JSON.stringify(r.rows));
  r = await as('service', `select body from notifications where user_id = '${U.C}' and title = 'Your bidding deposit has arrived'`); ok('deposit: the bidder is told their new limit', r.rows?.[0]?.body?.includes('up to $5,000'), JSON.stringify(r.rows));
  r = await as('C', `select me() j`); ok('deposit: now ready to bid, up to $5,000', r.rows?.[0]?.j?.payment_ok === true && Number(r.rows[0].j.deposit.limit) === 5000, JSON.stringify(r.rows?.[0]?.j?.deposit));
  r = await as('C', `select place_bid(20001, 5000) r`); ok('deposit: bids up to the limit', r.rows?.[0]?.r?.status === 'leading', r.error);
  r = await as('C', `select place_bid(20002, 1500) r`); ok('deposit: the deposit covers one vehicle at a time', r.error?.includes('deposit_short:500:0'), r.error);
  r = await as('C', `select place_bid(20001, 6000) r`); ok('deposit: raising your own maximum needs a deposit for the new maximum', r.error?.includes('deposit_short:600:500'), r.error);
  await as('ADM', `select record_deposit('${U.C}', 1000, 'payid', 'payid', 'Cal Cole')`);
  r = await as('C', `select place_bid(20002, 6000) r`); ok('deposit: a top-up raises the limit', r.rows?.[0]?.r?.status === 'leading', r.error);
  r = await as('service', `select deposit_summary('${U.C}') j`); let sC = r.rows?.[0]?.j;
  ok('deposit: what is held and what is free', Number(sC.balance) === 1500 && Number(sC.committed) === 1100 && Number(sC.available) === 400 && Number(sC.limit) === 0, JSON.stringify(sC));
  await as('ADM', `select record_deposit('${U.D}', 5000, 'bank', 'ref', 'Dee Dunn', '062000', '87654321')`);
  r = await as('D', `select place_bid(20001, 9000) r`); ok('deposit: someone else outbids', r.rows?.[0]?.r?.status === 'leading', r.error);
  r = await as('service', `select deposit_summary('${U.C}') j`); sC = r.rows?.[0]?.j;
  ok('deposit: being outbid frees the deposit straight away', Number(sC.committed) === 600 && Number(sC.available) === 900, JSON.stringify(sC));
  r = await as('D', `select place_bid(20004, 250000) r`); ok('deposit: the cap is per vehicle; other vehicles you lead still hold theirs', r.error?.includes('deposit_short:5000:4100'), r.error);
  await as('ADM', `select record_deposit('${U.D}', 1000, 'bank', 'ref', 'Dee Dunn', '062000', '87654321')`);
  r = await as('service', `select deposit_summary('${U.D}')->>'unlimited' u`); const unl = r.rows?.[0]?.u;
  r = await as('D', `select place_bid(20004, 250000) r`); ok('deposit: at the cap there is no limit', r.rows?.[0]?.r?.status === 'leading' && unl === 'true', r.error);
  r = await as('C', `select my_deposit() j`); const myC = r.rows?.[0]?.j;
  ok('deposit: the bidder sees their history and what is holding their deposit', myC?.history?.length === 2 && myC?.holding?.length === 1 && myC.holding[0].lot_id === 20002 && Number(myC.holding[0].amount) === 600, JSON.stringify(myC?.holding));
  r = await as('D', `select * from bidder_deposits where user_id = '${U.C}'`); ok("deposit: bidders can't see each other's deposits", r.rows?.length === 0, JSON.stringify(r));

  // withdrawals
  r = await as('C', `select request_deposit_withdrawal(1000)`); ok("withdraw: can't take back what's holding a bid", r.error?.includes('withdraw_too_much:900'), r.error);
  r = await as('C', `select request_deposit_withdrawal(400) id`); const WD = r.rows?.[0]?.id; ok('withdraw: what is free comes back', !!WD, r.error);
  r = await as('service', `select status, amount, payer_bsb from bidder_deposits where id = '${WD}'`); ok('withdraw: waits for our team, back to the account it came from', r.rows?.[0]?.status === 'pending' && Number(r.rows[0].amount) === -400 && r.rows[0].payer_bsb === '062000', JSON.stringify(r.rows));
  r = await as('C', `select deposit_withdrawal_paid('${WD}', 'x')`); ok("withdraw: members can't mark their own refund as paid", r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select deposit_withdrawal_paid('${WD}', 'NPP 123')`); ok('withdraw: our team marks it sent', !r.error, r.error);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.C}' and title = 'Your deposit refund is on its way'`); ok('withdraw: the bidder is told', r.rows?.[0]?.n === 1);
  r = await as('C', `select request_deposit_withdrawal(100) id`); const WD2 = r.rows?.[0]?.id;
  r = await as('C', `select cancel_deposit_withdrawal('${WD2}')`); ok('withdraw: a refund not yet sent can be cancelled', !r.error, r.error);
  r = await as('service', `select deposit_balance('${U.C}') b`); ok('withdraw: balance after one refund sent and one cancelled', Number(r.rows?.[0]?.b) === 1100, JSON.stringify(r.rows));

  // winning: the deposit for the price moves onto the invoice, the rest is paid by transfer; no card is ever charged
  await c.query(`update lots set ends_at = now() - interval '1 second' where id = 20002`);
  await as('service', `select close_due_lots()`);
  r = await as('service', `select pay_method, status, price, deposit_applied, card_amount, surcharge, balance_due, total, subtotal from invoices where lot_id = 20002`); const inv2 = r.rows?.[0];
  ok('win: invoice paid by transfer with the deposit applied', inv2?.pay_method === 'bank' && Number(inv2.price) === 1000 && Number(inv2.deposit_applied) === 500 && Number(inv2.card_amount) === 500
    && Number(inv2.surcharge) === 0 && Number(inv2.balance_due) === Number(inv2.subtotal) - 500 && Number(inv2.total) === Number(inv2.subtotal), JSON.stringify(inv2));
  r = await as('service', `select deposit_balance('${U.C}') b, (select count(*)::int from bidder_deposits where user_id = '${U.C}' and kind = 'applied') n`);
  ok('win: the deposit for the price leaves the balance once', Number(r.rows?.[0]?.b) === 600 && r.rows[0].n === 1, JSON.stringify(r.rows));
  r = await as('C', `select request_deposit_withdrawal(100)`); ok("withdraw: not while there's a vehicle to pay for", r.error?.includes('withdraw_unpaid'), r.error);
  r = await as('service', `select (price_breakdown(300)->>'card_amount')::numeric d, (price_breakdown(300)->>'balance_due')::numeric b, price_breakdown(20000)->>'mode' m, (price_breakdown(20000)->>'surcharge')::numeric s`);
  ok('win: a cheap vehicle is paid entirely from the deposit; never a surcharge', Number(r.rows?.[0]?.b) === 0 && Number(r.rows[0].d) === 432 && r.rows[0].m === 'deposit' && Number(r.rows[0].s) === 0, JSON.stringify(r.rows));

  // Buy Now and offers need the deposit too
  r = await as('C', `select buy_now(20003)`); ok('buy now: needs the deposit for the Buy Now price', r.error?.includes('deposit_short:3000:600'), r.error);
  await as('ADM', `select record_deposit('${U.D}', 3000, 'bank', 'ref', 'Dee Dunn', '062000', '87654321')`);
  r = await as('D', `select buy_now(20003) id`); const BN = r.rows?.[0]?.id; ok('buy now: works with enough deposit', !!BN, r.error);
  r = await as('service', `select deposit_applied, pay_method from invoices where id = '${BN}'`); ok('buy now: 10% of the price applied', Number(r.rows?.[0]?.deposit_applied) === 3000 && r.rows[0].pay_method === 'bank', JSON.stringify(r.rows));
  r = await as('ADM', `select return_invoice_deposit('${BN}') a`); ok('refund: a cancelled sale gives the deposit back', Number(r.rows?.[0]?.a) === 3000, r.error);
  await as('ADM', `select return_invoice_deposit('${BN}')`);
  r = await as('service', `select count(*)::int n from bidder_deposits where invoice_id = '${BN}' and kind = 'returned'`); ok('refund: only once', r.rows?.[0]?.n === 1);
  await c.query(`insert into lots (id, status, title, start_price, ends_at, decision_by) values (20005, 'offers', 'Offer car', 1000, now() - interval '1 hour', now() + interval '2 days')`);
  r = await as('C', `select make_offer(20005, 7000)`); ok('offers: an offer needs a deposit for its amount', r.error?.includes('deposit_short:700:600'), r.error);
  r = await as('C', `select make_offer(20005, 6000) id`); ok('offers: within the deposit', !!r.rows?.[0]?.id, r.error);
  r = await as('service', `select deposit_summary('${U.C}') j`); ok('offers: an open offer holds its deposit', Number(r.rows?.[0]?.j?.committed) === 600, JSON.stringify(r.rows?.[0]?.j));

  // our team's corrections, deleting an account
  r = await as('ADM', `select adjust_deposit('${U.C}', 50, 'no')`); ok('adjust: needs a reason', r.error?.includes('note_needed'), r.error);
  r = await as('ADM', `select adjust_deposit('${U.C}', 50, 'Bank fee refunded') id`); ok('adjust: recorded with a reason', !!r.rows?.[0]?.id, r.error);
  r = await as('service', `select account_deletion_blockers('${U.C}') b`); ok('delete account: not while holding a deposit', r.rows?.[0]?.b?.some((x) => x.includes('bidding deposit')), JSON.stringify(r.rows));
  r = await as('service', `select record_deposit('${U.D}', 100, 'payid', 'p', 'Dee Dunn', null, null, null, 'azupay', 'PR-1') a, record_deposit('${U.D}', 100, 'payid', 'p', 'Dee Dunn', null, null, null, 'azupay', 'PR-1') b`);
  ok('payments provider: the same payment is only counted once', r.rows?.[0]?.a === r.rows?.[0]?.b, JSON.stringify(r.rows));
  r = await as('A', `select can_bid('${U.A}') x`); ok('deposit: a card on file alone is no longer enough to bid', r.rows?.[0]?.x === false, JSON.stringify(r));
  r = await as('C', `select my_deposit() j`); const rt = r.rows?.[0]?.j?.refund_to;
  ok('withdraw: the bidder sees where a refund goes, never the full account number', rt?.bsb === '062000' && rt?.ending === '5678' && !JSON.stringify(r.rows).includes('12345678'), JSON.stringify(rt));
  r = await as('C', `select deposit_totals()`); ok("admin totals: members can't read them", !!r.error);
  r = await as('service', `select deposit_totals() t, (select sum(amount) from bidder_deposits where status <> 'cancelled') s`); const tot = r.rows?.[0]?.t;
  ok('admin totals: what we hold matches the ledger', Number(tot?.held) === Number(r.rows?.[0]?.s) && tot.bidders >= 2 && Number(tot.applied_unpaid) > 0, JSON.stringify(r.rows));
  // "today" is Brisbane's day (the CI server runs on UTC)
  await as('service', `select compute_daily_metrics((now() at time zone 'Australia/Brisbane')::date, false)`);
  r = await as('service', `select (select value from metric_values where day = (now() at time zone 'Australia/Brisbane')::date and metric = 'members_verified' and dim = '') m,
    (select count(*) from profiles p where id_status = 'verified' and mobile_verified and deposit_balance(p.id) >= 500) n,
    (select count(*) from profiles p where id_status = 'verified' and mobile_verified and payment_method_id is not null and deposit_balance(p.id) < 500) cards`);
  ok('insights: "ready to bid" counts deposits, not cards', Number(r.rows?.[0]?.m) === Number(r.rows?.[0]?.n) && Number(r.rows[0].n) >= 2 && Number(r.rows[0].cards) >= 1, JSON.stringify(r.rows));
}

// ---------- the default, like Turners: no deposit, a verified ID, pay by transfer after a win; a buyer who doesn't pay is banned ----------
{
  Object.assign(U, { E: 'e0e0e0e0-0000-4000-8000-00000000000e', F: 'f0f0f0f0-0000-4000-8000-00000000000f', G: '9a9a9a9a-0000-4000-8000-00000000009a', H: 'abababab-0000-4000-8000-0000000000ab' });
  await c.query(`update settings set value = value || '{"pay_mode": "transfer"}' where key = 'fees'`);
  await c.query(`insert into auth.users (id,email) values ('${U.E}','e@x.au'),('${U.F}','f@x.au'),('${U.H}','h@x.au')`);
  await c.query(`update profiles set details_done=true, first_name='Eve', last_name='Elder', dob='1990-05-01', mobile='0455555555', mobile_verified=true, id_status='verified', terms_version='2026-10-27' where id='${U.E}'`);
  await c.query(`update profiles set details_done=true, first_name='Fay', last_name='Ford', dob='1985-02-02', mobile='0466666666', mobile_verified=true, id_status='verified', terms_version='2026-10-27' where id='${U.F}'`);
  await c.query(`insert into lots (id, status, title, start_price, ends_at, buy_now_price) values
    (20011, 'live', 'Transfer ute', 1000, now() + interval '3 days', null),
    (20012, 'live', 'Transfer van', 1000, now() + interval '3 days', 40000),
    (20013, 'live', 'Transfer car', 1000, now() + interval '3 days', null)`);
  r = await as('E', `select me() j`); const meE = r.rows?.[0]?.j;
  ok('transfer: a verified mobile and ID is all it takes to bid (no deposit, no card)', meE?.pay_mode === 'transfer' && meE?.payment_ok === true && meE?.deposit === null && !meE?.payment_method_id, JSON.stringify(meE && { p: meE.pay_mode, ok: meE.payment_ok, d: meE.deposit }));
  r = await as('E', `select place_bid(20011, 250000) r`); ok('transfer: bid any amount, no deposit needed', r.rows?.[0]?.r?.status === 'leading', r.error);
  r = await as('F', `select place_bid(20013, 3000) r`); ok('transfer: another bidder', r.rows?.[0]?.r?.status === 'leading', r.error);
  r = await as('H', `select place_bid(20013, 5000) r`); ok('transfer: still no bidding without a verified ID', r.error?.includes('not_verified'), r.error);
  r = await as('E', `select buy_now(20012) id`); const TI = r.rows?.[0]?.id; ok('transfer: Buy Now without a deposit', !!TI, r.error);
  r = await as('service', `select pay_method, deposit_applied, card_amount, surcharge, balance_due, total, subtotal, due_at > now() due from invoices where id = '${TI}'`); const ti = r.rows?.[0];
  ok('transfer: the whole amount is paid by transfer, nothing from a deposit, never a surcharge', ti?.pay_method === 'bank' && Number(ti.deposit_applied) === 0 && Number(ti.card_amount) === 0
    && Number(ti.surcharge) === 0 && Number(ti.balance_due) === Number(ti.subtotal) && Number(ti.total) === Number(ti.subtotal) && ti.due === true, JSON.stringify(ti));
  r = await as('service', `select count(*)::int n from bidder_deposits where user_id = '${U.E}'`); ok('transfer: nothing touches the deposit ledger', r.rows?.[0]?.n === 0);

  // Not paying: banned
  r = await as('E', `select ban_member('${U.E}', 'x')`); ok("ban: members can't ban anyone", r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select ban_member('${U.E}', '')`); ok('ban: needs a reason', r.error?.includes('reason_required'), r.error);
  r = await as('ADM', `select ban_member('${U.E}', 'Didn''t pay for TB-100099') n`); ok('ban: their bids come off live auctions', r.rows?.[0]?.n === 1, r.error);
  r = await as('service', `select suspended, suspended_reason, (select leader_id from lots where id = 20011) leader, (select current_bid from lots where id = 20011) cb from profiles where id = '${U.E}'`);
  ok('ban: suspended with the reason; the auction is as if they never bid', r.rows?.[0]?.suspended === true && r.rows[0].suspended_reason === "Didn't pay for TB-100099" && r.rows[0].leader === null, JSON.stringify(r.rows));
  r = await as('E', `select place_bid(20013, 9000) r`); ok('ban: a banned member is told their account is suspended', r.error?.includes('account_suspended'), r.error);
  r = await as('E', `select buy_now(20013)`); ok('ban: no Buy Now either', r.error?.includes('account_suspended'), r.error);
  r = await as('service', `select count(*)::int n, bool_and(hash ~ '^[0-9a-f]{64}$') coded from banned_identities where user_id = '${U.E}'`);
  ok('ban: name and date of birth, mobile and email kept only as one-way codes', r.rows?.[0]?.n === 3 && r.rows[0].coded === true, JSON.stringify(r.rows));
  r = await as('E', `select * from banned_identities`); ok("ban: members can't read the ban list", (r.rows || []).length === 0);
  r = await as('E', `update profiles set suspended = false where id = '${U.E}'`); ok("ban: members can't lift their own suspension", r.error?.includes('protected_field'), r.error);

  // ... and can't come back with a new account
  await c.query(`insert into auth.users (id,email) values ('${U.G}','eve.again@x.au')`);
  await c.query(`update profiles set details_done=true, first_name='EVE', last_name='elder', dob='1990-05-01', mobile='0499990000', mobile_verified=true, terms_version='2026-10-27' where id='${U.G}'`);
  r = await as('service', `select suspended from profiles where id = '${U.G}'`); ok('ban: a new account is fine until it verifies an ID', r.rows?.[0]?.suspended === false);
  await c.query(`update profiles set id_status='verified' where id='${U.G}'`);
  r = await as('service', `select suspended, suspended_reason from profiles where id = '${U.G}'`);
  ok('ban: the same person verifying a new account is suspended (case and spacing ignored)', r.rows?.[0]?.suspended === true && r.rows[0].suspended_reason.startsWith('Matches an account closed for'), JSON.stringify(r.rows));
  r = await as('G', `select place_bid(20013, 9000) r`); ok('ban: and can\'t bid', r.error?.includes('account_suspended'), r.error);
  await c.query(`update profiles set details_done=true, first_name='Hal', last_name='Hart', dob='1970-01-01', mobile='+61 455 555 555', id_status='verified', terms_version='2026-10-27' where id='${U.H}'`);
  r = await as('service', `select suspended from profiles where id = '${U.H}'`); ok('ban: not yet: the mobile is only checked once it is verified', r.rows?.[0]?.suspended === false);
  await c.query(`update profiles set mobile_verified = true where id='${U.H}'`);
  r = await as('service', `select suspended from profiles where id = '${U.H}'`); ok('ban: the banned mobile, written another way, verified on a new account', r.rows?.[0]?.suspended === true);
  r = await as('F', `select place_bid(20013, 4000) r`); ok('ban: everyone else carries on', r.rows?.[0]?.r?.status === 'leading', r.error);

  r = await as('ADM', `select unban_member('${U.E}')`); ok('ban: staff can lift it', !r.error, r.error);
  r = await as('service', `select suspended, (select count(*)::int from banned_identities where user_id = '${U.E}') n from profiles where id = '${U.E}'`);
  ok('ban: lifted means the codes are gone too', r.rows?.[0]?.suspended === false && r.rows[0].n === 0, JSON.stringify(r.rows));
}

// ---------- security: two-step for admins, the admin log, nothing sensitive open to the public ----------
{
  r = await as('ADM_PW', `select is_admin() a, admin_access() s`); ok('two-step: an admin with only a password has no admin rights', r.rows?.[0]?.a === false && r.rows[0].s === 'mfa', JSON.stringify(r.rows));
  r = await as('ADM', `select is_admin() a, admin_access() s`); ok('two-step: with the authenticator code they do', r.rows?.[0]?.a === true && r.rows[0].s === 'ok');
  r = await as('A', `select admin_access() s`); ok('two-step: members are simply not admins', r.rows?.[0]?.s === 'no');
  r = await as('ADM_PW', `update settings set value = '{"admin_mfa": false}' where key = 'security' returning key`); ok("two-step: can't be switched off without it", (r.rows || []).length === 0);
  r = await as('ADM_PW', `select id from lot_private limit 1`); ok('two-step: private vehicle data stays hidden without it', (r.rows || []).length === 0);
  r = await as('ADM_PW', `select admin_security()`); ok('two-step: the security page needs it too', r.error?.includes('forbidden'), r.error);
  r = await as('ADM_PW', `select ban_member('${U.B}', 'x')`); ok('two-step: no banning without it', r.error?.includes('forbidden'), r.error);
  await c.query(`insert into auth.mfa_factors (user_id, status) values ('${U.ADM}', 'verified')`);
  r = await as('ADM', `select admin_security() j`); const sec = r.rows?.[0]?.j;
  ok('security page: every admin and whether they use two-step', sec?.mfa_required === true && sec.admins.some((a) => a.id === U.ADM && a.two_step === true), JSON.stringify(sec));

  // the admin log
  r = await as('ADM', `update lots set title = title || ' (checked)' where id = 10599 returning id`);
  r = await as('service', `select action, target, detail->'fields' f, actor from admin_audit where target = 'lots:10599' order by id desc limit 1`);
  ok('admin log: an admin editing a vehicle is recorded, with the fields', r.rows?.[0]?.action === 'update lots' && r.rows[0].actor === U.ADM && JSON.stringify(r.rows[0].f).includes('title'), JSON.stringify(r.rows));
  await as('service', `select audit_admin('${U.ADM}', 'ban', 'profile:x', '{"reason":"test"}', 'ok', '203.0.113.9', 'test')`);
  r = await as('service', `select count(*)::int n from admin_audit where action = 'ban' and ip = '203.0.113.9'`); ok('admin log: the server records actions with the network', r.rows?.[0]?.n === 1);
  r = await as('ADM', `delete from admin_audit returning id`); ok("admin log: admins can't delete it", !!r.error || (r.rows || []).length === 0);
  r = await c.query(`update admin_audit set action = 'x' where id = (select min(id) from admin_audit)`).catch((e) => ({ error: e.message }));
  ok('admin log: nobody can change it, not even the database owner', String(r.error || '').includes('append_only'), JSON.stringify(r).slice(0, 200));
  r = await as('A', `select count(*)::int n from admin_audit`); ok("admin log: members can't read it", r.rows?.[0]?.n === 0);
  r = await as('A', `select audit_admin('${U.A}', 'x', 'y', '{}', 'ok', '1', '1')`); ok("admin log: members can't write to it", !!r.error);

  // a new admin is logged and every admin is told at once
  await c.query(`update profiles set role = 'admin' where id = '${U.B}'`);
  r = await as('service', `select (select count(*)::int from admin_audit where action = 'admin added' and target = 'profile:${U.B}') a,
    (select count(*)::int from notifications where user_id = '${U.ADM}' and kind = 'health' and title like 'New admin%') n`);
  ok('new admin: logged and every admin alerted', r.rows?.[0]?.a === 1 && r.rows[0].n >= 1, JSON.stringify(r.rows));
  await c.query(`update profiles set role = 'buyer' where id = '${U.B}'`);

  // the public can read the settings the site shows, not the internal ones
  r = await as('anon', `select key from settings order by key`); const keys = (r.rows || []).map((x) => x.key);
  ok('settings: public ones readable, internal ones not', keys.includes('fees') && keys.includes('terms') && !keys.includes('health') && !keys.includes('security') && !keys.includes('jobs'), keys.join(','));

  // every table has row-level security, every privileged function pins its search path
  r = await c.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  ok('every table has row-level security', r.rows.length === 0, r.rows.map((x) => x.relname).join(','));
  r = await c.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')`);
  ok('every privileged (security definer) function pins its search path', r.rows.length === 0, r.rows.map((x) => x.proname).join(','));
  // functions anyone on the internet can call: a fixed list, reviewed. A new one fails this test until it's added here.
  r = await c.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') order by 1`);
  const ANON_OK = new Set(['auction_calendar', 'bid_history', 'deposit_for', 'is_admin', 'lot_facets', 'lot_videos_public', 'lot_watchers', 'pay_mode', 'price_estimate', 'sale_stats', 'search_lots']);
  const extra = r.rows.map((x) => x.proname).filter((n) => !ANON_OK.has(n));
  ok('functions open to the public are only the reviewed ones', extra.length === 0, 'review and add to ANON_OK if safe: ' + [...new Set(extra)].join(', '));
  r = await c.query(`select public_function_allowlist() l`);
  ok('the database allowlist matches the reviewed list', JSON.stringify([...r.rows[0].l].sort()) === JSON.stringify([...ANON_OK].sort()), JSON.stringify(r.rows[0].l));

  // site health watches it
  r = await as('service', `select health_snapshot() j`); const hs = r.rows?.[0]?.j;
  ok('health: no privileged function open to the public', Array.isArray(hs?.open_functions) && hs.open_functions.length === 0, JSON.stringify(hs?.open_functions));
  ok('health: two-step state and admins counted', hs?.admin_mfa === true && hs.admins >= 1 && typeof hs.admins_no_two_step === 'number' && hs.admins_added_day >= 1, JSON.stringify({ a: hs?.admin_mfa, n: hs?.admins, x: hs?.admins_no_two_step, d: hs?.admins_added_day }));
  ok('health: the older measurements are still there', typeof hs?.db_bytes === 'number' && Array.isArray(hs?.no_rls) && 'clock' in hs, Object.keys(hs || {}).join(','));
  await c.query(`create function public.oops_open() returns int language sql security definer set search_path = public as 'select 1'`);
  await c.query(`grant execute on function public.oops_open() to anon`);
  r = await as('service', `select health_snapshot() j`);
  ok('health: a privileged function left open is spotted', r.rows?.[0]?.j?.open_functions?.includes('oops_open'), JSON.stringify(r.rows?.[0]?.j?.open_functions));
  await c.query(`drop function public.oops_open()`);
  for (const who of ['anon', 'A', 'ADM']) {
    r = await as(who, `select health_snapshot_core()`); ok(`health: the inner snapshot isn't callable (${who})`, !!r.error, r.error);
  }
}

// ---------- no viewings (buyers never go to the seller's place); dealers; price drops; reviews; inspected ----------
{
  const today = (await c.query(`select ((now() at time zone 'Australia/Brisbane')::date + 1)::text d`)).rows[0];
  const day = today.d;
  const VL = (await c.query(`select id from lots where status = 'live' and ends_at > now() + interval '2 days' and seller_id is distinct from '${U.A}' order by id limit 1`)).rows[0]?.id;
  if (!VL) { await c.query(`update lots set ends_at = now() + interval '5 days' where id = 10599`); }
  const L = VL || 10599;
  const slots = (x) => JSON.stringify(x);
  r = await as('A', `select request_viewing(${L}, 'video', $1::jsonb)`, [slots([{ day, part: 'morning' }])]); ok('no viewings: video calls are not offered', r.error?.includes('viewing_not_offered'), r.error);
  r = await as('A', `select request_viewing(${L}, 'in_person', $1::jsonb)`, [slots([{ day, part: 'morning' }])]); ok('no viewings: in person is not offered', r.error?.includes('viewing_not_offered'), r.error);
  r = await as('anon', `select request_viewing(${L}, 'video', $1::jsonb)`, [slots([{ day, part: 'morning' }])]); ok("no viewings: signed-out visitors can't call it", !!r.error, r.error);
  r = await as('ADM', `update lots set in_person_viewing = true where id = ${L}`); ok('no viewings: a listing can never offer in-person viewings', r.error?.includes('lots_no_viewings'), r.error);
  r = await as('A', `insert into viewings (lot_id, user_id, kind) values (${L}, '${U.A}', 'video')`); ok("no viewings: members can't write bookings directly", !!r.error);
  r = await as('service', `select count(*)::int n from viewings where status in ('requested', 'confirmed')`); ok('no viewings: none open', r.rows?.[0]?.n === 0);

  // dealers
  r = await as('A', `update profiles set dealer_status = 'approved' where id = '${U.A}'`); ok("dealer: members can't approve themselves", r.error?.includes('protected_field'), r.error);
  await as('service', `update profiles set dealer_status = 'pending', company_name = 'Ash Motors Pty Ltd', abn = '51824753556', gst_registered = true, dealer_applied_at = now() where id = '${U.A}'`);
  r = await as('ADM_PW', `select admin_dealer('${U.A}', true)`); ok('dealer: approving needs two-step', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_dealer('${U.A}', true)`); ok('dealer: staff approve', !r.error, r.error);
  await c.query('begin');
  const inv = (await c.query(`select create_invoice(10620, '${U.A}', 12000, 'auction') id`)).rows[0].id;
  const bb = (await c.query(`select buyer_business from invoices where id = $1`, [inv])).rows[0].buyer_business;
  await c.query('rollback');
  ok('dealer: the business name and ABN go on the tax invoice', bb?.name === 'Ash Motors Pty Ltd' && bb.abn === '51824753556' && bb.gst === true && bb.dealer === true, JSON.stringify(bb));
  r = await as('A', `update profiles set abn = '53004085616' where id = '${U.A}' returning dealer_status`); ok('dealer: changing the ABN means it is checked again', r.rows?.[0]?.dealer_status === 'pending', JSON.stringify(r));
  await as('service', `update profiles set dealer_status = 'none', company_name = null, abn = null, gst_registered = false where id = '${U.A}'`);

  // price drop
  const PD = (await c.query(`select id, buy_now_price from lots where status = 'live' and buy_now_price is not null and current_bid < buy_now_price order by id limit 1`)).rows[0];
  if (PD) {
    await c.query(`insert into watchlist (user_id, lot_id) values ('${U.B}', ${PD.id}) on conflict do nothing`);
    await c.query(`update lots set buy_now_price = buy_now_price + 1000 where id = ${PD.id}`);
    r = await as('service', `select count(*)::int n from notifications where user_id = '${U.B}' and kind = 'price_drop'`); ok('price drop: a rise sends nothing', r.rows?.[0]?.n === 0);
    await c.query(`update lots set buy_now_price = buy_now_price - 2000 where id = ${PD.id}`);
    r = await as('service', `select body from notifications where user_id = '${U.B}' and kind = 'price_drop'`); ok('price drop: watchers told, with the all-in price', (r.rows || []).length === 1 && /all-in/.test(r.rows[0].body), JSON.stringify(r.rows));
    await c.query(`update lots set buy_now_price = ${PD.buy_now_price} where id = ${PD.id}`);
  } else ok('price drop: a Buy Now lot to test with', false);

  // inspected listings and the search filter
  await c.query(`update lots set inspected_at = current_date, inspected_by = 'Test Mechanics' where id = ${L}`);
  r = await as('anon', `select id from search_lots($1::jsonb, 100, 0)`, [JSON.stringify({ inspected: '1' })]); ok('search: inspected only', (r.rows || []).length >= 1 && r.rows.every((x) => Number(x.id) === Number(L)), JSON.stringify(r.rows));
  r = await as('anon', `select inspection_report_path from lot_private where lot_id = ${L}`); ok('inspection report path stays private', (r.rows || []).length === 0 || !!r.error);
  await c.query(`update lots set inspected_at = null, inspected_by = null where id = ${L}`);

  // the inspection before listing comes out of the seller's proceeds
  await c.query('begin');
  await c.query(`update seller_agreements set fees = coalesce(fees, '{}'::jsonb) || '{"pre_inspection_fee": 220}' where lot_id = ${SL}`);
  await c.query(`delete from seller_payouts where invoice_id = '${SINV}'`);
  await c.query(`update invoices set status = 'deposit_paid' where id = '${SINV}'`);
  await c.query(`update invoices set status = 'paid' where id = '${SINV}'`);
  const po = (await c.query(`select net_amount, other_deductions, deductions_note from seller_payouts where invoice_id = '${SINV}'`)).rows[0];
  await c.query('rollback');
  ok('pre-inspection: the fee comes out of the payout', Number(po?.other_deductions) === 220 && Number(po.net_amount) === 880 && po.deductions_note === 'Inspection before listing', JSON.stringify(po));

  // reviews: everyone asked after collection, only once the review link is set
  await c.query('begin');
  const RI = (await c.query(`select id, buyer_id from invoices where collected_at is null order by created_at limit 1`)).rows[0];
  await c.query(`update invoices set collected_at = now() where id = $1`, [RI.id]);
  const none = (await c.query(`select count(*)::int n from notifications where kind = 'review'`)).rows[0].n;
  await c.query(`update invoices set collected_at = null where id = $1`, [RI.id]);
  await c.query(`insert into settings (key, value) values ('business', '{"review_url": "https://g.page/r/tyrebiter/review"}') on conflict (key) do update set value = settings.value || excluded.value`);
  await c.query(`update invoices set collected_at = now() where id = $1`, [RI.id]);
  const rv = (await c.query(`select body from notifications where kind = 'review' and user_id = $1`, [RI.buyer_id])).rows;
  await c.query('rollback');
  ok('reviews: nothing until the review link is set', none === 0, String(none));
  ok('reviews: the buyer is asked after collection, good or bad', rv.length === 1 && /good or bad/.test(rv[0].body) && rv[0].body.includes('https://g.page/r/tyrebiter/review'), JSON.stringify(rv));
}

// ---------- live auctions, tenders, BPAY, damage map, write-off and "how it's sold" filters ----------
{
  // BPAY: every member has a valid CRN (MOD10V01) they can't change themselves
  r = await as('service', `select bpay_check_digit('7992739871') d, count(*) filter (where bpay_crn is null or not bpay_valid(bpay_crn))::int bad from profiles`);
  ok('bpay: the check digit is the MOD10V01 (Luhn) one', r.rows?.[0]?.d === 3, JSON.stringify(r.rows));
  ok('bpay: every member has a valid CRN', r.rows?.[0]?.bad === 0, JSON.stringify(r.rows));
  r = await as('A', `update profiles set bpay_crn = '1234567897' where id = '${U.A}'`); ok("bpay: members can't change their CRN", r.error?.includes('protected_field'), r.error);
  const crnA = (await c.query(`select bpay_crn, deposit_ref from profiles where id = '${U.A}'`)).rows[0];
  r = await as('service', `select deposit_summary('${U.A}') j`); ok('bpay: the CRN is on the deposit summary', r.rows?.[0]?.j?.crn === crnA.bpay_crn, JSON.stringify(r.rows?.[0]?.j));
  r = await as('ADM', `select record_deposit('${U.A}', 100, 'bpay', '${crnA.bpay_crn}', 'Amy Ash') id`); ok('bpay: staff record a BPAY payment', !!r.rows?.[0]?.id, r.error);
  r = await as('A', `select bpay_check_digit('123') d`); ok('bpay: the helper is fine to call', r.rows?.[0]?.d >= 0 || !!r.error);

  const free = (await c.query(`select id from lots where status = 'live' and bid_count = 0 and sale_id is null and coalesce(seller_id::text, '') not in ('${U.A}', '${U.B}')
    and ends_at > now() + interval '1 day' order by id desc limit 6`)).rows.map((x) => Number(x.id));
  ok('test setup: six free live vehicles', free.length === 6, JSON.stringify(free));
  const [T, L1, L2, L3, L4, W] = free;
  await c.query(`insert into lot_private (lot_id) select unnest($1::bigint[]) on conflict do nothing`, [free]);
  await c.query(`update lot_private set reserve_price = null where lot_id = any($1::bigint[])`, [free]);
  await c.query(`update lots set has_reserve = false, reserve_met = true, start_price = 1000, current_bid = 0, buy_now_price = null where id = any($1::bigint[])`, [free]);

  // ---- tender: sealed, revealed at close, the highest tender buys at its own price ----
  await c.query(`update lots set method = 'tender', buy_now_price = 500000 where id = ${T}`);
  r = await as('service', `select buy_now_price from lots where id = ${T}`); ok("tender: no Buy Now on a tender", r.rows?.[0]?.buy_now_price === null, JSON.stringify(r.rows));
  r = await as('A', `select place_bid(${T}, 500) r`); ok('tender: at least the starting amount', r.error?.includes('too_low:1000'), r.error);
  r = await as('A', `select place_bid(${T}, 9000) r`); ok('tender: a member puts in a tender', r.rows?.[0]?.r?.status === 'tendered' && r.rows[0].r.tender_count === 1, JSON.stringify(r));
  r = await as('B', `select place_bid(${T}, 9500) r`); ok('tender: a second tender', r.rows?.[0]?.r?.status === 'tendered' && r.rows[0].r.tender_count === 2, JSON.stringify(r));
  r = await as('A', `select place_bid(${T}, 9600) r`); ok('tender: a member can change their tender', r.rows?.[0]?.r?.status === 'tendered' && r.rows[0].r.tender_count === 2, JSON.stringify(r));
  r = await as('anon', `select current_bid, leader_id, tender_count, bid_count from lots where id = ${T}`);
  ok('tender: nothing public but the count', Number(r.rows?.[0]?.current_bid) === 0 && r.rows[0].leader_id === null && r.rows[0].tender_count === 2 && r.rows[0].bid_count === 0, JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from bids where lot_id = ${T}`); ok('tender: no bids in the public history', r.rows?.[0]?.n === 0);
  r = await as('anon', `select * from bid_history(${T}, 20)`); ok('tender: bid history is empty while open', (r.rows || []).length === 0, JSON.stringify(r));
  r = await as('B', `select max_amount from max_bids where lot_id = ${T}`); ok('tender: each member sees only their own', r.rows?.length === 1 && Number(r.rows[0].max_amount) === 9500, JSON.stringify(r.rows));
  r = await as('B', `select buy_now(${T})`); ok('tender: Buy Now refused', r.error?.includes('buy_now_unavailable'), r.error);
  r = await as('service', `select deposit_committed('${U.A}', null) - deposit_committed('${U.A}', ${T}) d, deposit_for(9600) f`);
  ok('tender: counts toward the bidding deposit', Number(r.rows?.[0]?.d) === Number(r.rows?.[0]?.f) && Number(r.rows[0].f) > 0, JSON.stringify(r.rows));
  r = await as('B', `select withdraw_tender(${T}) n`); ok('tender: withdraw before it closes', r.rows?.[0]?.n === 1, r.error);
  r = await as('B', `select withdraw_tender(${T}) n`); ok('tender: nothing to withdraw twice', r.error?.includes('no_tender'), r.error);
  await as('B', `select place_bid(${T}, 9500)`);
  r = await as('ADM', `select admin_remove_bidder(${T}, '${U.B}', 'Test removal') j`); ok('tender: staff can remove a tender', r.rows?.[0]?.j?.tender_count === 1, r.error);
  r = await as('service', `select current_bid, leader_id from lots where id = ${T}`); ok('tender: removing one reveals nothing', Number(r.rows?.[0]?.current_bid) === 0 && r.rows[0].leader_id === null, JSON.stringify(r.rows));
  await as('B', `select place_bid(${T}, 9500)`);
  r = await as('anon', `select id from search_lots($1::jsonb, 100, 0)`, [JSON.stringify({ how: 'tender' })]); ok('search: tenders only', r.rows?.length === 1 && Number(r.rows[0].id) === T, JSON.stringify(r.rows));
  r = await as('anon', `select id from search_lots($1::jsonb, 100, 0)`, [JSON.stringify({ how: 'timed' })]); ok('search: timed auctions leave tenders out', (r.rows || []).length > 0 && !r.rows.some((x) => Number(x.id) === T));
  await c.query(`update lot_private set reserve_price = 9000 where lot_id = ${T}`);
  await c.query(`update lots set ends_at = now() - interval '1 second' where id = ${T}`);
  await as('service', `select close_due_lots()`);
  r = await as('service', `select status, sold_price, winner_id, bid_count from lots where id = ${T}`);
  ok('tender: the highest tender buys at its own price', r.rows?.[0]?.status === 'sold' && Number(r.rows[0].sold_price) === 9600 && r.rows[0].winner_id === U.A && r.rows[0].bid_count === 2, JSON.stringify(r.rows));
  r = await as('service', `select price from invoices where lot_id = ${T}`); ok('tender: the winner is invoiced', Number(r.rows?.[0]?.price) === 9600, JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.B}' and title like 'Your tender for the%'`); ok('tender: the others are told', r.rows?.[0]?.n === 1);
  r = await as('ADM', `update lots set method = 'auction' where id = ${T}`); ok("tender: can't switch once there are tenders", r.error?.includes('method_locked'), r.error);

  // ---- write-off / salvage filter ----
  await c.query(`update lots set write_off_status = 'repairable' where id = ${W}`);
  r = await as('anon', `select id from search_lots($1::jsonb, 100, 0)`, [JSON.stringify({ wo: 'writeoff' })]); ok('search: write-offs only', (r.rows || []).some((x) => Number(x.id) === W) && r.rows.length >= 1, JSON.stringify(r.rows));
  r = await as('anon', `select id from search_lots($1::jsonb, 100, 0)`, [JSON.stringify({ wo: 'clear' })]); ok('search: never written off leaves it out', (r.rows || []).length > 0 && !r.rows.some((x) => Number(x.id) === W));
  await c.query(`update lots set write_off_status = 'none' where id = ${W}`);

  // ---- damage map ----
  r = await as('ADM', `insert into lot_flaws (lot_id, title, zone) values (${L4}, 'Stone chip', 'bonnet') returning id`); ok('damage map: a flaw pinned to the bonnet', !!r.rows?.[0]?.id, r.error);
  r = await as('ADM', `insert into lot_flaws (lot_id, title, zone) values (${L4}, 'Dent', 'wing')`); ok('damage map: only known parts', !!r.error);

  // ---- live auction ----
  r = await as('A', `insert into sales (slug, title, published, mode, starts_at) values ('live-nope', 'Nope', true, 'live', now())`); ok("live: members can't create sales", !!r.error);
  r = await as('ADM', `insert into sales (slug, title, published, mode) values ('live-nostart', 'No start', true, 'live')`); ok('live: a live sale needs a start time', !!r.error);
  r = await as('ADM', `insert into sales (slug, title, published, mode, starts_at, lot_seconds, extend_seconds) values ('live-test-sale', 'Live test', true, 'live', now() + interval '1 hour', 30, 15) returning id`);
  const SA = r.rows?.[0]?.id; ok('live: staff create a live sale', !!SA, r.error);
  r = await as('ADM', `update sales set stream_url = 'https://www.youtube.com/embed/abcDEF123_-' where id = ${SA}`); ok("live: no video stream (the room shows the listing's photos and the seller's video)", r.error?.includes('sales_no_stream'), r.error);
  await as('B', `select place_bid(${L4}, 1500)`);
  r = await as('ADM', `update lots set sale_id = ${SA} where id = ${L4}`); ok("live: a timed auction with bids can't move into a live sale", r.error?.includes('sale_move_bids'), r.error);
  r = await as('ADM', `update lots set sale_id = ${SA} where id in (${L1}, ${L2}, ${L3})`); ok('live: vehicles join the sale', !r.error, r.error);
  r = await as('service', `select id, live_state, sale_order, ends_at > now() + interval '1 hour' later from lots where id in (${L1}, ${L2}, ${L3}) order by sale_order`);
  ok('live: they wait their turn, in order, with an estimated time after the start', r.rows?.length === 3 && r.rows.every((x) => x.live_state === 'waiting' && x.later) && new Set(r.rows.map((x) => x.sale_order)).size === 3, JSON.stringify(r.rows));
  const order = r.rows.map((x) => Number(x.id));
  r = await as('A', `select place_bid(${order[0]}, 2000) r`); ok('live: early bids before the sale', r.rows?.[0]?.r?.status === 'leading' && r.rows[0].r.extended === false, JSON.stringify(r));
  r = await as('anon', `select auction_calendar(21) j`); const cal = r.rows?.[0]?.j;
  ok('calendar: the live sale is on it', (cal?.sales || []).some((x) => x.slug === 'live-test-sale' && x.mode === 'live' && x.count === 3), JSON.stringify(cal?.sales));
  ok('calendar: timed closings counted by day', Array.isArray(cal?.days) && cal.days.length > 0 && cal.days.every((d) => typeof d.timed === 'number'), JSON.stringify(cal?.days?.slice(0, 2)));
  r = await as('anon', `select id from search_lots($1::jsonb, 100, 0)`, [JSON.stringify({ how: 'live' })]); ok('search: live auction vehicles', r.rows?.length === 3, JSON.stringify(r.rows));
  r = await as('A', `select admin_live_start(${SA})`); ok("live: only staff run the sale", r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_live_next(${SA})`); ok('live: start before the next vehicle', r.error?.includes('sale_not_started'), r.error);
  r = await as('ADM', `select admin_live_start(${SA})`); ok("live: a live auction can't start until the auctioneer is named (shown for the whole auction)", r.error?.includes('auctioneer_needed'), r.error);
  await as('ADM', `update sales set auctioneer = 'Pat Gavel' where id = ${SA}`);
  r = await as('ADM', `select admin_live_start(${SA})`); ok('live: never before its published start time', r.error?.includes('sale_early') && r.error.includes('(Brisbane time)'), r.error);
  await c.query(`update sales set starts_at = now() - interval '1 second' where id = ${SA}`);
  r = await as('ADM', `select admin_live_start(${SA}) id`); ok('live: the sale starts with the first vehicle', Number(r.rows?.[0]?.id) === order[0], JSON.stringify(r));
  r = await as('service', `select l.live_state, l.extend_seconds, l.ends_at < now() + interval '31 seconds' soon, s.live_status, s.current_lot_id from lots l join sales s on s.id = l.sale_id where l.id = ${order[0]}`);
  ok('live: the vehicle is up with a short countdown', r.rows?.[0]?.live_state === 'open' && r.rows[0].soon && r.rows[0].extend_seconds === 15 && r.rows[0].live_status === 'running' && Number(r.rows[0].current_lot_id) === order[0], JSON.stringify(r.rows));
  r = await as('ADM', `select admin_live_start(${SA})`); ok("live: can't start twice", r.error?.includes('sale_started'), r.error);
  await c.query(`update sales set starts_at = now() + interval '1 hour' where id = ${SA}`);
  r = await as('service', `select bool_and(ends_at < now() + interval '10 minutes') x, count(*)::int n from lots where sale_id = ${SA} and live_state = 'waiting'`);
  ok('live: once it has started, the times for the vehicles still to come count from now', r.rows?.[0]?.x === true && r.rows[0].n === 2, JSON.stringify(r.rows));
  r = await as('ADM', `update sales set mode = 'timed' where id = ${SA}`); ok("live: can't switch to timed while it runs", r.error?.includes('sale_running'), r.error);
  await c.query(`update lots set buy_now_price = 900000 where id = ${order[0]}`);
  r = await as('B', `select buy_now(${order[0]})`); ok('live: no Buy Now while the vehicle is up', r.error?.includes('buy_now_unavailable'), r.error);
  await c.query(`update lots set ends_at = now() + interval '5 seconds' where id = ${order[0]}`);
  r = await as('B', `select place_bid(${order[0]}, 3000)`); ok("live: no bid in the room until the auction's conditions are accepted", r.error?.includes('enter_first'), r.error);
  r = await as('anon', `select enter_sale(${SA})`); ok('live: only members accept the conditions', !!r.error);
  r = await as('B', `select enter_sale(${SA}) t`); ok('live: B accepts the conditions on entering the room', !!r.rows?.[0]?.t, r.error);
  r = await as('service', `select terms_version from sale_entries where sale_id = ${SA} and user_id = '${U.B}'`); ok('live: recorded with the version of the terms', r.rows?.[0]?.terms_version === '2026-10-27', JSON.stringify(r.rows));
  r = await as('A', `select count(*)::int n from sale_entries`); ok("live: members see only their own entries", r.rows?.[0]?.n === 0, JSON.stringify(r.rows));
  r = await as('B', `insert into sale_entries (sale_id, user_id) values (${SA}, '${U.A}')`); ok('live: entries are written only by enter_sale', !!r.error);
  r = await as('B', `select place_bid(${order[0]}, 3000) r`); ok('live: an online bid in the last seconds', r.rows?.[0]?.r?.status === 'leading', JSON.stringify(r));
  r = await as('service', `select ends_at > now() + interval '13 seconds' and ends_at < now() + interval '16 seconds' x from lots where id = ${order[0]}`); ok("live: the countdown resets to the sale's short window", r.rows?.[0]?.x === true, JSON.stringify(r.rows));
  r = await as('A', `select admin_floor_bid(${SA}, '${crnA.deposit_ref}', 5000)`); ok('live: only staff take floor bids', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_floor_bid(${SA}, 'NOBODY1', 5000)`); ok('live: a floor bid needs a real bidder number', r.error?.includes('bidder_not_found'), r.error);
  r = await as('ADM', `select admin_floor_bid(${SA}, '${crnA.deposit_ref.toLowerCase()}', 5000) r`); ok('live: the auctioneer takes a floor bid for a registered member', r.rows?.[0]?.r?.status === 'leading', JSON.stringify(r));
  r = await as('service', `select source, bidder_id from bids where lot_id = ${order[0]} order by id desc limit 1`); ok('live: floor bids are marked as floor bids', r.rows?.[0]?.source === 'floor' && r.rows[0].bidder_id === U.A, JSON.stringify(r.rows));
  r = await as('ADM', `select admin_floor_bid(${SA}, '${crnA.bpay_crn}', 5600) r`); ok('live: the BPAY CRN works as a bidder number too', r.rows?.[0]?.r?.status === 'leading', JSON.stringify(r));
  r = await as('ADM', `select admin_live_message(${SA}, 'Fair warning')`); ok('live: the auctioneer calls fair warning', !r.error, r.error);
  r = await as('anon', `select live_message from sales where id = ${SA}`); ok('live: everyone sees it', r.rows?.[0]?.live_message === 'Fair warning', JSON.stringify(r.rows));
  r = await as('ADM', `select admin_live_pause(${SA}, null)`); ok('live: pause', !r.error, r.error);
  r = await as('B', `select place_bid(${order[0]}, 9000)`); ok('live: no bids while paused', r.error?.includes('live_paused'), r.error);
  r = await as('service', `select status, live_state from lots where id = ${order[0]}`); await as('service', `select close_due_lots()`);
  r = await as('service', `select status from lots where id = ${order[0]}`); ok("live: the clock doesn't close a paused vehicle", r.rows?.[0]?.status === 'live');
  r = await as('ADM', `select admin_live_resume(${SA})`); ok('live: resume', !r.error, r.error);
  r = await as('service', `select ends_at > now() and ends_at < now() + interval '1 minute' x from lots where id = ${order[0]}`); ok('live: the countdown carries on after the pause', r.rows?.[0]?.x === true);
  r = await as('ADM', `select admin_live_next(${SA})`); ok("live: can't skip a vehicle that's still up", r.error?.includes('live_lot_open'), r.error);
  r = await as('ADM', `select admin_live_time(${SA}, 30) t`); ok('live: more time on the vehicle', !!r.rows?.[0]?.t, r.error);
  r = await as('ADM', `select admin_live_close(${SA}) s`); ok('live: knock it down on the bids it has', r.rows?.[0]?.s === 'sold', JSON.stringify(r));
  r = await as('anon', `select live_message from sales where id = ${SA}`); ok('live: the hammer replaces the last call with the result', r.rows?.[0]?.live_message === 'Sold!', JSON.stringify(r.rows));
  r = await as('service', `select status, live_state, sold_price, winner_id from lots where id = ${order[0]}`);
  ok('live: sold to the highest bidder', r.rows?.[0]?.status === 'sold' && r.rows[0].live_state === 'closed' && Number(r.rows[0].sold_price) === 3100 && r.rows[0].winner_id === U.A, JSON.stringify(r.rows));
  r = await as('ADM', `select admin_sale_order(${SA}, array[${order[2]}, ${order[1]}]::bigint[]) n`); ok('live: staff reorder what is left', r.rows?.[0]?.n === 2, r.error);
  r = await as('ADM', `select admin_live_next(${SA}) id`); ok('live: next vehicle in the new order', Number(r.rows?.[0]?.id) === order[2], JSON.stringify(r));
  await c.query(`update lots set ends_at = now() - interval '1 second' where id = ${order[2]}`);
  await c.query(`update lots set ends_at = now() - interval '1 second' where id = ${order[1]}`);
  await as('service', `select close_due_lots()`);
  r = await as('service', `select id, status, live_state from lots where id in (${order[1]}, ${order[2]}) order by id`);
  const st = Object.fromEntries((r.rows || []).map((x) => [Number(x.id), x]));
  ok('live: a vehicle whose countdown ran out is closed by the clock', st[order[2]]?.status === 'passed' && st[order[2]].live_state === 'closed', JSON.stringify(r.rows));
  ok("live: a vehicle waiting its turn isn't closed, even past its estimate", st[order[1]]?.status === 'live' && st[order[1]].live_state === 'waiting', JSON.stringify(r.rows));
  r = await as('anon', `select live_message from sales where id = ${SA}`); ok('live: closed by the clock, the room still hears the result', r.rows?.[0]?.live_message === 'Passed in: no bids.', JSON.stringify(r.rows));
  r = await as('B', `select place_bid(${order[1]}, 1200) r`); ok('live: early bids still work while it waits', r.rows?.[0]?.r?.status === 'leading', JSON.stringify(r));
  r = await as('service', `select live_sweep() n`); ok('live: the clock keeps the sale moving if the console is closed', r.rows?.[0]?.n === 1, JSON.stringify(r));
  r = await as('service', `select live_state, ends_at > now() x from lots where id = ${order[1]}`); ok('live: the last vehicle is up', r.rows?.[0]?.live_state === 'open' && r.rows[0].x, JSON.stringify(r.rows));
  r = await as('ADM', `select admin_live_end(${SA}) n`); ok('live: end the sale', r.rows?.[0]?.n === 1, JSON.stringify(r));
  r = await as('service', `select l.status, s.live_status from lots l join sales s on s.id = l.sale_id where l.id = ${order[1]}`);
  ok('live: what was left closes on its bids, and the sale ends', r.rows?.[0]?.status === 'sold' && r.rows[0].live_status === 'ended', JSON.stringify(r.rows));
  r = await as('ADM', `select admin_live_next(${SA})`); ok("live: nothing more once it's ended", r.error?.includes('sale_ended'), r.error);
  for (const fn of [`place_bid_for('${U.A}', ${L4}, 5000, 'online')`, `close_one_lot(${L4})`, `live_advance(${SA}, null)`, `reveal_tenders(10)`, `live_sweep()`, `live_estimates(${SA})`, `admin_live_due(${SA})`]) {
    r = await as('A', `select ${fn}`); ok(`live: members can't call ${fn.split('(')[0]}`, !!r.error, r.error);
  }
}

// ---------- depots, the transport in the premium, a change noted at pickup, a sale cancelled after pickup ----------
{
  r = await as('anon', `select name, suburb, state, hours from depots`); ok('depots: everyone can read the active depots', (r.rows || []).length >= 9 && r.rows.every((x) => x.name && x.suburb), JSON.stringify(r.rows?.slice(0, 2)));
  r = await as('anon', `select * from depot_private`); ok('depots: the street address and contacts are private', (r.rows || []).length === 0 || !!r.error);
  r = await as('A', `select * from depot_private`); ok("depots: members can't read them either", (r.rows || []).length === 0 || !!r.error);
  r = await as('ADM', `select count(*)::int n from depot_private`); ok('depots: staff can', r.rows?.[0]?.n >= 9, JSON.stringify(r));
  r = await as('ADM', `insert into depots (name, suburb, state, postcode) values ('X depot', 'Hendra', 'QLD', '4011')`); ok('depots: written only through the server', !!r.error);
  r = await as('service', `insert into depots (name, suburb, state, postcode, hours) values ('Test Depot', 'Hendra', 'QLD', '4011', 'Weekdays') returning id`); const TD = r.rows?.[0]?.id;
  await as('service', `insert into depot_private (depot_id, address, email) values ('${TD}', '9 Test Rd, Hendra QLD 4011', 'test-depot@x.au')`);
  await c.query(`update depots set active = false where id = '${TD}'`);
  r = await as('anon', `select id from depots where id = '${TD}'`); ok('depots: an inactive one is hidden', (r.rows || []).length === 0);
  await c.query(`update depots set active = true where id = '${TD}'`);

  // the transport is in the all-in price, locked when bidding opens (a scheduled listing can still change it)
  await c.query(`insert into lots (id, status, title, start_price, ends_at, depot_id, transport_fee, statutory_warranty) values
    (10940, 'live', 'Depot test car', 1000, now() + interval '3 days', '${TD}', 280, false),
    (10941, 'live', 'Old listing car', 1000, now() + interval '3 days', '${TD}', 500, false),
    (10942, 'scheduled', 'Scheduled car', 1000, now() + interval '3 days', '${TD}', 100, false),
    (10943, 'live', 'Cancelled sale car', 1000, now() + interval '3 days', '${TD}', 200, false),
    (10944, 'live', 'Early cancel car', 1000, now() + interval '3 days', '${TD}', 200, false)`);
  r = await as('service', `select suburb, (fees->>'transport')::numeric t from lots where id = 10940`); ok('depot: a listing takes the depot suburb and locks the transport', r.rows?.[0]?.suburb === 'Hendra' && Number(r.rows[0].t) === 280, JSON.stringify(r.rows));
  r = await as('service', `select lot_price_breakdown(10940, 10000) b`);
  ok('transport: in the all-in price (10% + $280, GST on both)', Number(r.rows?.[0]?.b?.premium) === 1280 && Number(r.rows[0].b.transport) === 280 && Number(r.rows[0].b.gst) === 128 && Number(r.rows[0].b.total) === 11507, JSON.stringify(r.rows?.[0]?.b));
  r = await as('service', `select price_breakdown_with(10000, '{"premium_rate": 0.1, "admin_fee": 99}'::jsonb) b`); ok('transport: none unless a listing has it', Number(r.rows?.[0]?.b?.transport) === 0 && Number(r.rows[0].b.premium) === 1000, JSON.stringify(r.rows?.[0]?.b));
  await c.query(`update lots set fees = fees - 'transport' where id = 10941`);
  r = await as('service', `select lot_price_breakdown(10941, 10000) b`); ok('transport: a listing that went live before transport was in the premium carries none', Number(r.rows?.[0]?.b?.transport) === 0, JSON.stringify(r.rows?.[0]?.b));
  r = await as('ADM', `update lots set transport_fee = 150 where id = 10942`); r = await as('service', `select (fees->>'transport')::numeric t from lots where id = 10942`);
  ok('transport: a scheduled listing takes a new amount', Number(r.rows?.[0]?.t) === 150, JSON.stringify(r.rows));
  await c.query(`update lots set status = 'live' where id = 10942`);
  r = await as('ADM', `update lots set transport_fee = 200 where id = 10942`); ok('transport: locked once bidding opens', r.error?.includes('transport_locked'), r.error);

  // the depot moves: its listings follow, and bidders are told (a correction)
  await as('service', `update depots set suburb = 'Pinkenba', postcode = '4008' where id = '${TD}'`);
  r = await as('service', `select suburb, postcode from lots where id = 10940`); ok('depot: listings follow a depot that moves', r.rows?.[0]?.suburb === 'Pinkenba' && r.rows[0].postcode === '4008', JSON.stringify(r.rows));
  r = await as('service', `select label, before, after from lot_corrections where lot_id = 10940`); ok('depot: shown as a correction on a live listing', r.rows?.some((x) => x.label === 'Collect from' && x.before === 'Hendra' && x.after === 'Pinkenba'), JSON.stringify(r.rows));
  r = await as('ADM', `update lots set statutory_warranty = true where id = 10940`);
  r = await as('service', `select count(*)::int n from lot_corrections where lot_id = 10940 and field = 'statutory_warranty'`); ok('statutory warranty: a change on a live listing is a correction', r.rows?.[0]?.n === 1);

  // the driver notes a change at pickup: the buyer goes ahead (or cancels for a refund) before collecting
  const paid = async (lot, price) => {
    const id = (await c.query(`select create_invoice(${lot}, '${U.A}', ${price}, 'auction') id`)).rows[0].id;
    await c.query(`update lots set status = 'sold', winner_id = '${U.A}', sold_price = ${price} where id = ${lot}`);
    await c.query(`update invoices set status = 'paid', paid_at = now() where id = '${id}'`);
    return { inv: id, job: (await c.query(`select id from transport_jobs where invoice_id = '${id}'`)).rows[0]?.id };
  };
  const P1 = await paid(10940, 9000);
  r = await as('service', `select transport, premium from invoices where id = '${P1.inv}'`); ok('transport: on the invoice', Number(r.rows?.[0]?.transport) === 280 && Number(r.rows[0].premium) === 1180, JSON.stringify(r.rows));
  r = await as('ADM', `select admin_transport('${P1.job}', 'picked_up', '{"ok": false}')`); ok('pickup: a change needs a note for the buyer', r.error?.includes('transport_note'), r.error);
  r = await as('ADM', `select admin_transport('${P1.job}', 'picked_up', '{"ok": false, "note": "A crack in the windscreen that the photos do not show."}') s`); ok('pickup: picked up with a change noted', r.rows?.[0]?.s === 'picked_up', r.error);
  r = await as('service', `select body from outbox where dedupe_key like 'transport-change:${P1.job}%' limit 1`);
  ok('pickup: the buyer is told what changed and can cancel for a full refund', /crack in the windscreen/.test(r.rows?.[0]?.body || '') && /full refund/.test(r.rows[0].body), r.rows?.[0]?.body);
  r = await as('A', `select condition_ok, condition_note from invoice_transport('${P1.inv}')`); ok('pickup: the change is on their invoice', r.rows?.[0]?.condition_ok === false && /windscreen/.test(r.rows[0].condition_note), JSON.stringify(r.rows));
  await as('ADM', `select admin_transport('${P1.job}', 'at_depot', '{}')`);
  r = await as('A', `select transfer_submit('${P1.inv}', 'unregistered', 'carrier', '', '{}') s`); ok('transfer: the unregistered paperwork is done', r.rows?.[0]?.s === 'complete', r.error);
  r = await as('service', `select collect_by is null c from invoices where id = '${P1.inv}'`); ok('collection: no window while the buyer decides about the change', r.rows?.[0]?.c === true, JSON.stringify(r.rows));
  r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${P1.inv}', 10940, '${U.A}', 'Mon', 'Morning')`);
  ok("collection: not until the buyer has answered", r.error?.includes('change_not_answered'), r.error);
  r = await as('B', `select transport_decision('${P1.inv}', true)`); ok("pickup: only the buyer decides", r.error?.includes('not_found'), r.error);
  r = await as('A', `select transport_decision('${P1.inv}', true) d`); ok('pickup: the buyer goes ahead', r.rows?.[0]?.d === 'proceed', r.error);
  r = await as('A', `select transport_decision('${P1.inv}', false) d`); ok('pickup: the answer stands once given', r.rows?.[0]?.d === 'proceed', r.error);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.ADM}' and title like 'Buyer is going ahead:%'`); ok('pickup: our team hears the answer', r.rows?.[0]?.n >= 1);
  r = await as('service', `select collect_by > now() c from invoices where id = '${P1.inv}'`); ok('collection: the window starts once they go ahead', r.rows?.[0]?.c === true, JSON.stringify(r.rows));
  r = await as('service', `insert into collections (invoice_id, lot_id, buyer_id, preferred_day, preferred_time) values ('${P1.inv}', 10940, '${U.A}', 'Mon', 'Morning') returning id`);
  ok('collection: now it can be booked', !!r.rows?.[0]?.id, r.error);

  // a sale cancelled after pickup: our team arranges the vehicle's return; before pickup, the pickup is cancelled
  const P2 = await paid(10943, 5000);
  await as('ADM', `select admin_transport('${P2.job}', 'book', $1::jsonb)`, [JSON.stringify({ day: (await c.query(`select ((now() at time zone 'Australia/Brisbane')::date + 2)::text d`)).rows[0].d, window: 'day' })]);
  await as('ADM', `select admin_transport('${P2.job}', 'picked_up', '{"ok": true}')`);
  r = await as('ADM', `select admin_transport('${P2.job}', 'returned', '{}')`); ok("pickup: only a cancelled sale goes back to the seller", r.error?.includes('transport_step'), r.error);
  await as('service', `update invoices set status = 'cancelled', cancel_reason = 'not_buyer_fault: test' where id = '${P2.inv}'`);
  r = await as('service', `select status, sale_cancelled_at is not null x from transport_jobs where id = '${P2.job}'`); ok('pickup: a sale cancelled after pickup is flagged', r.rows?.[0]?.status === 'picked_up' && r.rows[0].x, JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.ADM}' and title like 'Sale cancelled after pickup:%'`); ok('pickup: our team is told to arrange the return', r.rows?.[0]?.n >= 1);
  r = await as('ADM', `select admin_transport('${P2.job}', 'returned', '{"note": "Back with the seller"}') s`); ok('pickup: returned to the seller', r.rows?.[0]?.s === 'returned', r.error);
  const P3 = await paid(10944, 5000);
  r = await as('ADM', `select admin_transport('${P3.job}', 'cancel', '{}')`); ok('pickup: cancelling needs a reason', r.error?.includes('transport_note'), r.error);
  await as('service', `update invoices set status = 'cancelled', cancel_reason = 'not_buyer_fault: test' where id = '${P3.inv}'`);
  r = await as('service', `select status from transport_jobs where id = '${P3.job}'`); ok('pickup: a sale cancelled before pickup cancels the pickup', r.rows?.[0]?.status === 'cancelled', JSON.stringify(r.rows));
  for (const fn of [`collection_ready('${P1.inv}')`, `transport_on_cancel()`]) {
    r = await as('A', `select ${fn}`); ok(`pickup: members can't call ${fn.split('(')[0]}`, !!r.error, r.error);
  }
}

// ---------- live auctions only, like Turners Live: an estimate on every listing, early bids that can be withdrawn,
// sold under the hammer or passed in (nothing referred, no offers, no Buy Now), the seller lowering their reserve ----------
{
  await c.query(`update settings set value = value || '{"live_only": true}' where key = 'auction'`);
  await c.query(`update settings set value = value || '{"pay_mode": "transfer"}' where key = 'fees'`);
  r = await as('anon', `select live_only() x`); ok('live only: the switch is on, and anyone can read it', r.rows?.[0]?.x === true, r.error);
  U.X = '7e7e7e7e-0000-4000-8000-00000000007e';
  await c.query(`insert into auth.users (id, email) values ('${U.X}', 'xan@x.au')`);
  await c.query(`update profiles set details_done=true, first_name='Xan', last_name='Xavier', dob='1981-03-03', mobile='0477777001', mobile_verified=true, id_status='verified', terms_version='2026-10-27' where id='${U.X}'`);
  await c.query(`update settings set value = value || '{"require_checks": false}' where key = 'selling'`);
  r = await as('ADM', `insert into sales (slug, title, published, mode, starts_at, lot_seconds, extend_seconds, auctioneer) values ('lo-thursday', 'Thursday night live', true, 'live', now() + interval '2 days', 30, 15, 'Pat Gavel') returning id`);
  const LS = r.rows?.[0]?.id; ok('live only: staff create a live auction', !!LS, r.error);
  const [E1, E4, E2, E3] = (await c.query(`select nextval('lot_number_seq')::bigint id from generate_series(1, 4)`)).rows.map((x) => Number(x.id));
  for (const [id, t] of [[E1, 'Live only ute'], [E4, 'Live only wagon'], [E2, 'Live only van'], [E3, 'Live only hatch']]) {
    await c.query(`insert into lots (id, status, title, category, start_price, ends_at, registration, method) values (${id}, 'draft', '${t}', 'cars', 1000, now() + interval '7 days', 'unregistered', 'auction')`);
  }
  await c.query(`insert into lot_private (lot_id, reserve_price) values (${E1}, 9500), (${E4}, 9500), (${E2}, 9500), (${E3}, null)`);
  await c.query(`update lots set seller_id = '${U.S}' where id = ${E4}`);

  // publishing: a live auction, no tender or Buy Now, an estimate with its basis
  await as('ADM', `update lots set method = 'tender' where id = ${E1}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${E1}`); ok('live only: a tender can\'t be published', r.error?.includes('from a tender to an auction'), r.error);
  await as('ADM', `update lots set method = 'auction', buy_now_price = 15000 where id = ${E1}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${E1}`); ok('live only: no Buy Now', r.error?.includes('Remove the Buy Now price'), r.error);
  await as('ADM', `update lots set buy_now_price = null where id = ${E1}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${E1}`); ok('live only: it must be in a live auction', r.error?.includes('live auction it will be offered in'), r.error);
  for (const id of [E1, E4, E2, E3]) await as('ADM', `update lots set sale_id = ${LS} where id = ${id}`);
  r = await as('service', `select id, live_state, sale_order from lots where id in (${E1}, ${E4}, ${E2}, ${E3}) order by sale_order`);
  ok('live only: they wait their turn in the order they joined', r.rows?.map((x) => Number(x.id)).join() === [E1, E4, E2, E3].join() && r.rows.every((x) => x.live_state === 'waiting'), JSON.stringify(r.rows));
  r = await as('ADM', `update lots set status = 'live' where id = ${E1}`); ok('live only: an estimate is needed', r.error?.includes('auction estimate'), r.error);
  r = await as('ADM', `update lots set estimate_low = 10000, estimate_high = 20000 where id = ${E1}`); ok('estimate: no wider than 25% (or $1,000)', r.error?.includes('lots_estimate_range'), r.error);
  r = await as('ADM', `update lots set estimate_low = 9000, estimate_high = 11000 where id = ${E1}`); ok("estimate: the low end can't be below the seller's reserve", r.error?.includes('estimate_rule') && r.error?.includes('$9,500'), r.error);
  r = await as('ADM', `update lots set estimate_low = 10000, estimate_high = 12500 where id = ${E1}`); ok('estimate: low and high set', !r.error, r.error);
  r = await as('ADM', `update lot_private set reserve_price = 11000 where lot_id = ${E1}`); ok("estimate: the reserve can't go above the low estimate", r.error?.includes('estimate_rule'), r.error);
  r = await as('ADM', `update lots set status = 'live' where id = ${E1}`); ok('estimate: what it is based on must be written down', r.error?.includes('based on'), r.error);
  await as('ADM', `update lot_private set estimate_basis = 'Three similar utes sold at auction in September 2026: $10,200, $11,500 and $12,100' where lot_id = ${E1}`);
  r = await as('service', `select estimate_by, estimate_at is not null t from lot_private where lot_id = ${E1}`); ok('estimate: who wrote the basis, and when, is kept', r.rows?.[0]?.estimate_by === U.ADM && r.rows[0].t, JSON.stringify(r.rows));
  r = await as('ADM', `update lots set status = 'live' where id = ${E1}`); ok('live only: publishes with an estimate in a live auction', !r.error, r.error);
  r = await as('anon', `select estimate_low, estimate_high from lots where id = ${E1}`); ok('estimate: public', Number(r.rows?.[0]?.estimate_low) === 10000 && Number(r.rows[0].estimate_high) === 12500, JSON.stringify(r.rows));
  r = await as('anon', `select estimate_basis from lot_private where lot_id = ${E1}`); ok('estimate: its basis stays private', (r.rows || []).length === 0);
  for (const [id, lo, hi] of [[E4, 9500, 11000], [E2, 9500, 11000], [E3, 5000, 6000]]) {
    await as('ADM', `update lots set estimate_low = ${lo}, estimate_high = ${hi} where id = ${id}`);
    await as('ADM', `update lot_private set estimate_basis = 'Recent sales of the same model and year on our results page' where lot_id = ${id}`);
    r = await as('ADM', `update lots set status = 'live' where id = ${id}`); ok(`live only: lot ${id} published`, !r.error, r.error);
  }
  r = await as('service', `select body from outbox where dedupe_key like 'live:${E4}%' limit 1`); ok('seller: told the auction day, early bids, and that they can lower the reserve', /live auction on/.test(r.rows?.[0]?.body || '') && /lower your reserve/.test(r.rows[0].body), r.rows?.[0]?.body);

  // early bids, withdrawn until the hammer falls
  r = await as('A', `select place_bid(${E1}, 9000) r`); ok('early bid: A', r.rows?.[0]?.r?.status === 'leading' && Number(r.rows[0].r.current_bid) === 1000, JSON.stringify(r));
  r = await as('B', `select place_bid(${E1}, 8000) r`); ok('early bid: B is outbid by A', r.rows?.[0]?.r?.status === 'outbid' && Number(r.rows[0].r.current_bid) === 8250, JSON.stringify(r));
  r = await as('B', `select withdraw_bid(${E1}) j`); ok('withdraw: B takes their early bid back', !r.error, r.error);
  r = await as('anon', `select current_bid, bid_count, leader_id is not null l from lots where id = ${E1}`);
  ok('withdraw: the price is worked out as if B never bid', Number(r.rows?.[0]?.current_bid) === 1000 && r.rows[0].bid_count === 1, JSON.stringify(r.rows));
  r = await as('B', `select withdraw_bid(${E1})`); ok('withdraw: nothing left to withdraw', r.error?.includes('no_bids'), r.error);
  r = await as('service', `select reason, removed_by from bid_removals where lot_id = ${E1} and bidder_id = '${U.B}'`); ok('withdraw: recorded as the bidder\'s own', r.rows?.[0]?.removed_by === U.B && /before the vehicle was offered/.test(r.rows[0].reason), JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.B}' and title like 'Your bid on the Live only ute was withdrawn'`); ok('withdraw: the bidder gets a confirmation', r.rows?.[0]?.n === 1);
  await as('A', `select withdraw_bid(${E1})`);
  r = await as('anon', `select current_bid, bid_count, leader_id from lots where id = ${E1}`); ok('withdraw: the last bidder out leaves no bids', Number(r.rows?.[0]?.current_bid) === 0 && r.rows[0].bid_count === 0 && r.rows[0].leader_id === null, JSON.stringify(r.rows));
  await as('A', `select place_bid(${E1}, 9000)`);
  r = await as('B', `select place_bid(${E1}, 9600) r`); ok('early bid: a maximum over the reserve jumps to it', r.rows?.[0]?.r?.status === 'leading' && Number(r.rows[0].r.current_bid) === 9500, JSON.stringify(r));
  const seedTimed = (await c.query(`select id from lots where status = 'live' and live_state is null and method = 'auction' limit 1`)).rows[0]?.id;
  r = await as('A', `select withdraw_bid(${seedTimed})`); ok('withdraw: only in a live auction', r.error?.includes('withdraw_closed'), r.error);

  // the seller lowers their reserve before the vehicle is offered (no higher, and only the seller)
  await as('A', `select place_bid(${E4}, 9000)`); await as('B', `select place_bid(${E4}, 8500)`);
  r = await as('S', `select seller_lot_reserve(${E4}) j`); ok('seller: sees their own reserve', Number(r.rows?.[0]?.j?.reserve) === 9500, JSON.stringify(r));
  r = await as('A', `select seller_lot_reserve(${E4})`); ok("seller: nobody else sees it", r.error?.includes('forbidden'), r.error);
  r = await as('S', `select seller_set_reserve(${E4}, 9600)`); ok("seller: a reserve can't be raised", r.error?.includes('only be lowered'), r.error);
  r = await as('A', `select seller_set_reserve(${E4}, 1000)`); ok("seller: only the seller lowers it", r.error?.includes('forbidden'), r.error);
  r = await as('S', `select seller_set_reserve(${E4}, 9200) j`); ok('seller: lowers the reserve', Number(r.rows?.[0]?.j?.reserve) === 9200 && r.rows[0].j.reserve_met === false, JSON.stringify(r));
  r = await as('service', `select action, amount, via from seller_decisions where lot_id = ${E4}`); ok("seller: the change is recorded as the seller's instruction", r.rows?.[0]?.action === 'lower_reserve' && Number(r.rows[0].amount) === 9200 && r.rows[0].via === 'portal', JSON.stringify(r.rows));
  r = await as('S', `select place_bid(${E4}, 20000)`); ok("seller: still can't bid on their own vehicle", r.error?.includes('own_vehicle'), r.error);

  // early bids on E2 and E3; a correction to E3 holds it back 24 hours
  await as('A', `select place_bid(${E2}, 9000)`); await as('B', `select place_bid(${E2}, 8500)`);
  await as('A', `select place_bid(${E3}, 3000)`);
  // the hour-before reminder for a watched vehicle in a live auction: "up in about an hour", with the live room
  await c.query(`insert into watchlist (user_id, lot_id, remind) values ('${U.X}', ${E2}, true) on conflict (user_id, lot_id) do update set remind = true, reminded_at = null`);
  await c.query(`update lots set ends_at = now() + interval '30 minutes' where id = ${E2}`);
  await as('service', `select queue_ending_reminders(100)`);
  r = await as('service', `select title, link from notifications where user_id = '${U.X}' and kind = 'ending'`);
  ok('reminder: a watched vehicle in a live auction is "up in about an hour", with a link to the room', r.rows?.length === 1 && r.rows[0].title === 'Up in about an hour: Live only van' && r.rows[0].link === '/live/lo-thursday', JSON.stringify(r.rows));
  await as('service', `select live_estimates(${LS})`);
  r = await as('ADM', `update lots set estimate_low = 4500, estimate_high = 5500 where id = ${E3}`); ok('correction: the estimate changed on a listed vehicle', !r.error, r.error);
  r = await as('anon', `select label, before, after from lot_corrections where lot_id = ${E3} order by label`);
  ok('correction: shown on the listing, in dollars', r.rows?.length === 2 && r.rows[0].label === 'Estimate (high)' && r.rows[1].before === '$5,000' && r.rows[1].after === '$4,500', JSON.stringify(r.rows));
  r = await as('service', `select body from notifications where user_id = '${U.A}' and title like 'Correction to a vehicle you bid on: Live only hatch' order by created_at desc limit 1`);
  ok("correction: early bidders hear it won't be offered for 24 hours, and that they can withdraw", /won't be offered until at least 24 hours/.test(r.rows?.[0]?.body || '') && /withdraw your early bid/.test(r.rows[0].body), r.rows?.[0]?.body);
  r = await as('service', `select live_state, ends_at < now() + interval '3 days' x from lots where id = ${E3}`); ok("correction: it keeps its place (its time isn't pushed out)", r.rows?.[0]?.live_state === 'waiting' && r.rows[0].x === true, JSON.stringify(r.rows));
  await c.query(`update lots set buy_now_price = 20000 where id = ${E3}`);
  r = await as('B', `select buy_now(${E3})`); ok('live only: Buy Now refused', r.error?.includes('buy_now_unavailable'), r.error);
  await c.query(`update lots set buy_now_price = null where id = ${E3}`);

  // the auction, at its published start time
  r = await as('ADM', `select admin_live_start(${LS})`); ok('auction: never before its published start time', r.error?.includes('sale_early'), r.error);
  await c.query(`update sales set starts_at = now() - interval '1 second' where id = ${LS}`);
  r = await as('ADM', `select admin_live_start(${LS}) id`); ok('auction: starts with the first vehicle', Number(r.rows?.[0]?.id) === E1, JSON.stringify(r));
  r = await as('X', `select place_bid(${E1}, 10000)`); ok('auction: the conditions come first', r.error?.includes('enter_first'), r.error);
  await as('X', `select enter_sale(${LS})`);
  r = await as('X', `select place_bid(${E1}, 10000) r`); ok('auction: a live bid', r.rows?.[0]?.r?.status === 'leading' && Number(r.rows[0].r.current_bid) === 9850, JSON.stringify(r));
  await c.query(`update lots set ends_at = now() + interval '2 seconds' where id = ${E1}`);
  r = await as('X', `select withdraw_bid(${E1}) j`); ok('auction: a live bid withdrawn before the hammer', r.rows?.[0]?.j?.leader_changed === true && Number(r.rows[0].j.current_bid) === 9500, JSON.stringify(r));
  r = await as('service', `select leader_id, ends_at > now() + interval '13 seconds' x from lots where id = ${E1}`); ok('auction: the previous bidder is back in front, and the room gets time to answer', r.rows?.[0]?.leader_id === U.B && r.rows[0].x === true, JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.B}' and title like 'You''re the highest bidder again on the Live only ute'`); ok('auction: and is told', r.rows?.[0]?.n === 1);
  r = await as('ADM', `select admin_live_close(${LS}) s`); ok('auction: sold under the hammer', r.rows?.[0]?.s === 'sold', JSON.stringify(r));
  r = await as('anon', `select live_message from sales where id = ${LS}`); ok('hammer: the room is told "Sold!"', r.rows?.[0]?.live_message === 'Sold!', JSON.stringify(r.rows));
  r = await as('service', `select status, sold_price, winner_id, sold_via from lots where id = ${E1}`); ok('auction: to the highest bidder, at their bid', r.rows?.[0]?.status === 'sold' && Number(r.rows[0].sold_price) === 9500 && r.rows[0].winner_id === U.B && r.rows[0].sold_via === 'auction', JSON.stringify(r.rows));
  r = await as('B', `select withdraw_bid(${E1})`); ok("withdraw: not once the hammer has fallen", r.error?.includes('withdraw_closed'), r.error);

  r = await as('ADM', `select admin_live_next(${LS}) id`); ok('auction: the next vehicle', Number(r.rows?.[0]?.id) === E4, JSON.stringify(r));
  r = await as('anon', `select live_message from sales where id = ${LS}`); ok('hammer: the call clears when the next vehicle is up', r.rows?.[0]?.live_message === null, JSON.stringify(r.rows));
  r = await as('A', `select admin_live_reserve(${LS}, 8900)`); ok('auctioneer: only staff record the seller\'s instruction', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_live_reserve(${LS}, 8900) j`); ok("auctioneer: records the seller's instruction to lower the reserve; the leader's max covers it", Number(r.rows?.[0]?.j?.current_bid) === 8900 && r.rows[0].j.reserve_met === true, JSON.stringify(r));
  r = await as('service', `select via from seller_decisions where lot_id = ${E4} order by created_at desc limit 1`); ok('auctioneer: recorded as given through us', r.rows?.[0]?.via === 'admin', JSON.stringify(r.rows));
  r = await as('A', `select admin_live_due(${LS})`); ok('hammer: only staff knock a vehicle down', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_live_due(${LS}) s`); ok('hammer: not while the countdown is still running', !r.error && r.rows?.[0]?.s === null, JSON.stringify(r));
  r = await as('service', `select status, live_state from lots where id = ${E4}`); ok('hammer: so it stays open', r.rows?.[0]?.status === 'live' && r.rows[0].live_state === 'open', JSON.stringify(r.rows));
  await c.query(`update lots set ends_at = now() - interval '1 second' where id = ${E4}`);
  r = await as('ADM', `select admin_live_due(${LS}) s`); ok('auction: sold once the reserve was lowered, when its countdown ran out', r.rows?.[0]?.s === 'sold', JSON.stringify(r));
  r = await as('ADM', `select admin_live_due(${LS}) s`); ok('hammer: only once', !r.error && r.rows?.[0]?.s === null, JSON.stringify(r));

  // the auctions after this one: tomorrow's is too soon to relist into, an unpublished one doesn't count
  r = await as('ADM', `insert into sales (slug, title, published, mode, starts_at, lot_seconds, extend_seconds, auctioneer) values
    ('lo-next', 'Next Thursday live', true, 'live', now() + interval '9 days', 30, 15, 'Pat Gavel'),
    ('lo-soon', 'Tomorrow live', true, 'live', now() + interval '1 day', 30, 15, 'Pat Gavel'),
    ('lo-hidden', 'Not published yet', false, 'live', now() + interval '5 days', 30, 15, 'Pat Gavel') returning id, slug`);
  const NEXT = Number(r.rows?.find((x) => x.slug === 'lo-next')?.id); ok('relist: later live auctions to relist into', NEXT > 0, r.error);
  await c.query(`update lots set seller_id = '${U.S}' where id in (${E2}, ${E3})`);
  await c.query(`insert into seller_agreements (lot_id, seller_id, version, signed_name, signed_at, fees, disclosures) values (${E3}, '${U.S}', 'test', 'Sam Seller', now() - interval '85 days', '{}', '{}')`);
  r = await as('ADM', `select admin_live_next(${LS}) id`); ok('auction: the third vehicle', Number(r.rows?.[0]?.id) === E2, JSON.stringify(r));
  r = await as('ADM', `select admin_live_close(${LS}) s`); ok('auction: below the reserve it is passed in, never referred to the seller', r.rows?.[0]?.s === 'passed', JSON.stringify(r));
  r = await as('anon', `select live_message from sales where id = ${LS}`); ok('hammer: the room is told it was passed in', r.rows?.[0]?.live_message === 'Passed in: below the reserve.', JSON.stringify(r.rows));
  r = await as('service', `select status, decision_by, (select count(*)::int from invoices where lot_id = ${E2}) inv from lots where id = ${E2}`);
  ok('passed in: no sale, no decision window, no invoice', r.rows?.[0]?.status === 'passed' && r.rows[0].decision_by === null && r.rows[0].inv === 0, JSON.stringify(r.rows));
  await as('service', `select queue_status_notices()`);
  r = await as('service', `select title, body from notifications where user_id = '${U.A}' and title = 'You were the highest bidder on the Live only van'`);
  ok('passed in: the highest bidder is told a consultant will be in touch', r.rows?.length === 1 && /One of our consultants will be in touch/.test(r.rows[0].body) && /don't owe anything/.test(r.rows[0].body), JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id in ('${U.A}', '${U.B}') and title = 'The Live only van was passed in'`); ok('passed in: the other bidders are told nobody owes anything', r.rows?.[0]?.n === 1);
  r = await as('service', `select id, status, sale_id, live_state, fees, estimate_low, estimate_high, bid_count, p.estimate_basis, p.reserve_price from lots left join lot_private p on p.lot_id = lots.id where relisted_from = ${E2}`);
  const RL = Number(r.rows?.[0]?.id);
  ok('relist: passed in, it goes straight into the next live auction far enough ahead (not tomorrow\'s, not an unpublished one), as a draft', r.rows?.length === 1 && r.rows[0].status === 'draft' && Number(r.rows[0].sale_id) === NEXT && r.rows[0].live_state === 'waiting', JSON.stringify(r.rows));
  ok("relist: it doesn't carry the old auction's fees, bids or estimate (a fresh one, with fresh grounds), but keeps the reserve", r.rows?.[0]?.fees === null && r.rows[0].estimate_low === null && r.rows[0].estimate_high === null && r.rows[0].estimate_basis === null && Number(r.rows[0].reserve_price) === 9500 && r.rows[0].bid_count === 0, JSON.stringify(r.rows));
  r = await as('service', `select to_addr, title, body, link from outbox where dedupe_key like 'passed-followup:${E2}%' and kind = 'staff'`);
  ok("passed in: the consultant (or the admins) gets the highest bidder's details to follow up", (r.rows || []).length >= 1 && r.rows.every((x) => /0411111111/.test(x.body) && /below the seller's reserve of \$9,500/.test(x.body)), JSON.stringify(r.rows));
  ok("passed in: and whether it can be sold after the auction (not without a state on it)", (r.rows || []).length >= 1 && r.rows.every((x) => /It can't be sold after the auction: Record the vehicle's state first/.test(x.body) && /the bidder can leave an early bid on it/.test(x.body)), JSON.stringify(r.rows));
  ok('relist: and the relist, with what to do before it goes live', (r.rows || []).length >= 1 && r.rows.every((x) => x.body.includes(`relisted as lot ${RL} (a draft) for Next Thursday live`) && /fresh estimate/.test(x.body) && /fresh PPSR search/.test(x.body) && x.link === `/admin/lots/${RL}`), JSON.stringify(r.rows));
  r = await as('service', `select body from outbox where dedupe_key like 'seller-passed:${E2}%' limit 1`);
  ok("relist: the seller hears it's going into the next live auction, and that they can say no for free", /It was passed in at \$\d/.test(r.rows?.[0]?.body || '') && /We're offering it again in our live auction on/.test(r.rows[0].body) && /there's no fee/.test(r.rows[0].body), r.rows?.[0]?.body);
  r = await as('A', `select make_offer(${E2}, 9400)`); ok('live only: no offers after the auction', r.error?.includes('offers_closed'), r.error);
  r = await as('ADM', `select admin_accept(${E2}, null)`); ok("live only: staff can't accept a bid after the auction", r.error?.includes('live_only'), r.error);
  r = await as('S', `select seller_decide(${E4}, 'accept_referral', null)`); ok("live only: sellers can't accept a bid after the auction", r.error?.includes('live_only'), r.error);
  r = await as('ADM', `select admin_offer_next_bidder(${E2}, 24, true)`); ok('live only: no second-chance offers', r.error?.includes('live_only'), r.error);
  r = await as('A', `select respond_second_chance(gen_random_uuid(), true)`); ok("live only: a second-chance offer can't be accepted", r.error?.includes('live_only'), r.error);

  r = await as('ADM', `select admin_live_next(${LS}, ${E3})`); ok("auction: a vehicle corrected in the last 24 hours can't be offered", r.error?.includes('corrected_recently'), r.error);
  r = await as('ADM', `select admin_live_next(${LS}) id`); ok('auction: nothing else can be offered, so the sale ends', r.rows?.[0]?.id === null, JSON.stringify(r));
  r = await as('service', `select l.status, l.live_state, s.live_status from lots l join sales s on s.id = l.sale_id where l.id = ${E3}`);
  ok("auction: what wasn't offered is passed in, not sold on its early bids", r.rows?.[0]?.status === 'passed' && r.rows[0].live_state === 'closed' && r.rows[0].live_status === 'ended', JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and title = 'The Live only hatch wasn''t offered'`); ok("auction: its early bidders are told", r.rows?.[0]?.n === 1);
  r = await as('service', `select status, sale_id, not_offered, (select not_offered from lots where id = ${E3}) was from lots where relisted_from = ${E3}`);
  ok("relist: what wasn't offered is relisted too, but not into an auction after the seller's authority ends", r.rows?.length === 1 && r.rows[0].status === 'draft' && r.rows[0].sale_id === null, JSON.stringify(r.rows));
  ok("passed in: a vehicle not offered says so (and its relist starts afresh)", r.rows?.[0]?.was === true && r.rows[0].not_offered === false, JSON.stringify(r.rows));
  r = await as('service', `select body from outbox where dedupe_key like 'passed-followup:${E3}%' limit 1`);
  ok("relist: the consultant hears it wasn't offered, and when the seller's authority ends", /wasn't offered before the auction finished/.test(r.rows?.[0]?.body || '') && /not yet in an auction/.test(r.rows[0].body) && /authority to sell ends on/.test(r.rows[0].body), r.rows?.[0]?.body);
  r = await as('service', `select body from outbox where dedupe_key like 'seller-not-offered:${E3}%' limit 1`);
  ok("relist: and the seller that it's going into the next auction (date to come)", /we'll tell you the date/.test(r.rows?.[0]?.body || ''), r.rows?.[0]?.body);
  await as('service', `select queue_status_notices()`);
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.A}' and title = 'The Live only hatch was passed in'`); ok("auction: and aren't told twice", r.rows?.[0]?.n === 0);

  // the seller doesn't want it offered again: free while the relist is a draft
  r = await as('A', `select seller_decline_relist(${RL})`); ok("relist: only the seller can say no", r.error?.includes('forbidden'), r.error);
  r = await as('anon', `select seller_decline_relist(${RL})`); ok("relist: not without signing in", !!r.error);
  r = await as('S', `select seller_decline_relist(${RL}) id`); ok('relist: the seller says no', Number(r.rows?.[0]?.id) === E2, r.error);
  r = await as('service', `select (select status from lots where id = ${RL}) st, (select string_agg(action || '/' || via, ',') from seller_decisions where lot_id = ${E2}) d,
    (select count(*)::int from outbox where dedupe_key like 'relist-declined:${E2}%') m`);
  ok('relist: the draft is cancelled, the decision recorded and the consultant told', r.rows?.[0]?.st === 'cancelled' && r.rows[0].d === 'decline_relist/portal' && r.rows[0].m >= 1, JSON.stringify(r.rows));
  r = await as('service', `select relist_auto(${E2}) p`); ok('relist: never again by itself once the seller has said no', r.rows?.[0]?.p === null, JSON.stringify(r.rows));
  // the seller changes their mind: staff relist it by hand, and the copy is a fresh draft for a later auction
  r = await as('A', `select admin_relist(${E2})`); ok('relist: only staff relist by hand', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_relist(${E2}) id`); const RL2 = Number(r.rows?.[0]?.id); ok('relist: a fresh draft', RL2 > 0 && RL2 !== RL, r.error);
  r = await as('ADM', `select admin_relist(${E2})`); ok('relist: only one at a time', r.error?.includes('already_relisted'), r.error);
  r = await as('service', `select status, sale_id, live_state, fees, estimate_low, bid_count from lots where id = ${RL2}`);
  ok("relist: by hand, it isn't in an auction until staff choose one", r.rows?.[0]?.status === 'draft' && r.rows[0].sale_id === null && r.rows[0].live_state === null && r.rows[0].fees === null && r.rows[0].estimate_low === null && r.rows[0].bid_count === 0, JSON.stringify(r.rows));
  r = await as('A', `select admin_decline_relist(${RL2})`); ok('relist: only staff record a no on the seller\'s behalf', r.error?.includes('forbidden'), r.error);
  // listed again: everyone who bid or watched hears when, and its watchers keep watching it
  await as('ADM', `update lots set sale_id = ${NEXT}, estimate_low = 9500, estimate_high = 11000 where id = ${RL2}`);
  await as('ADM', `update lot_private set estimate_basis = 'Passed in at $9,000 with a $9,500 reserve; two similar vans sold for $9,800 and $10,400' where lot_id = ${RL2}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${RL2}`); ok('relist: listed in the next auction', !r.error, r.error);
  r = await as('service', `select user_id, body from notifications where title = 'Back for auction: Live only van' order by user_id`);
  ok('relist: its bidders and watchers hear it\'s back, with the live auction\'s day', r.rows?.length === 3 && [U.A, U.B, U.X].every((u) => r.rows.some((x) => x.user_id === u)) && r.rows.every((x) => /back, in our live auction on/.test(x.body) && /Leave an early bid now/.test(x.body)), JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from watchlist where user_id = '${U.X}' and lot_id = ${RL2}`); ok('relist: its watchers keep watching the new listing', r.rows?.[0]?.n === 1);
  r = await as('S', `select seller_decline_relist(${E2})`); ok("relist: once it's listed, saying no is a withdrawal (call us)", r.error?.includes('relist_listed'), r.error);

  // the certificate a state needs to transfer a registered vehicle
  r = await as('service', `select roadworthy_needed('QLD', 2015, 'cars', null) q, roadworthy_needed('NSW', 2005, 'cars', null) n, roadworthy_needed('VIC', 2020, 'trailers', 2000) vt,
    roadworthy_needed('VIC', 2020, 'utes', null) vu, roadworthy_needed('ACT', extract(year from current_date)::int - 3, 'cars', null) a3, roadworthy_needed('ACT', extract(year from current_date)::int - 8, 'cars', null) a8,
    roadworthy_needed('NT', extract(year from current_date)::int - 7, 'cars', null) nt, roadworthy_needed('SA', 2015, 'cars', null) sac, roadworthy_needed('SA', 2015, 'trailers', 2000) sat,
    roadworthy_needed('QLD', 2015, 'boats', null) b, roadworthy_needed('WA', 2001, 'cars', null) w, roadworthy_needed('QLD', 2015, 'trailers', 600) qt`);
  const rw = r.rows?.[0] || {};
  ok('roadworthy: the right certificate for each state', rw.q === 'safety certificate' && rw.n === null && rw.vt === null && rw.vu === 'roadworthy certificate' && rw.a3 === null && rw.a8 === 'roadworthy inspection'
    && rw.nt === 'roadworthy inspection' && rw.sac === null && rw.sat === 'inspection' && rw.b === null && rw.w === null && rw.qt === null, JSON.stringify(rw));

  for (const fn of [`buy_now_core(${E3})`, `make_offer_core(${E2}, 1)`, `seller_decide_core(${E4}, 'accept_referral', null)`, `admin_accept_core(${E2}, null)`,
    `admin_offer_next_bidder_core(${E2}, 24, false)`, `respond_second_chance_core(gen_random_uuid(), true)`, `remove_bids_core(${E3}, '${U.A}', 'x', '${U.A}', false)`,
    `set_reserve_core(${E3}, 1, 'portal')`, `live_pass_unoffered(${LS})`, `queue_passed_followup(${E2})`, `relist_core(${E2})`, `relist_auto(${E2})`,
    `relist_decline_core(${E2}, 'portal')`, `relist_seller_text(null)`, `queue_staff_email(${E2}, 'x', 'x', 'x', 'x')`]) {
    r = await as('A', `select ${fn}`); ok(`live only: members can't call ${fn.split('(')[0]}`, !!r.error, r.error);
  }
  await c.query(`update settings set value = value || '{"require_checks": true}' where key = 'selling'`);
  const E5 = Number((await c.query(`select nextval('lot_number_seq')::bigint id`)).rows[0].id);
  await c.query(`insert into lots (id, status, title, category, start_price, ends_at, registration, method, seller_id, estimate_low, estimate_high) values (${E5}, 'draft', 'Live only sedan', 'cars', 1000, now() + interval '7 days', 'unregistered', 'auction', '${U.S}', 5000, 6000)`);
  await c.query(`insert into lot_private (lot_id, reserve_price, estimate_basis) values (${E5}, 4000, 'Recent sales of the same model and year on our results page')`);
  await c.query(`insert into seller_agreements (lot_id, seller_id, version, signed_name, signed_at, fees, disclosures) values (${E5}, '${U.S}', 'test', 'Sam Seller', now() - interval '85 days', '{}', '{}')`);
  await as('ADM', `update lots set sale_id = ${NEXT} where id = ${E5}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${E5}`);
  ok("authority: a vehicle can't go into an auction after the seller's 90-day authority ends", r.error?.includes('authority to sell ends on') && r.error?.includes('sign the agreement again'), r.error);
  await c.query(`update seller_agreements set signed_at = now() - interval '10 days' where lot_id = ${E5}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${E5}`);
  ok('authority: inside it, the other checks carry on', !!r.error && !r.error.includes('authority to sell'), r.error);

  // ---------- selling after the auction, by agreement, where the state allows it (migration 26) ----------
  // five vehicles passed in, one per state: A leads each one below its reserve, B bid too, X watches
  await c.query(`update settings set value = value || '{"require_checks": false}' where key = 'selling'`);
  r = await as('ADM', `insert into sales (slug, title, published, mode, starts_at, lot_seconds, extend_seconds, auctioneer) values ('aa-friday', 'Friday live', true, 'live', now() + interval '1 hour', 30, 15, 'Pat Gavel') returning id`);
  const AS = Number(r.rows?.[0]?.id);
  const AA = {};
  const YR = Number((await c.query(`select extract(year from now() at time zone 'Australia/Brisbane')::int y`)).rows[0].y);
  for (const [st, t] of [['QLD', 'Brisbane ute'], ['SA', 'Adelaide wagon'], ['NSW', 'Sydney hatch'], ['VIC', 'Melbourne van'], ['TAS', 'Hobart sedan']]) {
    const id = Number((await c.query(`select nextval('lot_number_seq')::bigint id`)).rows[0].id);
    AA[st] = id;
    // Queensland's is recent (no statutory warranty on a consignment there); elsewhere we only sell after the auction where
    // none applies, so those are older, higher-kilometre cars
    await c.query(`insert into lots (id, status, title, category, start_price, ends_at, registration, method, seller_id, state, estimate_low, estimate_high, year, odometer)
      values (${id}, 'draft', '${t}', 'cars', 1000, now() + interval '7 days', 'unregistered', 'auction', '${U.S}', '${st}', 9000, 11000, ${st === 'QLD' ? '2019, 80000' : `${YR - 18}, 250000`})`);
    await c.query(`insert into lot_private (lot_id, reserve_price, estimate_basis) values (${id}, 9000, 'Two of the same model and year sold for $9,800 and $10,400')`);
    await c.query(`insert into seller_agreements (lot_id, seller_id, version, signed_name, signed_at, fees, disclosures) values (${id}, '${U.S}', 'test', 'Sam Seller', now() - interval '5 days', '{}', '{}')`);
    await as('ADM', `update lots set sale_id = ${AS} where id = ${id}`);
    r = await as('ADM', `update lots set status = 'live' where id = ${id}`); ok(`after: ${st} vehicle listed`, !r.error, r.error);
    await as('A', `select place_bid(${id}, 8000)`); await as('B', `select place_bid(${id}, 7500)`);
    await c.query(`insert into watchlist (user_id, lot_id) values ('${U.X}', ${id}) on conflict do nothing`);
  }
  await c.query(`update sales set starts_at = now() - interval '1 second' where id = ${AS}`);
  r = await as('ADM', `select admin_live_start(${AS}) id`); ok('after: the auction starts', Number(r.rows?.[0]?.id) === AA.QLD, JSON.stringify(r));
  for (let i = 0; i < 5; i++) {
    r = await as('ADM', `select admin_live_close(${AS}) s`); ok(`after: vehicle ${i + 1} passed in below the reserve`, r.rows?.[0]?.s === 'passed', JSON.stringify(r));
    if (i < 4) await as('ADM', `select admin_live_next(${AS})`);
  }
  await as('service', `select queue_status_notices()`);
  r = await as('service', `select state, (after_auction_check(id)->>'ok')::boolean ok, after_auction_check(id)->>'why' why, (after_auction_check(id)->'rule'->>'cooling_days')::int cd from lots where id in (${Object.values(AA).join(',')}) order by state`);
  const chk = Object.fromEntries((r.rows || []).map((x) => [x.state, x]));
  ok('after: Queensland, New South Wales and South Australia can sell after the auction', chk.QLD?.ok && chk.NSW?.ok && chk.SA?.ok, JSON.stringify(r.rows));
  ok('after: never in Victoria (a consigned vehicle can only be sold at auction)', chk.VIC?.ok === false && /Victoria: a consigned vehicle can only be sold at auction/.test(chk.VIC.why), JSON.stringify(chk.VIC));
  ok('after: not in Tasmania until a trader licence is held', chk.TAS?.ok === false && /motor vehicle trader licence/.test(chk.TAS.why), JSON.stringify(chk.TAS));
  ok('after: the cooling-off a business day longer than the law (NSW 2, SA 3), none in Queensland', chk.NSW?.cd === 2 && chk.SA?.cd === 3 && chk.QLD?.cd === 0, JSON.stringify(r.rows));
  r = await as('service', `select body from outbox where dedupe_key like 'passed-followup:${AA.QLD}%' limit 1`);
  ok('after: the consultant hears it can be sold after the auction, under Queensland rules', /It can be sold after the auction until the new listing goes live \(QLD rules\)/.test(r.rows?.[0]?.body || '') && !/forms|cooling-off period/.test(r.rows[0].body), r.rows?.[0]?.body);
  r = await as('service', `select body from outbox where dedupe_key like 'passed-followup:${AA.SA}%' limit 1`);
  ok("after: and for South Australia, the state's forms and the buyer's cooling-off", /section 18C/.test(r.rows?.[0]?.body || '') && /The buyer gets a cooling-off period/.test(r.rows[0].body), r.rows?.[0]?.body);
  r = await as('service', `select body from outbox where dedupe_key like 'passed-followup:${AA.VIC}%' limit 1`);
  ok("after: for Victoria, that it can't be (it goes into the next auction)", /It can't be sold after the auction: Victoria/.test(r.rows?.[0]?.body || ''), r.rows?.[0]?.body);
  r = await as('service', `select (select body from outbox where dedupe_key like 'seller-passed:${AA.QLD}%' limit 1) q, (select body from outbox where dedupe_key like 'seller-passed:${AA.VIC}%' limit 1) v`);
  ok('after: the seller hears they can accept the highest bid from their dashboard (not in Victoria)', /You can also sell it before then: accept the highest bid \(\$7,750\) on your seller dashboard/.test(r.rows?.[0]?.q || '') && !/sell it before then/.test(r.rows[0].v || ''), JSON.stringify(r.rows));
  r = await as('S', `select seller_lot_after(${AA.QLD}) j`); const sv = r.rows?.[0]?.j || {};
  ok("after: the seller's dashboard view: open, the highest bid, who could be offered it, no price agreed yet", sv.open === true && Number(sv.highest) === 7750 && sv.price === null && sv.offer === null
    && sv.interested === 3 && sv.defaulted === false, JSON.stringify(r));
  r = await as('A', `select seller_lot_after(${AA.QLD})`); ok("after: nobody else sees the seller's view", r.error?.includes('forbidden'), r.error);
  // nobody to offer it to: the seller isn't promised an offer; a watcher changes that
  const AQ2 = Number((await c.query(`select nextval('lot_number_seq')::bigint id`)).rows[0].id);
  await c.query(`insert into lots (id, status, title, category, start_price, ends_at, registration, method, seller_id, state, year, not_offered)
    values (${AQ2}, 'passed', 'Brisbane caravan', 'caravans', 1000, now() - interval '1 hour', 'unregistered', 'auction', '${U.S}', 'QLD', 2018, true)`);
  await c.query(`insert into seller_agreements (lot_id, seller_id, version, signed_name, signed_at, fees, disclosures) values (${AQ2}, '${U.S}', 'test', 'Sam Seller', now() - interval '5 days', '{}', '{}')`);
  r = await as('service', `select (after_auction_check(${AQ2})->>'ok')::boolean ok, after_interested(${AQ2}) n, after_seller_text(${AQ2}) t`);
  ok("after: with nobody who bid on it or watched it, the seller isn't promised an offer", r.rows?.[0]?.ok === true && r.rows[0].n === 0 && r.rows[0].t === '', JSON.stringify(r.rows));
  await c.query(`insert into watchlist (user_id, lot_id) values ('${U.X}', ${AQ2}), ('${U.NEW}', ${AQ2}), ('${U.S}', ${AQ2})`);
  r = await as('service', `select after_interested(${AQ2}) n, after_seller_text(${AQ2}) t`);
  ok('after: a watcher counts (never the seller or a suspended account), and the seller hears they can name a price', r.rows?.[0]?.n === 1
    && /tell us on your seller dashboard the lowest price you'd take, and we'll offer it to the people who watched it/.test(r.rows[0].t), JSON.stringify(r.rows));
  r = await as('S', `select seller_lot_after(${AQ2}) j`); const sv2 = r.rows?.[0]?.j || {};
  ok("after: the seller's view of it: one person, no bid to accept, wasn't offered", sv2.open === true && sv2.interested === 1 && sv2.highest === null && sv2.defaulted === false && sv2.not_offered === true, JSON.stringify(sv2));

  // we never give a statutory warranty: state by state, a vehicle is clear of them only well past the limits (two years past
  // the age, because the law counts from build, compliance or first registration; or over the distance; or a kind not covered)
  r = await as('service', `select warranty_free_for('NSW', ${YR - 3}, 60000, 'cars', null) a, warranty_free_for('NSW', ${YR - 10}, 90000, 'cars', null) b,
    warranty_free_for('NSW', ${YR - 11}, 90000, 'cars', null) c, warranty_free_for('NSW', ${YR - 12}, 90000, 'cars', null) d, warranty_free_for('NSW', ${YR - 3}, 160001, 'cars', null) e,
    warranty_free_for('NSW', ${YR - 2}, 20000, 'trucks', 8000) f, warranty_free_for('SA', ${YR - 2}, 5000, 'motorbikes', null) g, warranty_free_for('WA', ${YR - 13}, 150000, 'utes', null) h,
    warranty_free_for('WA', ${YR - 14}, 150000, 'utes', null) i, warranty_free_for('ACT', ${YR - 1}, 1000, 'motorbikes', null) j, warranty_free_for('QLD', ${YR - 1}, 1000, 'cars', null) k,
    warranty_free_for('NSW', null, 50000, 'cars', null) l, warranty_free_for('SA', ${YR - 5}, null, 'boats', null) m, warranty_free_for('NSW', ${YR - 8}, null, 'caravans', null) n,
    warranty_free_for('TAS', ${YR - 9}, 60000, 'cars', null) o, warranty_free_for('NT', ${YR - 2}, 31000, 'motorbikes', null) q`);
  const wf = r.rows?.[0] || {};
  const WF = {
    a: [false, `New South Wales: the dealer guarantee covers a vehicle sold by a dealer, even for its owner, up to 10 years old and 160,000 km, and this one may be within it (${YR - 3}, 60,000 km)`],
    b: [false, null], c: [false, null],
    d: [true, `New South Wales: the dealer guarantee doesn't cover a vehicle more than 10 years old (this one is from ${YR - 12})`],
    e: [true, "New South Wales: the dealer guarantee doesn't cover a vehicle over 160,000 km"],
    f: [true, "New South Wales: the dealer guarantee doesn't cover a vehicle over 4.5 tonnes GVM"],
    g: [true, "South Australia: the dealer's duty to repair doesn't cover a second-hand motorcycle"],
    h: [false, null], i: [true, null], j: [true, "The ACT: the dealer's duty to repair doesn't cover a second-hand motorcycle"],
    k: [true, "Queensland: no statutory warranty on a sale on consignment for an owner who isn't a motor dealer"],
    l: [null, "New South Wales: add its year and odometer to check that the dealer guarantee doesn't cover it"],
    m: [true, "South Australia: the dealer's duty to repair doesn't cover boats"],
    n: [false, `New South Wales: the dealer guarantee covers a trailer or caravan sold by a dealer, even for its owner, up to 10 years old, and this one may be within it (${YR - 8})`],
    o: [true, `Tasmania: the statutory warranty doesn't cover a vehicle more than 7 years old (this one is from ${YR - 9})`],
    q: [true, "The Northern Territory: the statutory warranty doesn't cover a motorcycle over 30,000 km"],
  };
  const wbad = Object.entries(WF).filter(([k, [free, why]]) => (wf[k]?.free ?? null) !== free || (why !== null && wf[k]?.why !== why)).map(([k]) => `${k}: ${JSON.stringify(wf[k])}`);
  ok('warranty: clear of every statutory warranty only well past the limits, state by state (same words as warrantyFree())', wbad.length === 0, wbad.join(' | '));
  // a recent car in New South Wales: the dealer guarantee would cover it, so it can't be sold after the auction
  const ANSW = Number((await c.query(`select nextval('lot_number_seq')::bigint id`)).rows[0].id);
  await c.query(`insert into lots (id, status, title, category, start_price, ends_at, registration, method, seller_id, state, year, odometer, current_bid, bid_count, leader_id)
    values (${ANSW}, 'passed', 'Sydney SUV', 'cars', 1000, now() - interval '1 hour', 'unregistered', 'auction', '${U.S}', 'NSW', ${YR - 3}, 60000, 9000, 1, '${U.A}')`);
  await c.query(`insert into seller_agreements (lot_id, seller_id, version, signed_name, signed_at, fees, disclosures) values (${ANSW}, '${U.S}', 'test', 'Sam Seller', now() - interval '5 days', '{}', '{}')`);
  await c.query(`insert into watchlist (user_id, lot_id) values ('${U.X}', ${ANSW})`);
  r = await as('service', `select after_auction_check(${ANSW}) j, after_seller_text(${ANSW}) t`);
  ok("warranty: a recent NSW car the dealer guarantee would cover can't be sold after the auction (and the seller isn't told it can)", r.rows?.[0]?.j?.code === 'warranty'
    && /^New South Wales: the dealer guarantee covers a vehicle sold by a dealer, even for its owner/.test(r.rows[0].j.why) && /We never give a statutory warranty, so it can't be sold after the auction\.$/.test(r.rows[0].j.why) && r.rows[0].t === '', JSON.stringify(r.rows));
  r = await as('S', `select seller_accept_after(${ANSW}, 9000)`); ok('warranty: so the seller can\'t agree a price for it', r.error?.includes('after_closed') && r.error?.includes('dealer guarantee'), r.error);
  r = await as('ADM', `select admin_after_offer(${ANSW}, '${U.X}', 9000, 24, false, null, '[]', 'Pat Consultant')`); ok('warranty: and staff can\'t offer it', r.error?.includes('after_closed'), r.error);
  await c.query(`update lots set year = null where id = ${ANSW}`);
  r = await as('service', `select after_auction_check(${ANSW}) j`); ok('warranty: without its year, we can\'t tell, so it can\'t be sold after the auction either', r.rows?.[0]?.j?.code === 'warranty_unknown', JSON.stringify(r.rows));
  // never a listing with a statutory warranty; in the ACT never a vehicle its duty to repair could cover (it applies at auction too)
  const ACTL = Number((await c.query(`select nextval('lot_number_seq')::bigint id`)).rows[0].id);
  await c.query(`insert into lots (id, status, title, category, start_price, ends_at, registration, method, seller_id, state, estimate_low, estimate_high, year, odometer)
    values (${ACTL}, 'draft', 'Canberra hatch', 'cars', 1000, now() + interval '7 days', 'unregistered', 'auction', '${U.S}', 'ACT', 9000, 11000, ${YR - 3}, 40000)`);
  r = await as('ADM', `update lots set status = 'live' where id = ${ACTL}`);
  ok("ACT: a vehicle its dealer's duty to repair could cover can't be listed, even for auction", r.error?.includes('In the ACT it applies even at auction') && r.error?.includes('up to 10 years old and 160,000 km'), r.error);
  await c.query(`update lots set year = ${YR - 13}, odometer = 170000 where id = ${ACTL}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${ACTL}`); ok('ACT: one clearly outside it goes on to the other checks', !!r.error && !r.error.includes('ACT') && !r.error.includes('statutory warranty'), r.error);
  await c.query(`update lots set statutory_warranty = true where id = ${ACTL}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${ACTL}`); ok('never a listing with a statutory warranty', r.error?.includes('we never give a statutory warranty'), r.error);

  // Queensland: the seller accepts the highest bid from their dashboard; the consultant offers it; the buyer signs; sold
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.A}', 8000, 24, false, null, '[]', 'Pat Consultant')`); ok("after: no offer before the seller's written agreement", r.error?.includes('seller_not_agreed'), r.error);
  r = await as('A', `select seller_accept_after(${AA.QLD}, 8000)`); ok('after: only the seller agrees a price', r.error?.includes('forbidden'), r.error);
  r = await as('anon', `select seller_accept_after(${AA.QLD}, 8000)`); ok('after: not signed out', !!r.error);
  r = await as('S', `select seller_accept_after(${AA.QLD}, 8000.5)`); ok('after: a price in whole dollars', r.error?.includes('amount_needed'), r.error);
  r = await as('S', `select seller_accept_after(${AA.QLD}, 8000) id`); const DQ = r.rows?.[0]?.id; ok('after: the seller agrees to sell for $8,000 or more', !!DQ, r.error);
  r = await as('service', `select action, amount, via from seller_decisions where id = '${DQ}'`); ok("after: recorded as the seller's own written instruction", r.rows?.[0]?.action === 'accept_after' && Number(r.rows[0].amount) === 8000 && r.rows[0].via === 'portal', JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from outbox where dedupe_key like 'after-agreed:${DQ}%'`); ok('after: and the consultant is told', r.rows?.[0]?.n >= 1);
  r = await as('A', `select admin_after_offer(${AA.QLD}, '${U.A}', 8000, 24, false, null, '[]', 'Pat Consultant')`); ok('after: only staff send offers', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.A}', 7900, 24, false, null, '[]', 'Pat Consultant')`); ok("after: never below the seller's price", r.error?.includes('below_seller_price') && r.error?.includes('$8,000'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.ADM}', 8000, 24, false, null, '[]', 'Pat Consultant')`); ok('after: only to someone who bid on it or watched it', r.error?.includes('not_interested'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.NEW}', 8000, 24, false, null, '[]', 'Pat Consultant')`); ok('after: never to a suspended account', r.error?.includes('account_suspended'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.S}', 8000, 24, false, null, '[]', 'Pat Consultant')`); ok('after: never to the seller', r.error?.includes('own_vehicle'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.A}', 8000, 24, null, null, '[]', 'Pat Consultant')`); ok('after: staff confirm no statutory warranty applies', r.error?.includes('warranty_needed'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.A}', 8000, 24, true, 'Dealer guarantee: 3 months', '[]', 'Pat Consultant')`); ok('after: never with a statutory warranty', r.error?.includes('warranty_applies'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.A}', 8000, 24, false, null, '[]', '')`); ok('after: someone signs it for us', r.error?.includes('consultant_needed'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.A}', 8250, 24, false, null, '[]', 'Pat Consultant') j`); const OQ = r.rows?.[0]?.j?.id;
  ok('after: Queensland needs no forms beyond our contract: the offer goes to the highest bidder (above the seller\'s price is fine)', !!OQ && Number(r.rows[0].j.total) > 8250, JSON.stringify(r));
  r = await as('service', `select title, body, link from notifications where user_id = '${U.A}' and title = 'An offer for you: the Brisbane ute'`);
  ok('after: the bidder gets the offer, with the all-in price and the time it closes', r.rows?.length === 1 && /for \$8,250 \(\$[\d,]+\.\d\d all-in with fees\), after the auction/.test(r.rows[0].body) && r.rows[0].link === `/offers/${OQ}`, JSON.stringify(r.rows));
  r = await as('ADM', `select admin_after_offer(${AA.QLD}, '${U.B}', 8250, 24, false, null, '[]', 'Pat Consultant')`); ok('after: one open offer at a time', r.error?.includes('offer_open'), r.error);
  r = await as('A', `select count(*)::int n from second_chance_offers where id = '${OQ}'`); ok('after: the buyer reads their own offer', r.rows?.[0]?.n === 1);
  r = await as('B', `select count(*)::int n from second_chance_offers where id = '${OQ}'`); ok('after: nobody else does', r.rows?.[0]?.n === 0);
  r = await as('B', `select respond_after_offer('${OQ}', true, 'Amy Ash')`); ok('after: only the buyer it was made to can answer', r.error?.includes('offer_not_found'), r.error);
  r = await as('A', `select respond_after_offer('${OQ}', true, 'Someone Else')`); ok('after: signing means typing the name on the account', r.error?.includes('sign_name') && r.error?.includes('Amy Ash'), r.error);
  r = await as('A', `select respond_after_offer('${OQ}', true, '  amy   ash ') j`); const ansQ = r.rows?.[0]?.j || {};
  ok('after: Queensland (no cooling-off): signed and sold at once', ansQ.status === 'accepted' && !!ansQ.invoice_id, JSON.stringify(r));
  r = await as('service', `select l.status, l.sold_via, l.winner_id, l.sold_price, i.sold_via iv, i.price, o.status os, o.signed_name, o.terms_version, o.invoice_id = i.id same
    from lots l join invoices i on i.lot_id = l.id join second_chance_offers o on o.lot_id = l.id where l.id = ${AA.QLD}`);
  ok('after: the vehicle is sold after the auction, the invoice made, the signature and terms version kept', r.rows?.[0]?.status === 'sold' && r.rows[0].sold_via === 'after_auction' && r.rows[0].winner_id === U.A
    && Number(r.rows[0].sold_price) === 8250 && r.rows[0].iv === 'after_auction' && r.rows[0].os === 'accepted' && r.rows[0].signed_name === 'amy ash' && r.rows[0].terms_version === '2026-10-27' && r.rows[0].same, JSON.stringify(r.rows));
  r = await as('service', `select status from lots where relisted_from = ${AA.QLD}`); ok('after: its relist for the next auction is cancelled', r.rows?.length === 1 && r.rows[0].status === 'cancelled', JSON.stringify(r.rows));
  await as('service', `select queue_status_notices()`);
  r = await as('service', `select (select body from outbox where dedupe_key like 'seller-sold:${AA.QLD}%' limit 1) s, (select body from notifications where user_id = '${U.B}' and title = 'The Brisbane ute has sold') b`);
  ok('after: the seller hears it is sold after the auction, and the other bidders that it sold', /sold after the auction, at the price you agreed/.test(r.rows?.[0]?.s || '') && /after the auction/.test(r.rows[0].b || ''), JSON.stringify(r.rows));

  // South Australia: the seller agrees in writing to the consultant; the state's forms; a cooling-off period, then sold
  r = await as('ADM', `select admin_seller_agreed(${AA.SA}, 7800, 'phone')`); ok('after: staff record how the seller confirmed it in writing', r.error?.includes('note_needed'), r.error);
  r = await as('A', `select admin_seller_agreed(${AA.SA}, 7800, 'Email from the seller, 26 Oct 10:15 am')`); ok('after: only staff record it', r.error?.includes('forbidden'), r.error);
  r = await as('ADM', `select admin_seller_agreed(${AA.SA}, 7800, 'Email from the seller, 26 Oct 10:15 am') id`); ok('after: recorded', !!r.rows?.[0]?.id, r.error);
  r = await as('service', `select body from outbox where dedupe_key like 'after-agreed-seller:%' and body like '%$7,800 or more%' limit 1`); ok('after: and confirmed to the seller in writing', /If that isn't right, tell us straight away/.test(r.rows?.[0]?.body || ''), JSON.stringify(r.rows));
  r = await as('ADM', `select admin_after_offer(${AA.SA}, '${U.B}', 7800, 24, false, null, '[]', 'Pat Consultant')`);
  ok("after: South Australia needs the state's forms with the offer", r.error?.includes('forms_needed') && r.error?.includes('section 18C'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.SA}, '${U.B}', 7800, 24, false, null, $1::jsonb, 'Pat Consultant')`, [JSON.stringify([{ name: 'Form', path: '999/x.pdf' }])]);
  ok('after: only documents uploaded for this vehicle', r.error?.includes('bad_docs'), r.error);
  const docs = [1, 2, 3].map((n) => ({ name: `SA form ${n}`, path: `${AA.SA}/${'0'.repeat(8)}-0000-4000-8000-00000000000${n}.pdf` }));
  r = await as('ADM', `select admin_after_offer(${AA.SA}, '${U.B}', 7800, 24, false, null, $1::jsonb, 'Pat Consultant') j`, [JSON.stringify(docs)]);
  const OS = r.rows?.[0]?.j?.id; ok('after: with the forms, the offer goes', !!OS, r.error);
  r = await as('B', `select respond_after_offer('${OS}', true, 'Amy Ash') j`); const ansS = r.rows?.[0]?.j || {};
  ok('after: South Australia: signed, then a cooling-off period of 3 business days (the law gives 2)', ansS.status === 'cooling_off' && new Date(ansS.cooling_off_until) > new Date(Date.now() + 2 * 86400_000), JSON.stringify(r));
  r = await as('service', `select status, (select count(*)::int from invoices where lot_id = ${AA.SA}) inv, deposit_committed('${U.B}') dc from lots where id = ${AA.SA}`);
  ok('after: nothing is sold or invoiced during it (and it holds a bidding deposit, where those are on)', r.rows?.[0]?.status === 'passed' && r.rows[0].inv === 0 && Number(r.rows[0].dc) > 0, JSON.stringify(r.rows));
  r = await as('service', `select (select body from notifications where user_id = '${U.B}' and title = 'Agreed: the Adelaide wagon for $7,800') b, (select body from outbox where dedupe_key like 'after-agreed-seller-buyer:${OS}%' limit 1) s`);
  ok('after: the buyer is told when the cooling-off ends (SA time) and that nothing is taken before then; the seller that it isn\'t final', /until .+ \(SA time\): cancel on the offer page, free/.test(r.rows?.[0]?.b || '') && /We don't take any money before then/.test(r.rows[0].b) && /it isn't final yet/.test(r.rows[0].s || ''), JSON.stringify(r.rows));
  r = await as('ADM', `select admin_after_offer(${AA.SA}, '${U.A}', 7800, 24, false, null, $1::jsonb, 'Pat Consultant')`, [JSON.stringify(docs)]); ok('after: no second offer during the cooling-off period', r.error?.includes('offer_open'), r.error);
  r = await as('S', `select seller_withdraw_after(${AA.SA})`); ok("after: once a buyer has signed, the seller can't back out from the dashboard", r.error?.includes('after_agreed'), r.error);
  r = await as('ADM', `select admin_after_withdraw('${OS}', 'x')`); ok("after: nor can staff withdraw it (only the buyer can cancel in cooling-off)", r.error?.includes('after_agreed'), r.error);
  r = await as('service', `select id from lots where relisted_from = ${AA.SA} and status = 'draft'`); const RSA = Number(r.rows?.[0]?.id);
  await as('ADM', `update lots set sale_id = ${NEXT} where id = ${RSA}`);
  r = await as('ADM', `update lots set status = 'live' where id = ${RSA}`); ok("after: its relist can't go live while the deal is open", r.error?.includes('open offer to sell it after the auction'), r.error);
  await as('service', `select finish_after_offers()`);
  r = await as('service', `select status from second_chance_offers where id = '${OS}'`); ok('after: the clock leaves it until the cooling-off ends', r.rows?.[0]?.status === 'cooling_off', JSON.stringify(r.rows));
  await c.query(`update second_chance_offers set cooling_off_until = now() - interval '1 second' where id = '${OS}'`);
  r = await as('B', `select cancel_after_offer('${OS}')`); ok("after: no cancelling once the cooling-off period is over", r.error?.includes('cooling_over'), r.error);
  r = await as('service', `select finish_after_offers() n`); ok('after: then the clock makes the sale', Number(r.rows?.[0]?.n) >= 1, r.error);
  r = await as('service', `select l.status, l.sold_via, i.price, o.status os, o.invoice_id = i.id same, (select status from lots where id = ${RSA}) rel from lots l join invoices i on i.lot_id = l.id join second_chance_offers o on o.id = '${OS}' where l.id = ${AA.SA}`);
  ok('after: sold after the auction at the end of the cooling-off, with its invoice; the relist cancelled', r.rows?.[0]?.status === 'sold' && r.rows[0].sold_via === 'after_auction' && Number(r.rows[0].price) === 7800 && r.rows[0].os === 'accepted' && r.rows[0].same && r.rows[0].rel === 'cancelled', JSON.stringify(r.rows));

  // New South Wales: the buyer changes their mind in the cooling-off period (free)
  r = await as('S', `select seller_accept_after(${AA.NSW}, 7600) id`); ok('after: NSW seller agrees', !!r.rows?.[0]?.id, r.error);
  const docsN = [1, 2].map((n) => ({ name: `NSW Form ${n}`, path: `${AA.NSW}/${'0'.repeat(8)}-0000-4000-8000-00000000001${n}.pdf` }));
  r = await as('ADM', `select admin_after_offer(${AA.NSW}, '${U.A}', 7600, 24, false, null, $1::jsonb, 'Pat Consultant') j`, [JSON.stringify(docsN)]);
  const ON = r.rows?.[0]?.j?.id; ok('after: NSW offer with Forms 5 and 12', !!ON, r.error);
  r = await as('A', `select respond_after_offer('${ON}', true, 'Amy Ash') j`); ok('after: NSW buyer signs: cooling-off', r.rows?.[0]?.j?.status === 'cooling_off', JSON.stringify(r));
  r = await as('B', `select cancel_after_offer('${ON}')`); ok('after: only the buyer cancels', r.error?.includes('offer_not_found'), r.error);
  r = await as('A', `select cancel_after_offer('${ON}') id`); ok('after: the buyer cancels in the cooling-off period', Number(r.rows?.[0]?.id) === AA.NSW, r.error);
  r = await as('service', `select o.status, o.cancel_reason, l.status ls, (select count(*)::int from invoices where lot_id = ${AA.NSW}) inv,
    (select count(*)::int from outbox where dedupe_key like 'after-cancelled-seller:${ON}%') s from second_chance_offers o join lots l on l.id = o.lot_id where o.id = '${ON}'`);
  ok("after: free: nothing invoiced, still the seller's, and the seller is told", r.rows?.[0]?.status === 'cancelled' && r.rows[0].cancel_reason === 'cooling_off' && r.rows[0].ls === 'passed' && r.rows[0].inv === 0 && r.rows[0].s >= 1, JSON.stringify(r.rows));
  r = await as('A', `select cancel_after_offer('${ON}')`); ok('after: only once', r.error?.includes('offer_closed'), r.error);
  // a new offer to B, which nobody answers in time; then the seller changes their mind
  r = await as('ADM', `select admin_after_offer(${AA.NSW}, '${U.B}', 7600, 4, false, null, $1::jsonb, 'Pat Consultant') j`, [JSON.stringify(docsN)]);
  const ON2 = r.rows?.[0]?.j?.id; ok('after: a fresh offer to another bidder', !!ON2, r.error);
  await c.query(`update second_chance_offers set expires_at = now() - interval '1 second' where id = '${ON2}'`);
  r = await as('B', `select respond_after_offer('${ON2}', true, 'Amy Ash')`); ok("after: an offer can't be accepted once it has expired", r.error?.includes('offer_expired'), r.error);
  await as('service', `select finish_after_offers()`);
  r = await as('ADM', `select admin_after_offer(${AA.NSW}, '${U.X}', 7700, 24, false, null, $1::jsonb, 'Pat Consultant') j`, [JSON.stringify(docsN)]);
  const ON3 = r.rows?.[0]?.j?.id; ok('after: offered to a watcher', !!ON3, r.error);
  r = await as('S', `select seller_withdraw_after(${AA.NSW}) id`); ok('after: the seller changes their mind before anyone accepts', !!r.rows?.[0]?.id, r.error);
  r = await as('service', `select status, cancel_reason from second_chance_offers where id = '${ON3}'`); ok("after: the open offer is withdrawn with them", r.rows?.[0]?.status === 'withdrawn' && /changed their mind/.test(r.rows[0].cancel_reason), JSON.stringify(r.rows));
  r = await as('service', `select count(*)::int n from notifications where user_id = '${U.X}' and title = 'The offer for the Sydney hatch has been withdrawn'`); ok('after: and the buyer is told', r.rows?.[0]?.n === 1);
  r = await as('ADM', `select admin_after_offer(${AA.NSW}, '${U.B}', 7700, 24, false, null, $1::jsonb, 'Pat Consultant')`, [JSON.stringify(docsN)]); ok('after: no offer without the seller\'s agreement', r.error?.includes('seller_not_agreed'), r.error);

  // Victoria and Tasmania
  r = await as('S', `select seller_accept_after(${AA.VIC}, 7000)`); ok('after: Victoria: the seller can\'t agree a sale after the auction', r.error?.includes('after_closed') && r.error?.includes('Victoria'), r.error);
  r = await as('ADM', `select admin_after_offer(${AA.VIC}, '${U.A}', 8000, 24, false, null, '[]', 'Pat Consultant')`); ok('after: and staff can\'t offer it', r.error?.includes('after_closed'), r.error);
  await c.query(`update settings set value = value || '{"after_auction_states": ["QLD","NSW","WA","SA","ACT","TAS","VIC"]}' where key = 'selling'`);
  r = await as('service', `select (after_auction_check(${AA.TAS})->>'ok')::boolean t, (after_auction_check(${AA.VIC})->>'ok')::boolean v, after_auction_states() s`);
  ok('after: Tasmania once switched on (with the licence); Victoria never, whatever the setting', r.rows?.[0]?.t === true && r.rows[0].v === false && !r.rows[0].s.includes('VIC'), JSON.stringify(r.rows));
  await c.query(`update settings set value = value || '{"after_auction_states": ["QLD","NSW","WA","SA","ACT"]}' where key = 'selling'`);
  r = await as('service', `select after_auction_check(${AA.QLD})->>'code' c`); ok('after: a sold vehicle can\'t be sold again', r.rows?.[0]?.c === 'not_passed', JSON.stringify(r.rows));
  await c.query(`update seller_agreements set signed_at = now() - interval '91 days' where lot_id = ${AA.TAS}`);
  await c.query(`update settings set value = value || '{"after_auction_states": ["QLD","NSW","WA","SA","ACT","TAS"]}' where key = 'selling'`);
  r = await as('service', `select after_auction_check(${AA.TAS})->>'code' c`); ok("after: not once the seller's 90-day authority has ended", r.rows?.[0]?.c === 'authority', JSON.stringify(r.rows));
  await c.query(`update settings set value = value || '{"after_auction_states": ["QLD","NSW","WA","SA","ACT"]}' where key = 'selling'`);

  // the cooling-off period: business days after the day of signing, in the state's own time
  r = await as('service', `select cooling_off_end('2026-10-23 10:00+10', 3, 'Australia/Adelaide') = ('2026-10-28 23:59:59'::timestamp at time zone 'Australia/Adelaide') sa,
    cooling_off_end('2026-12-24 12:00+10', 2, 'Australia/Sydney') = ('2026-12-30 23:59:59'::timestamp at time zone 'Australia/Sydney') xmas,
    cooling_off_end(now(), 0, 'Australia/Sydney') is null none`);
  ok('cooling-off: counts business days in the state\'s time, skipping weekends and public holidays', r.rows?.[0]?.sa === true && r.rows[0].xmas === true && r.rows[0].none === true, JSON.stringify(r.rows));

  for (const fn of [`after_auction_check(${AA.NSW})`, `after_seller_price(${AA.NSW})`, `after_seller_agree_core(${AA.NSW}, 1, 'portal', null)`, `after_sale_complete(gen_random_uuid())`,
    `finish_after_offers()`, `after_seller_text(${AA.NSW})`, `after_interested(${AA.NSW})`]) {
    r = await as('A', `select ${fn}`); ok(`after: members can't call ${fn.split('(')[0]}`, !!r.error, r.error);
  }
  for (const fn of [`seller_accept_after(${AA.NSW}, 1)`, `seller_withdraw_after(${AA.NSW})`, `respond_after_offer(gen_random_uuid(), false, '')`, `cancel_after_offer(gen_random_uuid())`,
    `admin_after_offer(${AA.NSW}, '${U.A}', 1, 24, false, null, '[]', 'x')`, `seller_lot_after(${AA.NSW})`, `admin_seller_agreed(${AA.NSW}, 1, 'xxxxxxxxxxxx')`]) {
    r = await as('anon', `select ${fn}`); ok(`after: signed-out visitors can't call ${fn.split('(')[0]}`, !!r.error, r.error);
  }
  await c.query(`update settings set value = value || '{"require_checks": true}' where key = 'selling'`);
}

// ---------- the seed as it really runs (live-only on): its sample vehicles wait in a sample live auction ----------
{
  const sa = new pg.Client({ ...PG, database: 'postgres' }); await sa.connect();
  await sa.query('drop database if exists tyrebiter_seedcheck'); await sa.query('create database tyrebiter_seedcheck'); await sa.end();
  const sc = new pg.Client({ ...PG, database: 'tyrebiter_seedcheck' }); await sc.connect();
  await sc.query(fs.readFileSync(ROOT + '/tests/db/supabase_base.sql', 'utf8'));
  for (const f of fs.readdirSync(M + 'migrations').sort()) { await sc.query(fs.readFileSync(M + 'migrations/' + f, 'utf8')); }
  await sc.query(fs.readFileSync(M + 'seed.sql', 'utf8'));
  let q = await sc.query(`select slug, mode, live_status, auctioneer, auto_advance, published, extract(isodow from starts_at at time zone 'Australia/Brisbane')::int dow,
    to_char(starts_at at time zone 'Australia/Brisbane', 'HH24:MI') t, starts_at > now() + interval '1 day' later from sales`);
  const sale = q.rows[0] || {};
  ok('seed: a sample live auction, on a Thursday at 7pm (Brisbane), that the clock never runs by itself', q.rows.length === 1 && sale.slug === 'sample-live-auction' && sale.mode === 'live' && sale.live_status === 'scheduled'
    && sale.auctioneer === 'Sample Auctioneer' && sale.auto_advance === false && sale.published && sale.dow === 4 && sale.t === '19:00' && sale.later, JSON.stringify(q.rows));
  q = await sc.query(`select l.id, l.live_state, l.method, l.buy_now_price, l.estimate_low::int lo, l.estimate_high::int hi, p.reserve_price, char_length(coalesce(p.estimate_basis, '')) basis,
    l.registration, l.roadworthy_issued_on, roadworthy_needed(coalesce(l.rego_state, l.state), l.year, l.category, l.gvm_kg) cert, l.ends_at > now() future
    from lots l join lot_private p on p.lot_id = l.id where l.status = 'live' order by l.sale_order`);
  const lots = q.rows;
  ok('seed: every sample vehicle waits in it, with no Buy Now', lots.length === 10 && lots.every((x) => x.live_state === 'waiting' && x.method === 'auction' && x.buy_now_price === null && x.future), JSON.stringify(lots));
  ok('seed: each has an estimate within the rule, above the reserve, with its basis on file', lots.every((x) => x.lo > 0 && x.hi >= x.lo && x.hi <= Math.max(x.lo * 1.25, x.lo + 1000)
    && (x.reserve_price === null || Number(x.reserve_price) <= x.lo) && x.basis >= 20), JSON.stringify(lots));
  ok("seed: the seller's certificate where the state needs one to transfer the registration", lots.every((x) => (x.registration === 'registered' && x.cert) ? !!x.roadworthy_issued_on : x.roadworthy_issued_on === null), JSON.stringify(lots));
  await sc.end();
  const sd = new pg.Client({ ...PG, database: 'postgres' }); await sd.connect(); await sd.query('drop database if exists tyrebiter_seedcheck'); await sd.end();
}

console.log(`\n${pass} passed, ${failN} failed`);
fails.forEach((f) => console.log(process.env.GITHUB_ACTIONS ? '::error title=Database test::' + f.replace(/\n/g, ' ') : 'FAIL: ' + f));
await c.end();
process.exit(failN ? 1 : 0);
