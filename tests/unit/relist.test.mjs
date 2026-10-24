// Relisting a vehicle that didn't sell: the staff checklist per state, the seller's 90-day authority, and the words the
// seller sees (in step with the database's relist_seller_text).
import fs from 'fs';
import { authorityEnds, relistSteps, relistSellerLine, relistBackLine, AUTHORITY_DAYS } from '../../src/lib/relist.ts';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; console.log('FAIL', name, detail ?? ''); } };
const texts = (steps) => steps.map((s) => s.text).join(' | ');
const now = new Date('2026-10-25T00:00:00Z');
const sale = { saleTitle: 'Thursday night live', saleAt: '2026-11-05T09:00:00Z' };

ok('authority: 90 days from signing', AUTHORITY_DAYS === 90 && authorityEnds('2026-10-01T00:00:00Z')?.toISOString() === '2026-12-30T00:00:00.000Z');
ok('authority: none without a signature', authorityEnds(null) === null && authorityEnds('not a date') === null);

let s = relistSteps({ ...sale, state: 'VIC', registration: 'registered', year: 2015, category: 'cars', signedAt: '2026-10-01T00:00:00Z', passedAt: 5450 }, now);
ok('steps: the auction it goes into', /It goes into Thursday night live on/.test(texts(s)), texts(s));
ok('steps: reserve, a fresh estimate (with where bidding stopped), a fresh PPSR and the listing checks', /Agree the reserve with the seller/.test(texts(s)) && /fresh estimate.*\$5,450/.test(texts(s)) && /fresh PPSR search/.test(texts(s)) && /listing checks again/.test(texts(s)), texts(s));
ok('steps: Victoria, the roadworthy certificate less than 30 days before the new auction', /Victoria: the roadworthy certificate must be issued less than 30 days before the auction \(5 Nov 2026\)/.test(texts(s)), texts(s));
ok('steps: inside the authority, no warning', /authority to sell ends on 30 Dec 2026/.test(texts(s)) && s.every((x) => !x.warn), JSON.stringify(s));

s = relistSteps({ ...sale, state: 'QLD', registration: 'registered', year: 2012, category: 'utes', signedAt: '2026-08-01T00:00:00Z', passedAt: null }, now);
ok('steps: Queensland, the safety certificate within 2 months of the new auction', /Queensland: the safety certificate must be no more than 2 months old at the auction/.test(texts(s)), texts(s));
ok('steps: nobody bid last time', /nobody bid last time/.test(texts(s)), texts(s));
ok('steps: the authority ends before the auction: sign again (a warning)', s.some((x) => x.warn && /That's before the auction: ask them to sign the agreement again/.test(x.text)), JSON.stringify(s));

s = relistSteps({ ...sale, state: 'NSW', registration: 'unregistered', signedAt: '2026-10-01T00:00:00Z', passedAt: 5000, notOffered: true }, now);
ok("steps: not offered last time says so (not where bidding stopped)", /it wasn't offered last time/.test(texts(s)) && !/\$5,000/.test(texts(s)), texts(s));
s = relistSteps({ state: 'NSW', registration: 'registered', year: 2015, category: 'cars', signedAt: '2026-10-01T00:00:00Z' }, now);
ok('steps: no certificate step where the state needs none (NSW)', !/certificate|inspection/.test(texts(s)), texts(s));
ok('steps: no auction yet: choose one (a warning)', s[0].warn === true && /Choose the live auction/.test(s[0].text), JSON.stringify(s[0]));
s = relistSteps({ ...sale, state: 'ACT', registration: 'registered', year: 2015, category: 'cars' }, now);
ok('steps: another state with a certificate (ACT inspection)', /ACT: it needs a current roadworthy inspection/.test(texts(s)), texts(s));
ok('steps: no signed agreement: send the link (a warning)', s.some((x) => x.warn && /send the seller the agreement link/.test(x.text)), texts(s));
s = relistSteps({ ...sale, state: 'VIC', registration: 'unregistered', year: 2015, category: 'cars', signedAt: '2026-10-01T00:00:00Z' }, now);
ok('steps: unregistered: no certificate', !/certificate/.test(texts(s)), texts(s));

ok('seller: the next auction, with its date', /^We're offering it again in our live auction on .+ \(Brisbane time\)\.$/.test(relistSellerLine(sale.saleAt)), relistSellerLine(sale.saleAt));
ok('seller: the next auction, date to come', relistSellerLine(null) === "We're offering it again at our next live auction, and we'll tell you the date.");
ok('listing: back in an auction', /^It's back, in our live auction on/.test(relistBackLine(sale.saleAt)) && relistBackLine(null) === "It's back for auction.");

const sql = fs.readFileSync(new URL('../../supabase/migrations/20261025000025_relist_by_state.sql', import.meta.url), 'utf8');
ok('database: the seller hears the same words', sql.includes("We''re offering it again in our live auction on") && sql.includes("We''re offering it again at our next live auction, and we''ll tell you the date."));
ok('database: the seller can say no for free before it is listed', sql.includes("Tell us from your seller dashboard before it''s listed: there''s no fee."));
ok('database: the 90-day authority is checked when publishing', sql.includes("interval '90 days'") && sql.includes('authority to sell ends on'));
const all = JSON.stringify([relistSteps({ ...sale, state: 'VIC', registration: 'registered', year: 2015, category: 'cars' }, now), relistSellerLine(null), relistBackLine(null)]);
ok('words: never "no warranty" or "non-refundable"', !/no warranty|non-refundable/i.test(all));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
