// Search bar parser and suggestions: node --experimental-strip-types tests/unit/search.test.mjs
import { parseQuery, suggest, cleanFilters, describe, toQueryString } from '../../src/lib/search.ts';
import { specLine } from '../../src/lib/vehicles.ts';

let pass = 0, fail = 0;
const sortObj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortObj(o[k])])) : o);
const eq = (a, b) => JSON.stringify(sortObj(a)) === JSON.stringify(sortObj(b));
function t(q, expect) {
  const { f } = parseQuery(q);
  const got = Object.fromEntries(Object.keys(expect).map((k) => [k, f[k]]));
  const extra = Object.keys(f).filter((k) => !(k in expect));
  if (eq(got, expect) && !extra.length) pass++; else { fail++; console.log('FAIL', JSON.stringify(q), '\n  want', JSON.stringify(expect), '\n  got ', JSON.stringify(f)); }
}
t('hilux', { make: 'Toyota', model: 'HiLux', cat: 'utes' });
t('Toyota Hilux SR5 under 30k qld diesel', { make: 'Toyota', model: 'HiLux', cat: 'utes', max: '30000', state: 'QLD', fuel: 'diesel', q: 'sr5' });
t('land cruiser 79 series', { make: 'Toyota', model: 'LandCruiser 70', cat: 'utes' });
t('landcruiser', { make: 'Toyota', model: 'LandCruiser', cat: 'utes' });
t('prado 2015-2018', { make: 'Toyota', model: 'LandCruiser Prado', cat: 'utes', ymin: '2015', ymax: '2018' });
t('ford ranger', { make: 'Ford', model: 'Ranger', cat: 'utes' });
t('ranger', { q: 'ranger' });
t('cx-5 automatic', { make: 'Mazda', model: 'CX-5', cat: 'cars', trans: 'auto' });
t('mazda 3 hatch', { make: 'Mazda', model: 'Mazda3', cat: 'cars', type: 'hatch' });
t('toyota 86', { make: 'Toyota', model: '86', cat: 'cars' });
t('porsche 911', { make: 'Porsche', model: '911', cat: 'cars' });
t('dual cab ute 4x4 under $25,000', { cat: 'utes', type: 'dual-cab', drive: '4WD', max: '25000' });
t('motorbike', { cat: 'motorbikes' });
t('lams bike under 5k', { cat: 'motorbikes', lams: '1', max: '5000' });
t('250cc dirt bike', { cat: 'motorbikes', type: 'dirt', ccmin: '225', ccmax: '275' });
t('harley fat boy', { make: 'Harley-Davidson', model: 'Fat Boy', cat: 'motorbikes' });
t('yamaha mt-07', { make: 'Yamaha', model: 'MT-07', cat: 'motorbikes' });
t('jayco pop top sleeps 4', { make: 'Jayco', cat: 'caravans', type: 'pop-top', berths: '4' });
t('caravan under 6m', { cat: 'caravans', lenmax: '6' });
t('caravan sleeps 4 qld', { cat: 'caravans', berths: '4', state: 'QLD' });
t('motorhome nsw', { cat: 'caravans', type: 'motorhome', state: 'NSW' });
t('tinny', { cat: 'boats', type: 'tinny' });
t('jet ski under 10k', { cat: 'boats', type: 'jet-ski', max: '10000' });
t('5m boat', { cat: 'boats', lenmin: '4.3', lenmax: '5.8' });
t('tipper car licence', { cat: 'trucks', type: 'tipper', lic: 'C' });
t('isuzu npr tipper', { make: 'Isuzu', model: 'NPR', cat: 'trucks', type: 'tipper' });
t('prime mover', { cat: 'trucks', type: 'prime-mover' });
t('kenworth t909', { make: 'Kenworth', model: 'T909', cat: 'trucks' });
t('mini excavator', { cat: 'machinery', type: 'excavator' });
t('mini cooper', { make: 'Mini', model: 'Cooper', cat: 'cars' });
t('kubota tractor under 2000 hours', { make: 'Kubota', cat: 'machinery', type: 'tractor', hrs: '2000' });
t('forklift', { cat: 'machinery', type: 'forklift' });
t('box trailer', { cat: 'trailers', type: 'box' });
t('horse float', { cat: 'trailers', type: 'horse' });
t('car trailer', { cat: 'trailers', type: 'car' });
t('toyota coaster', { make: 'Toyota', model: 'Coaster', cat: 'buses' });
t('2015 corolla', { make: 'Toyota', model: 'Corolla', cat: 'cars', ymin: '2015', ymax: '2015' });
t('corolla after 2015', { make: 'Toyota', model: 'Corolla', cat: 'cars', ymin: '2015' });
t('corolla under 100,000km', { make: 'Toyota', model: 'Corolla', cat: 'cars', km: '100000' });
t('low km hatch', { cat: 'cars', type: 'hatch', km: '100000' });
t('car under 5000', { cat: 'cars', max: '5000' });
t('first car 3k-6k', { cat: 'cars', min: '3000', max: '6000', q: 'first' });
t('cars brisbane', { cat: 'cars', state: 'QLD' });
t('silver commodore', { make: 'Holden', model: 'Commodore', cat: 'cars', q: 'silver' });
t('no reserve ute', { cat: 'utes', nores: '1' });
t('buy now', { buynow: '1' });
t('ending today', { ending: 'today' });
t('electric', { fuel: 'electric' });
t('tesla model 3', { make: 'Tesla', model: 'Model 3', cat: 'cars' });
t('vw golf gti', { make: 'Volkswagen', model: 'Golf', cat: 'cars', q: 'gti' });
t('gti', { make: 'Volkswagen', model: 'Golf', cat: 'cars', q: 'gti' });
t('xr6 turbo', { make: 'Ford', model: 'Falcon', cat: 'cars', q: 'xr6 turbo' });
t('merc sprinter', { make: 'Mercedes-Benz', model: 'Sprinter', cat: 'vans' });
t('10432', { q: '10432' });
t('lot 10432', { q: '10432' });
t('toowoomba', { q: 'toowoomba' });
t('', {});
t('   ', {});
t('$%^&*', {});
t('lexus is', { make: 'Lexus', model: 'IS', cat: 'cars' });
t('ute in perth', { cat: 'utes', state: 'WA' });
t('northern territory', { state: 'NT' });
t('hiace van', { make: 'Toyota', model: 'HiAce', cat: 'vans' });
t('d-max', { make: 'Isuzu', model: 'D-Max', cat: 'utes' });
t('bt50 manual', { make: 'Mazda', model: 'BT-50', cat: 'utes', trans: 'manual' });
t('triton or navara', { make: 'Mitsubishi', model: 'Triton', cat: 'utes', q: 'navara' });

// clean filters
const c = cleanFilters({ cat: 'spaceships', min: 'abc', ymin: '2015', state: 'qld', trans: 'Auto', sort: 'ending', body: 'Tipper', junk: 'x' });
if (eq(c, { ymin: '2015', state: 'QLD', trans: 'auto', q: 'Tipper' })) pass++; else { fail++; console.log('FAIL cleanFilters', JSON.stringify(c)); }
const qs = toQueryString({ make: 'Toyota', model: 'HiLux', max: '30000' });
if (qs === 'make=Toyota&model=HiLux&max=30000') pass++; else { fail++; console.log('FAIL toQueryString', qs); }
const d = describe({ make: 'Toyota', model: 'HiLux', max: '30000', state: 'QLD', fuel: 'diesel' });
if (d === 'Toyota HiLux · Under $30,000 · Diesel · QLD') pass++; else { fail++; console.log('FAIL describe', d); }

// suggestions
function s(q, want, n = 4) {
  const got = suggest(q, { makes: { Toyota: 40 }, models: { 'Toyota|HiLux': 12 }, cats: { motorbikes: 9 } }).slice(0, n).map((x) => x.label);
  if (want.every((w) => got.includes(w))) pass++; else { fail++; console.log('FAIL suggest', JSON.stringify(q), '\n  want', want, '\n  got ', got); }
}
s('hil', ['Toyota HiLux']);
s('toyota h', ['Toyota HiLux', 'Toyota HiAce']);
s('moto', ['Motorbikes', 'Motorhome']);
s('jet', ['Jet ski']);
s('hilux under 30k', ['Toyota HiLux · Under $30,000']);
s('10432', ['Go to lot 10432'], 2);
s('queens', ['Queensland']);
s('carav', ['Caravans & motorhomes']);
const hl = suggest('hilux under 30k qu').find((x) => x.label === 'Queensland');
if (hl && hl.f.make === 'Toyota' && hl.f.max === '30000' && hl.f.state === 'QLD') pass++; else { fail++; console.log('FAIL suggestion keeps earlier words', JSON.stringify(hl)); }

// spec lines
const sl = [specLine({ category: 'motorbikes', odometer: 12000, engine_cc: 689, lams: true }), specLine({ category: 'boats', kind: 'tinny', length_m: 4.2, hours: 140 }), specLine({ category: 'cars', odometer: 1000, transmission: 'Auto', fuel: 'Petrol' })];
if (eq(sl, ['12,000 km · 689 cc · LAMS', 'Tinny · 4.2 m · 140 hrs', '1,000 km · Auto · Petrol'])) pass++; else { fail++; console.log('FAIL specLine', sl); }

// speed: the parser runs on every keystroke
const t0 = performance.now(); for (let i = 0; i < 2000; i++) { parseQuery('toyota hilux sr5 dual cab 4x4 under 30k in qld diesel auto 2015-2020'); suggest('toyota hil'); }
const ms = (performance.now() - t0) / 2000;
if (ms < 2) pass++; else { fail++; console.log('FAIL too slow per keystroke', ms.toFixed(2), 'ms'); }

console.log(`\n${pass} passed, ${fail} failed (parse + suggest ${ms.toFixed(2)} ms per keystroke)`);
process.exit(fail ? 1 : 0);
