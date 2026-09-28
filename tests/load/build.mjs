// Builds a full-size test database: 1,000,000 accounts and three years of sales.
// Usage: node tests/load/build.mjs [--baseline]   (--baseline = only the first 3 migrations)
import fs from 'fs';
import { ROOT, DB, freshDb, client } from './lib.mjs';

export const SIZE = {
  USERS: Number(process.env.USERS || 1_000_000),
  VERIFIED: Number(process.env.VERIFIED || 600_000), // accounts that finished sign-up and can bid
  LOTS: Number(process.env.LOTS || 60_000),          // vehicles listed over three years
  LIVE: Number(process.env.LIVE || 3_000),           // live at the same time
  WATCH: Number(process.env.WATCH || 3_000_000),
  SEARCHES: Number(process.env.SEARCHES || 250_000),
  NOTIFICATIONS: Number(process.env.NOTIFICATIONS || 3_000_000),
};

const baseline = process.argv.includes('--baseline');
const t0 = Date.now();
const applied = await freshDb(DB, { upTo: baseline ? 3 : Infinity });
console.log(`schema: ${applied.join(', ')}`);
let sql = fs.readFileSync(ROOT + '/tests/load/scale-seed.sql', 'utf8');
for (const [k, v] of Object.entries(SIZE)) sql = sql.replaceAll(`{{${k}}}`, String(v));
const c = await client();
// Run statement by statement so progress is visible.
const parts = sql.split(/;\s*\n/)
  .map((s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim())
  .filter(Boolean);
for (const p of parts) {
  const t = Date.now();
  await c.query(p);
  const first = p.split('\n')[0];
  if (Date.now() - t > 2000) console.log(`  ${((Date.now() - t) / 1000).toFixed(1)}s  ${first.slice(0, 70)}`);
}
await c.query('vacuum analyze');
const { rows } = await c.query(`select relname, n_live_tup::bigint rows, pg_size_pretty(pg_total_relation_size(relid)) size
  from pg_stat_user_tables where schemaname in ('public','auth') order by n_live_tup desc`);
console.table(rows.slice(0, 14));
const { rows: [db] } = await c.query(`select pg_size_pretty(pg_database_size(current_database())) size`);
console.log(`database size ${db.size}, built in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
fs.writeFileSync(ROOT + '/tests/load/results/size.json', JSON.stringify({ SIZE, tables: rows, db: db.size }, null, 2));
await c.end();
