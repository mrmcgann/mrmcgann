// The "Sell your vehicle" form: what's required, how answers are tidied, reserve or no reserve, the drawn signature.
// node --experimental-strip-types tests/unit/sell.test.mjs
import {
  validateSell, cleanDisclosures, cleanSignature, signatureInk, signatureSvg, agreementPrefill, needsDetails, photoSlots,
  wholeDollars, PHOTO_MAX, QUESTIONS,
} from '../../src/lib/sellForm.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

const now = new Date('2026-10-10T00:00:00Z');
const allNo = Object.fromEntries(QUESTIONS.map(([k]) => [k, k === 'runs' ? 'yes' : 'no']));
const stroke = (y = 100) => Array.from({ length: 60 }, (_, i) => [20 + i * 8, y + Math.sin(i / 3) * 30]).flat();
const sig = { w: 600, h: 200, strokes: [stroke()] };
const good = {
  category: 'utes', registration: 'registered', rego: 'abc 123', state: 'qld', vin: '', year: '2018', make: 'Toyota', model: 'HiLux',
  variant: 'SR5', odometer: '142,000', transmission: 'Automatic', fuel: 'Diesel', colour: 'White', condition: 'good',
  disclosures: { ...allNo, write_off: 'none', keys: '2', service_books: 'yes' },
  reserve_type: 'reserve', reserve_amount: '$32,500', suburb: 'Toowoomba', postcode: '4350',
  name: 'Sam  Driver', mobile: '0412 345 678', email: 'sam@example.com', sell_when: 'now', owner_type: 'individual',
  photos: ['9b2c1c1e-1111-4a4a-9c9c-000000000001/1728-abc.jpg'], agree: true, owner: true, signed_name: 'sam driver', signature: sig,
};
const v = (over = {}, opts = {}) => validateSell({ ...good, ...over }, { now, ...opts });

// ---------- a complete form passes, tidied ----------
{
  const r = v();
  ok('complete form has no errors', Object.keys(r.errors).length === 0, JSON.stringify(r.errors));
  ok('plate tidied', r.value.rego === 'ABC123', r.value.rego);
  ok('state upper-cased', r.value.state === 'QLD');
  ok('kilometres to a number', r.value.odometer === 142000);
  ok('reserve to whole dollars', r.value.reserve_amount === 32500);
  ok('typed name matches ignoring case and spaces', !r.errors.signed_name);
  ok('category kept', r.value.category === 'utes');
  ok('disclosures stored like the agreement', r.value.disclosures.starts_and_drives === 'yes' && r.value.disclosures.accident === 'no');
}

// ---------- what's required ----------
ok('plate needed when registered', !!v({ rego: '' }).errors.rego);
ok('no plate needed when unregistered', !v({ registration: 'unregistered', rego: '' }).errors.rego);
ok('unregistered drops the plate', v({ registration: 'unregistered' }).value.rego === '');
ok('state needed', !!v({ state: 'XX' }).errors.state);
ok('year in range', !!v({ year: '1850' }).errors.year && !!v({ year: '2029' }).errors.year && !v({ year: '2027' }).errors.year);
ok('make and model needed', !!v({ make: ' ' }).errors.make && !!v({ model: '' }).errors.model);
ok('kilometres needed for a ute', !!v({ odometer: '' }).errors.odometer);
ok('hours for machinery', v({ category: 'machinery', odometer: '' }).errors.odometer?.includes('hours'));
ok('no meter for a trailer', !v({ category: 'trailers', odometer: '' }).errors.odometer && v({ category: 'trailers' }).value.odometer === null);
ok('condition needed', !!v({ condition: '' }).errors.condition && !!v({ condition: 'mint' }).errors.condition);
ok('every yes/no answered', !!v({ disclosures: { ...allNo, hail: '' } }).errors.disclosures);
ok('a yes needs details', !!v({ disclosures: { ...allNo, accident: 'yes' } }).errors.q_accident);
ok('details given are kept', v({ disclosures: { ...allNo, accident: 'yes', accident_details: 'Rear bumper 2022' } }).value.disclosures.accident === 'Yes: Rear bumper 2022');
ok('"does it run: no" needs details', !!v({ disclosures: { ...allNo, runs: 'no' } }).errors.q_runs);
ok('finance owing needs an amount', !!v({ disclosures: { ...allNo, finance: 'yes' } }).errors.disclosures);
ok('finance amount tidied', v({ disclosures: { ...allNo, finance: 'yes', finance_amount: '$12,000' } }).value.disclosures.finance_amount === '12000');
ok('statutory write-off can still be submitted (sold unregistered for parts)', !v({ registration: 'unregistered', disclosures: { ...allNo, write_off: 'statutory' } }).errors.disclosures);
ok('reserve or no reserve must be chosen', !!v({ reserve_type: '' }).errors.reserve_type);
ok('no reserve needs no amount', !v({ reserve_type: 'none', reserve_amount: '' }).errors.reserve_amount && v({ reserve_type: 'none', reserve_amount: '5000' }).value.reserve_amount === null);
ok('reserve needs an amount', !!v({ reserve_amount: '' }).errors.reserve_amount && !!v({ reserve_amount: '50' }).errors.reserve_amount);
ok('postcode is 4 digits', !!v({ postcode: '435' }).errors.postcode && !!v({ postcode: 'abcd' }).errors.postcode);
ok('first and last name', !!v({ name: 'Sam', signed_name: 'Sam' }).errors.name);
ok('mobile needed', !!v({ mobile: '12' }).errors.mobile);
ok('email needed (they get a copy)', !!v({ email: 'sam' }).errors.email);
ok('at least one photo', !!v({ photos: [] }).errors.photos);
ok('photo paths are checked', !!v({ photos: ['../../etc/passwd'] }).errors.photos && !!v({ photos: ['a/b/c.jpg'] }).errors.photos);
ok('at most PHOTO_MAX photos kept', v({ photos: Array.from({ length: 14 }, (_, i) => `f/${i}.jpg`) }).value.photos.length === PHOTO_MAX);
ok('must tick agree', !!v({ agree: false }).errors.agree && !!v({ agree: 'true' }).errors.agree);
ok('must tick owner', !!v({ owner: undefined }).errors.owner);
ok('typed name must match', !!v({ signed_name: 'Someone Else' }).errors.signed_name);
ok('signature needed', !!v({ signature: null }).errors.signature);
ok('typed name only when they can\'t draw', !v({ signature: null, no_draw: true }).errors.signature);
ok('signature check can be skipped (server re-checks separately)', !v({ signature: null }, { requireSignature: false }).errors.signature);
ok('unknown values fall back', v({ sell_when: 'tomorrow' }).value.sell_when === 'now'
  && v({ owner_type: 'pirate' }).value.owner_type === 'individual' && v({ transmission: 'Sideways' }).value.transmission === '' && v({ fuel: 'Coal' }).value.fuel === '');
ok('transmission stored the way listings store it', v().value.transmission === 'Auto' && v({ transmission: 'Auto' }).value.transmission === 'Auto' && v({ transmission: '6 SP MANUAL' }).value.transmission === 'Manual');
ok('fuel tidied', v().value.fuel === 'Diesel' && v({ fuel: 'unleaded' }).value.fuel === 'Petrol');
ok('company owners are businesses', v({ owner_type: 'company' }).value.business === true && v({ owner_type: 'company' }).value.disclosures.business === 'yes');
ok('long text is cut', v({ make: 'x'.repeat(100) }).value.make.length === 40);

// ---------- the yes/no rules ----------
ok('needsDetails: yes for most', needsDetails('hail', 'yes') && !needsDetails('hail', 'no'));
ok('needsDetails: no for runs', needsDetails('runs', 'no') && !needsDetails('runs', 'yes'));
ok('cleanDisclosures: keys clamped', cleanDisclosures({ ...allNo, keys: '42' }).value.keys === '9');
ok('cleanDisclosures: bad write-off falls back', cleanDisclosures({ ...allNo, write_off: 'yes please' }).value.write_off === 'none');

// ---------- guided photos ----------
ok('five guided photos', photoSlots('cars').length === 5 && photoSlots('cars')[0][0] === 'front');
ok('dash photo for road vehicles', photoSlots('cars')[4][1].includes('Dash'));
ok('hour meter for machinery', photoSlots('machinery')[4][1] === 'Hour meter');
ok('plate or VIN for trailers', photoSlots('trailers')[4][1] === 'Plate or VIN');

// ---------- money ----------
ok('wholeDollars', wholeDollars('$12,345.60') === 12346 && wholeDollars('') === null && wholeDollars('abc') === null);

// ---------- the drawn signature ----------
ok('ink: a real signature has length', signatureInk(sig) > 300);
ok('ink: nothing', signatureInk(null) === 0 && signatureInk({ w: 1, h: 1, strokes: [] }) === 0);
ok('clean: a real one passes', !!cleanSignature(sig));
ok('clean: a dot is not a signature', cleanSignature({ w: 600, h: 200, strokes: [[100, 100]] }) === null);
ok('clean: a short tick is not a signature', cleanSignature({ w: 600, h: 200, strokes: [[100, 100, 130, 110]] }) === null);
ok('clean: rejects text', cleanSignature({ w: 600, h: 200, strokes: [['<script>', 1]] }) === null);
ok('clean: rejects odd number lists', cleanSignature({ w: 600, h: 200, strokes: [[1, 2, 3]] }) === null);
ok('clean: rejects a silly box', cleanSignature({ w: 99999, h: 200, strokes: [stroke()] }) === null && cleanSignature({ w: 600, h: 0, strokes: [stroke()] }) === null);
ok('clean: rejects too many strokes', cleanSignature({ w: 600, h: 200, strokes: Array.from({ length: 81 }, () => stroke()) }) === null);
ok('clean: rejects too many points', cleanSignature({ w: 600, h: 200, strokes: Array.from({ length: 70 }, () => stroke()) }) === null);
{
  const c = cleanSignature({ w: 600, h: 240, strokes: [[...stroke(), -50, 900, 700.04, 120.06]] });
  const last = c.strokes[0].slice(-4);
  ok('clean: points kept inside the box and rounded', last[0] === 0 && last[1] === 240 && last[2] === 600 && last[3] === 120.1, JSON.stringify(last));
  ok('clean: any pad shape (taller box) is fine', c.h === 240);
}
{
  const svg = signatureSvg(cleanSignature(sig));
  ok('svg: our own markup only', /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 600 200" width="600" height="200"><path d="[ML0-9. l-]+" fill="none" stroke="#1D1D1F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"\/><\/svg>$/.test(svg), svg.slice(0, 120));
  ok('svg: numbers only in the path', /<path d="[ML0-9. l-]+"/.test(svg));
  ok('svg: a dot still draws', signatureSvg({ w: 600, h: 200, strokes: [[10, 10], ...sig.strokes] }).includes('M10 10l0.1 0'));
}

// ---------- the agreement page is filled in from the sell form ----------
{
  const stored = v({ disclosures: { ...allNo, accident: 'yes', accident_details: 'Rear bumper', runs: 'no', runs_details: 'Flat battery', finance: 'yes', finance_amount: '9000', lender_name: 'Big Bank', keys: '1', service_books: 'yes', known_faults: 'Air-con' } }).value.disclosures;
  const p = agreementPrefill(stored);
  ok('prefill: yes with details', p.accident === 'yes' && p.accident_details === 'Rear bumper');
  ok('prefill: runs no with details', p.runs === 'no' && p.runs_details === 'Flat battery');
  ok('prefill: plain no', p.hail === 'no' && !p.hail_details);
  ok('prefill: finance', p.finance === 'yes' && p.finance_amount === '9000' && p.lender_name === 'Big Bank');
  ok('prefill: keys, books, faults', p.keys === '1' && p.service_books === 'yes' && p.known_faults === 'Air-con');
  ok('prefill: nothing stored', JSON.stringify(agreementPrefill(null)) === '{"service_books":"no"}');
  // and back through the agreement's own tidying, unchanged
  const again = cleanDisclosures(p).value;
  ok('prefill round-trips', again.accident === stored.accident && again.starts_and_drives === stored.starts_and_drives && again.finance_amount === stored.finance_amount);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
