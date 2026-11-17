// Terms of sale, seller agreement, website terms and help: node --experimental-strip-types tests/unit/legal.test.mjs
import { TERMS, SELLER_AGREEMENT, WEBSITE_TERMS, HELP, PRIVACY, fillLegal, legalValues, SELLER_AGREEMENT_VERSION_LABEL } from '../../src/content/legal.ts';
import { COMPARISON_WARNING } from '../../src/lib/finance.ts';

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
ok('section 16 is collecting it from where it is kept', title('t-site').startsWith('16.') && /where it’s kept/.test(title('t-site')));
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
ok('no storage before it is ready or when the delay is ours or the seller’s', /none before the seller’s notice of disposal is lodged/.test(terms) && /caused by us or the seller/.test(terms));
ok('title passes on payment; the transfer is the registration', /Ownership \(title\) passes to you when we receive full payment/.test(terms) && /Registration transfer:/.test(terms));
ok('help: passed in below the reserve goes into a later auction; nothing is sold privately in between', /it goes into a later auction \(usually the next one\)/.test(help) && /Every truck is sold under the hammer, or not at all/.test(help) && /passed in/.test(help));
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

// Super Trucker: viewing by appointment, collecting it from the seller, and every sale going through us
{
  const t = JSON.stringify(fillLegal({ TERMS, HELP, PRIVACY, SELLER_AGREEMENT, WEBSITE_TERMS }, { selling: { pre_inspection_fee: 249 } }));
  const seller = JSON.stringify(SELLER_AGREEMENT), privacy = JSON.stringify(PRIVACY), web = JSON.stringify(WEBSITE_TERMS);
  ok('nothing of the depot way is left in any document', !/our depot|transport partner|to our depot|at the depot|the depot’s|No viewings|no viewings or test drives|buyers never visit/i.test(t), (t.match(/.{50}(our depot|transport partner|to our depot|at the depot|the depot’s|No viewings|no viewings or test drives|buyers never visit).{50}/i) || [''])[0]);
  ok('viewing: by appointment, for verified members, the address only on a booking', /in person, by appointment, where it’s kept/.test(terms) && /Viewings are for verified members/.test(terms) && /We agree a time with the owner and send you the address/.test(terms) && /No booking, no visit/.test(terms));
  ok('viewing: looking and listening only; the yard is the owner’s workplace, and we are not there', /There’s no road test, and nothing is taken apart/.test(terms) && /Nobody from Super Trucker is there/.test(terms) && /follow the site’s rules/.test(terms));
  ok('viewing: what an owner says isn’t the listing; ask us to confirm it in writing', /What an owner tells you at a viewing isn’t part of the listing/.test(terms) && /ask us to confirm it in writing before the auction/.test(terms) && /if you tell a visitor something that isn’t in the listing, tell us too/.test(seller));
  ok('viewing: the listing says when an owner can’t host one', /Some owners can’t host viewings/.test(terms) && /If you can’t host viewings at all, tell us before it’s listed/.test(seller));
  ok('we list without visiting, and nothing says we inspect it to list it', /We list a vehicle without visiting it/.test(terms) && /We list your vehicle without visiting it/.test(seller) && !/we (walk around|inspect|photograph|visit) (it|the vehicle|every)/i.test(t));
  ok('introductions (buyers): no dealing direct; our premium on a sale around us; collected once', terms.includes('id=\\"t-intro\\"') && /you won’t make the owner an offer or ask them to deal direct/.test(terms)
    && /you pay us the buyer’s premium we would have earned on the price you paid/.test(terms) && /That is what we lose when a sale we set up goes around us, and no more/.test(terms) && /We collect it once: from you or from the owner/.test(terms) && /Every sale goes through us/.test(terms));
  ok('introductions (sellers): exclusive for the 90-day authority, then buyers we introduced', /For the 90 days of your authority \(section 1\), only we sell the vehicle/.test(seller) && /by you or anyone else, to anyone, you pay us the buyer’s premium we would have earned/.test(seller)
    && /anyone we named to you in writing \(every viewing and collection we book names the visitor\), anyone who bid on it with us/.test(seller) && /say no and tell us the same day/.test(seller));
  ok('introductions: proportionate, paid once, and a clean withdrawal costs only the withdrawal fee', /what we lose when a sale we advertised, checked and set up goes around us, and no more/.test(seller) && /We don’t also collect it from the buyer/.test(seller) && /you pay only the withdrawal fee/.test(seller));
  ok('introductions: the tail follows the setting in every document', t.includes('within 90 days after') && JSON.stringify(fillLegal({ TERMS, SELLER_AGREEMENT }, { auction: { exclusivity_days: 60 } })).includes('For 60 days after your authority ends') && legalValues({}).EXCLUSIVITY_DAYS === '90');
  ok('the address: suburb on the listing, street only for a booked viewing or a confirmed collection (every document)', /The street address isn’t published/.test(terms) && /it shows your suburb, not your street/.test(seller)
    && /only to a verified member whose viewing we’ve booked and to the buyer whose collection time is confirmed/.test(privacy) && /We tell the owner the name of whoever is coming/.test(privacy) && /We never give either side the other’s phone, email or home address/.test(privacy));
  ok('website terms: an address is for its viewing or sale only; no sales around us', /for anything other than the viewing or sale they were given for/.test(web) && /don’t arrange to buy or sell a vehicle listed with us outside Super Trucker to avoid our fees/.test(web));
  ok('fees: the premium with its floor, GST, and nothing for transport or admin', t.includes('A buyer’s premium of 6% of the price (at least $140), and GST on the premium. No surcharge, payment fee or transport charge.') && /Nothing is added for transport/.test(terms)
    && t.includes('There’s no admin or documentation fee.') && !/admin fee of \$0|Admin fee: \$0/.test(t));
  ok('fees: an admin fee is named when there is one', JSON.stringify(fillLegal(TERMS, { fees: { admin_fee: 55 } })).includes('and an admin fee of $55') && JSON.stringify(fillLegal(TERMS, { fees: { premium_min: 0 } })).includes('6% of the price, plus GST on the premium'));
  ok('fees: the seller agrees in writing to the premium being charged and shown', /you agree in writing to us charging the buyer a buyer’s premium/.test(seller) && /The seller has agreed in writing to us charging it/.test(terms));
  ok('collection: from where it is kept, after payment and the notice of disposal, with a release code', /Collecting it from where it’s kept/.test(terms) && /We agree it with the seller and send you the address and a 6-digit release code/.test(terms)
    && /The seller hands over the vehicle only when the release code works/.test(terms) && /The vehicle is handed over only once the buyer has paid us in full/.test(seller));
  ok('handover: check it first; the code is the sign-off; something wrong means no code and a full refund', /check the vehicle against the listing before you give the release code/.test(terms) && /The code is your sign-off/.test(terms)
    && /don’t give the code: call us from the yard. You choose: go ahead, or cancel the sale for a full refund/.test(terms) && /If the code doesn’t work, don’t hand it over: call us/.test(seller));
  ok('handover: nobody pays the seller, and the seller takes money from nobody', /Never pay the seller anything/.test(terms) && /Never accept money from anyone for it/.test(seller) && /Pay Super Trucker only, never the seller/.test(terms));
  ok('risk: with the seller until the handover; the money in trust is the buyer’s protection', /Until then the vehicle is in the seller’s hands and at the seller’s risk/.test(terms) && /We never have the vehicle/.test(terms)
    && /we hold your money in trust until the handover is done and your claim window has closed/.test(terms) && /The vehicle stays at your risk, and insured by you, until the handover is recorded/.test(seller));
  ok('unregistered: leaves on a carrier or float, or under a permit number recorded at the handover (both documents)', /whose number the seller records on the handover page before the keys change hands/.test(terms) && /an offence by whoever permits it as well as whoever drives it/.test(terms)
    && /the handover page won’t complete without one of those/.test(seller) && /A written-off vehicle can’t be driven away at all/.test(terms));
  ok('permits: each state’s is named for what it is', /Queensland’s unregistered vehicle permit/.test(terms) && /New South Wales issues one at a service centre, not online/.test(terms) && /Western Australia’s temporary movement permit lasts 48 hours/.test(terms) && /not simply to drive it home/.test(terms));
  ok('certificates: Queensland heavy and light, the New South Wales plates rule, Western Australia', /over 4\.5 tonnes GVM is transferred on a current certificate of inspection/.test(terms) && /the law doesn’t let a vehicle be auctioned with its plates on unless a current inspection report \(issued in the 42 days before\) is shown with it/.test(terms)
    && /first issued or renewed in the 90 days before the auction/.test(terms) && /the listing says why it has none/.test(terms) && /Western Australia<\/b>: nothing more is needed/.test(terms)
    && /a certificate of inspection for a vehicle over 4\.5 tonnes GVM/.test(seller) && /otherwise you hand the plates in and it’s sold unregistered/.test(seller));
  ok('statutory warranty: we never give one; none applies at auction in our three states; trade owners kept off', /we never give a statutory warranty or take on a dealer’s duty to repair/.test(terms) && /says that none applies to the sale/.test(terms)
    && /none applies in Queensland \(a commercial vehicle, and a vehicle sold on consignment for an owner who isn’t a motor dealer, are both excluded\)/.test(terms) && /in Western Australia, a vehicle whose owner bought it to resell/.test(terms)
    && /you didn’t buy this vehicle to resell it, unless you’ve told us/.test(seller) && /We don’t list a vehicle that would carry one/.test(terms));
  ok('a goods vehicle is covered by the ACL at any price, and the auction rule is the same', /a truck bought to carry goods on public roads is covered by the Australian Consumer Law at any price/.test(terms));
  ok('never sold after the auction (terms, agreement, help)', terms.includes('id=\\"t-after\\"') && /Nothing is sold after the auction/.test(terms) && /We don’t sell trucks by private treaty after an auction/.test(seller) && /Can I buy a truck after the auction\?/.test(help)
    && !/offer page|cooling-off period your state gives|sign an offer/.test(t));
  ok('a listed truck is parked, not worked', /A listed truck is parked, not worked/.test(terms) && /A listed vehicle is parked, not worked/.test(seller));
  ok('inspection: two ways, yourself or our mobile mechanic; the fee, the limits, the faults on the listing, the refund rule and due care',
    /two ways to inspect a truck before you bid: inspect it yourself/.test(terms) && /send our mobile mechanic/.test(terms) && /id=\\"t-mechanic\\"/.test(terms) && /\{\{MECHANIC_FEE\}\} including GST/.test(terms)
    && /There’s no road test, nothing is taken apart, and it isn’t a safety certificate or a certificate of inspection/.test(terms) && /mechanic’s opinion of the truck on the day/.test(terms)
    && /anything that needs attention is added to the listing’s damage and wear for every bidder/.test(terms) && /full refund if you cancel more than 24 hours before the booked time/.test(terms)
    && /due care and skill/.test(terms) && /ordinarily acquired for personal, domestic or household use/.test(terms) && /How does your mobile mechanic work\?/.test(help) && /Without a hoist/.test(help)
    && legalValues({ selling: { mechanic_fee: 495 } }).MECHANIC_FEE === '$495' && legalValues({}).MECHANIC_FEE === '$495');
  ok('pre-inspection: fee from the proceeds, only if it sells', t.includes('$249 including GST') && /only if it sells|nothing to pay/.test(t));
  ok('big payments: check the bank’s limit before the auction', /check your bank’s daily transfer limit before the auction/.test(terms) && /Will my bank let it through\?/.test(help));
  ok('the seller sends the photos and walkaround video, and gives a mechanic access', /Photos and video: send us the photos/.test(seller) && /walkaround video/.test(seller) && /A bidder may also book our mobile mechanic: give the mechanic access/.test(seller) && /We tell you what they find/.test(seller));
  ok('where our messages come from follows the site address', t.includes('Our emails come from @tyrebiter.com.au') && legalValues({}).DOMAIN === 'tyrebiter.com.au' && !/privacy@/.test(t));
  ok('the states we sell in follow the setting (Queensland first)', t.includes('in Queensland.') && legalValues({}).SELL_STATES === 'Queensland' && legalValues({ selling: { states: ['QLD', 'NSW', 'WA'] } }).SELL_STATES === 'Queensland, New South Wales and Western Australia' && legalValues({ selling: { states: ['QLD', 'VIC'] } }).SELL_STATES === 'Queensland and Victoria');
  ok('settled: no lawyer or accountant placeholders left in any document', !/LAWYER|ACCOUNTANT|\[STATE\]|TRUST ACCOUNT|TO CONFIRM/.test(t), (t.match(/.{40}(LAWYER|ACCOUNTANT|\[STATE\]|TO CONFIRM).{40}/) || [''])[0]);
  ok('settled: Queensland law governs the terms, the agreement and the website terms', /governed by the laws of Queensland/.test(terms) && /governed by the laws of Queensland/.test(seller) && /governed by the laws of Queensland/.test(web));
  ok('settled: selling for an owner the listing doesn’t name, and what we answer for', /the law allows an agent to contract for an owner it doesn’t name/.test(terms) && /If the owner doesn’t complete a sale through no fault of yours, we refund everything you paid/.test(terms) && /where a state’s law puts the owner’s name on your sale paperwork \(Queensland does\)/.test(terms));
  ok('settled: money is held in our trust account (both documents)', /paid into our trust account and held there for the seller/.test(terms) && /Sale money is held in our trust account for you/.test(seller) && /Agents Financial Administration Act 2014/.test(seller));
  ok('settled: GST through Subdivision 153-B', /Subdivision 153-B of the GST Act applies to the sale/.test(seller) && /we issue the buyer’s tax invoice in our name/.test(seller));
  ok('settled: a written consignment authority for 90 days', /Your authority lasts 90 days from when you sign/.test(seller) && /consignment agreement the motor dealer laws require/.test(seller));
  ok('settled: uncollected goods laws named for our three states', /Disposal of Uncollected Goods Act 1967 in Queensland/.test(terms) && /Uncollected Goods Act 1995 in New South Wales/.test(terms) && /Disposal of Uncollected Goods Act 1970 in Western Australia/.test(terms));
  ok('dealers: one transfer for several invoices', /several invoices with one transfer/.test(t));
}

// live auctions, tenders and BPAY: the wording matches the engine
ok('live: the terms explain live auctions, with an anchor the room links to', terms.includes('id=\\"t-live\\"') && /auctioneer decides/.test(terms) && /floor bids/.test(terms), '');
ok('live: the page counts; the room shows the photos and the seller’s video, no stream', /The price and countdown on the page are what count; delays in your own connection are your risk/.test(terms) && /the room shows its photos and the seller’s walkaround video/.test(terms) && !/stream/i.test(terms));
ok('live: the auction’s conditions are read and accepted on entering the room, and recorded', /you read the auction’s conditions \(the key points of these terms\) and accept them once, on entering; we record that you did/.test(terms));
ok('live: the passed-in highest bidder hears from one of our sales consultants; in the auction, only the hammer sells', /If you were the highest bidder, one of our sales consultants will be in touch about it, including whether it’ll be offered at a later auction/.test(terms) && /a vehicle offered in the live auction is sold only under the hammer, or not at all/.test(terms));
ok('live: a vehicle not offered before the sale finishes is passed in, not sold', /that vehicle is passed in, not sold: its early bids lapse/.test(terms));
// live auctions only: every sale under the hammer, an estimate on every listing, bids withdrawable until the hammer falls
{
  const tt = JSON.stringify(fillLegal({ TERMS, HELP, SELLER_AGREEMENT }, {}));
  ok('live only: no tenders, Buy Now, offers or referrals anywhere', !/\btenders?\b|Buy Now|Make an Offer|offers open|referral period|referred bid/i.test(tt), (tt.match(/.{40}(\btenders?\b|Buy Now|Make an Offer|offers open|referral period|referred bid).{40}/i) || [''])[0]);
  ok('live only: every truck in a live auction, sold under the hammer', /Every truck is sold in a <b>live online auction<\/b>/.test(terms) && /a vehicle offered in the live auction is sold only under the hammer, or not at all/.test(terms));
  ok('live only: below the reserve it is passed in, nobody owes anything', /the vehicle is <b>passed in<\/b>: it isn’t sold, and neither you nor the seller owes anything/.test(terms));
  ok('live only: a bid can be withdrawn until the hammer falls (terms and help)', /You can withdraw a bid until the hammer falls/.test(terms) && /Once the hammer falls on your bid, the sale is made/.test(terms) && /Can I withdraw a bid\?/.test(help) && !/Bids can’t be withdrawn/.test(tt));
  ok('estimate: what it is, its basis kept, the reserve never above the low end, at most 25% wide', /The auction estimate is our opinion, made with reasonable care/.test(terms) && /we keep a written record of that basis/.test(terms) && /reserve is never above the estimate’s low end/.test(terms) && /never more than 25% wide/.test(terms));
  ok('estimate: agreed with the seller, reserve no higher than its low end', /we agree an auction estimate with you/.test(JSON.stringify(SELLER_AGREEMENT)) && /it can’t be above the estimate’s low end/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('no vendor bids, ever (terms and agreement)', /we never bid on a seller’s behalf \(there are no vendor bids\)/.test(terms) && /we never bid on your behalf/.test(JSON.stringify(SELLER_AGREEMENT)));
  ok('the seller lowers the reserve until the hammer falls, never raises it', /lower or remove the reserve at any time until the hammer falls/.test(JSON.stringify(SELLER_AGREEMENT)) && /The seller may lower or remove the reserve until the hammer falls, never raise it/.test(terms));
  ok('remote: we list without visiting; seller content is labelled and passed on', /We list a vehicle without visiting it/.test(terms) && /We don’t adopt it as our own statement/.test(terms) && /We list your vehicle without visiting it/.test(JSON.stringify(SELLER_AGREEMENT)));
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
  ok('relist: offered again at the next live auction, unless the seller says no', /We offer it again at our next live auction unless you tell us not to \(section 12\)/.test(sa) && /If it isn’t sold, we offer it again at our next live auction for your state, while your authority lasts/.test(sa));
  ok('relist: saying no is free until it is listed; after that it is a withdrawal', /tell us before it’s listed, from your seller dashboard or by calling us. There’s no fee, and the vehicle stays yours/.test(sa) && /taking it out is a withdrawal \(section 8\)/.test(sa));
  ok('relist: fresh checks, the state’s certificate rules for the new date, and a new signature after 90 days', /fresh PPSR search and listing check, set a fresh estimate with you/.test(sa) && /New South Wales inspection report must be no more than 42 days old at the auction/.test(sa) && /you sign this agreement again for it/.test(sa));
  ok('relist: help for sellers and buyers says the same', /We offer it again at our next live auction for your state/.test(help) && /it goes into a later auction \(usually the next one\), and its bidders and watchers hear when it’s back/.test(help));
}
{
  // trucks are never sold after the auction (migration 36): the documents say so, and the versions moved
  const sa = JSON.stringify(SELLER_AGREEMENT);
  ok('after: to sell on the day the seller lowers the reserve, by phone if need be', /lower your reserve before the hammer falls \(section 4\): our auctioneer can take your instruction by phone while it’s up/.test(sa));
  ok("Western Australia's prescribed consignment contract", /Schedule 4 terms of the Motor Vehicle Dealers \(Sales\) Regulations 1974/.test(sa));
  ok('seller: told up front we never give a statutory warranty, and to say if they are in the trade', /We never give a statutory warranty, so we don’t list a vehicle that would carry one: tell us if you’re a motor dealer, or if you bought this vehicle to resell it/.test(sa));
  ok('new versions of all three documents', /This version: 17 November 2026/.test(terms) && SELLER_AGREEMENT_VERSION_LABEL === 'Version 17 November 2026' && /This version: 17 November 2026/.test(JSON.stringify(WEBSITE_TERMS)));
}

{
  // No "[LAWYER ...]" placeholders anywhere: every position is settled from the primary source and recorded in
  // docs/legal-basis.md, which the lawyer reads beside the finished wording. A placeholder means a position we never
  // settled, and it would ship to members as a square-bracketed note.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = new URL('../../', import.meta.url).pathname;
  const skip = new Set(['node_modules', '.next', '.git', 'dist', 'ios', 'android', 'coverage']);
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|sql|md)$/.test(e.name)) continue;
      const text = fs.readFileSync(p, 'utf8');
      // the test's own description of the rule doesn't count
      if (p.endsWith('tests/unit/legal.test.mjs')) continue;
      if (/\[LAWYER/i.test(text)) found.push(p.slice(root.length));
    }
  };
  for (const d of ['src', 'supabase', 'docs', 'mobile/src', 'mobile/store']) {
    const full = path.join(root, d);
    if (fs.existsSync(full)) walk(full);
  }
  ok('no "[LAWYER ...]" placeholders: every position is settled and in docs/legal-basis.md', found.length === 0, found.join(', '));
  const reg = fs.readFileSync(path.join(root, 'docs/legal-basis.md'), 'utf8');
  ok('register: the comparison rate warning is prescribed, with its regulation', /reg 99 \("Warnings about comparison rate"\)/.test(reg) && /National Consumer Credit Protection Regulations 2010/.test(reg));
  ok('register: the Super Trucker positions are recorded with their sources', /## 15\. Trucks are never sold after the auction/.test(reg) && /Australian Consumer Law s 3\(1\)/.test(reg)
    && /## 16\. Viewings and introductions/.test(reg) && /Paciocco v Australia and New Zealand Banking Group Ltd \[2016\] HCA 28/.test(reg)
    && /Motor Dealers and Repairers Act 2013 \(NSW\) ss 55-59/.test(reg) && /Motor Dealers and Repairers Regulation 2025 \(NSW\) cl 55/.test(reg)
    && /Motor Vehicle Dealers \(Prescribed Vehicles\) Regulations 1974 \(WA\) r 3/.test(reg) && /Auction Sales Act 1973/.test(reg)
    && /certificate of inspection/.test(reg) && /SMS Sender ID Register/.test(reg));
  ok('the comparison rate warning is the prescribed words, unchanged', COMPARISON_WARNING === 'WARNING: This comparison rate is true only for the examples given and may not include all fees and charges. Different terms, fees or other loan amounts might result in a different comparison rate.');
}
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
