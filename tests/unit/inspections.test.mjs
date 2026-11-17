// Book an inspection, two ways (inspect it yourself, or our mobile mechanic); the details truck buyers look for;
// Queensland first; and the words for a truck passed in below the reserve.
// node --experimental-strip-types tests/unit/inspections.test.mjs
import { readFileSync } from 'node:fs';
import { inspectionAck, inspectionDays, cleanMechanicSlots, cancelTerms, inspectionError, mechanicFee, mechanicOn, feeText, gstIn, mechanicOption,
  INSPECT_YOURSELF, MECHANIC_CHECKS, MECHANIC_LIMITS, MECHANIC_PARTS, INSPECTION_STATUS, isOpen } from '../../src/lib/inspections.ts';
import { truckDetails, truckFeatures, sellStates, navMenus, BRAKES, TRUCK_FEATURES, CAB_LABEL, SUSPENSION_LABEL } from '../../src/lib/vehicles.ts';
import { RESERVE_NOTE, PASSED_IN_TOP, passedInTop } from '../../src/lib/estimate.ts';
import { checkIt } from '../../src/lib/transport.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const m38 = readFileSync(new URL('../../supabase/migrations/20261117000038_queensland_mechanic.sql', import.meta.url), 'utf8');

// the fee and the switch, from the public settings
ok('fee: $495 by default, whole dollars, never negative', mechanicFee(null) === 495 && mechanicFee({ mechanic_fee: 549.6 }) === 550 && mechanicFee({ mechanic_fee: -5 }) === 495 && mechanicFee({ mechanic_fee: 'x' }) === 495);
ok('fee: on unless switched off', mechanicOn(null) && mechanicOn({}) && !mechanicOn({ mechanic: false }));
ok('fee: written the way the database writes it', feeText(495) === '495' && feeText(1250) === '1,250');
ok('fee: the GST in it is one eleventh', gstIn(495) === 45 && gstIn(440) === 40);
ok('fee: the migration sets the same default', /"mechanic": true, "mechanic_fee": 495/.test(m38) && /\["QLD"\]/.test(m38));

// what the member agrees to (the database test holds the database's words to these)
const ack = inspectionAck(495);
ok('agreement: our mechanic, the fee with GST, paid before the visit, lapses if unpaid', /Super Trucker's mobile mechanic/.test(ack) && /\$495 including GST/.test(ack) && /pay by bank transfer before the mechanic goes/.test(ack) && /the booking lapses/.test(ack));
ok('agreement: no road test, nothing taken apart, an opinion on the day', /no road test and nothing taken apart/.test(ack) && /opinion on the day/.test(ack) && /can't find every fault/.test(ack));
ok('agreement: we sell for the owner, the owner is told, faults go on the listing', /owner's agent/.test(ack) && /owner is told what the mechanic finds/.test(ack) && /added to the listing for every bidder/.test(ack));
ok('agreement: the refund rule', /full refund until 24 hours before the booked time/.test(ack));
ok('agreement: never "no warranty" or "non-refundable"', !/no warranty|non-refundable/i.test(ack + MECHANIC_LIMITS + MECHANIC_CHECKS.join(' ')));

// the two ways, side by side
const opt = mechanicOption(495);
ok('two ways: inspect it yourself, free; or send our mechanic, with the price', INSPECT_YOURSELF.title === 'Inspect it yourself' && INSPECT_YOURSELF.price === 'Free' && opt.title === 'Send our mobile mechanic' && opt.price === '$495 incl. GST');
ok('two ways: yourself means a booked time, your own mechanic welcome, no road test', /Book a time/.test(INSPECT_YOURSELF.lines[0]) && /your own mechanic/.test(INSPECT_YOURSELF.lines[1]) && /No road test/.test(INSPECT_YOURSELF.lines[2]));
ok("two ways: our mechanic means you don't attend, a written report, paid by transfer, the refund rule", /don't need to be there/.test(opt.lines[0]) && /written report with photos/.test(opt.lines[1]) && /bank transfer/.test(opt.lines[2]) && /24 hours before for a full refund/.test(opt.lines[2]));
ok('two ways: the mechanic checks the engine running, underneath, the equipment, and says what it needs', MECHANIC_CHECKS.length === 4 && /run/.test(MECHANIC_CHECKS[0]) && /Underneath/.test(MECHANIC_CHECKS[1]) && /tailgate loader/.test(MECHANIC_CHECKS[2]));
ok('two ways: the limits in one line', /No road test, nothing taken apart, and no certificate/.test(MECHANIC_LIMITS));
ok('the listing steps: both ways, and no mechanic step when it is switched off', checkIt({ collect_from: 'seller', in_person_viewing: true }).some(([t]) => /Inspect it yourself/.test(t)) && checkIt({ collect_from: 'seller', in_person_viewing: true }).some(([t]) => /mobile mechanic/.test(t))
  && !checkIt({ collect_from: 'seller' }, { mechanic: false }).some(([t]) => /mechanic/i.test(t)));

// the days: mornings and afternoons, from tomorrow, before the auction day
const NOW = Date.parse('2026-11-16T23:00:00Z'); // 9 am Tuesday 17 November in Brisbane
const days = inspectionDays('2026-11-26T09:00:00Z', NOW); // the auction: 7 pm Thursday 26 November in Brisbane
ok('days: from tomorrow to the day before the auction', days[0] === '2026-11-18' && days[days.length - 1] === '2026-11-25' && days.length === 8, JSON.stringify(days));
ok('days: at most three weeks out', inspectionDays(null, NOW).length === 21);
ok('days: none when the auction is tomorrow', inspectionDays('2026-11-18T09:00:00Z', NOW).length === 0);
ok('parts: mornings and afternoons only (mechanics work in daylight)', MECHANIC_PARTS.map(([p]) => p).join() === 'morning,afternoon');
let r = cleanMechanicSlots([{ day: '2026-11-18', part: 'morning' }, { day: '2026-11-18', part: 'morning' }, { day: '2026-11-19', part: 'evening' }], days);
ok('slots: duplicates and evenings dropped', r.slots.length === 1 && r.error === null, JSON.stringify(r));
r = cleanMechanicSlots([], days); ok('slots: at least one', r.error === 'Pick at least one day that suits you.');
r = cleanMechanicSlots(days.slice(0, 4).map((day) => ({ day, part: 'afternoon' })), days); ok('slots: up to three', r.slots.length === 3 && /up to 3/.test(r.error || ''));

// cancelling
const at = (h) => new Date(NOW + h * 3600_000).toISOString();
ok('cancel: free before it is paid', cancelTerms({ status: 'booked', starts_at: at(30), fee: 495 }, NOW).can && cancelTerms({ status: 'booked', starts_at: at(30), fee: 495 }, NOW).refund === 0);
ok('cancel: a full refund more than 24 hours out', cancelTerms({ status: 'paid', starts_at: at(30), fee: 495 }, NOW).refund === 495);
ok('cancel: not online inside 24 hours of a paid visit', !cancelTerms({ status: 'paid', starts_at: at(20), fee: 495 }, NOW).can);
ok('cancel: nothing to cancel once it is done', !cancelTerms({ status: 'done', starts_at: at(-20), fee: 495 }, NOW).can && !isOpen({ status: 'done' }) && isOpen({ status: 'paid' }));
ok('status words for every status', ['requested', 'booked', 'paid', 'done', 'cancelled', 'declined'].every((x) => INSPECTION_STATUS[x]));

// the database's refusals, in plain words (and every code the migration raises has words)
const codes = [...new Set(m38.match(/'inspection_[a-z_]+'/g).map((x) => x.slice(1, -1)))];
ok('errors: every refusal the migration raises has its own words', codes.every((c) => inspectionError(`ERROR: ${c}`) && !/couldn't book that inspection/.test(inspectionError(`ERROR: ${c}`))), codes.filter((c) => !inspectionError(`ERROR: ${c}`) || /couldn't book that inspection/.test(inspectionError(`ERROR: ${c}`))).join());
ok('errors: "times" and "time" are told apart', /mornings or afternoons/.test(inspectionError('inspection_times')) && /12 hours/.test(inspectionError('inspection_time')) && /three weeks/.test(inspectionError('inspection_times_range')));
ok('errors: others are left alone', inspectionError('something else') === null);

// the details truck buyers look for, in groups (like the truck sites' listing details and further details)
const truck = { year: 2012, make: 'Volvo', model: 'FH', variant: '16 600', category: 'trucks', kind: 'prime-mover', engine: '16.1L turbo-diesel', transmission: 'Auto', fuel: 'Diesel',
  odometer: 1240000, hours: null, colour: 'Blue', seats: 2, keys: 2, gvm_kg: 26500, registration: 'unregistered', id: 10703, configuration: '6x4', gcm_kg: 90000, tare_kg: 10200,
  engine_hp: 600, cab: 'sleeper', suspension: 'air', emissions: 'Euro 5 (ADR 80/03)', gearbox: 'Volvo I-Shift 12-speed', rear_axles: 'Tandem drive, hub reduction', brakes: 'abs_disc_drum',
  wheelbase_mm: 3800, fuel_capacity_l: 1100, body_size: null, features: ['fridge', 'aircon', 'fifth_wheel'] };
const g = truckDetails(truck, 'Roma, QLD');
const row = (key, label) => g.find((x) => x.key === key)?.rows.find(([k]) => k === label)?.[1];
ok('details: four groups in order', g.map((x) => x.key).join() === 'listing,driveline,weights,cab', g.map((x) => x.key).join());
ok('details: the listing group', row('listing', 'Odometer') === '1,240,000 km' && row('listing', 'Registration') === 'Sold without plates' && row('listing', "Where it's kept") === 'Roma, QLD' && row('listing', 'Type') === 'Prime mover' && row('listing', 'Lot') === '10703');
ok('details: the engine and driveline', row('driveline', 'Power') === '600 hp' && row('driveline', 'Fuel capacity') === '1,100 litres' && row('driveline', 'Gearbox') === 'Volvo I-Shift 12-speed' && row('driveline', 'Brakes') === 'ABS, disc front and drum rear' && row('driveline', 'Rear suspension') === 'Airbag');
ok('details: weights and size', row('weights', 'GVM') === '26,500 kg' && row('weights', 'GCM') === '90,000 kg' && row('weights', 'Wheelbase') === '3,800 mm' && row('weights', 'Body size') === undefined);
ok('details: the cab', row('cab', 'Cab') === 'Sleeper cab' && row('cab', 'Seats') === '2');
ok('details: empty rows and empty groups are left out', truckDetails({ year: 2020, make: 'Hino' }).map((x) => x.key).join() === 'listing');
ok('details: a registered truck says where and until when', truckDetails({ registration: 'registered', rego_state: 'QLD', rego_expiry: '2027-03-31' })[0].rows.find(([k]) => k === 'Registration')[1] === 'Registered in QLD, until Mar 2027');
ok('details: the depot way names the place differently', truckDetails({ year: 2020 }, 'Our depot in Eagle Farm, QLD', 'Collect from')[0].rows.some(([k, v]) => k === 'Collect from' && /depot/.test(v)));
ok('features: in the order of the list, with their words', truckFeatures(truck.features).join() === 'Air conditioning,Fifth wheel,Cab fridge' && truckFeatures(null).length === 0);
// the words match the database's word for word
const sqlLabel = (field, key) => (m38.match(new RegExp(`when '${key}' then '([^']+)'`)) || [])[1];
ok('labels: brakes as the database writes them', BRAKES.every(([k, label]) => sqlLabel('brakes', k) === label), JSON.stringify(BRAKES.map(([k, l]) => [k, l, sqlLabel('brakes', k)])));
ok('labels: features as the database writes them, and the same list it checks', TRUCK_FEATURES.every(([k, label]) => sqlLabel('feature', k) === label)
  && TRUCK_FEATURES.every(([k]) => new RegExp(`'${k}'`).test(m38.slice(m38.indexOf('features <@'), m38.indexOf('features <@') + 400))));
ok('labels: cab and suspension as the database writes them', Object.entries(CAB_LABEL).every(([k, l]) => sqlLabel('cab', k) === l) && Object.entries(SUSPENSION_LABEL).every(([k, l]) => sqlLabel('suspension', k) === l));
ok('key facts: every truck detail is logged when it changes on a live listing', ['configuration', 'gcm_kg', 'tare_kg', 'engine_hp', 'cab', 'suspension', 'emissions', 'gearbox', 'rear_axles', 'brakes', 'wheelbase_mm', 'fuel_capacity_l', 'body_size', 'features', 'plates_note']
  .every((f) => m38.includes(`('${f}','`) && m38.includes(`old.${f}`) && m38.includes(`new.${f}`)));

// the header shows only what we sell: with trucks alone, the truck types (like the truck sites)
const tm = navMenus(['trucks']);
ok('menus: trucks alone are one menu of truck types', tm.length === 1 && tm[0].label === 'Trucks' && tm[0].items[0][0] === 'All trucks'
  && tm[0].items.some(([l, h]) => l === 'Prime mover' && h === '/auctions?cat=trucks&type=prime-mover') && tm[0].items.some(([l]) => l === 'Tipper'));
ok('menus: several categories keep their groups, trimmed to what we sell', JSON.stringify(navMenus(['trucks', 'cars']).map((m) => [m.label, m.items.map(([l]) => l)])) === JSON.stringify([['Cars & bikes', ['Cars']], ['Trucks & trailers', ['Trucks']]]));

// Queensland first
ok('states: Queensland when the setting is missing or empty', sellStates(null).join() === 'QLD' && sellStates({ states: [] }).join() === 'QLD');
ok('states: the setting, cleaned', sellStates({ states: ['qld', 'NSW', 'XX', 'QLD'] }).join() === 'QLD,NSW');

// passed in below the reserve: one of our sales consultants is in touch, and nothing is promised in between
ok('reserve: what happens below it, beside the reserve sign', /passed in: it isn't sold, and nobody owes anything/.test(RESERVE_NOTE) && /one of our sales consultants/.test(RESERVE_NOTE));
ok("reserve: never promises a sale after the auction", !/after the auction|private|negotiat|deal/i.test(RESERVE_NOTE + PASSED_IN_TOP));
ok('passed in: the highest bidder hears from a sales consultant, about whether it will be in a later auction', /One of our sales consultants will be in touch about it, including whether it'll be offered at a later auction/.test(PASSED_IN_TOP) && /you don't owe anything/.test(PASSED_IN_TOP));
ok('passed in: with the amount it reached', passedInTop(48000) === `Bidding reached $48,000. ${PASSED_IN_TOP}` && passedInTop(null) === PASSED_IN_TOP);
const sqlTop = (m38.match(/passed_in_top_text\(\) returns text\s+language sql immutable as \$\$\s+select '([\s\S]*?)';\s+\$\$/) || [])[1];
const sqlWords = sqlTop?.replace(/'\s*\n\s*\|\|\s*'/g, '').replace(/''/g, "'");
ok('passed in: the database sends the same words', sqlWords === PASSED_IN_TOP, JSON.stringify([sqlWords, PASSED_IN_TOP]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
