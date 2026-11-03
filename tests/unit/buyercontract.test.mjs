// The buyer's sale contract: the state rules, the odometer in words and figures, and the wording that has to stay
// true to the engine (the hammer makes the contract; signing only records it).
// node --experimental-strip-types tests/unit/buyercontract.test.mjs
import fs from 'fs';
import { STATE_RULES, ruleFor, needsSignature, namesOwner, odometerWords, odometerLine, engineLine, soldLine, ACK_TEXT, ackNote } from '../../src/lib/buyerContract.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const STATES = ['QLD', 'NSW', 'VIC', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

// every state has a rule, and every rule says where it came from
ok('rules: all eight states', STATES.every((s) => STATE_RULES[s] && STATE_RULES[s].state === s));
ok('rules: every one cites a source', STATES.every((s) => (STATE_RULES[s].source || '').length > 30));
ok('rules: every one has a notice for the buyer', STATES.every((s) => (STATE_RULES[s].notice || '').length > 40));

// Queensland is the only state that names the owner (MDCA Act s 74(1)(b), Regulation s 8(a))
ok('owner: named in Queensland only', namesOwner('QLD') === true && STATES.filter((s) => s !== 'QLD').every((s) => namesOwner(s) === false));
ok('owner: the Queensland notice says which law makes us', /section 74 of the Motor Dealers and Chattel Auctioneers Act 2014/.test(STATE_RULES.QLD.notice));
ok('owner: the Queensland source names the Act, the Regulation and why auctions are not exempt',
  /s 74\(1\)-\(3\)/.test(STATE_RULES.QLD.source) && /s 8\(a\)/.test(STATE_RULES.QLD.source) && /ss 6, 100\(2\)/.test(STATE_RULES.QLD.source));

// the two states whose own form the buyer signs
ok('signature: New South Wales and South Australia only', needsSignature('NSW') === true && needsSignature('SA') === true
  && ['QLD', 'VIC', 'WA', 'TAS', 'ACT', 'NT'].every((s) => needsSignature(s) === false));
ok('signature: those two name the form being signed', /Form 11/.test(STATE_RULES.NSW.document) && /Form 13/.test(STATE_RULES.SA.document));
ok('signature: the note says the copy comes back to them', /your copy is attached/.test(ackNote('NSW')) && /your copy is attached/.test(ackNote('SA')));
ok('signature: elsewhere it says plainly that signing is only a receipt', /complete at the fall of the hammer whether or not you sign/.test(ackNote('QLD')));

// an unknown or missing state falls back to the strictest, never to nothing
ok('state: unknown falls back to Queensland', ruleFor('XX').state === 'QLD' && ruleFor(null).state === 'QLD' && ruleFor('').state === 'QLD');
ok('state: case and spacing do not matter', ruleFor(' nsw ').state === 'NSW' && ruleFor('Nsw').state === 'NSW');

// Queensland's Regulation s 8 wants the reading in words AND figures
ok('odometer: words', odometerWords(205553) === 'two hundred and five thousand, five hundred and fifty-three', odometerWords(205553));
ok('odometer: round thousands', odometerWords(120000) === 'one hundred and twenty thousand', odometerWords(120000));
ok('odometer: under a hundred', odometerWords(42) === 'forty-two' && odometerWords(7) === 'seven' && odometerWords(0) === 'zero');
ok('odometer: teens and tens', odometerWords(13) === 'thirteen' && odometerWords(90) === 'ninety' && odometerWords(119) === 'one hundred and nineteen', odometerWords(119));
ok('odometer: a million', odometerWords(1000000) === 'one million' && odometerWords(1205553) === 'one million, two hundred and five thousand, five hundred and fifty-three');
ok('odometer: refuses what it cannot say exactly', odometerWords(null) === null && odometerWords(-5) === null && odometerWords(1.5) === null && odometerWords(99999999) === null);

const line = odometerLine({ odometer: 205553, odometerConcerns: false });
ok('odometer line: figures and words together', /205,553 km \(two hundred and five thousand, five hundred and fifty-three kilometres\)/.test(line), line);
ok('odometer line: the owner said it is sound', /has not been replaced or altered/.test(line));
ok('odometer line: the owner raised a doubt, with their words', /reason to doubt the reading: cluster swapped at 180k/.test(odometerLine({ odometer: 205553, odometerConcerns: true, odometerDetails: 'cluster swapped at 180k' })));
ok('odometer line: not told is said as not told, never as checked', /We are not told whether the odometer has been replaced/.test(odometerLine({ odometer: 205553 })));
ok('odometer line: no reading says so', /^Not recorded\./.test(odometerLine({ odometer: null })), odometerLine({ odometer: null }));

ok('engine: replaced, with when', /engine has been replaced \(2019\)/.test(engineLine({ engineReplaced: true, engineReplacedWhen: '2019' })));
ok('engine: not replaced', /has not been replaced/.test(engineLine({ engineReplaced: false })));
ok('engine: not told', /We are not told whether the engine has been replaced/.test(engineLine({})));

// the contract is made at the hammer: the wording must never suggest signing makes it
ok('hammer: the sold line says the hammer and names the auctioneer', /fall of the hammer on Thursday 5 November/.test(soldLine('Dale Fenwick', 'Thursday 5 November')) && /conducted by Dale Fenwick/.test(soldLine('Dale Fenwick', 'Thursday 5 November')));
ok('hammer: the acknowledgement says the sale was already binding', /already\s+binding when the hammer fell/.test(ACK_TEXT) && /records it rather than making it/.test(ACK_TEXT));
const words = JSON.stringify([ACK_TEXT, ...STATES.map((s) => STATE_RULES[s].notice), ...STATES.map((s) => ackNote(s))]);
ok('hammer: nothing anywhere makes the sale conditional on signing', !/sign.{0,40}(to complete|to finalise|before the sale is|and the sale is then)/i.test(words));
ok('wording: never says "no warranty" or "non-refundable"', !/no warranty|non-refundable/i.test(words));
ok('wording: every state says no cooling-off applies to a sale by auction', STATES.every((s) => /no cooling-off period applies/i.test(STATE_RULES[s].notice)));

// what is still open is recorded, not silently assumed away
const open = STATES.filter((s) => STATE_RULES[s].toConfirm);
ok('open points: the unsettled states say what is unsettled', open.length > 0 && open.every((s) => STATE_RULES[s].toConfirm.length > 30));
ok('open points: Queensland, New South Wales, South Australia and Tasmania are settled', ['QLD', 'NSW', 'SA', 'TAS'].every((s) => STATE_RULES[s].toConfirm === null));

// in step with the register
const reg = fs.readFileSync(new URL('../../docs/legal-basis.md', import.meta.url), 'utf8');
ok('register: the buyer\'s statement has its own section', /## 12\. The buyer's sale contract/.test(reg));
ok('register: it records the Queensland owner-name position and its sources',
  /s 74\(1\)\(b\)/.test(reg) && /Motor Dealers and Chattel Auctioneers Regulation 2014 \(Qld\) s 8/.test(reg) && /s 8\(a\) \(the owner's name\)/.test(reg));
ok('register: it records that New South Wales and South Australia have the buyer sign', /Form 11/.test(reg) && /Form 13/.test(reg));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
