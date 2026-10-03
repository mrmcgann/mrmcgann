#!/usr/bin/env node
// Fills the SAMPLE listings with openly licensed photos of the same make and model from
// Wikimedia Commons (public domain, CC0, CC BY or CC BY-SA only), with a credit on each photo.
// Never use photos from other listing sites: they belong to their sellers and photographers.
//
// Needs internet access. Run from the project folder:
//   node scripts/sample-photos.mjs            downloads photos and writes the SQL
//   node scripts/sample-photos.mjs --dry      only lists what it would use
// Then run supabase/sample-photos.sql in the Supabase SQL editor (after seed.sql).
// Photos are saved to public/sample-photos/ and served by the website itself.
// Delete the sample vehicles (and these photos) before launch, like the rest of the sample data.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'sample-photos');
const SQL = path.join(ROOT, 'supabase', 'sample-photos.sql');
const DRY = process.argv.includes('--dry');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'TyrebiterSamplePhotos/1.0 (sample data for a vehicle auction site; contact: help@tyrebiter.com.au)';
const FREE = /^(cc0|public domain|pd|cc by(-sa)? \d(\.\d)?( [a-z]+)?|cc-by(-sa)?-\d(\.\d)?)/i;

// What to look for. Searches are tried in order; the first good photos win.
const LOTS = [
  { id: 10432, want: ['corolla', 'zre152'], avoid: ['hatch', 'rumion', 'altis', 'e170', 'e210'], searches: ['Toyota Corolla ZRE152R Ascent sedan', 'Toyota Corolla (ZRE152R) Ascent sedan', 'Toyota Corolla E150 sedan Australia'] },
  { id: 10588, want: ['isuzu', 'npr'], avoid: ['bus'], searches: ['Isuzu NPR tipper', 'Isuzu NPR truck Australia', 'Isuzu N series tipper'] },
  { id: 10590, want: ['kenworth'], avoid: ['toy', 'model'], searches: ['Kenworth T401', 'Kenworth T404', 'Kenworth T402 prime mover', 'Kenworth prime mover Australia'] },
  { id: 10599, want: ['ranger'], avoid: ['raptor', 'wildtrak', 'px iii', '2019', '2022', '2023', 'next-gen', 'ry '], searches: ['Ford Ranger PX XLT 4WD 4-door utility', 'Ford Ranger (PX) XLT', 'Ford Ranger PX MkII XLT'] },
  { id: 10611, want: ['mazda'], avoid: ['sedan', 'dj', 'dl ', 'cx'], searches: ['Mazda 2 (DE) Neo 5-door hatchback', 'Mazda2 DE Neo hatchback', 'Mazda 2 DE hatchback'] },
  { id: 10620, want: ['commodore'], avoid: ['ute', 'wagon', 'sportwagon', 'hsv', 'police', 'vf', 'vz', 'vy'], searches: ['Holden Commodore (VE) Omega sedan', 'Holden VE Commodore Omega', 'Holden Commodore VE sedan'] },
  { id: 10633, want: ['i30'], avoid: ['wagon', 'tourer', 'pd', 'n line', 'sedan'], searches: ['Hyundai i30 (GD) Active 5-door hatchback', 'Hyundai i30 GD Active', 'Hyundai i30 GD hatchback'] },
  { id: 10660, want: ['mt-07', 'mt07', 'mt 07'], avoid: ['tracer', 'xsr'], searches: ['Yamaha MT-07', 'Yamaha MT-07 motorcycle'] },
  { id: 10661, want: ['jayco'], avoid: ['factory'], searches: ['Jayco caravan', 'Jayco pop top caravan', 'Jayco Starcraft'] },
  { id: 10662, want: ['quintrex', 'aluminium boat', 'aluminum boat', 'tinny', 'dinghy'], avoid: ['ship', 'ferry'], searches: ['Quintrex boat', 'aluminium fishing boat Australia', 'tinny boat Australia'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params })) u.searchParams.set(k, String(v));
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    await sleep(1000 * (i + 1));
  }
  throw new Error(`Commons API failed: ${u}`);
}
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function candidates(query) {
  const j = await api({ action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: 6, gsrlimit: 40,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata|user|timestamp', iiurlwidth: 1280 });
  return (j.query?.pages || []).map((p) => {
    const ii = p.imageinfo?.[0] || {};
    const m = ii.extmetadata || {};
    return {
      title: p.title, page: ii.descriptionurl, url: ii.thumburl || ii.url, width: ii.width, height: ii.height, mime: ii.mime,
      licence: strip(m.LicenseShortName?.value), author: strip(m.Artist?.value) || ii.user, user: ii.user,
      date: strip(m.DateTimeOriginal?.value).slice(0, 10), desc: strip(m.ImageDescription?.value).slice(0, 200),
    };
  });
}

function ok(c, lot) {
  const t = `${c.title} ${c.desc}`.toLowerCase();
  return c.mime === 'image/jpeg' && c.width >= 1100 && c.width >= c.height * 1.15 && FREE.test(c.licence)
    && lot.want.some((w) => t.includes(w)) && !lot.avoid.some((a) => t.includes(a))
    && !/interior|engine bay|badge|logo|wheel|detail|dashboard|crash|wreck|damaged|burnt|toy|model car|diecast/.test(t.replace(/^file:/, ''));
}

function angleOf(title) {
  const t = title.toLowerCase();
  if (/rear|back/.test(t)) return 'Rear';
  if (/side|profile/.test(t)) return 'Side';
  if (/interior|dash/.test(t)) return 'Interior';
  return 'Front 3/4';
}

const esc = (s) => String(s).replace(/'/g, "''");
const credits = [];
const lines = ['-- Sample photos from Wikimedia Commons (openly licensed). Generated by scripts/sample-photos.mjs.', '-- Run after seed.sql. Delete with the sample vehicles before launch.'];
if (!DRY) fs.mkdirSync(OUT, { recursive: true });

for (const lot of LOTS) {
  const seen = new Map();
  for (const q of lot.searches) {
    for (const c of await candidates(q)) if (!seen.has(c.title) && ok(c, lot)) seen.set(c.title, c);
    if (seen.size >= 8) break;
    await sleep(300);
  }
  // Prefer several photos of the same vehicle: group by uploader and date, biggest group first.
  const groups = new Map();
  for (const c of seen.values()) { const k = `${c.user}|${c.date}`; groups.set(k, [...(groups.get(k) || []), c]); }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length).flat();
  const pick = ordered.slice(0, 5).sort((a, b) => (angleOf(a.title) === 'Front 3/4' ? -1 : 0) - (angleOf(b.title) === 'Front 3/4' ? -1 : 0));
  console.log(`\nLot ${lot.id}: ${pick.length} photo(s)`);
  if (!pick.length) continue;
  lines.push(`delete from public.lot_photos where lot_id = ${lot.id} and path like '/sample-photos/%';`);
  let n = 0;
  for (const c of pick) {
    n++;
    const file = `${lot.id}-${n}.jpg`;
    const credit = `${c.author}, Wikimedia Commons, ${c.licence}`;
    console.log(`  ${file}  ${c.licence}  ${c.author}  ${c.page}`);
    if (!DRY) {
      const r = await fetch(c.url, { headers: { 'User-Agent': UA } });
      if (!r.ok) { console.log(`    download failed (${r.status}), skipped`); n--; continue; }
      fs.writeFileSync(path.join(OUT, file), Buffer.from(await r.arrayBuffer()));
      await sleep(250);
    }
    // CC BY and BY-SA need the author, the licence and a link to the source: credit_url is the file page.
    lines.push(`insert into public.lot_photos (lot_id, path, angle, sort, credit, credit_url) values (${lot.id}, '/sample-photos/${file}', '${angleOf(c.title)}', ${n - 1}, '${esc(credit)}', '${esc(c.page)}');`);
    credits.push(`- ${file}: ${credit}. Source: ${c.page}`);
  }
  lines.push(`update public.lots set cover_path = '/sample-photos/${lot.id}-1.jpg' where id = ${lot.id};`);
}

if (!DRY) {
  fs.writeFileSync(SQL, lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), ['# Sample photo credits', '', 'Openly licensed photos from Wikimedia Commons, used for sample listings only. Licences: https://creativecommons.org/licenses/', '', ...credits].join('\n') + '\n');
  console.log(`\nWrote ${path.relative(ROOT, SQL)} and photos in ${path.relative(ROOT, OUT)}. Look through them, delete any that don't match, then run the SQL.`);
}
