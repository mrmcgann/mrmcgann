// Selling after the auction (migration 26): the words buyers, sellers and staff see, the statutory warranty guide, and
// the state rules in step with the database.
import fs from 'fs';
import { AFTER_DEFAULT, afterStatusLabel, afterWarrantyGuide, afterWarrantyLine, coolingLine, coolingOffAd, coolingOffSign, sellerAfterIntro, stateTime } from '../../src/lib/afterAuction.ts';

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

// the guide for staff, state by state (a private owner's vehicle, sold after the auction)
const g = (st, f) => afterWarrantyGuide(st, { now, ...f });
const car = { year: 2019, odometer: 80000, category: 'cars' };
ok('guide: Queensland: none (a consignment for a private seller)', g('QLD', car).applies === false);
ok('guide: NSW dealer guarantee for a car up to 10 years and 160,000 km', g('NSW', car).applies === true && /3 months or 5,000 km/.test(g('NSW', car).text));
ok('guide: NSW none for an older car, a heavy vehicle', g('NSW', { ...car, year: 2010 }).applies === false && g('NSW', { ...car, category: 'trucks' }).applies === false);
ok('guide: NSW motorcycles 3 months or 3,000 km', /3,000 km/.test(g('NSW', { year: 2023, odometer: 9000, category: 'motorbikes' }).text));
ok('guide: WA 3 months or 5,000 km up to 10 years and 150,000 km', g('WA', { ...car, price: 9000 }).applies === true && /3 months or 5,000 km/.test(g('WA', { ...car, price: 9000 }).text));
ok('guide: WA 1 month or 1,500 km up to 12 years and 180,000 km', /1 month or 1,500 km/.test(g('WA', { year: 2015, odometer: 170000, category: 'cars', price: 9000 }).text));
ok('guide: WA none under $4,000', g('WA', { ...car, price: 3500 }).applies === false);
ok('guide: SA 2 months or 3,000 km at $3,001 to $6,000; 3 months or 5,000 km over', /2 months or 3,000 km/.test(g('SA', { ...car, price: 5000 }).text) && /3 months or 5,000 km/.test(g('SA', { ...car, price: 9000 }).text));
ok('guide: SA none for motorcycles, or over 15 years', g('SA', { year: 2023, odometer: 9000, category: 'motorbikes' }).applies === false && g('SA', { year: 2009, odometer: 100000, category: 'cars', price: 9000 }).applies === false);
ok('guide: ACT duty to repair (check Schedule 1)', g('ACT', car).applies === true && /Schedule 1/.test(g('ACT', car).text));
ok('guide: Tasmania 3 months or 3,000 km under 7 years and 120,000 km', g('TAS', { year: 2022, odometer: 50000, category: 'cars' }).applies === true && g('TAS', { year: 2017, odometer: 50000, category: 'cars' }).applies === false);
ok('guide: NT 3 months or 5,000 km under 10 years and 160,000 km', g('NT', car).applies === true);
ok("guide: Victoria can't be sold after the auction", g('VIC', car).applies === false && /Victoria/.test(g('VIC', car).text));
ok('guide: nothing to go on', g('NSW', { category: 'cars' }).applies === null && g('', car).applies === null);

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
ok('database: the forms each state needs', /Form 5: the motor dealer''s notice/.test(sql) && /Form 12: the cooling-off period notice/.test(sql) && /section 18C/.test(sql) && /Form 4: vehicle particulars/.test(sql) && /Schedule 5 terms/.test(sql) && /section 20\), endorsed and signed for the sale/.test(sql));
const reg = fs.readFileSync(new URL('../../docs/legal-basis.md', import.meta.url), 'utf8');
ok('register: selling after the auction, state by state', /### Selling after the auction, state by state/.test(reg) && /Williams v Pisano \[2015\] NSWCA 177/.test(reg) && /Sch 4 cl 9/.test(reg));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
