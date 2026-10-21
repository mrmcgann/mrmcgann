// Transport to our depot in the buyer's premium, and the pickup and collection words (website, server and app).
// node --experimental-strip-types tests/unit/transport.test.mjs
import { priceBreakdown, lotFees } from '../../src/lib/fees.ts';
import { premiumLabel, feesLine, collectLine, buyerTransportLine, sellerTransportLine, transportError, depotPlace, windowLabel, CHECK_IT, ACK_CHECK, NO_VIEWINGS } from '../../src/lib/transport.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const F = { premium_rate: 0.1, admin_fee: 99, storage_per_day: 50, card_limit: 5000, surcharge_rate: 0, nrd_low: 500, nrd_high: 1000, nrd_split: 20000 };

// The buyer's premium is the rate of the price plus the transport, with GST on all of it (price_breakdown_with()
// in the database does the same sum: the database test expects the same $11,507).
const b = priceBreakdown(10000, { ...F, transport: 280 });
ok('premium: the rate of the price plus the transport', b.premium === 1280 && b.transport === 280, JSON.stringify(b));
ok('premium: GST on the whole premium', b.gst === 128);
ok('premium: the all-in total, all due by transfer', b.total === 11507 && b.balanceDue === 11507 && b.surcharge === 0);
ok('premium: no transport, as before', priceBreakdown(10000, F).premium === 1000 && priceBreakdown(10000, F).total === 11199 && priceBreakdown(10000, F).transport === 0);
ok('premium: a negative or blank transport counts as none', priceBreakdown(1000, { ...F, transport: -50 }).transport === 0 && priceBreakdown(1000, { ...F, transport: '' }).transport === 0);
ok('premium: cents are rounded', priceBreakdown(999.99, { ...F, transport: 249.999 }).premium === 350);

// Each vehicle's transport is fixed with its other fees when bidding opens (lots.fees), like lot_price_breakdown()
ok('locked: the transport locked on the vehicle', lotFees(F, { fees: { premium_rate: 0.1, transport: 300 } }).transport === 300);
ok('locked: a listing from before transport was in the premium has none', lotFees({ ...F, transport: 999 }, { fees: { premium_rate: 0.1 } }).transport === 0);
ok('locked: a draft shows the amount entered so far', lotFees(F, { fees: null, transport_fee: 275 }).transport === 275 && lotFees(F, { fees: null, transport_fee: null }).transport === 0);
ok('locked: the all-in price uses the vehicle’s own transport', priceBreakdown(10000, lotFees(F, { fees: { transport: 280 } })).total === 11507);
ok('locked: no vehicle, today’s fees', lotFees(F) === F);

// Words
ok('label: the rate and the transport', premiumLabel({ premium_rate: 0.1, transport: 250 }) === "Buyer's premium (10% + $250 transport to our depot)", premiumLabel({ premium_rate: 0.1, transport: 250 }));
ok('label: no transport, just the rate', premiumLabel({ premium_rate: 0.125 }) === "Buyer's premium (12.5%)");
ok('fees line: names the transport beside an all-in price', feesLine(250) === 'Premium (with $250 transport to our depot), GST and admin fee' && feesLine(0) === 'Premium, GST and admin fee' && feesLine(null) === 'Premium, GST and admin fee');
const reg = collectLine({ suburb: 'Eagle Farm', state: 'QLD', registration: 'registered' }, 250);
ok('collect line: our depot, the transport in the premium', reg.includes('our depot in Eagle Farm, QLD') && reg.includes("the $250 transport is in the buyer's premium") && reg.includes('registration is in your name'), reg);
ok('collect line: unregistered', /certificate of sale is done/.test(collectLine({ suburb: 'Wetherill Park', state: 'NSW', registration: 'unregistered' })));
ok('depot place', depotPlace({ suburb: 'Eagle Farm', state: 'QLD' }) === 'Eagle Farm, QLD' && depotPlace(null) === '' && depotPlace({ suburb: null }) === '');

// Where it's up to: the buyer sees our depot, the seller sees the pickup, and neither sees the other
const job = { status: 'booked', pickup_on: '2026-10-23', depot_suburb: 'Eagle Farm', depot_state: 'QLD', sale_cancelled: false };
ok('buyer: booked, with the day and the depot', buyerTransportLine(job) === 'Our transport partner is picking it up on Fri 23 Oct and taking it to our depot in Eagle Farm, QLD.', buyerTransportLine(job));
ok('buyer: at the depot', buyerTransportLine({ ...job, status: 'at_depot' }) === 'At our depot in Eagle Farm, QLD.');
ok('buyer: a cancelled sale says so, whatever the status', buyerTransportLine({ ...job, status: 'picked_up', sale_cancelled: true }) === 'The sale has been cancelled.');
const sb = sellerTransportLine({ status: 'booked', pickup_on: '2026-10-23', pickup_window: 'morning', ref: 'TR-40001' });
ok('seller: the day, the window and the reference the driver quotes', /Fri 23 Oct, morning \(8am to 12pm\)/.test(sb) && /quote booking reference TR-40001/.test(sb) && /only hand it over to them/.test(sb), sb);
ok('seller: never told where the depot is', ['to_book', 'booked', 'picked_up', 'at_depot', 'released', 'returned'].every((s) => !/depot in|Eagle Farm/.test(sellerTransportLine({ status: s, pickup_on: null, pickup_window: null, ref: 'TR-1' }))));
ok('pickup windows', windowLabel('afternoon') === 'Afternoon (12pm to 5pm)' && windowLabel('nope') === '');

// The database's refusals in plain words
ok('errors: not at the depot yet', /isn't at our depot yet/.test(transportError('ERROR: not_at_depot') || ''));
ok('errors: the buyer must answer a change first', /going ahead/.test(transportError('ERROR: change_not_answered') || ''));
ok('errors: the transport is fixed once bidding opens', /can't change once bidding has opened/.test(transportError('ERROR: transport_locked: bidding has opened') || ''));
ok('errors: a step out of order reads as a sentence', transportError('ERROR: transport_step:mark it picked up first') === 'Mark it picked up first.');
ok('errors: others are left alone', transportError('something else') === null);

// Checking a vehicle without seeing it
ok('ack: no viewing, a guide only, an inspection at their cost, collected from our depot', /can't view it/.test(ACK_CHECK) && /guide only/.test(ACK_CHECK) && /mechanical inspection/.test(ACK_CHECK) && /at my cost/.test(ACK_CHECK) && /depot/.test(ACK_CHECK));
ok('check it: four ways, none of them a visit', CHECK_IT.length === 4 && CHECK_IT.every(([t, d]) => !/viewing|visit the seller|test drive/i.test(t + d)));
ok('check it: the inspection is paid to the mechanic and the seller stays private', /you pay them/.test(CHECK_IT[2][1]) && /seller's details stay private/.test(CHECK_IT[2][1]));
ok('no viewings, in one line', /^No viewings or test drives/.test(NO_VIEWINGS));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
