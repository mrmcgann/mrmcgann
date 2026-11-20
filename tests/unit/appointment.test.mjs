// The seller's appointment of Super Trucker on Queensland's approved form (Form 9): what the form says, in the form's
// order, filled in from what we know; the 90-day single appointment and the 30-day written notice either side can give
// (MDCA Act s 82(1)(i)); what has to be set up before anyone can sign.
// node --experimental-strip-types tests/unit/appointment.test.mjs
import { readFileSync } from 'node:fs';
import { buildAppointment, appointmentProblem, appointmentFacts, addDays, longDate, brisbaneToday, noticeEnds, premiumWords, sellerFeeWords,
  APPOINTMENT_DAYS, NOTICE_DAYS, LEGAL_ADVICE_WARNING, TERMINATION_TEXT, FORM9_TITLE, FORM9_ACT, FORM9_END, ASSIGN_CLAUSE } from '../../src/lib/appointment.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const m39 = readFileSync(new URL('../../supabase/migrations/20261120000039_seller_appointment.sql', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../src/components/Form9View.tsx', import.meta.url), 'utf8');
const pdf = readFileSync(new URL('../../src/lib/pdf.ts', import.meta.url), 'utf8');
const signRoute = readFileSync(new URL('../../src/app/api/seller/sign/route.ts', import.meta.url), 'utf8');

const input = (over = {}) => ({
  client: { name: 'Dave Citizen', address: '1 Depot Road, Rocklea QLD 4106', phone: '0400000000', email: 'dave@example.com', ...(over.client || {}) },
  licensee: { agency: 'Super Trucker', name: 'Super Trucker Pty Ltd', licenceNo: '3456789', licenceExpiry: '30 June 2028', address: '10 Example St, Brisbane QLD 4000', phone: '1300 000 000', email: 'help@example.com', ...(over.licensee || {}) },
  vehicle: { makeModel: 'Kenworth T610', built: 2019, vin: '6F4000000K0000001', engineNo: 'X15-001', rego: '123ABC', type: 'Prime mover', odometer: 612000, colour: 'White', ...(over.vehicle || {}) },
  reserve: 'reserve' in over ? over.reserve : 145000,
  startOn: over.startOn || '2026-11-20',
  fees: { sellerRate: 0, sellerMin: 0, withdrawal: 250, preInspection: 0, premiumRate: 0.06, premiumMin: 140, adminFee: 0, exclusivityDays: 90, ...(over.fees || {}) },
  assignOk: !!over.assignOk,
  agreementVersion: 'Version 20 November 2026',
});
const items = (a, id) => a.parts.find((p) => p.id === id).items;
const rowsOf = (a, id) => items(a, id).filter((i) => i.t === 'rows').flatMap((i) => i.rows);
const row = (a, id, label) => (rowsOf(a, id).find(([k]) => k === label) || [])[1];
const ticksOf = (a, id) => items(a, id).filter((i) => i.t === 'ticks').flatMap((i) => i.ticks);
const ticked = (a, id, label) => (ticksOf(a, id).find(([k]) => k.startsWith(label)) || [])[1];
const textOf = (a, id) => items(a, id).filter((i) => i.t === 'text' || i.t === 'head').map((i) => i.text).join(' | ');
const all = (a) => JSON.stringify(a);

// dates: calendar days, Brisbane's today
ok('dates: 90 days from 20 Nov 2026 is 18 Feb 2027', addDays('2026-11-20', APPOINTMENT_DAYS) === '2027-02-18');
ok('dates: over a month and a year end', addDays('2026-12-31', 1) === '2027-01-01' && addDays('2027-02-28', 1) === '2027-03-01' && addDays('2028-02-28', 1) === '2028-02-29');
ok('dates: written out', longDate('2027-02-18') === '18 February 2027');
ok('dates: today is Brisbane\'s (UTC+10, no daylight saving)', brisbaneToday(new Date('2026-11-20T15:00:00Z')) === '2026-11-21' && brisbaneToday(new Date('2026-11-20T13:59:00Z')) === '2026-11-20' && brisbaneToday(new Date('2027-01-15T14:30:00Z')) === '2027-01-16');
ok('dates: notice ends 30 days after it\'s given', noticeEnds('2026-11-20') === '2026-12-20' && NOTICE_DAYS === 30);

// the form itself
const a = buildAppointment(input());
ok('form: the approved form\'s name and Act', a.title === FORM9_TITLE && FORM9_TITLE === 'Appointment of motor dealer or chattel auctioneer' && /Motor Dealers and Chattel Auctioneers Act 2014 \(Qld\), Form 9/.test(FORM9_ACT));
ok('form: nine parts, in order', a.parts.map((p) => p.title.split('—')[0]).join(',') === 'Part 1,Part 2,Part 3,Part 4,Part 5,Part 6,Part 7,Part 8,Part 9', a.parts.map((p) => p.title).join(' / '));
ok('form: the independent legal advice statement, prominent (top and Part 9)', a.warning === LEGAL_ADVICE_WARNING && /SEEK INDEPENDENT LEGAL ADVICE BEFORE SIGNING/.test(LEGAL_ADVICE_WARNING) && items(a, 'p9').some((i) => i.t === 'text' && i.strong && i.text === LEGAL_ADVICE_WARNING));
ok('form: plain text only (nothing that could be markup)', !/[<>]/.test(all(a)));
ok('form: never "no warranty" or "non-refundable"', !/no warranty|non-refundable/i.test(all(a)));
ok('form: survives being stored as JSON', JSON.stringify(JSON.parse(JSON.stringify(a))) === JSON.stringify(a));

// Part 1: the client
ok('part 1: the seller\'s name, address and contact', row(a, 'p1', 'Client 1') === 'Dave Citizen' && row(a, 'p1', 'Address') === '1 Depot Road, Rocklea QLD 4106' && row(a, 'p1', 'Mobile') === '0400000000' && row(a, 'p1', 'ABN') === 'None');
const co = buildAppointment(input({ client: { company: 'Haulage Co Pty Ltd', abn: '12 345 678 901' } }));
ok('part 1: a company is the client, signed for by the person', row(co, 'p1', 'Client 1') === 'Haulage Co Pty Ltd (signed for it by Dave Citizen)' && row(co, 'p1', 'ABN') === '12 345 678 901');
const joint = buildAppointment(input({ client: { joint: true } }));
ok('part 1: joint owners: every other owner confirms in writing before listing', /Every other owner confirms this appointment with us in writing/.test(row(joint, 'p1', 'Client 2') || '') && row(a, 'p1', 'Client 2') === undefined);

// Part 2: us
ok('part 2: a motor dealer (not a chattel auctioneer licence), our licence printed', ticked(a, 'p2', 'Motor dealer') === true && ticked(a, 'p2', 'Chattel auctioneer') === false && row(a, 'p2', 'Licence number') === '3456789' && row(a, 'p2', 'Expiry date') === '30 June 2028');
ok('part 2: the auction is run by our employed licensed auctioneer', /licensed chattel auctioneer employed by the licensee/.test(textOf(a, 'p2')));

// Part 3: the truck and the service
ok('part 3: the truck\'s details', row(a, 'p3', 'Make and model') === 'Kenworth T610' && row(a, 'p3', 'VIN') === '6F4000000K0000001' && row(a, 'p3', 'Odometer reading') === '612,000 km' && row(a, 'p3', 'Registration number') === '123ABC');
ok('part 3: sold by auction, not private treaty', ticked(a, 'p3', 'Sell a used motor vehicle by auction') === true && ticked(a, 'p3', 'Sell a used motor vehicle by private treaty') === false);
const unreg = buildAppointment(input({ vehicle: { rego: null, vin: null } }));
ok('part 3: unregistered, and a VIN still to come from the papers', row(unreg, 'p3', 'Registration number') === 'Unregistered' && /registration papers/.test(row(unreg, 'p3', 'VIN')));

// Part 4: the appointment
ok('part 4: auction, a single appointment (never continuing)', ticked(a, 'p4', 'Auction') === true && ticked(a, 'p4', 'Sale') === false && ticked(a, 'p4', 'Single appointment') === true && ticked(a, 'p4', 'Continuing appointment') === false);
ok('part 4: the term, start and end', a.startOn === '2026-11-20' && a.endOn === '2027-02-18' && /start 20 November 2026, end 18 February 2027/.test(textOf(a, 'p4')));
ok('part 4: the reserve, lowered but never raised once bidding starts', /Reserve: \$145,000\. It may be lowered or removed, but not raised once bidding starts/.test(textOf(a, 'p4')));
ok('part 4: no reserve', /no reserve\. The vehicle sells to the highest bid/.test(textOf(buildAppointment(input({ reserve: null })), 'p4')));
ok('part 4: either party, at least 30 days\' written notice (s 82(1)(i))', /revoked by either party giving the other party at least 30 days written notice/.test(TERMINATION_TEXT) && textOf(a, 'p4').includes(TERMINATION_TEXT));

// Part 5: the conditions
ok('part 5: Annexure A is the conditions, by version', /Annexure A, the Super Trucker Seller Agency Agreement \(Version 20 November 2026\)/.test(textOf(a, 'p5')));
ok('part 5: what we do, and that we don\'t visit to list it', /live online auction, under the hammer/.test(textOf(a, 'p5')) && /we don't visit it/.test(textOf(a, 'p5')) && /trust account/.test(textOf(a, 'p5')));

// Part 6: commission
ok('part 6: no commission on our auction by default', /^Nil/.test(row(a, 'p6', 'Commission on a sale through our auction')));
ok('part 6: a commission, when there is one, on the actual sale price', sellerFeeWords({ ...input().fees, sellerRate: 0.05, sellerMin: 300 }) === '5% of the actual sale price (at least $300), plus GST');
ok('part 6: percentage commission only on the actual sale price (s 87)', /Percentage commission is worked out only on the actual sale price/.test(textOf(a, 'p6')));
ok('part 6: sold another way in the term, or to a buyer we introduced in the 90 days after', /buyer's premium we would have earned: 6% of the actual sale price/.test(row(a, 'p6', "If it's sold another way during this appointment")) && rowsOf(a, 'p6').some(([k]) => /in the 90 days after this appointment ends to a buyer we introduced/.test(k)));
ok('part 6: commission is negotiable (the form\'s note)', /commission is negotiable/.test(a.parts.find((p) => p.id === 'p6').note));

// Part 7: fees and expenses
ok('part 7: advertising costs the seller nothing', /\$0/.test(row(a, 'p7', 'Section 1—Advertising and marketing')));
ok('part 7: the withdrawal fee only on an agreed early end after listing', /\$250, payable only if, after the vehicle is listed, the client asks us to end this appointment early and we agree/.test(row(a, 'p7', 'Section 2—Other: withdrawal fee')));
ok('part 7: the inspection before listing only if asked for', row(a, 'p7', 'Section 2—Other: inspection before listing') === 'Not requested' && /\$495 including GST/.test(row(buildAppointment(input({ fees: { preInspection: 495 } })), 'p7', 'Section 2—Other: inspection before listing')));
ok('part 7: our rebates disclosed (s 82)', /Referral fees from finance, insurance, warranty and transport partners/.test(row(a, 'p7', "Section 3—Licensee's rebate, discount, commission or benefit")));
ok('part 7: the buyer\'s premium, paid by the buyer', premiumWords(input().fees) === '6% of the price (at least $140), plus GST' && /doesn't reduce the client's proceeds/.test(row(a, 'p7', "Buyer's premium")));

// Part 8: assignment is the seller's choice
ok('part 8: disagree unless the seller ticks it', ticked(a, 'p8', 'I agree') === false && ticked(a, 'p8', 'I disagree') === true && ticked(buildAppointment(input({ assignOk: true })), 'p8', 'I agree') === true);
ok('part 8: the assignment clause and the 14 days\' notice', textOf(a, 'p8').includes(ASSIGN_CLAUSE) && /14 days' written notice/.test(textOf(a, 'p8')));

// what has to be set up before anyone signs
ok('setup: our licence number and expiry are needed', /licence details aren't set up/.test(appointmentProblem(input({ licensee: { licenceNo: '' } }))) && /licence details/.test(appointmentProblem(input({ licensee: { licenceExpiry: ' ' } }))));
ok('setup: placeholder business details are refused', /licence details/.test(appointmentProblem(input({ licensee: { name: '[Company name Pty Ltd]' } }))) && /licence details/.test(appointmentProblem(input({ licensee: { phone: '[1300 XXX XXX]' } }))));
ok('setup: the seller\'s name and address are needed', /full name/.test(appointmentProblem(input({ client: { name: 'D' } }))) && /address/.test(appointmentProblem(input({ client: { address: '' } }))));
ok('setup: everything in place', appointmentProblem(input()) === '');

// the short version on the agreement page and the dashboard
const facts = Object.fromEntries(appointmentFacts(input()));
ok('facts: the term and the 30 days\' notice', /from 20 November 2026 to 18 February 2027 \(90 days\)/.test(facts.Term) && /at least 30 days' written notice/.test(facts['Ending it']));
ok('facts: commission, the premium and the costs', /^Nil/.test(facts['Our commission']) && /6% of the price \(at least \$140\), plus GST/.test(facts['What the buyer pays']) && /advertising: nothing/.test(facts['Costs you authorise']) && /\$250 only if/.test(facts['Costs you authorise']));

// the database, the PDF and the page agree
ok('db: 90-day term and 30 days\' notice, the same numbers', /interval '90 days'/.test(m39) && /now\(\) \+ interval '30 days'/.test(m39) && APPOINTMENT_DAYS === 90);
ok('db: no listing until signed, countersigned and copied', /hasn''t signed the appointment form \(Form 9\)/.test(m39) && /countersign the seller''s appointment/.test(m39) && /send the seller their signed copy/.test(m39));
ok('db: the live room never offers a truck whose appointment has ended', /and appointment_in_force\(id\)/.test(m39) && /appointment_ended:/.test(m39));
ok('view: renders data as text, never as HTML', !/dangerouslySetInnerHTML/.test(view));
ok('pdf: prints the end of the approved form and Annexure A', /FORM9_END/.test(pdf) && /Annexure A/.test(pdf) && FORM9_END.startsWith('This is the end of the approved form'));
ok('sign route: checks the licence before signing and stores the form as signed', /appointmentProblem\(base\)/.test(signRoute) && /appointment, assign_ok/.test(signRoute) && /annexure: fillLegal\(SELLER_AGREEMENT, settings\)/.test(signRoute));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
