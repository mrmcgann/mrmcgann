#!/usr/bin/env node
// Builds our free VIN lookup table from New Zealand's Motor Vehicle Register open data
// (NZ Transport Agency Waka Kotahi, licensed CC BY 4.0: free to use, with credit, which the
// sell form shows). NZ gets much of the same right-hand-drive stock as Australia, so the first
// characters of a VIN usually tell us the make, model, sub-model, body and fuel.
//
// 1. Download the Motor Vehicle Register CSV files (one per vehicle year, plus pre-1990) from
//    https://opendata-nzta.opendata.arcgis.com/datasets/NZTA::motor-vehicle-register
//    into one folder. Unzip any zip files.
// 2. From the project folder:
//      npm run vin-data -- ~/Downloads/nzta-mvr             writes supabase/vin-patterns-nz.csv and a summary
//      npm run vin-data -- ~/Downloads/nzta-mvr --upload    also loads it into Supabase (needs .env.local with
//                                                             NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
// Run it again any time with newer files: it replaces the previous NZ rows. What our team confirms on
// our own listings always outranks this data.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { finishVehicle } from '../src/lib/rego.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const UPLOAD = args.includes('--upload');
const inputs = args.filter((a) => !a.startsWith('--'));
if (!inputs.length) { console.log('Usage: npm run vin-data -- <folder with the NZ register CSV files> [--upload]'); process.exit(1); }

const files = [];
const walk = (p) => { const st = fs.statSync(p); if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f)); else if (/\.csv$/i.test(p)) files.push(p); };
for (const i of inputs) walk(path.resolve(i.replace(/^~/, process.env.HOME || '~')));
if (!files.length) { console.log('No .csv files found. Unzip the downloads into the folder first.'); process.exit(1); }

// CSV line splitter that copes with quoted fields.
function split(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

const VIN11 = /^[A-HJ-NPR-Z0-9]{11}$/;
const want = { vin: ['VIN11', 'VIN_11', 'VIN'], make: ['MAKE'], model: ['MODEL'], sub: ['SUBMODEL', 'SUB_MODEL'], body: ['BODY_TYPE'], fuel: ['MOTIVE_POWER'],
  trans: ['TRANSMISSION_TYPE', 'TRANSMISSION'], cc: ['CC_RATING'], year: ['VEHICLE_YEAR'] };
const groups = new Map(); // prefix -> Map(make|model|sub -> { n, body:{}, fuel:{}, trans:{}, cc:{}, year:{} })
const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
const mode = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
let rows = 0, used = 0;

for (const file of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let col = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!col) {
      const head = split(line).map((h) => h.trim().toUpperCase());
      col = Object.fromEntries(Object.entries(want).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))]));
      if (col.vin < 0 || col.make < 0 || col.model < 0) {
        console.log(`${path.basename(file)}: no VIN11, MAKE or MODEL column. Columns found:\n  ${head.join(', ')}`);
        process.exit(1);
      }
      continue;
    }
    rows++;
    const f = split(line);
    const vin = (f[col.vin] || '').trim().toUpperCase().slice(0, 11);
    const make = (f[col.make] || '').trim(), model = (f[col.model] || '').trim();
    if (!VIN11.test(vin) || !make || !model) continue;
    used++;
    const prefix = vin.slice(0, 8) + vin[9];
    const sub = col.sub >= 0 ? (f[col.sub] || '').trim() : '';
    let g = groups.get(prefix); if (!g) { g = new Map(); groups.set(prefix, g); }
    const key = `${make}|${model}|${sub}`;
    let e = g.get(key); if (!e) { e = { n: 0, body: {}, fuel: {}, trans: {}, cc: {}, year: {} }; g.set(key, e); }
    e.n++;
    if (col.body >= 0) bump(e.body, f[col.body]?.trim());
    if (col.fuel >= 0) bump(e.fuel, f[col.fuel]?.trim());
    if (col.trans >= 0) bump(e.trans, f[col.trans]?.trim());
    if (col.cc >= 0) bump(e.cc, f[col.cc]?.trim());
    if (col.year >= 0) bump(e.year, f[col.year]?.trim());
  }
  console.log(`read ${path.basename(file)} (${rows.toLocaleString()} rows so far)`);
}

// For each VIN prefix keep the common readings (at least 1 in 10 of that prefix), tidied like a lookup.
const out = [];
for (const [prefix, g] of groups) {
  const total = [...g.values()].reduce((a, e) => a + e.n, 0);
  for (const [key, e] of [...g.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3)) {
    if (e.n / total < 0.1) continue;
    const [make, model, sub] = key.split('|');
    const cc = Number(mode(e.cc)) || null;
    const v = finishVehicle({ make, model, variant: sub || null, body: mode(e.body), fuel: mode(e.fuel), transmission: mode(e.trans), year: Number(mode(e.year)) || null });
    out.push({ prefix, source: 'nzta', make: v.make, model: v.model, variant: v.variant || null, body: v.body || null, fuel: v.fuel || null, transmission: v.transmission || null,
      drive: v.drive || null, engine_cc: cc && cc > 0 && cc < 30000 ? cc : null, year: v.year || null, category: v.category || null, kind: v.kind || null, seen: e.n });
  }
}
// One row per prefix + make + model + variant (the database's unique key), keeping the commonest.
const dedup = new Map();
for (const r of out) { const k = [r.prefix, r.make, r.model, r.variant || ''].join('|').toLowerCase(); const prev = dedup.get(k); if (!prev) dedup.set(k, r); else prev.seen += r.seen; }
out.length = 0; out.push(...dedup.values());
console.log(`\n${rows.toLocaleString()} vehicles read, ${used.toLocaleString()} with a VIN, ${groups.size.toLocaleString()} VIN prefixes, ${out.length.toLocaleString()} rows to keep.`);

const csvPath = path.join(ROOT, 'supabase', 'vin-patterns-nz.csv');
const cols = ['prefix', 'source', 'make', 'model', 'variant', 'body', 'fuel', 'transmission', 'drive', 'engine_cc', 'year', 'category', 'kind', 'seen'];
const cell = (x) => (x == null ? '' : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
fs.writeFileSync(csvPath, [cols.join(','), ...out.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n');
console.log(`Wrote ${path.relative(ROOT, csvPath)}.`);

if (UPLOAD) {
  const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env.local')) ? fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8') : '').split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log('Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local to upload.'); process.exit(1); }
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  const del = await fetch(`${url}/rest/v1/vin_patterns?source=eq.nzta`, { method: 'DELETE', headers: h });
  if (!del.ok) { console.log(`Couldn't clear the old NZ rows: ${del.status} ${await del.text()}`); process.exit(1); }
  for (let i = 0; i < out.length; i += 1000) {
    const r = await fetch(`${url}/rest/v1/vin_patterns`, { method: 'POST', headers: h, body: JSON.stringify(out.slice(i, i + 1000)) });
    if (!r.ok) { console.log(`Upload stopped at row ${i}: ${r.status} ${await r.text()}`); process.exit(1); }
    if (i % 20000 === 0) console.log(`uploaded ${Math.min(i + 1000, out.length).toLocaleString()} of ${out.length.toLocaleString()}`);
  }
  console.log('Uploaded. The sell form now uses it.');
}
