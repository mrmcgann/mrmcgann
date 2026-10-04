// Our own VIN decoder: node --experimental-strip-types tests/unit/vin.test.mjs
import { vinMake, vinCountry, vinYear, decodeVinOffline, isVin, normalizeVin } from '../../src/lib/vin.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const now = new Date('2026-10-04');

const makes = { JTNBV58E09J000432: 'Toyota', JTHBK1GG00A000001: 'Lexus', MR0FB22G400000997: 'Toyota', MNAUMFF50HW000599: 'Ford', '6FPAAAJGSW8A00001': 'Ford',
  '6G1EK52W06L000620': 'Holden', KMHD3510AFU000633: 'Hyundai', KNADN512AF6000001: 'Kia', JYARM33E0LA000660: 'Yamaha', JAANPR85HE7000588: 'Isuzu', MPATFS85JKT000001: 'Isuzu',
  JM0DE1023C0000611: 'Mazda', JMBXJGA7WGZ000001: 'Mitsubishi', JN1TBNT30Z0000001: 'Nissan', JF1GP7KC5DG000001: 'Subaru', WDD2050421R000001: 'Mercedes-Benz', WVWZZZAUZFW000001: 'Volkswagen',
  WBA8E36000NU00001: 'BMW', SALLAAA147A000001: 'Land Rover', '5YJ3E7EB1KF000001': 'Tesla', LSJA24U96MS000001: 'MG', LGWEF4A51NF000001: 'GWM', '1HD1KHM1XFB000001': 'Harley-Davidson' };
for (const [vin, make] of Object.entries(makes)) ok(`make: ${vin}`, vinMake(vin) === make, `${vinMake(vin)} != ${make}`);
ok('make: unknown maker', vinMake('XXX0000000A000000') === null);
ok('country: Thailand', vinCountry('MR0FB22G400000997') === 'Thailand');
ok('country: Australia', vinCountry('6G1EK52W06L000620') === 'Australia');
ok('country: Japan', vinCountry('JTNBV58E09J000432') === 'Japan');
ok('country: Korea', vinCountry('KMHD3510AFU000633') === 'South Korea');
const y = (c) => vinYear(`JTNBV58E0${c}J000432`, now);
ok('year: 9 is 2009', y('9') === 2009);
ok('year: H is 2017', y('H') === 2017);
ok('year: L is 2020', y('L') === 2020);
ok('year: A is 2010', y('A') === 2010);
ok('year: Y is 2000', y('Y') === 2000);
ok('year: T is 2026', y('T') === 2026);
ok('year: V is 2027 (next year allowed)', y('V') === 2027);
ok('year: W is 1998 (2028 is in the future)', y('W') === 1998);
ok('year: 0 is not a year code', y('0') === null);
ok('valid VIN', isVin('JTNBV58E09J000432') && !isVin('JTNBV58E09J00043') && !isVin('JTNBV58E09J00043O'));
ok('normalise', normalizeVin(' jtnbv58e09-j000432 ') === 'JTNBV58E09J000432');
const d = decodeVinOffline('jtnbv58e09j000432');
ok('offline decode', d && d.make === 'Toyota' && d.country === 'Japan' && d.year === 2009, JSON.stringify(d));
ok('offline decode: not a VIN', decodeVinOffline('ABC123') === null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
