import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { TrendChart } from "@/components/admin/Charts";
import { brisbaneDay, fmtValue } from "@/lib/metrics";
import { expectedCtr } from "@/lib/seo";
import { gscConfigured } from "@/lib/seoEngine";
import { loadSeries } from "@/lib/insights";
import { env } from "@/lib/env";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SEV: Record<string, string> = { act: "Act now", watch: "Keep an eye on", info: "Worth doing" };
const ORDER: Record<string, number> = { act: 0, watch: 1, info: 2 };
type Issue = { id: number; kind: string; target: string; lot_id: number | null; severity: string; message: string; fix: string | null; first_seen: string };
type Top = { key: string; clicks: number; impressions: number; ctr: number; position: number };

// Search engines: what the nightly audit found, what Google says about how people find us (once Search
// Console is connected), and the automatic pings. Admin only.
export default async function Seo() {
  await requireAdmin();
  const db = supabaseAdmin();
  const days = 28;
  const from = brisbaneDay(-(days - 1)), to = brisbaneDay(0);
  const [{ data: issues }, { data: google }, { data: queries }, { data: pages }, { data: opp }, { data: seo }] = await Promise.all([
    db.from("seo_issues").select("id, kind, target, lot_id, severity, message, fix, first_seen").is("resolved_at", null).order("last_seen", { ascending: false }).limit(500),
    loadSeries(db, from, to, ["visitors"], "src:google").then((r) => ({ data: r.visitors })),
    db.rpc("seo_top", { p_days: days, p_by: "query", p_limit: 25 }),
    db.rpc("seo_top", { p_days: days, p_by: "page", p_limit: 15 }),
    db.rpc("seo_opportunities", { p_days: days, p_limit: 15 }),
    db.from("settings").select("value").eq("key", "seo").maybeSingle(),
  ]);
  const list = ((issues || []) as Issue[]).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const bySev = (s: string) => list.filter((i) => i.severity === s).length;
  const g = new Map(Object.entries((google || {}) as Record<string, number>));
  const pts = Array.from({ length: days }, (_, i) => brisbaneDay(-(days - 1 - i))).map((d) => ({ day: d, value: g.get(d) || 0 }));
  const connected = gscConfigured();
  const cfg = (seo?.value || {}) as { indexnow?: boolean; indexnow_last?: string };
  const q = (queries || []) as Top[], p = (pages || []) as Top[];
  const o = (opp || []) as { query: string; page: string; impressions: number; clicks: number; position: number; ctr: number }[];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><h1 className="d2">SEO.</h1><p className="muted" style={{ margin: 0 }}>The audit runs every night at 3 am; new and changed listings are sent to search engines every 10 minutes.</p></div>
        <div className="pill-row">
          <AdminAction action="seo-audit" payload={{}} label="Run the audit now" tone="blue" />
          <AdminAction action="indexnow" payload={{}} label="Ping search engines" tone="soft" />
          {connected && <AdminAction action="gsc-sync" payload={{}} label="Get Google data now" tone="soft" />}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="l">Visitors from Google (28 days)</span><span className="v">{fmtValue(pts.reduce((a, b) => a + b.value, 0), "count")}</span></div>
        <div className="kpi" data-testid="seo-act"><span className="l">To fix now</span><span className="v">{bySev("act")}</span></div>
        <div className="kpi"><span className="l">To improve</span><span className="v">{bySev("watch") + bySev("info")}</span></div>
        <div className="kpi"><span className="l">Google Search Console</span><span className="v" style={{ fontSize: 20 }}>{connected ? "Connected" : "Not connected"}</span></div>
        <div className="kpi"><span className="l">Last ping (Bing, IndexNow)</span><span className="v" style={{ fontSize: 20 }}>{cfg.indexnow === false ? "Off" : cfg.indexnow_last ? dateTime(cfg.indexnow_last) : "Not yet"}</span></div>
      </div>

      <div className="admin-card"><TrendChart title="Visitors from Google per day" points={pts} fmt="count" kind="line" testId="chart-google" /></div>

      <div className="admin-card" data-testid="seo-issues">
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>What to fix</h2>
        {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing found. Press Run the audit now to check again.</p> : list.slice(0, 200).map((i) => (
          <div className="ins" key={i.id}>
            <span className={`sev ${i.severity}`}><i aria-hidden="true" />{SEV[i.severity]}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <b style={{ fontSize: 15 }}>{i.lot_id ? <Link className="blue" href={`/admin/lots/${i.lot_id}`}>Lot {i.lot_id}</Link> : <a className="blue" href={`${env.siteUrl}${i.target}`} target="_blank" rel="noreferrer">{i.target}</a>}: {i.message}</b>
              {i.fix && <span className="muted" style={{ fontSize: 14 }}><b>Fix:</b> {i.fix}</span>}
            </div>
            <span className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>Since {dateTime(i.first_seen)}</span>
          </div>
        ))}
        {list.length > 200 && <p className="hint">And {list.length - 200} more.</p>}
      </div>

      {!connected ? (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="gsc-setup">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Connect Google Search Console (free, 10 minutes)</h2>
          <p className="muted" style={{ margin: 0 }}>It shows what people type into Google to find you, where you rank, and which pages they click. The machine then tells you which searches you&apos;re close to winning and which titles to rewrite.</p>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
            <li>Add the site at search.google.com/search-console (a Domain property for tyrebiter.com.au) and verify it with the DNS record Google gives you.</li>
            <li>In Google Cloud, create a project, turn on the &ldquo;Google Search Console API&rdquo;, and create a service account with a JSON key.</li>
            <li>In Search Console → Settings → Users and permissions, add the service account&apos;s email as a user (Full).</li>
            <li>In Vercel, add <code>GOOGLE_SERVICE_ACCOUNT</code> (the JSON key) and <code>GSC_SITE</code> (<code>sc-domain:tyrebiter.com.au</code>), then redeploy.</li>
          </ol>
          <p className="hint" style={{ margin: 0 }}>Also submit <code>{env.siteUrl}/sitemap.xml</code> under Sitemaps, and do the same in Bing Webmaster Tools (it can import from Search Console).</p>
        </div>
      ) : (
        <>
          <div className="admin-card" style={{ overflowX: "auto" }} data-testid="gsc-opportunities">
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Searches you could win</h2>
            <p className="muted" style={{ margin: "0 0 8px" }}>On page 1 or 2 of Google but not at the top. Strengthen the page: more live listings in it, a fuller description, and links to it from listings.</p>
            <table className="table"><thead><tr><th>Search</th><th>Page</th><th>Seen</th><th>Clicks</th><th>Position</th><th>Title working?</th></tr></thead>
              <tbody>{o.length ? o.map((r) => {
                const low = Number(r.impressions) >= 100 && Number(r.ctr) < expectedCtr(Number(r.position)) / 2;
                return <tr key={r.query}><td>{r.query}</td><td><a className="blue" href={`${env.siteUrl}${r.page}`} target="_blank" rel="noreferrer">{r.page}</a></td><td>{fmtValue(Number(r.impressions), "count")}</td><td>{fmtValue(Number(r.clicks), "count")}</td><td>{Number(r.position).toFixed(1)}</td><td>{low ? "Few clicks: rewrite the title" : "OK"}</td></tr>;
              }) : <tr><td colSpan={6} className="muted">Not enough Google data yet (it arrives 2 to 3 days late).</td></tr>}</tbody></table>
          </div>
          <div className="dash2">
            <div className="admin-card" style={{ overflowX: "auto" }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Top searches on Google</h2>
              <table className="table"><thead><tr><th>Search</th><th>Clicks</th><th>Seen</th><th>Position</th></tr></thead>
                <tbody>{q.length ? q.map((r) => <tr key={r.key}><td>{r.key}</td><td>{fmtValue(Number(r.clicks), "count")}</td><td>{fmtValue(Number(r.impressions), "count")}</td><td>{Number(r.position).toFixed(1)}</td></tr>) : <tr><td colSpan={4} className="muted">No data yet.</td></tr>}</tbody></table>
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Top pages on Google</h2>
              <table className="table"><thead><tr><th>Page</th><th>Clicks</th><th>Click rate</th></tr></thead>
                <tbody>{p.length ? p.map((r) => <tr key={r.key}><td><a className="blue" href={`${env.siteUrl}${r.key}`} target="_blank" rel="noreferrer">{r.key}</a></td><td>{fmtValue(Number(r.clicks), "count")}</td><td>{fmtValue(Number(r.ctr), "pct")}</td></tr>) : <tr><td colSpan={3} className="muted">No data yet.</td></tr>}</tbody></table>
            </div>
          </div>
        </>
      )}

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>What the site does automatically</h2>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          <li>Every vehicle page has a search title and description built from its facts (year, make, model, kilometres, place, price with the all-in amount), structured data Google can show as a rich result, breadcrumbs, and its photos in the sitemap.</li>
          <li>Landing pages for every category, state, make and model (<Link className="blue" href="/makes">/makes</Link>) with real live listings and real recent results. Pages with nothing on them are hidden from search engines until they have.</li>
          <li>Filtered search pages all point to one main page, so Google doesn&apos;t see thousands of near-copies.</li>
          <li>New, changed and sold listings are sent to Bing and other IndexNow engines within 10 minutes; Google reads the sitemap (<a className="blue" href="/sitemap.xml">sitemap.xml</a>).</li>
        </ul>
      </div>
    </>
  );
}
