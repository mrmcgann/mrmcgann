// Load-tests the website itself (Next.js server) against the mock Supabase API.
// Shows how many requests one server instance handles and how many database
// queries each page view costs once the public-page cache is warm.
// Usage: node tests/load/web.mjs [baseUrl] [mockUrl]   (needs `autocannon` installed)
import { save } from './lib.mjs';

const autocannon = (await import(process.env.AUTOCANNON || 'autocannon')).default;

const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const MOCK = process.argv[3] || 'http://127.0.0.1:54321';
const CONN = Number(process.env.CONN || 200);
const SECONDS = Number(process.env.SECONDS || 20);

const scenarios = [
  ['Home page', ['/']],
  ['Auctions page (static shell)', ['/auctions', '/auctions?cat=utes', '/auctions?cat=cars&state=QLD', '/auctions?q=hilux']],
  ['Auction search results (the API the page calls)', ['/api/lots/search', '/api/lots/search?cat=utes', '/api/lots/search?cat=cars&state=QLD', '/api/lots/search?q=hilux']],
  ['Vehicle pages (50 different cars)', Array.from({ length: 50 }, (_, i) => `/lot/${100001 + i}`)],
  ['Live price endpoint (what open lot pages poll)', ['/api/lots/100001/live']],
  ['Bid history endpoint', ['/api/lots/100001/history']],
];

const out = [];
for (const [name, paths] of scenarios) {
  // warm the cache once, like a real site that's been up for a minute
  for (const p of paths) await fetch(BASE + p).catch(() => {});
  await fetch(`${MOCK}/__reset`);
  let i = 0;
  const r = await autocannon({
    url: BASE, connections: CONN, duration: SECONDS,
    requests: [{ setupRequest: (req) => ({ ...req, path: paths[i++ % paths.length] }) }],
  });
  const stats = await (await fetch(`${MOCK}/__stats`)).json();
  const row = {
    name, requests: r.requests.total, perSecond: Math.round(r.requests.average), p50: r.latency.p50, p99: r.latency.p99,
    errors: r.errors + r.non2xx, dbQueries: stats.total, dbQueriesPer1000Views: Math.round((stats.total / Math.max(1, r.requests.total)) * 1000),
  };
  out.push(row);
  console.log(`${name}: ${row.perSecond}/s, p50 ${row.p50} ms, p99 ${row.p99} ms, errors ${row.errors}, database queries per 1,000 views: ${row.dbQueriesPer1000Views}`);
}
save('web', out);
