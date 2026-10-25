// Terms of sale, seller agreement, website terms and help: node --experimental-strip-types tests/unit/legal.test.mjs
import { TERMS, SELLER_AGREEMENT, WEBSITE_TERMS, HELP, PRIVACY, fillLegal, legalValues, SELLER_AGREEMENT_VERSION_LABEL } from '../../src/content/legal.ts';

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
ok('help: passed in below the reserve; sold afterwards only by agreement, where the state allows it', /the seller may agree to sell it after the auction, and we may send you a written offer to sign, with no obligation/.test(help) && /passed in/.test(help));
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
  ok('statutory warranty stated on each listing and in the live room, state by state', /says whether a statutory warranty \(or a dealer’s duty to repair\) applies/.test(terms) && /none applies in Queensland/.test(terms) && /In the ACT a dealer’s duty to repair can apply/.test(terms));
  ok('the seller sends the photos and walkaround video, and gives the mechanic access', /Photos and video: send us the photos/.test(seller) && /walkaround video/.test(seller) && /give our partner mechanic access/.test(seller));
  ok('settled: no lawyer or accountant placeholders left in any document', !/LAWYER|ACCOUNTANT|\[STATE\]|TRUST ACCOUNT|TO CONFIRM/.test(t), (t.match(/.{40}(LAWYER|ACCOUNTANT|\[STATE\]|TO CONFIRM).{40}/) || [''])[0]);
  ok('settled: Queensland law governs the terms, the agreement and the website terms', /governed by the laws of Queensland/.test(terms) && /governed by the laws of Queensland/.test(seller) && /governed by the laws of Queensland/.test(JSON.stringify(WEBSITE_TERMS)));
  ok('settled: selling for an unnamed owner, and what we answer for', /the law allows an agent to contract for an owner it doesn’t name/.test(terms) && /If the owner doesn’t complete a sale through no fault of yours, we refund everything you paid/.test(terms));
  ok('settled: money is held in our trust account (both documents)', /paid into our trust account and held there for the seller/.test(terms) && /Sale money is held in our trust account for you/.test(seller) && /Agents Financial Administration Act 2014/.test(seller));
  ok('settled: the seller agrees in writing to the buyer’s premium being charged and shown', /you agree in writing to us charging the buyer a buyer’s premium/.test(seller) && /The seller has agreed in writing to us charging it/.test(terms));
  ok('settled: GST through Subdivision 153-B, so the seller stays unnamed', /Subdivision 153-B of the GST Act applies to the sale/.test(seller) && /we issue the buyer’s tax invoice in our name/.test(seller));
  ok('settled: a written consignment authority for 90 days', /Your authority lasts 90 days from when you sign/.test(seller) && /consignment agreement the motor dealer laws require/.test(seller));
  ok('settled: safety and roadworthy certificates, state by state', ['Queensland needs a safety certificate', 'Victoria needs a roadworthy certificate issued less than 30 days before the sale', 'The ACT needs a roadworthy inspection', 'New South Wales, Western Australia and Tasmania don’t need one'].every((x) => terms.includes(x)) && /a Queensland safety certificate, a Victorian roadworthy certificate/.test(seller));
  ok('settled: uncollected goods laws named', /Disposal of Uncollected Goods Act 1967 in Queensland/.test(terms) && /Uncollected Goods Act 1995 in New South Wales/.test(terms));
  ok('dealers: one transfer for several invoices', /several invoices with one transfer/.test(t));
}
// live auctions, tenders and BPAY: the wording matches the engine
ok('live: the terms explain live auctions, with an anchor the room links to', terms.includes('id=\\"t-live\\"') && /auctioneer decides/.test(terms) && /floor bids/.test(terms), '');
ok('live: the page counts; the room shows the photos and the seller’s video, no stream', /The price and countdown on the page are what count; delays in your own connection are your risk/.test(terms) && /the room shows its photos and the seller’s walkaround video/.test(terms) && !/stream/i.test(terms));
ok('live: the auction’s conditions are read and accepted on entering the room, and recorded', /you read the auction’s conditions \(the key points of these terms\) and accept them once, on entering; we record that you did/.test(terms));
ok('live: the passed-in highest bidder hears from a consultant; in the auction, only the hammer sells', /If you were the highest bidder, one of our consultants will be in touch/.test(terms) && /a vehicle offered in the live auction is sold only under the hammer, or not at all/.test(terms));
ok('live: a vehicle not offered before the sale finishes is passed in, not sold', /that vehicle is passed in, not sold: its early bids lapse/.test(terms));
// live auctions only: every sale under the hammer, an estimate on every listing, bids withdrawable until the hammer falls
{
  const tt = JSON.stringify(fillLegal({ TERMS, HELP, SELLER_AGREEMENT }, {}));
  ok('live only: no tenders, Buy Now, offers or referrals anywhere', !/\btenders?\b|Buy Now|Make an Offer|offers open|referral period|referred bid/i.test(tt), (tt.match(/.{40}(\btenders?\b|Buy Now|Make an Offer|offers open|referral period|referred bid).{40}/i) || [''])[0]);
  ok('live only: every vehicle in a live auction, sold under the hammer (after it, only by the seller\'s written agreement)', /Every vehicle is sold in a <b>live online auction<\/b>/.test(terms) && /a vehicle offered in the live auction is sold only under the hammer, or not at all/.test(terms) && /only at a price you agree to in writing at the time/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('live only: below the reserve it is passed in, nobody owes anything', /the vehicle is <b>passed in<\/b>: it isn’t sold, and neither you nor the seller owes anything/.test(terms));
  ok('live only: a bid can be withdrawn until the hammer falls (terms and help)', /You can withdraw a bid until the hammer falls/.test(terms) && /Once the hammer falls on your bid, the sale is made/.test(terms) && /Can I withdraw a bid\?/.test(help) && !/Bids can’t be withdrawn/.test(tt));
  ok('estimate: what it is, its basis kept, the reserve never above the low end, at most 25% wide', /The auction estimate is our opinion, made with reasonable care/.test(terms) && /we keep a written record of that basis/.test(terms) && /reserve is never above the estimate’s low end/.test(terms) && /never more than 25% wide/.test(terms));
  ok('estimate: agreed with the seller, reserve no higher than its low end', /we agree an auction estimate with you/.test(JSON.stringify(SELLER_AGREEMENT)) && /it can’t be above the estimate’s low end/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('no vendor bids, ever (terms and agreement)', /we never bid on a seller’s behalf \(there are no vendor bids\)/.test(terms) && /we never bid on your behalf/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('the seller lowers the reserve until the hammer falls, never raises it', /lower or remove the reserve at any time until the hammer falls/.test(JSON.stringify(SELLER_AGREEMENT)) && /The seller may lower or remove the reserve until the hammer falls, never raise it/.test(terms));
  ok('remote: we’re never at the vehicle; seller content is labelled and passed on', /We’re never at the vehicle/.test(terms) && /We don’t adopt it as our own statement/.test(terms) && /never at your vehicle/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('remote: the seller promises recent, unedited photos and video of this vehicle', /taken by you for this listing in the last 14 days/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('only registered bidders, the auctioneer named for the whole auction', /Only registered bidders can bid/.test(terms) && /The auctioneer’s name is shown in the live room for the whole auction/.test(terms));
  ok('every sale is a sale by auction under the ACL, whoever the seller is', /“sale by auction” under the Australian Consumer Law/.test(terms) && /sections 51 to 53/.test(terms) && /sections 54 to 59/.test(terms));
}
ok('bpay: CRN explained, never cards', /Customer Reference Number \(CRN\)/.test(terms) && /We don’t accept cards, cash or cheques/.test(terms));
ok('help: live auctions, the estimate, withdrawing, passed in, calendar, results and BPAY answered', ['How do live auctions work?', 'What’s the auction estimate?', 'Can I withdraw a bid?', 'What does “passed in” mean?', 'Where can I see what’s coming up?', 'Can I see what vehicles sold for?', 'Can I pay by BPAY?', 'Can I lower my reserve during the auction?'].every((q) => JSON.stringify(HELP).includes(q)));
ok('seller agreement: its last line carries its version (the label on the signed copy)', JSON.stringify(SELLER_AGREEMENT).includes(`${SELLER_AGREEMENT_VERSION_LABEL}.`), SELLER_AGREEMENT_VERSION_LABEL);
ok('seller agreement: a live online auction by a licensed auctioneer', /sell the vehicle in a live online auction, conducted by a licensed auctioneer/.test(JSON.stringify(SELLER_AGREEMENT)));
{
  // a vehicle that didn't sell goes into the next live auction for its state (never sold afterwards, in any state), unless
  // the seller says no: free until it's listed; the state's rules and the 90-day authority checked for the new auction
  const sa = JSON.stringify(SELLER_AGREEMENT);
  ok('relist: offered again at the next live auction, unless the seller says no', /we offer it again at our next live auction unless you tell us not to \(section 12\)/.test(sa) && /If it isn’t sold, we offer it again at our next live auction for your state, while your authority lasts/.test(sa));
  ok('relist: saying no is free until it is listed; after that it is a withdrawal', /tell us before it’s listed, from your seller dashboard or by calling us. There’s no fee, and the vehicle stays yours/.test(sa) && /taking it out is a withdrawal \(section 8\)/.test(sa));
  ok('relist: fresh checks, the state’s certificate rules for the new date, and a new signature after 90 days', /fresh PPSR search and listing check, set a fresh estimate with you/.test(sa) && /Victorian roadworthy certificate must be less than 30 days old/.test(sa) && /Queensland safety certificate no more than 2 months old/.test(sa) && /you sign this agreement again for it/.test(sa));
  ok('relist: help for sellers and buyers says the same', /Otherwise we offer it again at our next live auction for your state/.test(help) && /it goes into a later auction \(usually the next one\), and its bidders and watchers hear when it’s back/.test(help));
}
{
  // selling after the auction (migration 26): by the seller's written agreement, a written offer the buyer signs, the
  // state's cooling-off (longer) and warranty, never in Victoria; the seller's price is the floor and we carry the warranty
  const sa = JSON.stringify(SELLER_AGREEMENT);
  ok('after: the terms explain it, with an anchor the offer page and Help link to', terms.includes('id=\\"t-after\\"') && /it isn’t a sale by auction/.test(terms) && /You accept it by signing on the offer page/.test(terms));
  ok('after: the cooling-off a business day longer than the law, free, nothing taken until it ends', /a business day longer than the law gives/.test(terms) && /New South Wales until the end of the second business day after you sign, South Australia the third, the ACT the fourth/.test(terms) && /Nothing is invoiced or taken until it ends/.test(terms));
  ok('after: never in Victoria; Tasmania and the NT only once licensed', /We never sell a vehicle after the auction in Victoria/.test(terms) && /in Tasmania and the Northern Territory only once we hold the licence that covers it/.test(terms) && /never in Victoria/.test(sa));
  ok('after: consumer rights: title always; quality can apply (business), may not (private); never excluded', /A vehicle sold after the auction<\/b> \(section 6\) isn’t sold by auction/.test(terms) && /they may not apply to a private owner’s. Any guarantee that does apply can’t be excluded/.test(terms));
  ok('after: the statutory warranty is stated before signing, and we meet it', /the offer and the contract say so, with its period, before you sign, and we meet it for you as the dealer/.test(terms));
  ok('after: the seller agrees the price in writing, never less, can change their mind; repairs never charged to them', /only at a price you agree to in writing at the time/.test(sa) && /we never sell it for less/.test(sa) && /you can change your mind until a buyer signs/.test(sa) && /never charge you for those repairs/.test(sa));
  ok('after: the relist waits while an offer is open', /It can’t be listed again while an offer to sell it after the auction is open/.test(sa));
  ok('after: Western Australia\'s prescribed consignment contract', /Schedule 4 terms of the Motor Vehicle Dealers \(Sales\) Regulations 1974/.test(sa));
  ok('after: Help answers buyers and sellers', /Can I buy a vehicle after the auction\?/.test(help) && /cancel free on the offer page/.test(help) && /accept the highest bid, or name the lowest price you’d take, on your seller dashboard/.test(help));
  ok('after: the short version and the cooling-off line agree', /we may send you a written offer to sign \(section 6\)/.test(terms) && /A vehicle bought after the auction gets the cooling-off period your state gives a buyer from a dealer/.test(terms));
  ok('after: new versions of both documents', /This version: 26 October 2026/.test(terms) && SELLER_AGREEMENT_VERSION_LABEL === 'Version 26 October 2026');
}
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
