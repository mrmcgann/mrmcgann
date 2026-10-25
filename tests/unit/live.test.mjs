// Live auctions, tenders, BPAY, the damage map and the auction calendar: the shared helpers.
// node --experimental-strip-types tests/unit/live.test.mjs
import { bpayCheckDigit, isCrn, formatCrn, cleanCrn, isBillerCode } from '../../src/lib/bpay.ts';
import { ZONES, ZONE_LABEL, PANELS, OFF_DIAGRAM, flawPins, hasDiagram, isZone } from '../../src/lib/damage.ts';
import { nextBid, quickBids, secondsLeft, liveLine, resultLine, liveError, howSold, CALLS } from '../../src/lib/live.ts';
import { auctionConditions, CONDITIONS_ACK } from '../../src/lib/conditions.ts';
import { icsCalendar, icsText, saleEvents, calDay } from '../../src/lib/calendar.ts';
import { cleanFilters, parseQuery, describe } from '../../src/lib/search.ts';
import { readFileSync } from 'node:fs';

let pass = 0, failN = 0; const fails = [];
const ok = (name, cond, extra = '') => { if (cond) pass++; else { failN++; fails.push(name + ' ' + extra); } };

// ---- BPAY (MOD10V01, the Luhn method) ----
ok('bpay: the textbook Luhn example', bpayCheckDigit('7992739871') === 3);
ok('bpay: a made CRN is valid', isCrn('100000014') || isCrn('10000001' + bpayCheckDigit('10000001')));
ok('bpay: one wrong digit is caught', !isCrn('79927398710') && isCrn('79927398713'));
ok('bpay: two swapped digits are caught', !isCrn('79927398731'));
ok('bpay: spaces are fine', isCrn('7992 7398 713') && cleanCrn('7992 7398-713') === '79927398713');
ok('bpay: letters are not a CRN', !isCrn('BIDK7M2QX') && !isCrn(''));
ok('bpay: written in groups of four', formatCrn('100000014') === '1000 0001 4', formatCrn('100000014'));
ok('bpay: biller codes are 4 to 6 digits', isBillerCode('12345') && !isBillerCode('123') && !isBillerCode('12a45'));
// the database makes the same digit
const sql = readFileSync(new URL('../../supabase/migrations/20261021000020_live_tender_bpay.sql', import.meta.url), 'utf8');
ok('bpay: the database uses the same rule (doubling from the right)', /if i % 2 = 1 then d := d \* 2; if d > 9 then d := d - 9/.test(sql));

// ---- damage map ----
const zoneSql = /zone in \(([\s\S]*?)\)\)/.exec(sql)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1));
ok('damage: the website and the database list the same parts', JSON.stringify([...zoneSql].sort()) === JSON.stringify(ZONES.map((z) => z[0]).sort()), JSON.stringify(zoneSql));
ok('damage: every part is either drawn or listed under the drawing', ZONES.every(([z]) => PANELS.some((p) => p.zone === z) || OFF_DIAGRAM.includes(z)));
ok("damage: the car's left (passenger side) is on the left of the drawing", PANELS.find((p) => p.zone === 'left_front').cx < 100 && PANELS.find((p) => p.zone === 'right_front').cx > 100);
ok('damage: labels say which side is the passenger side', /passenger/.test(ZONE_LABEL.left_front) && /driver/.test(ZONE_LABEL.right_rear));
const pins = flawPins([{ zone: 'bonnet' }, { zone: null }, { zone: 'bonnet' }, { zone: 'wing' }, { zone: 'interior' }]);
ok('damage: flaws numbered as listed, grouped by part', JSON.stringify(pins.get('bonnet')) === '[1,3]' && JSON.stringify(pins.get('interior')) === '[5]' && !pins.has('wing'));
ok('damage: drawn for cars, utes, vans and trucks only', hasDiagram('cars') && hasDiagram('utes') && !hasDiagram('boats') && !hasDiagram('motorbikes'));
ok('damage: unknown parts refused', !isZone('wing') && isZone('roof'));

// ---- live auctions ----
// no video stream: the room shows the listing's photos and the seller's video (migration 24)
const m24 = readFileSync(new URL('../../supabase/migrations/20261024000024_room_photos_entry.sql', import.meta.url), 'utf8');
ok('room: no video stream, kept empty by the database', /add constraint sales_no_stream check \(stream_url is null\)/.test(m24));
const csp = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');
ok('room: the content rules frame no video players', /frame-src/.test(csp) && !/youtube|vimeo/i.test(csp));
// the auction's conditions, accepted on entering the room
const terms = readFileSync(new URL('../../src/content/legal.ts', import.meta.url), 'utf8');
for (const mode of ['transfer', 'deposit']) {
  const cs = auctionConditions({ payMode: mode, payDays: 2 });
  const all = cs.map((c) => c.head + ' ' + c.text).join(' ');
  ok(`conditions (${mode}): every point names the section of the Terms it comes from`, cs.every((c) => terms.includes(`'${c.terms}'`) || terms.includes(`id="${c.terms}"`)), cs.map((c) => c.terms).join());
  ok(`conditions (${mode}): as is, where is; never at the vehicle; each tap a bid; withdraw until the hammer; passed in; consultant; pay on time; consumer rights`,
    /As is, where is/.test(all) && /no viewings or test drives/.test(all) && /each tap of a bid button is a binding bid/.test(all) && /withdraw a bid until the hammer falls/.test(all)
    && /passed in: it isn't sold and nobody owes anything/.test(all) && /one of our consultants will be in touch/.test(all) && /within 2 business days/.test(all) && /Australian Consumer Law/.test(all), all);
  ok(`conditions (${mode}): a sale after the auction is by a written offer, isn't by auction, never in Victoria`, /the seller may then agree to sell it after the auction, by a written offer you'd sign: that isn't a sale by auction/.test(all) && /never in Victoria/.test(all), all);
  ok(`conditions (${mode}): never "no warranty" or "non-refundable"`, !/no warranty|non-refundable/i.test(all));
}
ok('conditions: the deposit wording only with deposits', /deposit/.test(auctionConditions({ payMode: 'deposit' }).map((c) => c.text).join()) && !/deposit/.test(auctionConditions({ payMode: 'transfer' }).map((c) => c.text).join()));
ok('conditions: the box they tick includes the Terms of Sale', /Terms of Sale/.test(CONDITIONS_ACK));
ok('next bid: the starting price when nobody has bid', nextBid({ current_bid: 0, bid_count: 0, start_price: 1000 }) === 1000);
ok('next bid: one increment above the current bid', nextBid({ current_bid: 4900, bid_count: 3, start_price: 1000 }) === 5000 && nextBid({ current_bid: 5000, bid_count: 4, start_price: 1000 }) === 5250);
ok('quick bids: three steps, each a valid increment', JSON.stringify(quickBids({ current_bid: 4800, bid_count: 2, start_price: 0 })) === JSON.stringify([4900, 5000, 5250]));
ok('countdown: uses the server clock', secondsLeft(new Date(10_000).toISOString(), 2_000, 0) === 8 && secondsLeft(new Date(0).toISOString(), 0, 5_000) === 0);
ok('room line: reserve met says on the market', /on the market/.test(liveLine({ live_status: 'running' }, { live_state: 'open', status: 'live', reserve_met: true, has_reserve: true, sold_price: null, bid_count: 3 })));
ok('room line: paused', /Paused/.test(liveLine({ live_status: 'paused' }, { live_state: 'open', status: 'live', reserve_met: false, has_reserve: true, sold_price: null, bid_count: 3 })));
ok('results: sold shows the price, passed in does not', resultLine({ status: 'sold', sold_price: 12500 }) === 'Sold for $12,500.' && resultLine({ status: 'offers', sold_price: null }).startsWith('Passed in'));
ok('results: below reserve goes to the seller', /referred to the seller/.test(resultLine({ status: 'referred', sold_price: null })));
ok('results: passed in and sold after the auction says so (not an auction result)', resultLine({ status: 'sold', sold_price: 9000, sold_via: 'after_auction' }) === 'Passed in, then sold after the auction for $9,000.' && resultLine({ status: 'sold', sold_price: 9000, sold_via: 'auction' }) === 'Sold for $9,000.');
ok('how sold', howSold({ method: 'tender' }) === 'tender' && howSold({ method: 'auction', live_state: 'waiting' }) === 'live' && howSold({ method: 'auction', live_state: null }) === 'timed');
ok('calls: "On the market" only once the reserve is met', CALLS.find((c) => c.text === 'On the market').needsReserve === true);
ok('errors: paused bidding in plain words', /paused/.test(liveError('live_paused')));
ok('errors: the engine\'s own explanation is used', liveError('ERROR: live_lot_open:knock down the current vehicle first') === 'Knock down the current vehicle first.');
ok('errors: anything else is not ours', liveError('something_else') === null);
ok('errors: a bid in the room before the conditions', liveError('ERROR: enter_first:read and accept the auction conditions in the live room before you bid there') === 'Read and accept the auction conditions in the live room before you bid there.');

// ---- calendar (.ics) ----
ok('ics: commas, semicolons and new lines escaped', icsText('a,b;c\nd\\e') === 'a\\,b\\;c\\nd\\\\e');
const ev = saleEvents([{ id: 7, slug: 'fleet-x', title: 'Fleet, utes', mode: 'live', state: 'QLD', starts_at: '2026-11-01T00:00:00Z', live_status: 'scheduled', seller_label: null, first_end: null, last_end: null, count: 12 },
  { id: 8, slug: 'council', title: 'Council', mode: 'timed', state: null, starts_at: null, live_status: 'scheduled', seller_label: null, first_end: '2026-11-02T08:00:00Z', last_end: '2026-11-02T09:00:00Z', count: 30 }], 'https://tyrebiter.com.au');
ok('ics: a live sale starts at its start time and links to the room', ev[0].start === '2026-11-01T00:00:00Z' && ev[0].url === 'https://tyrebiter.com.au/live/fleet-x' && /^Live auction/.test(ev[0].title));
ok('ics: a fleet sale spans its closing window', ev[1].start === '2026-11-02T08:00:00Z' && ev[1].end === '2026-11-02T09:00:00Z' && ev[1].url.endsWith('/sales/council'));
const ics = icsCalendar('Tyrebiter auctions', ev, '2026-10-21T00:00:00Z');
ok('ics: a valid calendar with two events and reminders', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trimEnd().endsWith('END:VCALENDAR') && (ics.match(/BEGIN:VEVENT/g) || []).length === 2 && /DTSTART:20261101T000000Z/.test(ics) && /TRIGGER:-PT30M/.test(ics));
ok('ics: long lines folded at 75 characters', ics.split('\r\n').every((l) => l.length <= 75), ics.split('\r\n').find((l) => l.length > 75));
ok('calendar day label', calDay('2026-10-22') === 'Thu 22 Oct', calDay('2026-10-22'));

// ---- search: write-offs and how it's sold ----
ok('search: write-off filter values', cleanFilters({ wo: 'writeoff' }).wo === 'writeoff' && cleanFilters({ wo: 'clear' }).wo === 'clear' && !cleanFilters({ wo: 'x' }).wo);
ok('search: how-sold filter values', cleanFilters({ how: 'tender' }).how === 'tender' && cleanFilters({ how: 'live' }).how === 'live' && !cleanFilters({ how: 'auction' }).how);
ok('search: "salvage" and "repairable write off" understood', parseQuery('salvage hilux').f.wo === 'writeoff' && parseQuery('repairable write off ranger').f.wo === 'writeoff');
ok('search: "never written off" is the opposite', parseQuery('never written off corolla').f.wo === 'clear', JSON.stringify(parseQuery('never written off corolla').f));
ok('search: "tender" and "live auction" understood', parseQuery('tractor tender').f.how === 'tender' && parseQuery('live auction utes').f.how === 'live');
ok('search: described in plain words', /Write-offs and salvage/.test(describe({ wo: 'writeoff' })) && /Tender/.test(describe({ how: 'tender' })));
ok('search: the database knows both filters', /f->>'wo' = 'writeoff'/.test(sql) && /f->>'how' = 'tender'/.test(sql) && /query->>'wo'/.test(sql) && /query->>'how'/.test(sql));

console.log(`\n${pass} passed, ${failN} failed`);
fails.forEach((f) => console.log('FAIL:', f));
process.exit(failN ? 1 : 0);
