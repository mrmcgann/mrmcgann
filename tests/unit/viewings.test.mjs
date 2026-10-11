// Seeing a vehicle before bidding (times a buyer can offer, their wording) and dealer ABNs.
// node --experimental-strip-types tests/unit/viewings.test.mjs
import { viewingDays, cleanSlots, viewingError, brisbaneToday, slotLabel, MAX_SLOTS } from '../../src/lib/viewings.ts';
import { isAbn, cleanAbn, formatAbn } from '../../src/lib/abn.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// 11 pm UTC on 11 Oct is 9 am on 12 Oct in Brisbane
const NOW = Date.parse('2026-10-11T23:00:00Z');
ok('today in Brisbane, not UTC', brisbaneToday(NOW) === '2026-10-12', brisbaneToday(NOW));
let d = viewingDays(null, false, NOW);
ok('days: from tomorrow, two weeks', d.length === 14 && d[0] === '2026-10-13' && d[13] === '2026-10-26', JSON.stringify(d));
d = viewingDays('2026-10-15T09:00:00Z', true, NOW);
ok('days: never after bidding closes (Brisbane date)', JSON.stringify(d) === JSON.stringify(['2026-10-13', '2026-10-14', '2026-10-15']), JSON.stringify(d));
d = viewingDays('2026-10-15T15:00:00Z', true, NOW);
ok('days: a close late in the UTC day counts as the next Brisbane day', d.at(-1) === '2026-10-16', JSON.stringify(d));
ok('days: none when it closes today', viewingDays('2026-10-12T08:00:00Z', true, NOW).length === 0);
ok('days: offers and referred sales ignore the old close', viewingDays('2026-10-10T08:00:00Z', false, NOW).length === 14);

const days = viewingDays(null, false, NOW);
let c = cleanSlots([{ day: days[0], part: 'morning' }, { day: days[0], part: 'morning' }, { day: '2099-01-01', part: 'morning' }, { day: days[1], part: 'midnight' }, { day: days[2], part: 'evening' }], days);
ok('slots: duplicates, bad days and parts dropped', c.slots.length === 2 && !c.error, JSON.stringify(c));
c = cleanSlots([], days); ok('slots: at least one', !!c.error);
c = cleanSlots(days.slice(0, 5).map((day) => ({ day, part: 'afternoon' })), days); ok(`slots: at most ${MAX_SLOTS}`, !!c.error && c.slots.length === MAX_SLOTS);
ok('slot label reads naturally', slotLabel({ day: '2026-10-13', part: 'morning' }) === 'Tue, 13 Oct, morning', slotLabel({ day: '2026-10-13', part: 'morning' }));

ok('errors: plain words for each refusal', ['viewing_needs_mobile', 'viewing_needs_id', 'viewing_in_person_off', 'viewing_closed', 'viewing_own_vehicle', 'viewing_times_range', 'viewing_times', 'viewing_already', 'viewing_too_many', 'viewing_not_found'].every((k) => typeof viewingError(`ERROR: ${k}`) === 'string'));
ok('errors: the range message wins over the general one', /two weeks/.test(viewingError('viewing_times_range')));
ok('errors: other errors are left alone', viewingError('something_else') === null);

ok('ABN: valid', isAbn('51 824 753 556') && isAbn('53004085616'));
ok('ABN: a wrong digit is caught', !isAbn('51824753557') && !isAbn('12345678901'));
ok('ABN: wrong length or letters', !isAbn('5182475355') && !isAbn('51a24753556') && !isAbn(''));
ok('ABN: cleaned and formatted', cleanAbn(' 51-824 753 556 ') === '51824753556' && formatAbn('51824753556') === '51 824 753 556');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
