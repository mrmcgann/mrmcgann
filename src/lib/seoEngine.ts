import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { gscRows, googleJwt, lotIssues, pageIssues, type AuditLot, type Issue } from "@/lib/seoChecks";

// The SEO engine, run by the clock:
//  - audit(): every night, checks every live listing for what makes a page rank (photos, description,
//    facts for the structured data) and fetches a sample of our own pages the way Google does (status,
//    speed, title, description, canonical, structured data). Findings go to Admin → SEO.
//  - pingIndexNow(): every 10 minutes, tells Bing (and the other IndexNow engines) about listings that
//    went live, changed or sold. Google finds them through the sitemap and Search Console.
//  - syncSearchConsole(): every night, when Google Search Console is connected, copies what people
//    searched on Google to find us (queries, pages, clicks, impressions, position) and resubmits the sitemap.

const LIVE = (process.env.NODE_ENV === "production" && env.siteUrl.startsWith("https://") && !env.testMode);

export const indexNowKey = () => process.env.INDEXNOW_KEY || createHash("sha256").update(`${env.linkSecret || "tyrebiter"}|indexnow`).digest("hex").slice(0, 32);

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------
async function fetchPage(url: string, timeoutMs = 15000) {
  const started = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": "TyrebiterSEOAudit/1.0 (+self-check)" }, signal: AbortSignal.timeout(timeoutMs), redirect: "manual", cache: "no-store" });
    const html = r.headers.get("content-type")?.includes("html") ? await r.text() : "";
    return { status: r.status, ms: Date.now() - started, html, bytes: html.length };
  } catch {
    return { status: 0, ms: Date.now() - started, html: "", bytes: 0 };
  }
}

export async function audit(opts: { crawl?: boolean; deadlineMs?: number } = {}) {
  const db = supabaseAdmin();
  const run = new Date().toISOString();
  const until = Date.now() + (opts.deadlineMs ?? 90_000);
  const issues: Issue[] = [];
  // every live listing, a page at a time (the API returns at most 1,000 rows per call)
  const lots: AuditLot[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db.rpc("seo_lot_audit", { p_limit: 50_000 }).range(from, from + 999);
    if (error) throw new Error("Couldn't read the listings for the audit."); // never close open issues on a failed read
    lots.push(...((data || []) as AuditLot[]));
    if (!data || data.length < 1000) break;
  }
  for (const l of lots) issues.push(...lotIssues(l));

  const crawled: string[] = [];
  if (opts.crawl !== false) {
    const live = lots.slice(0, 8);
    const cats = [...new Set(lots.map((l) => l.category))].slice(0, 3);
    const targets: [string, { indexable: boolean; structured: boolean }][] = [
      ["/", { indexable: true, structured: true }], ["/auctions", { indexable: true, structured: false }], ["/sell", { indexable: true, structured: false }],
      ["/makes", { indexable: true, structured: false }],
      ...cats.map((c) => [`/for-sale/${c}`, { indexable: true, structured: true }] as [string, { indexable: boolean; structured: boolean }]),
      ...live.map((l) => [`/lot/${l.id}`, { indexable: true, structured: true }] as [string, { indexable: boolean; structured: boolean }]),
    ];
    for (let i = 0; i < targets.length && Date.now() < until; i += 4) {
      const batch = targets.slice(i, i + 4);
      const res = await Promise.all(batch.map(([p]) => fetchPage(`${env.siteUrl}${p}`)));
      batch.forEach(([p, expect], k) => { crawled.push(p); issues.push(...pageIssues(p, res[k], expect)); });
    }
    for (const [p, kind] of [["/sitemap.xml", "sitemap"], ["/robots.txt", "robots"]] as const) {
      const r = await fetchPage(`${env.siteUrl}${p}`);
      crawled.push(p);
      if (r.status !== 200) issues.push({ key: `${kind}_missing:${p}`, kind: `${kind}_missing`, target: p, severity: "act", message: `${p} returned ${r.status || "no response"}.`, fix: "Search engines need it: check the deploy." });
    }
  }

  for (let i = 0; i < issues.length; i += 500) {
    await db.from("seo_issues").upsert(issues.slice(i, i + 500).map((x) => ({ ...x, lot_id: x.lot_id ?? null, fix: x.fix ?? null, last_seen: run, resolved_at: null })), { onConflict: "key" });
  }
  // Anything not seen this run is fixed (listing issues: all live listings were checked; page issues: only pages fetched).
  await db.from("seo_issues").update({ resolved_at: run }).is("resolved_at", null).lt("last_seen", run).like("kind", "lot_%");
  if (crawled.length) await db.from("seo_issues").update({ resolved_at: run }).is("resolved_at", null).lt("last_seen", run).in("target", crawled);
  return { issues: issues.length, crawled: crawled.length };
}

// ---------------------------------------------------------------------------
// IndexNow (Bing, Yandex, Seznam, Naver): instant notice of new and changed listings
// ---------------------------------------------------------------------------
export async function pingIndexNow(force = false) {
  const db = supabaseAdmin();
  const { data: row } = await db.from("settings").select("value").eq("key", "seo").maybeSingle();
  const s = (row?.value || {}) as { indexnow?: boolean; indexnow_last?: string };
  if (s.indexnow === false) return { sent: 0, reason: "IndexNow is switched off." };
  const since = s.indexnow_last || new Date(Date.now() - 86400000).toISOString();
  // listings whose page really changed (went live, edited, sold...), oldest first; the cursor moves to the
  // last one sent, so a busy period is sent over several pings rather than skipped
  const { data } = await db.rpc("seo_changed_lots", { p_since: since, p_limit: 1000 });
  const rows = (data || []) as { id: number; changed_at: string }[];
  if (!rows.length) return { sent: 0 };
  const cursor = rows[rows.length - 1].changed_at;
  const urls = rows.map((r) => `${env.siteUrl}/lot/${r.id}`);
  if (!LIVE && !force) {
    await db.from("settings").update({ value: { ...s, indexnow_last: cursor } }).eq("key", "seo");
    return { sent: 0, reason: "Only sent from the live site.", urls: urls.length };
  }
  const host = new URL(env.siteUrl).host;
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ host, key: indexNowKey(), keyLocation: `${env.siteUrl}/indexnow-key.txt`, urlList: urls }),
  }).catch(() => null);
  if (r && r.status < 300) await db.from("settings").update({ value: { ...s, indexnow_last: cursor } }).eq("key", "seo");
  return { sent: r && r.status < 300 ? urls.length : 0, status: r?.status ?? 0 };
}

// ---------------------------------------------------------------------------
// Google Search Console (optional): GOOGLE_SERVICE_ACCOUNT (JSON, or base64 of it) + GSC_SITE
// ("sc-domain:tyrebiter.com.au" or "https://tyrebiter.com.au/"). Add the service account's email as a
// user on the Search Console property.
// ---------------------------------------------------------------------------
export const gscConfigured = () => Boolean(process.env.GOOGLE_SERVICE_ACCOUNT && process.env.GSC_SITE);

function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT || "";
  try { return JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")); } catch { return null; }
}

async function googleToken() {
  const sa = serviceAccount();
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT isn't valid JSON.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: googleJwt(sa, "https://www.googleapis.com/auth/webmasters") }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google sign-in failed (${r.status}). Check the service account and that it's added to Search Console.`);
  return j.access_token as string;
}

export async function syncSearchConsole(days = 5) {
  if (!gscConfigured()) return { rows: 0, reason: "Search Console isn't connected." };
  const db = supabaseAdmin();
  const site = encodeURIComponent(process.env.GSC_SITE!);
  const token = await googleToken();
  const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - (days + 1) * 86400000).toISOString().slice(0, 10);
  let startRow = 0, total = 0;
  for (let page = 0; page < 8; page++) {
    const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date", "query", "page"], rowLimit: 25000, startRow, dataState: "all" }),
    });
    if (!r.ok) throw new Error(`Search Console returned ${r.status}.`);
    const j = await r.json();
    const rows = gscRows(j.rows || []);
    for (let i = 0; i < rows.length; i += 1000) await db.from("seo_search_daily").upsert(rows.slice(i, i + 1000), { onConflict: "day,query,page" });
    total += rows.length;
    if (rows.length < 25000) break;
    startRow += 25000;
  }
  // Resubmit the sitemap once a week (Mondays).
  if (new Date().getUTCDay() === 1) {
    await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${encodeURIComponent(`${env.siteUrl}/sitemap.xml`)}`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    }).catch(() => null);
  }
  return { rows: total };
}
