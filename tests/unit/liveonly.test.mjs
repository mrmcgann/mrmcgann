// Live auctions only, with an auction estimate; the seller sends the photos and video and we're never at the vehicle.
// node --experimental-strip-types tests/unit/liveonly.test.mjs
import { ESTIMATE_NOTE, allInMoney, estimateAllIn, estimateAllInText, estimateMaxHigh, estimateProblem, estimateText, hasEstimate } from '../../src/lib/estimate.ts';
import { certLine, certNeeded } from '../../src/lib/transfer.ts';
import { LISTING_CHECKS, PHOTO_CHECK, REMOTE_REPORT, RUNS_HINT, warrantyGuide, warrantySign } from '../../src/lib/listing.ts';
import { liveError } from '../../src/lib/live.ts';
import { MORE_SHOTS, PHOTO_RULES, SELLER_ACKS, VIDEO_STEPS } from '../../src/lib/sellForm.ts';
import { lotFees, priceBreakdown } from '../../src/lib/fees.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const F = { premium_rate: 0.1, admin_fee: 99, storage_per_day: 50, card_limit: 5000, surcharge_rate: 0, nrd_low: 500, nrd_high: 1000, nrd_split: 20000 };

// The estimate: the same rules as the database (lots_estimate_range, the estimate_rule triggers)
ok('estimate: a sensible range is fine', estimateProblem(14000, 17000, 13500) === null);
ok('estimate: both ends needed', /both ends/.test(estimateProblem(14000, null) || '') && /Add the auction estimate/.test(estimateProblem(null, null) || ''));
ok('estimate: whole dollars', /whole dollars/.test(estimateProblem(14000.5, 15000) || ''));
ok('estimate: high at least low', /at least the low end/.test(estimateProblem(15000, 14000) || ''));
ok('estimate: no wider than 25%', /Too wide/.test(estimateProblem(20000, 25001) || '') && estimateProblem(20000, 25000) === null, estimateProblem(20000, 25001));
ok('estimate: or $1,000 for cheaper vehicles', estimateProblem(2000, 3000) === null && /up to \$3,000/.test(estimateProblem(2000, 3001) || ''));
ok('estimate: the reserve is never above the low end', /reserve \(\$15,000\) is above the low end/.test(estimateProblem(14000, 17000, 15000) || '') && estimateProblem(14000, 17000, 14000) === null);
ok('estimate: the highest high end', estimateMaxHigh(20000) === 25000 && estimateMaxHigh(2000) === 3000);
ok('estimate: in words', estimateText({ estimate_low: 14000, estimate_high: 17000 }) === '$14,000–$17,000' && estimateText({ estimate_low: null, estimate_high: 1 }) === '' && !hasEstimate({}));
// all-in at each end: 10% premium + $250 transport, GST on the premium, $99 admin fee
const fees = lotFees(F, { fees: { premium_rate: 0.1, transport: 250 } });
const a = estimateAllIn({ estimate_low: 14000, estimate_high: 17000 }, fees);
ok('estimate: the all-in amounts at both ends', a?.[0] === priceBreakdown(14000, fees).total && a[1] === priceBreakdown(17000, fees).total && a[0] === 14000 + 1650 + 165 + 99, JSON.stringify(a));
ok('estimate: all-in shown in whole dollars when it is one', estimateAllInText({ estimate_low: 14000, estimate_high: 17000 }, fees) === '$15,914–$19,244', estimateAllInText({ estimate_low: 14000, estimate_high: 17000 }, fees));
ok('all-in: cents when there are cents (never rounded down)', allInMoney(15914.05) === '$15,914.05' && allInMoney(15914) === '$15,914');
ok('estimate: what it is and that the reserve is never above it', /guide, not a valuation or a promise/.test(ESTIMATE_NOTE) && /reserve is never above the low end/.test(ESTIMATE_NOTE) && /recent sales of similar vehicles/.test(ESTIMATE_NOTE));

// The certificate each state needs to transfer a registered vehicle (the same as roadworthy_needed() in the database)
const now = new Date('2026-10-22T00:00:00Z');
ok('certificate: Queensland safety certificate', certNeeded('QLD', 2015, 'cars', null, now) === 'safety certificate' && certNeeded('qld', 2015, 'motorbikes', null, now) === 'safety certificate');
ok('certificate: none for a light Queensland trailer or a heavy truck', certNeeded('QLD', 2015, 'trailers', 600, now) === null && certNeeded('QLD', 2015, 'trucks', 12000, now) === null);
ok('certificate: Victorian roadworthy, not for light trailers', certNeeded('VIC', 2020, 'utes', null, now) === 'roadworthy certificate' && certNeeded('VIC', 2020, 'trailers', 2000, now) === null && certNeeded('VIC', 2020, 'caravans', 5000, now) === 'roadworthy certificate');
ok('certificate: ACT over 6 years, NT 7 years or more', certNeeded('ACT', 2023, 'cars', null, now) === null && certNeeded('ACT', 2018, 'cars', null, now) === 'roadworthy inspection' && certNeeded('NT', 2019, 'cars', null, now) === 'roadworthy inspection' && certNeeded('NT', 2021, 'cars', null, now) === null);
ok('certificate: SA trailers and heavy vehicles 3 years or more, not cars', certNeeded('SA', 2015, 'cars', null, now) === null && certNeeded('SA', 2015, 'trailers', 2000, now) === 'inspection' && certNeeded('SA', 2025, 'trailers', 2000, now) === null && certNeeded('SA', 2015, 'trucks', 9000, now) === 'inspection');
ok('certificate: none in NSW, WA or TAS, or for boats and machinery', ['NSW', 'WA', 'TAS'].every((st) => certNeeded(st, 2001, 'cars', null, now) === null) && certNeeded('QLD', 2001, 'boats', null, now) === null && certNeeded('VIC', 2001, 'machinery', null, now) === null);
ok('certificate: an unknown year counts as old', certNeeded('ACT', null, 'cars', null, now) === 'roadworthy inspection');
const cl = certLine({ registration: 'registered', rego_state: 'QLD', year: 2015, category: 'cars', roadworthy_issued_on: '2026-10-12' });
ok('certificate: the listing line names who supplied it and when', /^Safety certificate supplied by the seller, issued 12 Oct 2026\. QLD needs it to transfer the registration\.$/.test(cl), cl);
ok('certificate: an exemption is shown as written', certLine({ registration: 'registered', rego_state: 'QLD', year: 2015, category: 'trailers', gvm_kg: 900, roadworthy_note: 'Exempt: garaged in an exempt area' }) === 'Exempt: garaged in an exempt area');
ok('certificate: none needed in NSW', certLine({ registration: 'registered', rego_state: 'NSW', year: 2015, category: 'cars' }) === 'Not needed to transfer a NSW registration.');
ok('certificate: unregistered', /sold unregistered/.test(certLine({ registration: 'unregistered', state: 'QLD' })));

// The statutory warranty: the sign beside the price, and what usually applies
ok('warranty: the sign', warrantySign(false) === 'No statutory warranty.' && /applies/.test(warrantySign(true) || '') && warrantySign(null) === null);
ok('warranty: none for a private owner\'s vehicle at auction (QLD)', /none applies to a private owner's vehicle sold at auction/.test(warrantyGuide('QLD', 'private', 'cars')));
ok("warranty: the ACT's duty to repair applies at auction, so we don't list a vehicle it could cover", /ACT: the dealer's duty to repair applies even at auction/.test(warrantyGuide('ACT', 'private', 'cars')) && /we don't list a vehicle it could cover/.test(warrantyGuide('ACT', 'private', 'cars')) && !/duty to repair/.test(warrantyGuide('ACT', 'private', 'motorbikes')));
ok("warranty: a motor dealer's own vehicle may carry one, so we don't list it", /Class A or B/.test(warrantyGuide('NSW', 'business', 'cars')) && /don't list it/.test(warrantyGuide('NSW', 'business', 'cars')));

// We're never at the vehicle: every check and word says so
ok('remote: the checks are of the seller\'s photos, video and the records', LISTING_CHECKS.length === 11 && LISTING_CHECKS.every(([, staff]) => !/on the vehicle itself|walkaround and visual|at the walkaround/i.test(staff)) && LISTING_CHECKS.filter(([, staff]) => /seller's (photo|video)|photos|video/.test(staff)).length >= 8);
ok('remote: the run check is from the video', /seller's video/.test(LISTING_CHECKS.find(([k]) => k === 'runs')[1]) && /seller's video/.test(RUNS_HINT.drives) && !/when we checked it/.test(Object.values(RUNS_HINT).join(' ')));
ok('remote: the condition report says where it comes from', /seller's photos and walkaround video/.test(REMOTE_REPORT) && /never at the vehicle/.test(REMOTE_REPORT));
ok('remote: the photos are the seller\'s, checked, with the location removed', /Taken by the seller/.test(PHOTO_CHECK) && /remove the camera's location/.test(PHOTO_CHECK));
ok('seller: what to photograph and film', PHOTO_RULES.length === 4 && /last 14 days/.test(PHOTO_RULES[0]) && /no filters/.test(PHOTO_RULES[1]) && /house numbers/.test(PHOTO_RULES[2]) && MORE_SHOTS.length >= 5 && VIDEO_STEPS.length === 5 && /from cold/.test(VIDEO_STEPS[0]) && /warning lights/.test(VIDEO_STEPS[1]));
ok('seller: they promise the photos and video are theirs, recent and unedited', /photos and a walkaround video/.test(SELLER_ACKS.find(([k]) => k === 'video')[1]) && /last 14 days/.test(SELLER_ACKS.find(([k]) => k === 'video')[1]) && /never at the vehicle/.test(SELLER_ACKS.find(([k]) => k === 'video')[1]));

// The engine's live-only refusals in plain words
for (const [code, words] of [['live_only:every vehicle is sold under the hammer, so it can\'t be offered to the next bidder', 'Every vehicle is sold under the hammer'],
  ['corrected_recently:its listing was corrected less than 24 hours ago, so it can\'t be offered yet', 'Its listing was corrected'],
  ['auctioneer_needed:add the auctioneer\'s name first', "Add the auctioneer's name first."],
  ['reserve_rule:a reserve can only be lowered ($9,500 now)', 'A reserve can only be lowered'],
  ['estimate_rule:the reserve ($11,000) can\'t be above the low estimate ($10,000)', "The reserve ($11,000) can't be above"],
  ['withdraw_closed:bids can be withdrawn only until the hammer falls in a live auction', 'Bids can be withdrawn only until the hammer falls']]) {
  ok(`words: ${code.split(':')[0]}`, (liveError(`ERROR: ${code}`) || '').startsWith(words), liveError(`ERROR: ${code}`));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
