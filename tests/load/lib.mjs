// Shared helpers for the scale and load tests.
import pg from 'pg';
import fs from 'fs';
import path from 'path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const PG = {
  host: process.env.PGHOST || '/tmp',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
};
export const DB = process.env.SCALE_DB || 'tyrebiter_scale';

export const uid = (i) => md5uuid('u' + i);
export function md5uuid(s) {
  // Same as Postgres md5(s)::uuid
  const h = cryptoHash(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
import crypto from 'crypto';
function cryptoHash(s) { return crypto.createHash('md5').update(s).digest('hex'); }

export async function client(database = DB) {
  const c = new pg.Client({ ...PG, database });
  await c.connect();
  return c;
}

export function pool(size, database = DB) {
  return new pg.Pool({ ...PG, database, max: size, idleTimeoutMillis: 0 });
}

// Build an empty database with the Supabase base and the given migrations applied.
export async function freshDb(database, { upTo = Infinity } = {}) {
  const a = await client('postgres');
  await a.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [database]);
  await a.query(`drop database if exists ${database}`);
  await a.query(`create database ${database}`);
  await a.end();
  const c = await client(database);
  await c.query(fs.readFileSync(ROOT + '/tests/db/supabase_base.sql', 'utf8'));
  const files = migrations().filter((_, i) => i < upTo);
  for (const f of files) await c.query(fs.readFileSync(ROOT + '/supabase/migrations/' + f, 'utf8'));
  await c.end();
  return files;
}

export const migrations = () => fs.readdirSync(ROOT + '/supabase/migrations').filter((f) => f.endsWith('.sql')).sort();

export async function applyMigration(database, file) {
  const c = await client(database);
  await c.query(fs.readFileSync(ROOT + '/supabase/migrations/' + file, 'utf8'));
  await c.end();
}

// Run SQL the way PostgREST does: one transaction, role switched, JWT claims set.
export async function as(c, who, sql, params = []) {
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  const claims = who === 'anon' ? { role: 'anon' } : who === 'service' ? { role: 'service_role' } : { sub: who, role: 'authenticated' };
  await c.query('begin');
  try {
    await c.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`, [role, JSON.stringify(claims)]);
    const t = performance.now();
    const r = await c.query(sql, params);
    const ms = performance.now() - t;
    await c.query('commit');
    return { rows: r.rows, ms };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    return { error: e.message, code: e.code };
  }
}

export function stats(xs) {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
}

export function save(name, data) {
  fs.mkdirSync(ROOT + '/tests/load/results', { recursive: true });
  fs.writeFileSync(ROOT + `/tests/load/results/${name}.json`, JSON.stringify(data, null, 2));
}

export const rnd = (n) => Math.floor(Math.random() * n);
// Zipf-ish pick: a few lots get most of the attention, like real auctions.
export const hot = (n, s = 1.1) => Math.min(n - 1, Math.floor(n * Math.pow(Math.random(), 1 / (1 - 1 / (s + 1)) * 2)));
