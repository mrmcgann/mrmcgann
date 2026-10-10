// The information machine: traffic sources, metrics maths, SEO copy and structured data, SEO checks.
// node --experimental-strip-types tests/unit/insights.test.mjs
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { classifySource, deviceOf, isBot, pageOf, cleanPath, regionOf, cleanQuery, ipKey, isAppAgent } from '../../src/lib/traffic.ts';
import { KPIS, kpiValue, change, fmtValue, toTotals, breakdown, getter, brisbaneDay } from '../../src/lib/metrics.ts';
import { lotSeoTitle, lotSeoDescription, lotJsonLd, slugify, lotCrumbs, jsonLd, expectedCtr, breadcrumbJsonLd, siteJsonLd, checkedClaim } from '../../src/lib/seo.ts';
import { CHECK_KEYS } from '../../src/lib/listing.ts';
import { lotIssues, pageIssues, gscRows, googleJwt } from '../../src/lib/seoChecks.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// ---------- where visits come from ----------
const own = 'tyrebiter.com.au';
ok('source: google organic', classifySource({ referrer: 'https://www.google.com.au/', ownHost: own }).source === 'google');
ok('source: google medium organic', classifySource({ referrer: 'https://www.google.com/search', ownHost: own }).medium === 'organic');
ok('source: bing', classifySource({ referrer: 'https://www.bing.com/', ownHost: own }).source === 'bing');
ok('source: duckduckgo is other search', classifySource({ referrer: 'https://duckduckgo.com/', ownHost: own }).source === 'other-search');
ok('source: facebook (l.facebook.com)', classifySource({ referrer: 'https://l.facebook.com/', ownHost: own }).source === 'facebook');
ok('source: t.co is X', classifySource({ referrer: 'https://t.co/abc', ownHost: own }).source === 'x');
ok('source: tagged link beats referrer', classifySource({ referrer: 'https://www.google.com/', utmSource: 'Newsletter', utmMedium: 'email', utmCampaign: 'Week 41', ownHost: own }).source === 'newsletter');
ok('source: tagged campaign kept (cleaned)', classifySource({ utmSource: 'facebook', utmCampaign: 'Utes <b>Sale</b>', ownHost: own }).campaign === 'utes bsaleb');
ok('source: fb shorthand', classifySource({ utmSource: 'fb', ownHost: own }).source === 'facebook');
ok('source: our own site is direct', classifySource({ referrer: 'https://tyrebiter.com.au/auctions', ownHost: own }).source === 'direct');
ok('source: subdomain of ours is direct', classifySource({ referrer: 'https://www.tyrebiter.com.au/', ownHost: own }).source === 'direct');
ok('source: no referrer is direct', classifySource({ ownHost: own }).source === 'direct');
ok('source: other site is referral with host', JSON.stringify(classifySource({ referrer: 'https://forum.4x4.com.au/thread/1', ownHost: own })) === JSON.stringify({ source: 'referral', medium: 'referral', campaign: null, referrer: 'forum.4x4.com.au' }));
ok('source: webmail is email', classifySource({ referrer: 'https://mail.google.com/', ownHost: own }).source === 'email');
ok('source: app', classifySource({ app: true }).source === 'app');
ok('source: junk referrer is direct', classifySource({ referrer: 'not a url', ownHost: own }).source === 'direct');

ok('device: iPhone', deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148') === 'mobile');
ok('device: Android phone', deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36') === 'mobile');
ok('device: Android tablet', deviceOf('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36') === 'tablet');
ok('device: iPad', deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)') === 'tablet');
ok('device: desktop', deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15') === 'desktop');
ok('device: apps', deviceOf('okhttp/4.12', 'android') === 'android-app' && deviceOf('x', 'ios') === 'ios-app');

ok('bots: Googlebot', isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'));
ok('bots: Lighthouse', isBot('Mozilla/5.0 Chrome-Lighthouse'));
ok('bots: curl', isBot('curl/8.4.0'));
ok('bots: headless', isBot('Mozilla/5.0 HeadlessChrome/120'));
ok('bots: empty', isBot(''));
ok('bots: a real browser is not', !isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36'));

ok('page: vehicle with id', JSON.stringify(pageOf('/lot/10432')) === JSON.stringify({ page: 'lot', lotId: 10432 }));
ok('page: home', pageOf('/').page === 'home');
ok('page: search', pageOf('/auctions?make=Toyota').page === 'auctions');
ok('page: landing', pageOf('/for-sale/utes/qld').page === 'for-sale' && pageOf('/makes/toyota/hilux').page === 'for-sale');
ok('page: legal', pageOf('/terms').page === 'legal');
ok('page: unknown', pageOf('/whatever').page === 'other');
ok('path: query and fragment stripped', cleanPath('/lot/1?ref=x#bid') === '/lot/1');
ok('path: odd characters removed, length capped', cleanPath('/a<script>' + 'x'.repeat(400)).length <= 200 && !cleanPath('/a<script>').includes('<'));
ok('region: AU state', regionOf('AU', 'QLD') === 'QLD' && regionOf('AU', 'AU-NSW') === 'NSW');
ok('region: overseas', regionOf('NZ', 'AUK') === 'overseas');
ok('region: unknown', regionOf(null, null) === null && regionOf('AU', 'XX') === null);
ok('path: unsubscribe token never stored', cleanPath('/u/dTo1Y2NmMzNlOC04OGFh.oKVqYNEzWFJeOA2d99hc0c') === '/u/:private', cleanPath('/u/dTo1Y2NmMzNlOC04OGFh.oKVqYNEzWFJeOA2d99hc0c'));
ok('path: handover and agreement tokens never stored', cleanPath('/handover/abc123') === '/handover/:private' && cleanPath('/sell/agreement/9f8e7d6c5b4a39281706f5e4d3c2b1a0') === '/sell/agreement/:private');
ok('path: invoice ids never stored', cleanPath('/account/invoices/4cfafcef-c412-4920-abaf-319f2cb2940f') === '/account/invoices/:private');
ok('path: lot ids and normal pages kept', cleanPath('/lot/10432') === '/lot/10432' && cleanPath('/for-sale/utes/qld') === '/for-sale/utes/qld' && cleanPath('/makes/toyota/landcruiser-70') === '/makes/toyota/landcruiser-70');
ok('rate limit: one key per IPv6 /64', ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd') === ipKey('2001:db8:1:2:1:2:3:4') && ipKey('203.0.113.9') === '203.0.113.9');
ok('app agents: iOS and Android HTTP clients, not browsers', isAppAgent('Tyrebiter/12 CFNetwork/1568 Darwin/24.0') && isAppAgent('okhttp/4.12.0') && !isAppAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/129'));
ok('query: trimmed and capped', cleanQuery('  toyota   hilux  ') === 'toyota hilux' && cleanQuery('x'.repeat(300)).length === 120 && cleanQuery('') === null);

// ---------- metrics maths ----------
const t = toTotals([
  { metric: 'sales', dim: '', total: 8, latest: 2 }, { metric: 'gmv', dim: '', total: 200000, latest: 0 },
  { metric: 'lots_closed', dim: '', total: 10, latest: 1 }, { metric: 'lots_closed_no_bids', dim: '', total: 2, latest: 0 },
  { metric: 'lots_closed_reserve_met', dim: '', total: 6, latest: 0 }, { metric: 'bids_on_closed', dim: '', total: 95, latest: 0 },
  { metric: 'revenue', dim: '', total: 22000, latest: 0 }, { metric: 'visitors', dim: '', total: 1000, latest: 50 },
  { metric: 'signups', dim: '', total: 25, latest: 0 }, { metric: 'live_lots', dim: '', total: 300, latest: 42 },
  { metric: 'visitors', dim: 'src:google', total: 600, latest: 0 }, { metric: 'visitors', dim: 'src:facebook', total: 150, latest: 0 },
  { metric: 'visitors', dim: 'src:direct', total: 0, latest: 0 },
  { metric: 'messages_sent', dim: '', total: 95, latest: 0 }, { metric: 'messages_failed', dim: '', total: 5, latest: 0 },
  { metric: 'agreements_signed', dim: '', total: 9, latest: 0 }, { metric: 'appraisals', dim: '', total: 6, latest: 0 },
]);
ok('kpi: sell-through = sold / closed', kpiValue('sell_through', t) === 0.8);
ok('kpi: average sale', kpiValue('avg_sale', t) === 25000);
ok('kpi: bids per vehicle', kpiValue('bids_per_lot', t) === 9.5);
ok('kpi: no-bid rate', kpiValue('no_bid_rate', t) === 0.2);
ok('kpi: reserve met among auctions with bids', kpiValue('reserve_met_rate', t) === 0.75);
ok('kpi: take rate', kpiValue('take_rate', t) === 0.11);
ok('kpi: visitors who join', kpiValue('signup_rate', t) === 0.025);
ok('kpi: live now uses the latest value, not the sum', kpiValue('live_lots', t) === 42);
ok('kpi: message failure rate', kpiValue('message_failure_rate', t) === 0.05);
ok('kpi: ratios capped at 100%', kpiValue('appraisal_conversion', t) === 1);
ok('kpi: nothing to divide by gives no number', kpiValue('avg_pay_hours', t) === null);
ok('kpi: every KPI has a label, hint and group', KPIS.every((k) => k.label && k.hint.length > 5 && k.group));
ok('kpi: keys are unique', new Set(KPIS.map((k) => k.key)).size === KPIS.length);
ok('change: up 25%', change(125, 100) === 0.25);
ok('change: from zero is not a percentage', change(5, 0) === null && change(0, 0) === 0);
ok('format: money', fmtValue(1234567.4, 'money') === '$1,234,567');
ok('format: percent', fmtValue(0.256, 'pct') === '26%' && fmtValue(0.034, 'pct') === '3.4%');
ok('format: hours become days', fmtValue(72, 'hours') === '3.0 days' && fmtValue(5, 'hours') === '5.0 hrs');
ok('format: missing', fmtValue(null, 'count') === '–');
ok('breakdown: biggest first, zeros dropped', JSON.stringify(breakdown(t, 'visitors', 'src')) === JSON.stringify([['google', 600], ['facebook', 150]]));
ok('getter: dims', getter(t).g('visitors', 'src:google') === 600 && getter(t).g('nothing') === 0);
ok('day: Brisbane date format', /^\d{4}-\d{2}-\d{2}$/.test(brisbaneDay(0)) && brisbaneDay(-1, new Date('2026-10-10T01:00:00Z')) === '2026-10-09');

// ---------- SEO copy and structured data ----------
const lot = { verified: [...CHECK_KEYS], ppsr_checked_at: '2026-10-01', buy_now_price: null, id: 10432, title: '2019 Toyota HiLux SR5 dual cab', status: 'live', year: 2019, make: 'Toyota', model: 'HiLux', variant: 'SR5', odometer: 85000, hours: null, transmission: 'Automatic', fuel: 'Diesel', suburb: 'Paddington', state: 'QLD', current_bid: 24500, start_price: 1000, ends_at: '2026-10-12T09:00:00Z', sold_price: null, category: 'utes', bid_count: 12, colour: 'White', body: 'Dual cab', take: 'One owner, full service history.' };
const title = lotSeoTitle(lot);
ok('seo title: year make model variant, km, place', title === '2019 Toyota HiLux SR5 · 85,000 km · Paddington QLD', title);
ok('seo title: sold', lotSeoTitle({ ...lot, status: 'sold' }).startsWith('Sold: '));
ok('seo title: falls back to the listing title', lotSeoTitle({ ...lot, year: null, make: null, model: null, variant: null }).startsWith('2019 Toyota HiLux SR5 dual cab'));
const desc = lotSeoDescription(lot, 27229);
ok('seo description: price with its all-in amount (ACCC)', desc.includes('Current bid $24,500 ($27,229 all-in), ends'), desc);
ok('seo description: at most 160 characters', desc.length <= 160, desc.length);
ok('seo description: the all-in amount is never cut off, even for a long name', (() => { const d = lotSeoDescription({ ...lot, variant: 'SR5 Hi-Rider Double Cab Pick-up 4x4 Automatic Turbo Diesel Special Edition Black', suburb: 'Mount Cotton Rural Residential' }, 27229); return d.length <= 160 && d.includes('($27,229 all-in)'); })());
ok('seo description: sold price', lotSeoDescription({ ...lot, status: 'sold', sold_price: 26000 }, null).includes('Sold at auction for $26,000'));
ok('seo description: no price without bids says "Bids from"', lotSeoDescription({ ...lot, bid_count: 0, current_bid: 0 }, 1500).includes('Bids from $1,000 ($1,500 all-in)'));
ok('seo description: no price at all rather than a price without its all-in amount', !lotSeoDescription(lot, null).includes('$'));
ok('claims: only what was recorded on the listing', checkedClaim(lot) === 'Checked against the vehicle and PPSR searched.' && checkedClaim({ verified: ['vin'], ppsr_checked_at: null }) === '' && checkedClaim({ verified: [], ppsr_checked_at: 'x' }) === 'PPSR searched.');
ok('seo description: no checking claim when the checks weren\'t recorded', !lotSeoDescription({ ...lot, verified: [], ppsr_checked_at: null }, 27229).includes('Checked'));
const o = { url: 'https://x.au/lot/10432', images: ['https://x.au/a.jpg'], buyNowAllIn: null, siteUrl: 'https://x.au' };
const ld = lotJsonLd(lot, o);
ok('schema: a ute is a Car', ld['@type'] === 'Car');
ok('schema: odometer in kilometres', ld.mileageFromOdometer.value === 85000 && ld.mileageFromOdometer.unitCode === 'KMT');
ok('schema: an auction has no fixed-price offer', !ld.offers);
ok('schema: Buy Now offer at its all-in price', (() => { const b = lotJsonLd({ ...lot, buy_now_price: 30000 }, { ...o, buyNowAllIn: 33199 }); return b.offers.price === 33199 && b.offers.priceCurrency === 'AUD' && b.offers.availability.endsWith('InStock'); })());
ok('schema: diesel', ld.fuelType === 'Diesel');
ok('schema: never the VIN', !JSON.stringify(ld).includes('vehicleIdentificationNumber'));
ok('schema: no offer once sold or cancelled', !lotJsonLd({ ...lot, status: 'sold', sold_price: 26000, buy_now_price: 30000 }, { ...o, buyNowAllIn: 1 }).offers && !lotJsonLd({ ...lot, status: 'cancelled', buy_now_price: 30000 }, { ...o, buyNowAllIn: 1 }).offers);
ok('schema: machinery is a Vehicle, bikes Motorcycle', lotJsonLd({ ...lot, category: 'machinery' }, o)['@type'] === 'Vehicle' && lotJsonLd({ ...lot, category: 'motorbikes' }, o)['@type'] === 'Motorcycle');
ok('slug', slugify('LandCruiser 70') === 'landcruiser-70' && slugify('Mercedes-Benz') === 'mercedes-benz' && slugify('CX-5') === 'cx-5');
const crumbs = lotCrumbs(lot);
ok('crumbs: home › category › state › make › model', JSON.stringify(crumbs.map((c) => c[1])) === JSON.stringify(['/', '/for-sale/utes', '/for-sale/utes/qld', '/makes/toyota', '/makes/toyota/hilux']), JSON.stringify(crumbs));
ok('crumbs: catalogue spelling, and no link to a model without a page', JSON.stringify(lotCrumbs({ ...lot, make: 'TOYOTA', model: 'Hiace Commuter' }).map((c) => c[0])) === JSON.stringify(['Home', 'Utes & 4x4', 'Queensland', 'Toyota']), JSON.stringify(lotCrumbs({ ...lot, make: 'TOYOTA', model: 'Hiace Commuter' })));
ok('breadcrumb schema: absolute URLs, positions', (() => { const b = breadcrumbJsonLd(crumbs, 'https://x.au'); return b.itemListElement[0].item === 'https://x.au/' && b.itemListElement[4].position === 5; })());
ok('site schema: search action, placeholder phone left out', (() => { const [org, site] = siteJsonLd('https://x.au', { legalName: 'T', phone: '[1300]' }); return site.potentialAction.target.urlTemplate.includes('{search_term_string}') && !org.contactPoint; })());
ok('json-ld: closing script tags escaped', !jsonLd({ a: '</script><script>alert(1)</script>' }).includes('</script>'));
ok('ctr curve: falls with position', expectedCtr(1) > expectedCtr(3) && expectedCtr(3) > expectedCtr(10) && expectedCtr(25) === 0.01);

// ---------- SEO checks ----------
const auditLot = { id: 5, title: 'Ute', category: 'utes', year: 2019, make: 'Toyota', model: null, odometer: null, hours: null, take_len: 40, subtitle: null, cover_path: 'a.jpg', photos: 3, videos: 0, suburb: 'X', state: 'QLD' };
const kinds = lotIssues(auditLot).map((i) => i.kind).sort().join(',');
ok('audit: few photos, missing model, short description, no odometer, title without make, no video', kinds === 'lot_few_photos,lot_missing_facts,lot_no_odometer,lot_no_video,lot_short_description,lot_title_no_make', kinds);
ok('audit: no photo is urgent', lotIssues({ ...auditLot, cover_path: null }).some((i) => i.kind === 'lot_no_photo' && i.severity === 'act'));
ok('audit: a complete listing is clean', lotIssues({ ...auditLot, title: '2019 Toyota HiLux', model: 'HiLux', odometer: 1, take_len: 400, photos: 10, videos: 1 }).length === 0);
ok('audit: keys are stable per listing and kind', lotIssues(auditLot).every((i) => i.key === `${i.kind}:lot:5`));
const good = '<html><head><title>2019 Toyota HiLux · 85,000 km · Tyrebiter</title><meta name="description" content="Online auction: 2019 Toyota HiLux SR5, 85,000 km, automatic, diesel, in Paddington QLD. Current bid $24,500."><link rel="canonical" href="x"><script type="application/ld+json">{}</script></head><body><h1>x</h1></body></html>';
ok('page check: a good page passes', pageIssues('/lot/1', { status: 200, ms: 300, html: good, bytes: good.length }, { indexable: true, structured: true }).length === 0, JSON.stringify(pageIssues('/lot/1', { status: 200, ms: 300, html: good, bytes: good.length }, { indexable: true, structured: true })));
ok('page check: broken page', pageIssues('/x', { status: 500, ms: 10, html: '', bytes: 0 }, { indexable: true, structured: true })[0].kind === 'page_status');
const bad = '<html><head><meta name="robots" content="noindex"></head><body><h1>a</h1><h1>b</h1></body></html>';
const bk = pageIssues('/x', { status: 200, ms: 4000, html: bad, bytes: bad.length }, { indexable: true, structured: true }).map((i) => i.kind).sort().join(',');
ok('page check: slow, no title/description/canonical/schema, noindex, two h1s', bk === 'page_h1,page_no_canonical,page_no_description,page_no_structured_data,page_no_title,page_noindex,page_slow', bk);
const rows = gscRows([{ keys: ['2026-10-01', 'ute auction brisbane', 'https://tyrebiter.com.au/for-sale/utes/qld'], clicks: 3, impressions: 120.0, position: 6.456 }, { keys: ['bad'], clicks: 1, impressions: 1, position: 1 }]);
ok('search console: rows to our shape (path only), bad rows dropped', rows.length === 1 && rows[0].page === '/for-sale/utes/qld' && rows[0].position === 6.46 && rows[0].day === '2026-10-01');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwt = googleJwt({ client_email: 'svc@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, 'https://www.googleapis.com/auth/webmasters', 1000);
const [h, b, sig] = jwt.split('.');
const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
ok('google jwt: claims', claims.iss === 'svc@x.iam.gserviceaccount.com' && claims.aud === 'https://oauth2.googleapis.com/token' && claims.exp === 4600 && JSON.parse(Buffer.from(h, 'base64url').toString()).alg === 'RS256');
ok('google jwt: signature verifies', createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(sig, 'base64url')));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
