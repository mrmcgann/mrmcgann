// Bidding deposits: node --experimental-strip-types tests/unit/deposits.test.mjs
// The same rules as deposit_for_with() / deposit_summary() / price_breakdown_with() in the database.
import { depositFor, bidLimit, priceBreakdown, payMode, lotFees } from '../../src/lib/fees.ts';
import { cleanRef, payerMatches, limitChoices, limitLine, depositSteps, depositWhat, depositShortBy, winPayLine, buyNowPayLine, ackPayLine, joinSteps } from '../../src/lib/deposits.ts';
import { DEFAULT_FEES } from '../../src/lib/types.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };
const F = { ...DEFAULT_FEES, pay_mode: 'deposit' };
const TF = { ...DEFAULT_FEES }; // the default: no deposit

// The rule: 10% of the amount, at least $500, at most $5,000 (the same answers as the database test)
ok('deposit: minimum', depositFor(1000, F) === 500 && depositFor(5000, F) === 500);
ok('deposit: 10%, rounded up to the dollar', depositFor(5001, F) === 501 && depositFor(12000, F) === 1200 && depositFor(12345, F) === 1235);
ok('deposit: capped', depositFor(80000, F) === 5000 && depositFor(250000, F) === 5000);
ok('deposit: nothing for nothing', depositFor(0, F) === 0 && depositFor(-5, F) === 0);
ok('deposit: no cap when the cap is 0', depositFor(80000, { ...F, deposit_cap: 0 }) === 8000);
ok('deposit: the settings change the rule', depositFor(20000, { ...F, deposit_rate: 0.05, deposit_min: 250 }) === 1000 && depositFor(2000, { ...F, deposit_rate: 0.05, deposit_min: 250 }) === 250);

// The limit a free deposit gives
ok('limit: below the minimum, none', bidLimit(400, F) === 0);
ok('limit: $500 lets you bid $5,000', bidLimit(500, F) === 5000);
ok('limit: $1,500 lets you bid $15,000', bidLimit(1500, F) === 15000);
ok('limit: at the cap, no limit', bidLimit(5000, F) === null && bidLimit(9000, F) === null);
ok('limit: no cap, always the rate', bidLimit(9000, { ...F, deposit_cap: 0 }) === 90000);
ok('limit and deposit agree', [5000, 15000, 30000, 49990].every((l) => depositFor(l, F) <= (l / 10) + 1 && bidLimit(depositFor(l, F), F) >= l));

// What the winner pays: the deposit for the price comes off, the rest by transfer, never a surcharge
const p = priceBreakdown(1000, F);
ok('win: deposit mode', p.payMode === 'deposit' && payMode(F) === 'deposit' && p.surcharge === 0 && p.total === p.subtotal, JSON.stringify(p));
ok('win: $1,000 → $500 from the deposit, the rest by transfer', p.cardBase === 500 && p.cardAmount === 500 && p.balanceDue === Math.round((p.subtotal - 500) * 100) / 100, JSON.stringify(p));
const cheap = priceBreakdown(300, F);
ok('win: a cheap vehicle is paid entirely from the deposit', cheap.cardBase === cheap.subtotal && cheap.balanceDue === 0, JSON.stringify(cheap));
const big = priceBreakdown(120000, F);
ok('win: the deposit applied is never more than the cap', big.cardBase === 5000 && big.balanceDue === big.subtotal - 5000);
const card = priceBreakdown(1000, { ...F, pay_mode: 'card' });
ok('card mode still works for old invoices', card.payMode === 'card' && card.mode === 'card' && card.cardAmount === card.subtotal);
ok('deposit rules are global, not locked per vehicle', lotFees(F, { fees: { premium_rate: 0.12, deposit_rate: 0.5, pay_mode: 'card' } }).deposit_rate === 0.1
  && lotFees(F, { fees: { premium_rate: 0.12 } }).premium_rate === 0.12 && payMode(lotFees(F, { fees: { pay_mode: 'card' } })) === 'deposit' && payMode(lotFees(TF, { fees: { pay_mode: 'deposit' } })) === 'transfer');

// Matching a bank payment to the member
ok('reference: tidied the way people type it', cleanRef(' bid-k7m 2qx ') === 'BIDK7M2QX');
ok('payer: surname first, initial', payerMatches('SMITH J', 'John', 'Smith'));
ok('payer: title and middle name', payerMatches('MR JOHN PAUL SMITH', 'John', 'Smith'));
ok('payer: joint account', payerMatches('JOHN & JANE SMITH', 'Jane', 'Smith'));
ok('payer: double-barrelled surname', payerMatches('A SMITH-JONES', 'Amy', 'Smith-Jones') && payerMatches('AMY JONES', 'Amy', 'Smith-Jones'));
ok('payer: someone else', !payerMatches('ACME PTY LTD', 'John', 'Smith') && !payerMatches('J BROWN', 'John', 'Smith'));
ok('payer: nothing to go on', !payerMatches('', 'John', 'Smith') && !payerMatches('SMITH J', 'John', ''));

// Choosing a limit
const ch = limitChoices(F);
ok('choices: $5k, $10k, $20k, $30k, then no limit at the cap', JSON.stringify(ch.map((c) => [c.limit, c.deposit])) === JSON.stringify([[5000, 500], [10000, 1000], [20000, 2000], [30000, 3000], [null, 5000]]), JSON.stringify(ch));
ok('choices: steps at or over the cap drop out', limitChoices({ ...F, deposit_cap: 2000 }).map((c) => c.limit).join() === '5000,10000,');
ok('choices: no cap ends at $50,000', limitChoices({ ...F, deposit_cap: 0 }).pop().limit === 50000);

// The words
ok('limit line: none yet', limitLine({ unlimited: false, limit: 0, balance: 0, min: 500, available: 0 }) === 'Add a bidding deposit (from $500) to start bidding.');
ok('limit line: a limit', limitLine({ unlimited: false, limit: 15000, balance: 1500, min: 500, available: 1500 }) === 'You can bid up to $15,000.');
ok('limit line: all holding', limitLine({ unlimited: false, limit: 0, balance: 1500, min: 500, available: 0 }) === 'Your deposit is holding the vehicles you\'re winning.');
ok('limit line: no limit', limitLine({ unlimited: true, limit: null, balance: 5000, min: 500, available: 5000 }) === 'You can bid any amount.');
ok('steps: four, in plain words, with the settings', depositSteps(F).length === 4 && depositSteps(F)[0][1].includes('10%') && depositSteps(F)[0][1].includes('$5,000 lets you bid any amount'));
const e = { kind: 'applied', amount: -500, status: 'done', invoice_ref: 'TB-1', vehicle: '2019 HiLux', invoice_status: 'cancelled', cancel_reason: 'buyer_default' };
ok('history: a kept deposit says why', depositWhat(e) === "Kept: 2019 HiLux wasn't paid for");
ok('history: a cancelled sale that wasn\'t your fault is not "kept"', depositWhat({ ...e, cancel_reason: 'not_buyer_fault: title' }).startsWith('Towards'));
ok('history: refunds', depositWhat({ kind: 'withdrawal', status: 'pending', amount: -100 }) === 'Refund on its way to you');

// The hint beside a bid
const d = { available: 600 };
ok('short: what to add', JSON.stringify(depositShortBy(12000, F, d)) === JSON.stringify({ need: 1200, free: 600, short: 600 }));
ok('short: raising your own bid counts what this vehicle already holds', depositShortBy(12000, F, d, 1000).short === 0);
ok('short: nothing when covered', depositShortBy(5000, F, d).short === 0);


// The default, like Turners: no deposit; the winner pays the whole amount by transfer
ok('no deposit is the default', payMode(DEFAULT_FEES) === 'transfer' && payMode({}) === 'transfer' && payMode({ pay_mode: 'deposit' }) === 'deposit');
const t = priceBreakdown(8000, TF);
ok('no deposit: the whole amount by transfer, nothing up front, no surcharge', t.payMode === 'transfer' && t.cardBase === 0 && t.cardAmount === 0 && t.surcharge === 0 && t.balanceDue === t.subtotal && t.total === t.subtotal && t.subtotal === 8979, JSON.stringify(t));
ok('no deposit: what the bidder is told', winPayLine(t) === 'If you win, pay the $8,979.00 by PayID or bank transfer within 2 business days (your lender can pay it if you\'re using finance). No deposit, no card, no surcharge.' && buyNowPayLine(t).startsWith('Pay the $8,979.00 by PayID'));
ok('no deposit: agreeing to pay or lose the account', ackPayLine('transfer').includes('my account closed') && ackPayLine('deposit').includes('lose that deposit'));
ok('no deposit: four steps to bid, no payment step', JSON.stringify(joinSteps('transfer')) === '[1,2,3,5]' && JSON.stringify(joinSteps(undefined)) === '[1,2,3,5]' && JSON.stringify(joinSteps('deposit')) === '[1,2,3,5,4]');
ok('card mode words stay with the old code', winPayLine(priceBreakdown(1000, { ...TF, pay_mode: 'card' })) === null);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
