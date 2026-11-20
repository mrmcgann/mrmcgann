// Puts the captured app screens into store frames: iPhone 6.7" (1290x2796), Android phone (1080x1920), and the
// Play feature graphic (1024x500). Brand colours and type: Plus Jakarta Sans with a Fraunces italic accent.
// Run after capture.mjs: PW_ROOT=$(npm root -g) node mobile/store/tools/compose.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PW_ROOT + '/');
const { chromium } = require('playwright');

const STORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = path.join(STORE, '..', 'node_modules', '@expo-google-fonts');
const RAW = path.join(STORE, 'raw');
const OUT = path.join(STORE, 'screenshots');
const FRAMES_DIR = fs.mkdtempSync(path.join(path.dirname(STORE), '.store-frames-'));
fs.mkdirSync(`${OUT}/iphone`, { recursive: true });
fs.mkdirSync(`${OUT}/android`, { recursive: true });
const C = { ink: '#1D1D1F', blue: '#2F5BFF', sun: '#FFC93C', sky: '#33C4F2', lime: '#B8E62E', mint: '#3DDC97', grape: '#7A42E0', berry: '#FF4F79', tangerine: '#FF7A2F' };
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const FRAMES = [
  { shot: 'home', bg: C.sun, l1: 'Trucks,', l2: ['sold ', 'live.'], acc: C.blue, sub: 'Live online truck auctions in Queensland, with an estimate on every listing. Bid from anywhere.' },
  { shot: 'live', bg: C.grape, dark: true, l1: 'Bid live,', l2: ['', 'from anywhere.'], acc: C.sun, sub: 'Follow each truck in the live auction room and tap to bid. Every bid shows its all-in price.' },
  { shot: 'lot', bg: C.sky, l1: 'The all-in price,', l2: ['', 'every time.'], acc: C.ink, sub: 'Every estimate and bid shows what you’d pay: the bid, the buyer’s premium and GST, added up.' },
  { shot: 'details', bg: C.lime, l1: 'Every detail', l2: ['', 'that matters.'], acc: C.ink, sub: 'Configuration, GVM and GCM, power, gearbox, axles and brakes, the way truck buyers expect.' },
  { shot: 'inspect', bg: C.mint, l1: 'Inspect it', l2: ['', 'first.'], acc: C.ink, sub: 'Look it over yourself by appointment, or send our mobile mechanic for a written report.' },
  { shot: 'search', bg: C.berry, l1: 'Search the way', l2: ['you ', 'talk.'], acc: '#FFFFFF', sub: 'Type “Isuzu FVZ tipper under 80k” and we work out the make, model, type and price.' },
  { shot: 'sell', bg: C.tangerine, l1: 'Selling your', l2: ['', 'truck?'], acc: '#FFFFFF', sub: 'Photos and a walkaround video from your phone. We auction it live, and the buyer pays us in full before they collect it.' },
];

const fontCss = `
@font-face { font-family: J; font-weight: 800; src: url('file://${FONTS}/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'); }
@font-face { font-family: J; font-weight: 500; src: url('file://${FONTS}/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'); }
@font-face { font-family: F; font-style: italic; font-weight: 600; src: url('file://${FONTS}/fraunces/600SemiBold_Italic/Fraunces_600SemiBold_Italic.ttf'); }
* { box-sizing: border-box; } body { margin: 0; }`;

function framePage(f, k) {
  // k: sizes for the canvas
  const ink = f.dark ? '#FFFFFF' : C.ink;
  const sub = f.dark ? 'rgba(255,255,255,.86)' : 'rgba(29,29,31,.8)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
  .c { width: ${k.w}px; height: ${k.h}px; position: relative; overflow: hidden; background: ${f.bg}; font-family: J, sans-serif; }
  h1 { position: absolute; left: ${k.x}px; top: ${k.top}px; margin: 0; font-weight: 800; font-size: ${k.h1}px; line-height: 1.02; letter-spacing: -0.045em; color: ${ink}; }
  h1 em { font-family: F, serif; font-style: italic; font-weight: 600; letter-spacing: -0.015em; color: ${f.acc}; }
  p { position: absolute; left: ${k.x}px; top: ${k.subTop}px; width: ${k.w - 2 * k.x}px; margin: 0; font-weight: 500; font-size: ${k.p}px; line-height: 1.32; color: ${sub}; letter-spacing: -0.005em; }
  .ph { position: absolute; left: ${(k.w - k.pw) / 2}px; top: ${k.h - k.bottom - k.ph}px; width: ${k.pw}px; height: ${k.ph}px; background: #1D1D1F; border-radius: ${k.r}px; padding: ${k.bz}px; box-shadow: 0 ${k.bz * 2}px ${k.bz * 4}px rgba(0,0,0,.22); }
  .ph img { display: block; width: 100%; height: 100%; border-radius: ${k.r - k.bz}px; object-fit: cover; object-position: top; }
  </style></head><body><div class="c">
  <h1>${esc(f.l1)}<br>${esc(f.l2[0])}<em>${esc(f.l2[1])}</em></h1>
  <p>${esc(f.sub)}</p>
  <div class="ph"><img src="file://${RAW}/${f.shot}.png"></div>
  </div></body></html>`;
}
// screen 1170x2532 inside a bezel: phone height follows the screen's shape
const kit = (w, h, x, top, h1, p, pw, bz, bottom, r, gap) => {
  const sw = pw - 2 * bz, sh = Math.round(sw * 2532 / 1170);
  return { w, h, x, top, h1, p, subTop: top + Math.round(h1 * 1.02 * 2) + gap, pw, ph: sh + 2 * bz, bz, bottom, r };
};
const IPHONE = kit(1290, 2796, 96, 150, 124, 46, 904, 22, 110, 112, 34);
const ANDROID = kit(1080, 1920, 72, 70, 82, 31, 700, 16, 46, 84, 32);

const browser = await chromium.launch();
for (const [dir, k] of [['iphone', IPHONE], ['android', ANDROID]]) {
  const ctx = await browser.newContext({ viewport: { width: k.w, height: k.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [i, f] of FRAMES.entries()) {
    const file = path.join(FRAMES_DIR, `${dir}-${f.shot}.html`);
    fs.writeFileSync(file, framePage(f, k));
    await page.goto('file://' + file);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${dir}/0${i + 1}.png` });
  }
  await ctx.close();
}

// Play feature graphic
const truck = `<svg viewBox="0 0 300 110" width="460"><ellipse cx="150" cy="101" rx="140" ry="6" fill="rgba(0,0,0,0.18)"/><path d="M20 34C20 30 24 26 30 26L80 26C88 26 94 32 94 40L94 88L20 88Z" fill="#1D1D1F"/><path d="M30 34L80 34L85 56L30 56Z" fill="rgba(255,255,255,0.24)"/><path d="M100 40L288 40L288 80L100 80Z" fill="#1D1D1F"/><path d="M96 86L292 86" stroke="#1D1D1F" stroke-width="5"/>${[58, 224, 260].map((x) => `<circle cx="${x}" cy="88" r="15" fill="#1D1D1F"/><circle cx="${x}" cy="88" r="9.6" fill="none" stroke="#fff" stroke-width="3"/><circle cx="${x}" cy="88" r="3.6" fill="#fff"/>`).join('')}</svg>`;
const ring = ['#FF7A2F', '#FFC93C', '#B8E62E', '#33C4F2', '#7A42E0', '#FF4F79'].map((c, i) => `<circle cx="13" cy="13" r="10" fill="none" stroke="${c}" stroke-width="5" stroke-dasharray="9.47 53.36" stroke-dashoffset="${-10.47 * i}"/>`).join('');
const fg = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
.c { width: 1024px; height: 500px; position: relative; overflow: hidden; background: ${C.sun}; font-family: J, sans-serif; color: ${C.ink}; }
.logo { position: absolute; left: 64px; top: 56px; display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 34px; letter-spacing: -0.04em; }
.logo .m { width: 40px; height: 40px; background: #fff; border-radius: 50%; display: grid; place-items: center; }
h1 { position: absolute; left: 64px; top: 150px; margin: 0; font-weight: 800; font-size: 76px; line-height: 1.0; letter-spacing: -0.045em; }
h1 em { font-family: F, serif; font-style: italic; font-weight: 600; color: ${C.blue}; letter-spacing: -0.015em; }
p { position: absolute; left: 64px; top: 330px; margin: 0; width: 470px; font-weight: 500; font-size: 26px; line-height: 1.3; color: rgba(29,29,31,.8); }
.t { position: absolute; right: 40px; bottom: 54px; }
</style></head><body><div class="c">
<div class="logo"><span class="m"><svg width="34" height="34" viewBox="0 0 26 26">${ring}</svg></span>super trucker</div>
<h1>Live truck<br><em>auctions.</em></h1>
<p>An estimate on every listing, and the all-in price on every bid.</p>
<div class="t">${truck}</div>
</div></body></html>`;
fs.writeFileSync(path.join(FRAMES_DIR, 'feature.html'), fg);
const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('file://' + path.join(FRAMES_DIR, 'feature.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(STORE, 'play-feature-graphic.png') });
await browser.close();
fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
console.log('done');
