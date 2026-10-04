// Plate lookup tidying: node --experimental-strip-types tests/unit/rego.test.mjs
import { normalizePlate, isPlate, normalizeVin, isVin, categoryFor, finishVehicle, publicVehicle, tidyFuel, tidyTransmission, vehicleLine } from '../../src/lib/rego.ts';
import { parseQuery, cleanFilters, describeParts } from '../../src/lib/search.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

ok('plate: spaces and dashes removed, upper case', normalizePlate(' abc-123 ') === 'ABC123');
ok('plate: valid', isPlate('ABC123') && !isPlate(''));
ok('vin: 17 characters, no I/O/Q', isVin(normalizeVin('mnaumff50hw000001')) && !isVin('MNAUMFF50HW00000I') && !isVin('ABC'));
const c = (body, make, model) => categoryFor(body, make, model);
ok('category: dual cab utility', JSON.stringify(c('Dual Cab Utility')) === JSON.stringify({ category: 'utes', kind: 'dual-cab' }), JSON.stringify(c('Dual Cab Utility')));
ok('category: cab chassis', c('CAB CHASSIS').kind === 'cab-chassis');
ok('category: motorcycle', c('MOTOR CYCLE').category === 'motorbikes');
ok('category: scooter', c('Motor Scooter').kind === 'scooter');
ok('category: prime mover', JSON.stringify(c('PRIME MOVER')) === JSON.stringify({ category: 'trucks', kind: 'prime-mover' }));
ok('category: tipper', c('TIPPER').category === 'trucks');
ok('category: caravan is not a van', c('CARAVAN').category === 'caravans');
ok('category: van', c('PANEL VAN').category === 'vans');
ok('category: box trailer', JSON.stringify(c('BOX TRAILER')) === JSON.stringify({ category: 'trailers', kind: 'box' }));
ok('category: bus', c('BUS').category === 'buses');
ok('category: sedan', JSON.stringify(c('SEDAN', 'Toyota', 'Corolla')) === JSON.stringify({ category: 'cars', kind: 'sedan' }));
ok('category: a HiLux wagon is a ute-and-4x4', c('WAGON', 'Toyota', 'HiLux').category === 'utes');
ok('fuel', tidyFuel('DIESEL') === 'Diesel' && tidyFuel('Unleaded Petrol') === 'Petrol' && tidyFuel('PETROL/ELECTRIC HYBRID') === 'Hybrid');
ok('transmission', tidyTransmission('6 SP AUTOMATIC') === 'Auto' && tidyTransmission('MANUAL') === 'Manual' && tidyTransmission('CONTINUOUS VARIABLE') === 'CVT');
const v = finishVehicle({ year: 2017, make: 'FORD', model: 'RANGER', variant: 'xlt 3.2 (4x4)', body: 'DUAL CAB UTILITY', colour: 'WHITE', fuel: 'DIESEL', transmission: 'AUTOMATIC', vin: 'mnaumff50hw000001' });
ok('finish: tidy make and model', v.make === 'Ford' && v.model === 'Ranger', JSON.stringify(v));
ok('finish: description', v.description === '2017 Ford Ranger XLT 3.2 (4x4)', v.description);
ok('finish: drive from the variant', v.drive === '4WD', v.drive);
ok('finish: category', v.category === 'utes' && v.kind === 'dual-cab');
ok('finish: silly years dropped', finishVehicle({ year: 3020, make: 'Ford' }).year === null);
const pub = publicVehicle({ ...v, engineNo: 'SA2W1' });
ok('public: no full VIN or engine number', !('vin' in pub) && !('engineNo' in pub) && pub.vinEnding === '000001', JSON.stringify(pub));
ok('line', vehicleLine(v) === 'Dual cab ute · White · Diesel · Auto · 4WD', vehicleLine(v));

// Search: registration filter, typed and cleaned
ok('search: unregistered', parseQuery('unregistered ute').f.rego === 'unregistered' && parseQuery('unregistered ute').f.cat === 'utes', JSON.stringify(parseQuery('unregistered ute')));
ok('search: no rego', parseQuery('hilux no rego').f.rego === 'unregistered', JSON.stringify(parseQuery('hilux no rego')));
ok('search: registered', parseQuery('registered hilux').f.rego === 'registered' && parseQuery('registered hilux').f.model === 'HiLux', JSON.stringify(parseQuery('registered hilux')));
ok('search: with rego', parseQuery('corolla with rego').f.rego === 'registered', JSON.stringify(parseQuery('corolla with rego')));
ok('search: bad value dropped', cleanFilters({ rego: 'maybe' }).rego === undefined);
ok('search: described', describeParts({ rego: 'unregistered' }).includes('Unregistered'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
