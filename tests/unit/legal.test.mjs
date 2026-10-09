// Terms of sale, seller agreement, website terms and help: node --experimental-strip-types tests/unit/legal.test.mjs
import { TERMS, SELLER_AGREEMENT, WEBSITE_TERMS, HELP, PRIVACY, fillLegal, legalValues } from '../../src/content/legal.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const settings = { fees: { late_interest_rate: 10 }, business: {} };
const all = JSON.stringify(fillLegal({ TERMS, SELLER_AGREEMENT, WEBSITE_TERMS, HELP, PRIVACY }, settings));

ok('every {{TOKEN}} is filled', !/\{\{\w+\}\}/.test(all), (all.match(/\{\{\w+\}\}/g) || []).join(','));
ok('never says "no warranty"', !/no warranty/i.test(all));
ok('no "non-refundable" deposit wording', !/non-refundable/i.test(all));
ok('interest shown as a yearly rate', all.includes('10% a year'));
ok('interest token follows the setting', legalValues({ fees: { late_interest_rate: 7.5 } }).LATE_INTEREST === '7.5%');
ok('interest defaults to 10%', legalValues({}).LATE_INTEREST === '10%');

// Numbered sections run 1..n with no gaps or repeats (the summary isn't numbered)
const nums = (doc) => doc.map(([, t]) => (t.match(/^(\d+)\./) || [])[1]).filter(Boolean).map(Number);
const seq = (a) => a.every((n, i) => n === i + 1);
ok('terms numbered 1..20', seq(nums(TERMS)) && nums(TERMS).length === 20, nums(TERMS).join(','));
ok('seller agreement numbered in order', seq(nums(SELLER_AGREEMENT)), nums(SELLER_AGREEMENT).join(','));
ok('website terms numbered in order', seq(nums(WEBSITE_TERMS)), nums(WEBSITE_TERMS).join(','));
ok('section ids are unique', new Set([...TERMS, ...SELLER_AGREEMENT, ...WEBSITE_TERMS].map(([id]) => id)).size === TERMS.length + SELLER_AGREEMENT.length + WEBSITE_TERMS.length);

// Cross-references point at the right sections
const title = (id) => TERMS.find(([i]) => i === id)[1];
ok('section 9 is collection (storage, abandonment)', title('t-title').startsWith('9.'));
ok('section 11 is default', title('t-default').startsWith('11.'));
ok('section 12 is claims', title('t-claims').startsWith('12.'));
ok('section 16 is collecting from the seller', title('t-site').startsWith('16.'));
ok('section 17 is outages and events outside control', title('t-errors').startsWith('17.'));
ok('general is last', TERMS[TERMS.length - 1][0] === 't-general');

// The consumer-law protections the unfair contract terms laws look for
const terms = JSON.stringify(TERMS);
ok('ACL carve-out in liability', /Nothing in these terms excludes, restricts or changes any right/.test(terms));
ok('we answer for our own negligence', /responsible for loss caused by our own negligence/.test(terms));
ok('deposit or cancellation fee, never both', /one or the other, never both/.test(terms));
ok('shortfall capped at actual loss', /won’t claim more than our and the seller’s actual loss/.test(terms));
ok('reminder before cancelling', /remind you by SMS and email/.test(terms));
ok('force majeure gives a refund after 20 business days', /more than 20 business days/.test(terms));
ok('changes never apply to a sale already made', /never applies to a sale already made/.test(terms));
ok('indemnity reduced where we caused it', /doesn’t apply to the extent the loss was caused by us/.test(terms));
const web = JSON.stringify(WEBSITE_TERMS);
ok('website: suspension only on listed grounds, with reasons', /only if:/.test(web) && /We’ll tell you why/.test(web));
ok('website: notice of changes', /at least 14 days’ notice/.test(web));
ok('seller: listed vehicles keep their terms', /doesn’t apply to a vehicle already listed/.test(JSON.stringify(SELLER_AGREEMENT)));

const help = JSON.stringify(HELP);
ok('business day is defined', /“Business day” means/.test(terms));
ok('no storage before the transfer or when the delay is ours or the seller’s', /none before the registration transfer is complete/.test(terms) && /caused by us or the seller/.test(terms));
ok('title passes on payment; the transfer is the registration', /Ownership \(title\) passes to you when we receive full payment/.test(terms) && /Registration transfer:/.test(terms));
ok('help: offers open after the seller declines', /seller declines the highest bid/.test(help));
ok('help and summary agree on risk', /until your collection window ends/.test(terms) && /from the end of your collection window/.test(help));
ok('claims: longer window for title-type problems', /within 30 days of handover/.test(terms));
ok('seller: can pursue a non-paying buyer after 30 days', /you may pursue them yourself/.test(JSON.stringify(SELLER_AGREEMENT)));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
