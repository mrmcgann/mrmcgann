// Viewing a truck by appointment (the days a buyer can offer, the wording, what they agree to) and dealer ABNs.
// node --experimental-strip-types tests/unit/viewings.test.mjs
import { viewingDays, cleanSlots, viewingError, brisbaneToday, slotLabel, MAX_SLOTS, viewingAck, VIEWING_HOW, VIEWING_OFF } from '../../src/lib/viewings.ts';
import { isAbn, cleanAbn, formatAbn } from '../../src/lib/abn.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// 11 pm UTC on 11 Oct is 9 am on 12 Oct in Brisbane
const NOW = Date.parse('2026-10-11T23:00:00Z');
ok('today in Brisbane, not UTC', brisbaneToday(NOW) === '2026-10-12', brisbaneToday(NOW));
let d = viewingDays(null, NOW);
ok('days: from tomorrow, two weeks', d.length === 14 && d[0] === '2026-10-13' && d[13] === '2026-10-26', JSON.stringify(d));
d = viewingDays('2026-10-16T09:00:00Z', NOW);
ok('days: up to the day before the auction (Brisbane date)', JSON.stringify(d) === JSON.stringify(['2026-10-13', '2026-10-14', '2026-10-15']), JSON.stringify(d));
d = viewingDays('2026-10-15T15:00:00Z', NOW);
ok('days: an auction late in the UTC day is the next Brisbane day', d.at(-1) === '2026-10-15', JSON.stringify(d));
ok('days: none when the auction is tomorrow', viewingDays('2026-10-13T08:00:00Z', NOW).length === 0);
ok('days: none when it is today', viewingDays('2026-10-12T08:00:00Z', NOW).length === 0);

const days = viewingDays(null, NOW);
let c = cleanSlots([{ day: days[0], part: 'morning' }, { day: days[0], part: 'morning' }, { day: '2099-01-01', part: 'morning' }, { day: days[1], part: 'midnight' }, { day: days[2], part: 'evening' }], days);
ok('slots: duplicates, bad days and parts dropped', c.slots.length === 2 && !c.error, JSON.stringify(c));
c = cleanSlots([], days); ok('slots: at least one', !!c.error);
c = cleanSlots(days.slice(0, 5).map((day) => ({ day, part: 'afternoon' })), days); ok(`slots: at most ${MAX_SLOTS}`, !!c.error && c.slots.length === MAX_SLOTS);
ok('slot label reads naturally', slotLabel({ day: '2026-10-13', part: 'morning' }) === 'Tue, 13 Oct, morning', slotLabel({ day: '2026-10-13', part: 'morning' }));

ok('errors: plain words for each refusal', ['viewing_not_offered', 'viewing_needs_id', 'viewing_ack', 'viewing_in_person_off', 'viewing_closed', 'viewing_own_vehicle', 'viewing_times_range', 'viewing_times',
  'viewing_already', 'viewing_too_many', 'viewing_not_found', 'viewing_no_address', 'viewing_time', 'viewing_not_open', 'viewing_not_confirmed', 'viewing_something_new'].every((k) => typeof viewingError(`ERROR: ${k}`) === 'string'));
ok('errors: the range message wins over the general one', /two weeks/.test(viewingError('viewing_times_range')));
ok('errors: the agreement, not the times, when the box is not ticked', /Tick the box/.test(viewingError('viewing_ack')));
ok('errors: other errors are left alone', viewingError('something_else') === null);

// what the member agrees to before we give out an address
const ack = viewingAck(90);
ok('agreement: we make the introduction, and our premium follows a sale around us', /introduce me to this vehicle and its owner/.test(ack) && /within 90 days after/.test(ack) && /buyer's premium on the price I pay/.test(ack));
ok('agreement: no dealing direct, the address stays private, the owner is told their name', /won't make the owner an offer/.test(ack) && /won't share it/.test(ack) && /gives the owner my name/.test(ack));
ok('agreement: looking and listening only', /no road test/.test(ack) && /site rules/.test(ack));
ok('agreement: follows the setting', /within 60 days after/.test(viewingAck(60)));
ok("agreement: doesn't pretend to exclude anyone's rights", !/at (my|your) own risk|no liability|not liable/i.test(ack));
ok('how it works: three plain lines, and words for a truck that can\'t be viewed', VIEWING_HOW.length === 3 && /photo ID/.test(VIEWING_HOW[1]) && /can't host viewings/.test(VIEWING_OFF));

ok('ABN: valid', isAbn('51 824 753 556') && isAbn('53004085616'));
ok('ABN: a wrong digit is caught', !isAbn('51824753557') && !isAbn('12345678901'));
ok('ABN: wrong length or letters', !isAbn('5182475355') && !isAbn('51a24753556') && !isAbn(''));
ok('ABN: cleaned and formatted', cleanAbn(' 51-824 753 556 ') === '51824753556' && formatAbn('51824753556') === '51 824 753 556');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
