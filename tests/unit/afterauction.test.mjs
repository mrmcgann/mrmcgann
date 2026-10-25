// Selling after the auction (migrations 26 and 27): the words buyers, sellers and staff see, the statutory warranty check, and
// the state rules in step with the database.
import fs from 'fs';
import { AFTER_DEFAULT, afterStatusLabel, afterWarrantyLine, coolingLine, coolingOffAd, coolingOffSign, sellerAfterIntro, stateTime, warrantyFree } from '../../src/lib/afterAuction.ts';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log('FAIL', name, detail ?? ''); } };
const now = new Date('2026-10-26T00:00:00Z');

// the Queensland consignment sign (MDCA Regulation 2014 s 9): near the price, and in every advertisement
ok('sign: Queensland listings say no cooling-off, sale on consignment', coolingOffSign('qld') === 'No cooling-off period—sale on consignment.' && coolingOffSign('NSW') === null && coolingOffSign(null) === null);
ok('sign: and every Queensland advertisement says no cooling-off period applies', coolingOffAd('QLD') === 'No cooling-off period applies' && coolingOffAd('SA') === null);

// times in the state's own clock
ok('time: the end of a South Australian cooling-off period, in SA time', stateTime('2026-10-28T13:29:59Z', 'Australia/Adelaide', 'SA') === 'Wednesday 28 October, 11:59 pm (SA time)', stateTime('2026-10-28T13:29:59Z', 'Australia/Adelaide', 'SA'));
const sa = { state: 'SA', tz: 'Australia/Adelaide', cooling_days: 3, cooling_law: 'South Australian law gives a buyer from a dealer 2 clear business days to change their mind.' };
ok('cooling-off: before signing, the law', coolingLine(sa, null) === sa.cooling_law);
ok('cooling-off: after signing, the deadline, free, nothing taken', /^You can change your mind until Wednesday 28 October, 11:59 pm \(SA time\): cancel on this page, free\. Nothing is invoiced or taken before then\.$/.test(coolingLine(sa, '2026-10-28T13:29:59Z')), coolingLine(sa, '2026-10-28T13:29:59Z'));
ok('cooling-off: none (Queensland) says so', coolingLine({ state: 'QLD', tz: 'Australia/Brisbane', cooling_days: 0, cooling_law: 'No cooling-off period—sale on consignment.' }, '2026-10-28T00:00:00Z') === 'No cooling-off period—sale on consignment.');

// the warranty statement on an offer
ok('warranty: one applies, with what it is, and we meet it', afterWarrantyLine({ warranty: true, warranty_text: 'Dealer guarantee: 3 months or 5,000 km' }) === 'A statutory warranty applies to this sale: Dealer guarantee: 3 months or 5,000 km. We meet it for you as the dealer.');
ok('warranty: none applies', afterWarrantyLine({ warranty: false }) === 'No statutory warranty applies to this sale.');
const words = JSON.stringify([afterWarrantyLine({ warranty: false }), afterWarrantyLine({ warranty: true, warranty_text: 'x' })]);
ok('warranty: never "no warranty" or "non-refundable"', !/no warranty|non-refundable/i.test(words), words);

// we never give a statutory warranty: clear of them only well past the limits (the same cases and words as the DB test)
const YR = now.getFullYear();
const wf = (st, year, odometer, category, gvm = null) => warrantyFree(st, { year, odometer, category, gvm, now });
const W = [
  [wf('NSW', YR - 3, 60000, 'cars'), false, `New South Wales: the dealer guarantee covers a vehicle sold by a dealer, even for its owner, up to 10 years old and 160,000 km, and this one may be within it (${YR - 3}, 60,000 km)`],
  [wf('NSW', YR - 10, 90000, 'cars'), false], [wf('NSW', YR - 11, 90000, 'cars'), false],
  [wf('NSW', YR - 12, 90000, 'cars'), true, `New South Wales: the dealer guarantee doesn't cover a vehicle more than 10 years old (this one is from ${YR - 12})`],
  [wf('NSW', YR - 3, 160001, 'cars'), true, "New South Wales: the dealer guarantee doesn't cover a vehicle over 160,000 km"],
  [wf('NSW', YR - 2, 20000, 'trucks', 8000), true, "New South Wales: the dealer guarantee doesn't cover a vehicle over 4.5 tonnes GVM"],
  [wf('SA', YR - 2, 5000, 'motorbikes'), true, "South Australia: the dealer's duty to repair doesn't cover a second-hand motorcycle"],
  [wf('WA', YR - 13, 150000, 'utes'), false], [wf('WA', YR - 14, 150000, 'utes'), true],
  [wf('ACT', YR - 1, 1000, 'motorbikes'), true, "The ACT: the dealer's duty to repair doesn't cover a second-hand motorcycle"],
  [wf('QLD', YR - 1, 1000, 'cars'), true, "Queensland: no statutory warranty on a sale on consignment for an owner who isn't a motor dealer"],
  [wf('NSW', null, 50000, 'cars'), null, "New South Wales: add its year and odometer to check that the dealer guarantee doesn't cover it"],
  [wf('SA', YR - 5, null, 'boats'), true, "South Australia: the dealer's duty to repair doesn't cover boats"],
  [wf('NSW', YR - 8, null, 'caravans'), false, `New South Wales: the dealer guarantee covers a trailer or caravan sold by a dealer, even for its owner, up to 10 years old, and this one may be within it (${YR - 8})`],
  [wf('TAS', YR - 9, 60000, 'cars'), true, `Tasmania: the statutory warranty doesn't cover a vehicle more than 7 years old (this one is from ${YR - 9})`],
  [wf('NT', YR - 2, 31000, 'motorbikes'), true, "The Northern Territory: the statutory warranty doesn't cover a motorcycle over 30,000 km"],
];
const wbad = W.filter(([g, free, why]) => g.free !== free || (why !== undefined && g.why !== why)).map(([g]) => JSON.stringify(g));
ok('warranty: clear of every statutory warranty only well past the limits, state by state', wbad.length === 0, wbad.join(' | '));
ok("warranty: Victoria never; no state, can't tell", wf('VIC', YR - 20, 300000, 'cars').free === false && wf('', YR - 20, 300000, 'cars').free === null);
ok('warranty: the words never say "no warranty"', !W.some(([g]) => /no warranty/i.test(g.why)));

// the seller's dashboard, before they agree a price (in step with the pass-in notice, after_seller_text)
const intro = (v) => sellerAfterIntro({ not_offered: false, highest: null, defaulted: false, interested: 2, ...v });
ok('seller: passed in below the reserve: accept the highest bid or name a price', intro({ highest: 7750 }) === "Bidding stopped below your reserve, but you can still sell it now. Accept the highest bid, or tell us the lowest price you'd take, and your consultant offers it to the bidder. Nothing is sold until a buyer signs.", intro({ highest: 7750 }));
ok("seller: not offered, with an early bid", /^The auction finished before it was offered, but you can still sell it now\. Accept the highest early bid/.test(intro({ not_offered: true, highest: 500 })), intro({ not_offered: true, highest: 500 }));
ok('seller: no bids: name a price for the people who watched it', /^Nobody bid this time, .+ offers it to the people who watched it\./.test(intro({})), intro({}));
ok("seller: the buyer didn't pay: no bid to accept, offered to someone else", /^The buyer didn't pay, so that sale was cancelled\. You can still sell it to someone else/.test(intro({ defaulted: true, highest: 9000 })) && !/Accept the highest/.test(intro({ defaulted: true, highest: 9000 })));
ok('seller: nobody to offer it to: no promise', intro({ interested: 0, highest: null }) === "Nobody bid on it or watched it, so there's nobody to offer it to now. It goes into the next auction.");
const sqlText = fs.readFileSync(new URL('../../supabase/migrations/20261026000026_after_auction_sales.sql', import.meta.url), 'utf8');
ok("seller: the pass-in notice says the same (accept the highest bid; the people who watched it; nothing when nobody's interested)", sqlText.includes("tell us the lowest price you''d take, and we''ll offer it to the bidder.")
  && sqlText.includes("we''ll offer it to the people who watched it.") && sqlText.includes("or after_interested(p_lot) = 0 then return ''"));

ok('status: in words',afterStatusLabel({ status: 'cooling_off', expires_at: now.toISOString() }) === 'agreed, in the cooling-off period' && afterStatusLabel({ status: 'pending', expires_at: '2000-01-01T00:00:00Z' }) === 'expired');

// in step with the database (migration 26) and the register
const sql = fs.readFileSync(new URL('../../supabase/migrations/20261026000026_after_auction_sales.sql', import.meta.url), 'utf8');
ok('database: on by default in the same states', sql.includes(`'{"after_auction_states": [${AFTER_DEFAULT.map((s) => `"${s}"`).join(',')}]}'`), AFTER_DEFAULT.join());
ok('database: cooling-off a business day longer (NSW 2, SA 3, ACT 4), none elsewhere', /when 'NSW' then jsonb_build_object\('allowed', v_on, 'cooling_days', 2/.test(sql) && /when 'SA' then jsonb_build_object\('allowed', v_on, 'cooling_days', 3/.test(sql)
  && /when 'ACT' then jsonb_build_object\('allowed', v_on, 'cooling_days', 4/.test(sql) && /when 'QLD' then jsonb_build_object\('allowed', v_on, 'cooling_days', 0/.test(sql) && /when 'WA' then jsonb_build_object\('allowed', v_on, 'cooling_days', 0/.test(sql));
ok('database: never Victoria', /when 'VIC' then jsonb_build_object\('allowed', false/.test(sql) && sql.includes("where upper(trim(x)) in ('QLD','NSW','WA','SA','TAS','ACT','NT')"));
ok('database: the Queensland words match the sign', sql.includes("'No cooling-off period—sale on consignment."));
const sql27 = fs.readFileSync(new URL('../../supabase/migrations/20261027000027_never_a_warranty.sql', import.meta.url), 'utf8');
ok('database: the same check and words (migration 27)', sql27.includes("' covers a ' || kind || ' sold by a dealer, even for its owner, up to '") && sql27.includes("'Queensland: no statutory warranty on a sale on consignment for an owner who isn''t a motor dealer'")
  && sql27.includes("if age >= y + 2 then") && sql27.includes("raise exception 'warranty_applies:"));
ok('database: the forms each state needs', /Form 5: the motor dealer''s notice/.test(sql) && /Form 12: the cooling-off period notice/.test(sql) && /section 18C/.test(sql) && /Form 4: vehicle particulars/.test(sql) && /Schedule 5 terms/.test(sql) && /section 20\), endorsed and signed for the sale/.test(sql));
const reg = fs.readFileSync(new URL('../../docs/legal-basis.md', import.meta.url), 'utf8');
ok('register: selling after the auction, state by state', /### Selling after the auction, state by state/.test(reg) && /Williams v Pisano \[2015\] NSWCA 177/.test(reg) && /Sch 4 cl 9/.test(reg));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
