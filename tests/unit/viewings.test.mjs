// No viewings (the refusal's wording) and dealer ABNs.
// node --experimental-strip-types tests/unit/viewings.test.mjs
import { viewingError, NO_VIEWING_TEXT } from '../../src/lib/viewings.ts';
import { isAbn, cleanAbn, formatAbn } from '../../src/lib/abn.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// No viewings: every refusal from the database reads the same, and points to what buyers can do instead
ok('no viewings: the database refusal in plain words', viewingError('ERROR: viewing_not_offered') === NO_VIEWING_TEXT);
ok('no viewings: older refusals read the same', ['viewing_needs_mobile', 'viewing_in_person_off', 'viewing_times'].every((k) => viewingError(`ERROR: ${k}`) === NO_VIEWING_TEXT));
ok('no viewings: says what to do instead', /condition report/.test(NO_VIEWING_TEXT) && /mechanical inspection/.test(NO_VIEWING_TEXT) && !/test drive/i.test(NO_VIEWING_TEXT));
ok('no viewings: other errors are left alone', viewingError('something_else') === null);

ok('ABN: valid', isAbn('51 824 753 556') && isAbn('53004085616'));
ok('ABN: a wrong digit is caught', !isAbn('51824753557') && !isAbn('12345678901'));
ok('ABN: wrong length or letters', !isAbn('5182475355') && !isAbn('51a24753556') && !isAbn(''));
ok('ABN: cleaned and formatted', cleanAbn(' 51-824 753 556 ') === '51824753556' && formatAbn('51824753556') === '51 824 753 556');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
