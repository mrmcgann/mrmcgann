// Captures the app's screens at an iPhone's size (1170 x 2532) for the store screenshots, from the app's web build
// (npx expo export -p web) served on the same origin as the website's /api (the website sends no cross-origin headers).
// Then run compose.mjs. Needs Playwright: PW_ROOT=$(npm root -g) node mobile/store/tools/capture.mjs [home lot search live sell]
//   APP            the app's web build (default http://localhost:8090)
//   MEMBER         a file holding a signed-in member's Supabase session JSON (watchlist heart, entered in the auction room)
//   SELLER         the same for a member with no listings (the Sell tab's "how it works"); defaults to MEMBER
//   LOT_UP         the truck that's up in the live room (its specs and the two ways to inspect it)
//   LOT_WAITING    a truck waiting for its auction (its estimate and all-in price)
//   SALE           the live auction's slug; SEARCH what to type in search
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_ROOT + '/');
const { chromium } = require('playwright');

const APP = process.env.APP || 'http://localhost:8090';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'raw');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const read = (f) => (f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null);
const MEMBER = read(process.env.MEMBER);
const SELLER = read(process.env.SELLER) || MEMBER;
const LOT_UP = process.env.LOT_UP || '10702', LOT_WAITING = process.env.LOT_WAITING || '10703';
const SALE = process.env.SALE || 'sample-live-auction', SEARCH = process.env.SEARCH || 'Isuzu FVZ tipper under 80k';

const browser = await chromium.launch();
async function phone(sessionJson) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(([k, v]) => { try { if (v) localStorage.setItem(k, v); localStorage.setItem('pref.pushAsked', 'true'); } catch {} }, [process.env.SESSION_KEY || 'sb-127-auth-token', sessionJson]);
  return ctx;
}
const settle = (p, ms = 2500) => p.waitForLoadState('networkidle').catch(() => {}).then(() => p.waitForTimeout(ms));
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const scrollTo = async (p, text) => {
  const el = p.locator(`text=${text} >> visible=true`).first();
  await el.waitFor({ timeout: 15000 });
  await el.evaluate((n) => {
    let s = n.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const r = n.getBoundingClientRect();
    if (s) s.scrollBy(0, r.top - 120); else window.scrollBy(0, r.top - 120);
  });
  await p.waitForTimeout(900);
};
const want = (k) => !only.length || only.includes(k);
// bring an element to a given height on the screen (the app scrolls inside its own scroll view)
const place = async (p, sel, y) => {
  const el = p.locator(`${sel} >> visible=true`).first();
  await el.waitFor({ timeout: 15000 });
  await el.evaluate((n, y) => {
    let s = n.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const r = n.getBoundingClientRect();
    if (s) s.scrollBy(0, r.top - y); else window.scrollBy(0, r.top - y);
  }, y);
  await p.waitForTimeout(900);
};

const amy = await phone(MEMBER);
if (want('home')) { const p = await amy.newPage(); await p.goto(APP + '/'); await settle(p, 3500); await shot(p, 'home'); }
if (want('lot')) {
  // a truck waiting for the auction shows its estimate and early bids (the one that's up sends bidders to the room)
  const q = await amy.newPage(); await q.goto(APP + '/lot/' + LOT_WAITING); await settle(q, 3500);
  await place(q, 'text=Auction estimate', 600); await shot(q, 'lot');
  if (!process.env.LOT_ONLY) {
    const p = await amy.newPage(); await p.goto(APP + '/lot/' + LOT_UP); await settle(p, 3500);
    await scrollTo(p, 'Engine and driveline'); await shot(p, 'details');
    await place(p, '[data-testid="viewing"], [data-testid="viewing-off"]', 210); await shot(p, 'inspect');
  }
}
if (want('search')) {
  const p = await amy.newPage(); await p.goto(APP + '/search?focus=1'); await settle(p, 2500);
  const box = p.locator('input').first(); await box.click(); await box.fill(SEARCH); await p.keyboard.press('Enter');
  await settle(p, 3000); await p.locator('input').first().blur().catch(() => {}); await p.waitForTimeout(800); await shot(p, 'search');
}
if (want('live')) { const p = await amy.newPage(); await p.goto(APP + '/live/' + SALE); await settle(p, 4000); await shot(p, 'live'); }
if (want('sell')) { const ben = await phone(SELLER); const p = await ben.newPage(); await p.goto(APP + '/sell'); await settle(p, 3000); await shot(p, 'sell'); }
await browser.close();
