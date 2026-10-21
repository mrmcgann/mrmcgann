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
ok('section 16 is collecting from our depot', title('t-site').startsWith('16.'));
ok('section 17 is outages and events outside control', title('t-errors').startsWith('17.'));
ok('general is last', TERMS[TERMS.length - 1][0] === 't-general');

// The consumer-law protections the unfair contract terms laws look for
const terms = JSON.stringify(TERMS);
ok('ACL carve-out in liability', /Nothing in these terms excludes, restricts or changes any right/.test(terms));
ok('we answer for our own negligence', /responsible for loss caused by our own negligence/.test(terms));
ok('deposit kept or nothing, never a fee as well', /it’s the deposit or nothing, never both/.test(terms) && /There’s no cancellation fee/.test(terms));
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
const filled = JSON.stringify(fillLegal({ TERMS, HELP }, { fees: { pay_mode: 'deposit', deposit_rate: 0.1, deposit_min: 500, deposit_cap: 5000 } }));
ok('deposit: no card wording left for buyers', !/your card|card on file|add a card|card surcharge/i.test(JSON.stringify([TERMS, HELP, PRIVACY, WEBSITE_TERMS])));
ok('deposit: rule in words', filled.includes('The deposit is 10% of the most you want to bid, at least $500. A deposit of $5,000 lets you bid any amount.'));
ok('deposit: example follows the settings', filled.includes('a $2,000 deposit lets you bid up to $20,000'));
ok('deposit: no cap, no "any amount"', !JSON.stringify(fillLegal(TERMS, { fees: { pay_mode: 'deposit', deposit_cap: 0 } })).includes('any amount') && legalValues({ fees: { deposit_cap: 0 } }).DEPOSIT_CAP_PART === '');
ok('deposit: refunded in full unless the buyer didn’t pay', /kept only if the sale is cancelled because you didn’t pay/.test(terms) && /returned to your deposit in full/.test(terms));
ok('deposit: withdraw any time, back to where it came from', /We send it to the account it came from/.test(terms) && /How do I get my deposit back/.test(help));
ok('deposit: the payer must be the buyer', /Pay from an account in your own name/.test(terms));
ok('deposit: half of a kept deposit to the seller (both documents)', /half of it goes to the seller/.test(terms) && /we pay you half of it/.test(JSON.stringify(SELLER_AGREEMENT)));
ok('business day is defined', /“Business day” means/.test(terms));
ok('no storage before the transfer or when the delay is ours or the seller’s', /none before the registration transfer is complete/.test(terms) && /caused by us or the seller/.test(terms));
ok('title passes on payment; the transfer is the registration', /Ownership \(title\) passes to you when we receive full payment/.test(terms) && /Registration transfer:/.test(terms));
ok('help: offers open after the seller declines', /seller declines the highest bid/.test(help));
ok('help and summary agree on risk', /until your collection window ends/.test(terms) && /from the end of your collection window/.test(help));
ok('claims: longer window for title-type problems', /within 30 days of handover/.test(terms));
ok('seller: can pursue a non-paying buyer after 30 days', /you may pursue them yourself/.test(JSON.stringify(SELLER_AGREEMENT)));


// How bidders pay can be switched: no deposit (the default, like Turners) or a bidding deposit. Each shows only its own words.
const T = (mode) => JSON.stringify(fillLegal({ TERMS, HELP, PRIVACY, WEBSITE_TERMS }, { fees: mode ? { pay_mode: mode } : {} }));
const tr = T(null), dp = T('deposit');
ok('modes: no marker is left on any page', !/\[\[(transfer|deposit)\]\]/.test(tr) && !/\[\[(transfer|deposit)\]\]/.test(dp));
ok('modes: the default is no deposit', tr === T('transfer') && !/bidding deposit/i.test(tr) && !/Bidding deposit/.test(tr), (tr.match(/.{60}bidding deposit.{40}/i) || [''])[0]);
ok('no deposit: a verified mobile and ID is enough', tr.includes('To bid you need a verified mobile and a verified ID') && tr.includes('Do I need a deposit or a card to bid?'));
ok('no deposit: pay in full by transfer, lender can pay', tr.includes('pay the full amount by PayID or bank transfer within 2 business days') && tr.includes('Your lender can pay us directly'));
ok('no deposit: a non-payer is banned and can’t come back', tr.includes('we close your account for bidding') && tr.includes('you can’t open a new account') && tr.includes('If an account is closed for not paying'));
ok('no deposit: no fee for not paying, shortfall capped at actual loss', tr.includes('There’s no cancellation fee') && tr.includes('won’t claim more than our and the seller’s actual loss'));
ok('deposit: its own words only when switched on', dp.includes('Bidding deposit: before you bid') && dp.includes('What is the bidding deposit?') && !dp.includes('Do I need a deposit or a card to bid?'));
ok('both: the ban and the one-way code', dp.includes('we close your account for bidding') && dp.includes('one-way code'));
ok('both: never "non-refundable" or "no warranty"', !/non-refundable|no warranty/i.test(tr + dp));
const ids = (doc) => fillLegal(doc, {}).map(([id]) => id);
ok('modes: no deposit hides the deposit help section only', !ids(HELP).includes('h-deposit') && fillLegal(HELP, { fees: { pay_mode: 'deposit' } }).some(([id]) => id === 'h-deposit') && ids(TERMS).length === TERMS.length);


// Values from settings can't add markup to the HTML copy, and plain-text copy keeps them as typed
const evil = { fees: {}, business: { licences: { QLD: '<img src=x onerror=alert(1)> "A&B"' } } };
const t1 = JSON.stringify(fillLegal(TERMS, evil));
ok('security: settings values are escaped in the Terms', !t1.includes('<img') && t1.includes('&lt;img src=x onerror=alert(1)&gt; &quot;A&amp;B&quot;'));
const p1 = JSON.stringify(fillLegal(PRIVACY, { fees: {} }, { text: true }));
ok('security: plain-text copy is filled as typed and still valid', !/\{\{\w+\}\}/.test(p1) && JSON.parse(p1).length === PRIVACY.length);

// checking a vehicle without seeing it, the pickup to our depot, and keeping the seller private
{
  const t = JSON.stringify(fillLegal({ TERMS, HELP, PRIVACY, SELLER_AGREEMENT, WEBSITE_TERMS }, { selling: { pre_inspection_fee: 249 } }));
  const seller = JSON.stringify(SELLER_AGREEMENT), privacy = JSON.stringify(PRIVACY);
  ok('no viewings or test drives, anywhere', /There are no viewings, video calls or test drives/.test(terms) && /no viewings or test drives/i.test(help) && !/strictly by appointment|free video walkaround|in-person viewing|view it in person/i.test(t));
  ok('inspection: optional, through our partner, paid by the bidder, independent', /mechanical inspection/.test(t) && /independent of Tyrebiter/.test(t) && /You pay the mechanic/.test(terms) && /You don’t attend, and you aren’t given the address/.test(terms));
  ok('inspection: the report says what couldn’t be checked (no hoist)', /without a hoist/i.test(terms) && /Without a hoist/.test(help));
  ok('pre-inspection: fee from the proceeds, only if it sells', t.includes('$249 including GST') && /only if it sells|nothing to pay/.test(t));
  ok('transport: in the buyer’s premium, shown before bidding, fixed once it opens', /plus the vehicle’s transport to our depot/.test(terms) && /set before bidding opens and doesn’t change once it has/.test(terms) && /Why is transport in the buyer’s premium\?/.test(help));
  ok('transport: the seller pays nothing for the pickup', /or the pickup to our depot/.test(seller) && /the buyer pays the transport to our depot/.test(help));
  ok('pickup only after payment in full (both documents)', /Once you’ve paid in full, our transport partner picks it up/.test(terms) && /The vehicle is picked up only once the buyer has paid in full/.test(seller));
  ok('risk: the seller until pickup, us from pickup until handover, with due care', /Until our transport partner picks the vehicle up, the seller must look after it/.test(terms) && /From pickup until handover, we’re responsible for it/.test(terms) && /due care and skill/.test(terms) && /From pickup until the buyer collects it from our depot, we’re responsible for it/.test(seller));
  ok('a change found at pickup: the buyer may cancel for a full refund', /you choose: go ahead, or cancel the sale for a full refund/.test(terms));
  ok('collection is from our depot, with the release code', /Collecting from our depot/.test(terms) && /The depot only hands over the vehicle when given the release code/.test(terms));
  ok('seller kept private: never named to buyers; address only to transport and the mechanic', /We never give buyers the seller’s name, address or phone/.test(terms) && /Buyers never get your name, address or phone/.test(seller) && /A seller’s pickup address goes only to our transport partner/.test(privacy) && !/seller’s address for collection/.test(t));
  ok('buyers must not look for or contact the seller', /Leave the seller alone/.test(terms) && /Don’t try to find out who or where a seller is/.test(JSON.stringify(WEBSITE_TERMS)) && /Can I contact the seller\?/.test(help));
  ok('statutory warranty stated on each listing', /whether a statutory warranty applies/.test(terms));
  ok('the seller agrees to a walkaround video and mechanic access', /Walkaround video:/.test(seller) && /give our partner mechanic access/.test(seller));
  ok('lawyer items are marked', ['contracting for an unnamed seller', 'in Victoria, whether a vehicle consigned by a private seller', 'Queensland’s rules on charging a buyer’s premium', 'transit and depot cover', 'Subdivision 153-B'].every((x) => (terms + seller).includes(x)));
  ok('dealers: one transfer for several invoices', /several invoices with one transfer/.test(t));
}
// live auctions, tenders and BPAY: the wording matches the engine
ok('live: the terms explain live auctions, with an anchor the room links to', terms.includes('id=\\"t-live\\"') && /auctioneer decides/.test(terms) && /floor bids/.test(terms), '');
ok('live: the page, not the stream, counts', /The price and countdown on the page are what count, not the video stream/.test(terms));
ok('live: unoffered vehicles close on their bids when a sale finishes early', /closes on the bids already placed/.test(terms));
ok('tender: sealed, not extended, highest at its own amount, earliest wins a tie', terms.includes('id=\\"t-tender\\"') && /aren’t extended/.test(terms) && /buys at its own amount \(if two are equal, the one put in first\)/.test(terms));
ok("tender: not a sale by auction, so the outright rights apply", /Buy Now, a winning tender, an accepted offer/.test(terms) && /A tender isn’t a sale by auction/.test(terms));
ok('bpay: CRN explained, never cards', /Customer Reference Number \(CRN\)/.test(terms) && /We don’t accept cards, cash or cheques/.test(terms));
ok('help: live auctions, tenders, calendar, results and BPAY answered', ['How do live auctions work?', 'What is a tender?', 'Where can I see what’s coming up?', 'Can I see what vehicles sold for?', 'Can I pay by BPAY?'].every((q) => JSON.stringify(HELP).includes(q)));
ok('seller agreement: live auctions and tenders covered', /a live auction \(an auctioneer offers vehicles one at a time/.test(JSON.stringify(SELLER_AGREEMENT)));
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
