// Security helpers: safe "next" links, refusing requests from other sites, and what goes into the admin log.
// node --experimental-strip-types tests/unit/security.test.mjs
import { safePath } from '../../src/lib/safePath.ts';
import { crossSite } from '../../src/lib/csrf.ts';
import { auditDetail } from '../../src/lib/redact.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// ---------- safePath: a "next" link can only go somewhere on this site ----------
ok('safePath: a normal page', safePath('/lot/10432') === '/lot/10432');
ok('safePath: keeps the query and #', safePath('/auctions?q=hilux#top') === '/auctions?q=hilux#top');
ok('safePath: nothing → fallback', safePath(null) === '/account' && safePath('', '/watchlist') === '/watchlist');
for (const bad of ['//evil.example', '//evil.example/x', '/\\evil.example', '\\\\evil.example', 'https://evil.example', 'http:evil.example', 'javascript:alert(1)',
  'evil.example', ' /x', '/\t/evil.example', '/\n/evil.example', '/%0a', 'data:text/html,hi', '///evil.example']) {
  const r = safePath(bad, '/fallback');
  ok(`safePath: ${JSON.stringify(bad)} stays on the site`, r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\') && !/evil\.example/.test(r.split('?')[0].slice(0, 2)) && (r === '/fallback' || !r.includes('//')), r);
}
ok('safePath: dot segments resolve on the site', safePath('/a/../../admin') === '/admin');
ok('safePath: encoded slashes stay a path', safePath('/%2F%2Fevil.example').startsWith('/%2F'));

// ---------- crossSite: another site can't use a member's sign-in ----------
const H = (o) => ({ get: (k) => (k.toLowerCase() in o ? o[k.toLowerCase()] : null) });
const signed = ['sb-abc-auth-token'];
const base = { cookieNames: signed, host: 'tyrebiter.com.au' };
ok('csrf: GET is never blocked', !crossSite({ ...base, method: 'GET', headers: H({ origin: 'https://evil.example' }) }));
ok('csrf: same origin POST allowed', !crossSite({ ...base, method: 'POST', headers: H({ origin: 'https://tyrebiter.com.au', host: 'tyrebiter.com.au' }) }));
ok('csrf: other origin POST blocked', crossSite({ ...base, method: 'POST', headers: H({ origin: 'https://evil.example', host: 'tyrebiter.com.au' }) }));
ok('csrf: look-alike origin blocked', crossSite({ ...base, method: 'POST', headers: H({ origin: 'https://tyrebiter.com.au.evil.example', host: 'tyrebiter.com.au' }) }));
ok('csrf: origin "null" blocked', crossSite({ ...base, method: 'POST', headers: H({ origin: 'null', host: 'tyrebiter.com.au' }) }));
ok('csrf: behind a proxy uses the forwarded host', !crossSite({ ...base, method: 'DELETE', headers: H({ origin: 'https://tyrebiter.com.au', host: 'internal:3000', 'x-forwarded-host': 'tyrebiter.com.au' }) }));
ok('csrf: no origin but cross-site fetch blocked', crossSite({ ...base, method: 'POST', headers: H({ 'sec-fetch-site': 'cross-site' }) }));
ok('csrf: no origin, same-site subdomain blocked', crossSite({ ...base, method: 'POST', headers: H({ 'sec-fetch-site': 'same-site' }) }));
ok('csrf: no origin, same-origin allowed', !crossSite({ ...base, method: 'POST', headers: H({ 'sec-fetch-site': 'same-origin' }) }));
ok('csrf: no cookie (the app, webhooks) not affected', !crossSite({ cookieNames: [], host: 'x', method: 'POST', headers: H({ origin: 'https://hooks.stripe.com' }) }));
ok('csrf: chunked sign-in cookie counts', crossSite({ cookieNames: ['sb-abc-auth-token.0'], host: 'tyrebiter.com.au', method: 'PUT', headers: H({ origin: 'https://evil.example', host: 'tyrebiter.com.au' }) }));

// ---------- auditDetail: the admin log never keeps secrets ----------
const d = auditDetail({ userId: 'u1', reason: 'x'.repeat(300), bsb: '062000', account: '12345678', payer_account: '1', password: 'p', code: '123456', dob: '1990-01-01', token: 't', api_key: 'k',
  key: 'security', value: { admin_mfa: false, nested: { deep: 1 } }, list: [1, 2, 3], amount: 500, ok: true, licence_number: 'L1' });
ok('audit: ids and amounts kept', d.userId === 'u1' && d.amount === 500 && d.ok === true);
ok('audit: long text cut', d.reason.length === 201);
ok('audit: bank details, passwords, codes, DOB, tokens, licence numbers hidden', ['bsb', 'account', 'payer_account', 'password', 'code', 'dob', 'token', 'api_key', 'licence_number'].every((k) => d[k] === '•••'), JSON.stringify(d));
ok('audit: a setting name is kept', d.key === 'security', d.key);
ok('audit: small objects one level deep', d.value.admin_mfa === false && d.value.nested === '{…}', JSON.stringify(d.value));
ok('audit: lists counted, not copied', d.list === '[3 items]');
ok('audit: not an object → empty', JSON.stringify(auditDetail('x')) === '{}' && JSON.stringify(auditDetail(null)) === '{}' && JSON.stringify(auditDetail([1])) === '{}');
ok('audit: at most 30 fields', Object.keys(auditDetail(Object.fromEntries([...Array(50)].map((_, i) => [`f${i}`, i])))).length === 30);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
