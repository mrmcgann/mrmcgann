// Listing accuracy wording, bulk upload parsing and CSV: node --experimental-strip-types tests/unit/listing.test.mjs
import { consumerRights, rightsLine, LISTING_CHECKS, CHECK_KEYS, RUNS, WRITE_OFF, isElectrified } from '../../src/lib/listing.ts';
import { rowsToLots, importTemplate, IMPORT_COLUMNS } from '../../src/lib/importLots.ts';
import { parseCsv, toCsv } from '../../src/lib/csv.ts';
import { cleanFilters, parseQuery, describeParts } from '../../src/lib/search.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// The checks match the database's listing_check_keys()
ok('checks: ten, in the database order', CHECK_KEYS.join(',') === 'vin,year,odometer,transmission,fuel,features,warning_lights,runs,damage,photos', CHECK_KEYS.join(','));
ok('checks: each has staff and buyer wording', LISTING_CHECKS.every(([, a, b]) => a.length > 20 && b.length > 5));
ok('runs: four states', Object.keys(RUNS).join(',') === 'drives,starts,no_start,untested');
ok('write-off: inspected and statutory explained', WRITE_OFF.inspected.includes('Inspected') && WRITE_OFF.statutory.includes('never be registered'));

// Consumer rights wording never says "no warranty", and keeps misdescription rights
for (const [path, seller] of [['auction', 'private'], ['auction', 'business'], ['outright', 'private'], ['outright', 'business'], ['outright', null]]) {
  const t = consumerRights(path, seller);
  ok(`rights ${path}/${seller}: no "no warranty"`, !/no warranty/i.test(t), t);
  ok(`rights ${path}/${seller}: misleading-description rights kept`, /misleading descriptions aren't affected/.test(t), t);
}
ok('rights: auction keeps title guarantees, excludes quality', /clear title/.test(consumerRights('auction', 'private')) && /acceptable quality.*don't apply/.test(consumerRights('auction', 'business')));
ok('rights: outright from a business may include acceptable quality', /may apply/.test(consumerRights('outright', 'business')) && /acceptable quality/.test(consumerRights('outright', 'business')));
ok('rights: outright from a private seller', /private seller/.test(consumerRights('outright', 'private')) && /generally don't apply/.test(consumerRights('outright', 'private')));
ok('rights line: auction', rightsLine('auction', 'private').startsWith('Auction sale'));
ok('rights line: outright business', rightsLine('outright', 'business').startsWith('Business seller'));
ok('electrified: EV and hybrid, not diesel', isElectrified('Electric') && isElectrified('Hybrid') && !isElectrified('Diesel') && !isElectrified(null));

// CSV
ok('csv: quotes, commas and new lines', JSON.stringify(parseCsv('a,"b,1","c ""x"""\r\n1,2,"3\n4"\n')) === JSON.stringify([['a', 'b,1', 'c "x"'], ['1', '2', '3\n4']]), JSON.stringify(parseCsv('a,"b,1","c ""x"""\r\n1,2,"3\n4"\n')));
ok('csv: blank lines skipped', parseCsv('a,b\n\n1,2\n').length === 2);
const out = toCsv(['Name', 'Note'], [['=HYPERLINK("x")', 'a,b'], [-5, null]]);
ok('csv: formulas defused, commas quoted, negatives kept', out.includes(`"'=HYPERLINK(""x"")"`) && out.includes('"a,b"') && out.includes('-5,'), out);
ok('csv: starts with a BOM for Excel', out.charCodeAt(0) === 0xfeff);

// Bulk upload
const rows = rowsToLots(parseCsv(importTemplate()));
ok('import: template parses into one good row', rows.length === 1 && rows[0].problems.length === 0, JSON.stringify(rows[0]?.problems));
const r0 = rows[0]?.lot || {};
ok('import: tidy make, model, category and title', r0.make === 'Toyota' && r0.model === 'HiLux' && r0.category === 'utes' && r0.title === '2019 Toyota HiLux SR 4x4', JSON.stringify(r0));
ok('import: registration, plate, state and expiry', r0.registration === 'registered' && r0.rego_plate === 'ABC123' && r0.rego_state === 'QLD' && r0.rego_expiry === '2027-03-31');
ok('import: numbers and reserve', r0.odometer === 148000 && r0.start_price === 1000 && rows[0].reserve === 22000 && r0.keys === 2);
ok('import: always a draft', r0.status === 'draft');
const bad = rowsToLots(parseCsv('Make,Model,VIN,State,Rego expiry,Year\nFord,,BADVIN,XYZ,31/03/2027,1850\nIsuzu,NPR,,qld,,2015\n'));
ok('import: problems reported', bad[0].problems.length >= 4, JSON.stringify(bad[0].problems));
ok('import: a truck model is a truck', bad[1].lot.category === 'trucks' && bad[1].problems.length === 0 && bad[1].lot.state === 'QLD', JSON.stringify(bad[1]));
ok('import: unregistered without a plate', bad[1].lot.registration === null && bad[1].lot.rego_plate === null);
ok('import: column aliases (kms, plate)', rowsToLots(parseCsv('Make,Model,Kms,Plate\nMazda,CX-5,"120,500",xyz 999\n'))[0].lot.odometer === 120500);
ok('import: template has every column', importTemplate().split('\r\n')[0].split(',').length === IMPORT_COLUMNS.length);

// Search: new filters
ok('filters: starts and drives', cleanFilters({ runs: 'drives' }).runs === 'drives' && cleanFilters({ runs: 'maybe' }).runs === undefined);
ok('filters: sale is a number', cleanFilters({ sale: '12' }).sale === '12' && cleanFilters({ sale: 'x1' }).sale === undefined);
ok('parser: "runs and drives"', parseQuery('hilux runs and drives').f.runs === 'drives', JSON.stringify(parseQuery('hilux runs and drives').f));
ok('describe: starts and drives', describeParts({ runs: 'drives' }).includes('Starts and drives'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
