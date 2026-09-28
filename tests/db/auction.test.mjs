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
await c.query(`update profiles set details_done=true, first_name='Amy', last_name='Ash', mobile='0411111111', mobile_verified=true, payment_method_id='pm_a', card_brand='Visa', card_last4='4242', id_status='verified' where id in ('${U.A}','${U.B}')`);
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
ok('anon reads live lots', r.rows?.length === 7);
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
ok('fees: 10% premium, 10% GST, $99 admin, 1.2% surcharge', Number(inv?.premium) === 320 && Number(inv?.gst) === 32 && Number(inv?.admin_fee) === 99 && Number(inv?.subtotal) === 3651 && Number(inv?.surcharge) === 43.81 && Number(inv?.total) === 3694.81, JSON.stringify(inv));
r = await as('A', `select * from invoices`); ok("A cannot see B's invoice", !r.rows?.some((x) => x.buyer_id === U.B));
r = await as('B', `select * from invoices`); ok('B sees own invoice', r.rows?.some((x) => Number(x.lot_id) === 10432));
r = await as('B', `update invoices set status='paid'`); ok('member cannot mark own invoice paid', r.count === 0 || !!r.error);

// ---------- deposit tier, Buy Now ----------
r = await as('A', `select buy_now(10633) id`); ok('Buy Now works for verified member', !!r.rows?.[0]?.id, r.error);
r = await as('service', `select mode, card_amount, balance_due, total from invoices where lot_id=10633`);
ok('$8,900 Buy Now -> $500 deposit + 1.2%', r.rows?.[0]?.mode === 'deposit' && Number(r.rows[0].card_amount) === 506 && Number(r.rows[0].balance_due) === 9478, JSON.stringify(r.rows));
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

console.log(`\n${pass} passed, ${failN} failed`);
fails.forEach((f) => console.log('FAIL:', f));
await c.end();
process.exit(failN ? 1 : 0);
