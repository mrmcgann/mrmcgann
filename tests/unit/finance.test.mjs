// Repayment maths: node --experimental-strip-types tests/unit/finance.test.mjs
import { repayment, loan, listingEstimate, estimatePartner, fillReferral } from '../../src/lib/finance.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// $30,000 at 8% p.a. over 5 years, monthly: the textbook answer is $608.29
ok('monthly repayment', near(repayment(30000, 8, 60, 'monthly'), 608.29), repayment(30000, 8, 60, 'monthly'));
// Weekly is about a quarter of monthly (52 periods a year, a little less interest)
const w = repayment(30000, 8, 60, 'weekly');
ok('weekly repayment', w > 139 && w < 141, w);
ok('zero rate splits evenly', near(repayment(12000, 0, 12, 'monthly'), 1000));
ok('zero amount', repayment(0, 8, 60) === 0);
// A balloon lowers the repayment, and the balloon is paid at the end
const withBalloon = repayment(30000, 8, 60, 'monthly', 9000);
ok('balloon lowers repayments', withBalloon < 608.29 && withBalloon > 400, withBalloon);
ok('balloon capped at the loan', repayment(10000, 8, 60, 'monthly', 50000) >= 0);
const l = loan(30000, 8, 60, 'monthly', 0, 395, 8);
ok('totals include fees', near(l.totalPaid, 608.29 * 60 + 395 + 480, 1) && near(l.totalInterest, 608.29 * 60 - 30000, 1), JSON.stringify(l));

const P = (o) => ({ kind: 'finance', active: true, rate_from: 7, comparison_rate: 7.5, comparison_basis: '$30,000 secured loan over 5 years', min_amount: null, max_amount: null, ...o });
const partners = [P({ slug: 'a', rate_from: 9, comparison_rate: 9.6 }), P({ slug: 'b', rate_from: 7.5, comparison_rate: 8.1 }), P({ slug: 'c', rate_from: 6, comparison_rate: 6.4, min_amount: 50000 }), P({ slug: 'd', rate_from: 5, comparison_rate: null })];
ok('estimate uses the lowest eligible advertised rate', estimatePartner(partners, 20000)?.slug === 'b');
ok('estimate respects loan limits', estimatePartner(partners, 60000)?.slug === 'c');
ok('estimate needs a comparison rate', estimatePartner([P({ rate_from: 5, comparison_rate: null })], 20000) === null);
ok('no estimate without partners', listingEstimate(20000, []) === null);
ok('no estimate under the minimum price', listingEstimate(2000, partners, { min_price: 3000 }) === null);
ok('no estimate when switched off', listingEstimate(20000, partners, { show_on_listings: false }) === null);
const e = listingEstimate(20000, partners, { term_months: 60, deposit_pct: 10 });
ok('listing estimate', e && e.amount === 18000 && e.partner.slug === 'b' && near(e.weekly, repayment(18000, 7.5, 60, 'weekly')), JSON.stringify(e));
ok('no estimate without a comparison-rate example', listingEstimate(20000, [P({ comparison_basis: null })]) === null);
ok('referral links are filled and encoded', fillReferral('https://x.au/q?a={amount}&m={model}&z={missing}', { amount: 20000, model: 'Hi Lux' }) === 'https://x.au/q?a=20000&m=Hi%20Lux&z=');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
