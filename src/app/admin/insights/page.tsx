import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { BarList, Spark, TrendChart } from "@/components/admin/Charts";
import { KPIS, FUNNEL, SOURCE_LABELS, breakdown, brisbaneDay, change, fmtValue, kpiValue, type Kpi } from "@/lib/metrics";
import { loadSeries, loadTotals, topSearches } from "@/lib/insights";
import { CAT, STATE_NAMES } from "@/lib/vehicles";
import { BriefingSettings } from "./BriefingSettings";

export const dynamic = "force-dynamic";

const PERIODS: [number, string][] = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];
const SEV: Record<string, string> = { act: "Act now", watch: "Keep an eye on", good: "Working well", info: "Worth knowing" };
const ORDER: Record<string, number> = { act: 0, watch: 1, good: 2, info: 3 };
const RATIO = new Set(["pct"]);
const PAGE_LABELS: Record<string, string> = { lot: "Vehicle pages", home: "Home", auctions: "Search", "for-sale": "Category, make and model pages", sold: "Results", sell: "Sell pages", sales: "Fleet sales", help: "Help", join: "Join", account: "Account", legal: "Terms and policies", partners: "Finance and insurance", other: "Other" };
const DEVICE_LABELS: Record<string, string> = { mobile: "Phone (website)", desktop: "Computer", tablet: "Tablet", "ios-app": "iPhone app", "android-app": "Android app" };

type Row = { id: number; key: string; day: string; severity: string; area: string; title: string; body: string; action: string | null; link: string | null };

// Every number about the business in one place, filled by the clock every 15 minutes, with what the
// insights engine noticed at the top. Admin only.
export default async function Insights({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const db = supabaseAdmin();
  const asked = (await searchParams).days;
  const days = PERIODS.find(([d]) => String(d) === asked)?.[0] || 30;
  const from = brisbaneDay(-(days - 1)), to = brisbaneDay(0);
  const pFrom = brisbaneDay(-(2 * days - 1)), pTo = brisbaneDay(-days);
  const SERIES = ["gmv", "revenue", "sales", "visitors", "views", "signups", "bidders", "bids", "lots_published", "collections", "appraisals", "searches", "partner_leads", "id_verified", "watch_adds"];
  const [cur, prev, series, searches, zero, { data: ins }, { data: cfg }] = await Promise.all([
    loadTotals(db, from, to), loadTotals(db, pFrom, pTo), loadSeries(db, from, to, SERIES), topSearches(db, from, to, false), topSearches(db, from, to, true),
    db.from("insights").select("id, key, day, severity, area, title, body, action, link").eq("status", "open").gte("day", brisbaneDay(-3)).order("day", { ascending: false }).limit(200),
    db.from("settings").select("value").eq("key", "insights").maybeSingle(),
  ]);
  const seen = new Set<string>();
  const insights = ((ins || []) as Row[]).filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
  const summary = insights.find((r) => r.key === "summary");
  const feed = insights.filter((r) => r.key !== "summary").sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(brisbaneDay(-i));
  const pts = (m: string) => dayList.map((d) => ({ day: d, value: series[m]?.[d] || 0 }));

  const delta = (k: Kpi) => {
    const v = kpiValue(k.key, cur), b = kpiValue(k.key, prev);
    if (v == null || b == null) return null;
    const isRatio = RATIO.has(k.fmt);
    const c = isRatio ? v - b : change(v, b);
    if (c == null) return null;
    const dir = Math.abs(c) < (isRatio ? 0.005 : 0.01) ? "flat" : c > 0 ? "up" : "down";
    const good = k.good === "neutral" || dir === "flat" ? "flat" : (dir === "up") === (k.good === "up") ? "good" : "bad";
    return { text: isRatio ? `${Math.round(Math.abs(c) * 100)} pts` : `${Math.round(Math.abs(c) * 100)}%`, dir, good };
  };
  const groups = [...new Set(KPIS.map((k) => k.group))];
  const funnel = FUNNEL.map(([m, label]) => ({ label, value: cur.sum[m] || 0 }));
  const sources = breakdown(cur, "visitors", "src");
  const catRows = Object.keys(CAT).map((c) => {
    const closed = cur.sum[`lots_closed|cat:${c}`] || 0, sold = cur.sum[`sales|cat:${c}`] || 0;
    return { c, live: cur.latest[`live_lots|cat:${c}`] || 0, listed: cur.sum[`lots_published|cat:${c}`] || 0, sold, gmv: cur.sum[`gmv|cat:${c}`] || 0, st: closed ? Math.min(1, sold / closed) : null, bpl: closed ? (cur.sum[`bids_on_closed|cat:${c}`] || 0) / closed : null };
  }).filter((r) => r.live || r.listed || r.sold);
  const stateRows = Object.keys(STATE_NAMES).map((s) => ({ s, listed: cur.sum[`lots_published|state:${s}`] || 0, sold: cur.sum[`sales|state:${s}`] || 0, gmv: cur.sum[`gmv|state:${s}`] || 0, visitors: cur.sum[`visitors|region:${s}`] || 0 })).filter((r) => r.listed || r.sold || r.visitors);
  const nothingYet = !Object.keys(cur.sum).length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><h1 className="d2">Insights.</h1><p className="muted" style={{ margin: 0 }}>Updated by the clock every 15 minutes. Compared with the {days} days before.</p></div>
        <div className="pill-row">
          {PERIODS.map(([d, l]) => <Link key={d} className="pill pill-soft" href={`/admin/insights?days=${d}`} style={d === days ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{l}</Link>)}
          <AdminAction action="insights-refresh" payload={{ days: 35 }} label="Refresh now" tone="blue" />
        </div>
      </div>
      {nothingYet && <div className="notice">No numbers yet. Press Refresh now to work them out from everything already in the database; after that the clock keeps them up to date.</div>}

      {summary && <div className="admin-card" data-testid="ai-summary"><span className="eyebrow" style={{ color: "var(--grape)" }}>This week, in a paragraph</span><p style={{ fontSize: 17, lineHeight: 1.6, margin: "8px 0 0" }}>{summary.body}</p></div>}

      <div className="admin-card" data-testid="insight-feed">
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>What the numbers say</h2>
        {feed.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing needs you right now. New insights arrive every morning at 6:30, or press Refresh now.</p> : feed.map((r) => (
          <div className="ins" key={r.id} data-testid="insight">
            <span className={`sev ${r.severity}`}><i aria-hidden="true" />{SEV[r.severity]}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <b style={{ fontSize: 16 }}>{r.title}</b>
              <span className="muted" style={{ fontSize: 14 }}>{r.body}</span>
              {r.action && <span style={{ fontSize: 14 }}><b>What to do:</b> {r.action}</span>}
              {r.link && <Link className="blue" href={r.link} style={{ fontSize: 14, fontWeight: 700 }}>Open ›</Link>}
            </div>
            <span className="pill-row" style={{ flexWrap: "nowrap" }}>
              <AdminAction action="insight" payload={{ id: r.id, status: "done" }} label="Done" tone="soft" />
              <AdminAction action="insight" payload={{ id: r.id, status: "dismissed" }} label="Dismiss" tone="soft" />
            </span>
          </div>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>{g}</h2>
          <div className="kpis">
            {KPIS.filter((k) => k.group === g).map((k) => {
              const v = kpiValue(k.key, cur);
              const d = delta(k);
              const sp = series[k.key] ? pts(k.key).map((p) => p.value) : null;
              return (
                <div className="kpi" key={k.key} title={k.hint} data-testid={`kpi-${k.key}`}>
                  <span className="l">{k.label}</span>
                  <span className="v">{fmtValue(v, k.fmt)}</span>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    {d ? <span className={`d ${d.good}`}>{d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "■"} {d.dir === "flat" ? "No change" : d.text}</span> : <span className="d flat">–</span>}
                    {sp && <Spark values={sp} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="dash2">
        <div className="admin-card"><TrendChart title="Vehicle sales per day" points={pts("gmv")} fmt="money" testId="chart-gmv" /></div>
        <div className="admin-card"><TrendChart title="Tyrebiter revenue per day" points={pts("revenue")} fmt="money" testId="chart-revenue" /></div>
        <div className="admin-card"><TrendChart title="Visitors per day" points={pts("visitors")} fmt="count" kind="line" testId="chart-visitors" /></div>
        <div className="admin-card"><TrendChart title="New members per day" points={pts("signups")} fmt="count" testId="chart-signups" /></div>
        <div className="admin-card"><TrendChart title="Bids per day" points={pts("bids")} fmt="count" kind="line" testId="chart-bids" /></div>
        <div className="admin-card"><TrendChart title="New listings per day" points={pts("lots_published")} fmt="count" testId="chart-listings" /></div>
      </div>

      <div className="dash2">
        <div className="admin-card"><BarList title="From a visit to a paid sale" rows={funnel.map((f, i) => ({ label: f.label, value: f.value, sub: i && funnel[i - 1].value && f.value <= funnel[i - 1].value ? `${Math.round((f.value / funnel[i - 1].value) * 100)}%` : undefined }))} fmt="count" testId="funnel" note="Each step as a share of the one before" /></div>
        <div className="admin-card" id="sources"><BarList title="Where visitors come from" rows={sources.map(([s, v]) => ({ label: SOURCE_LABELS[s] || s, value: v, sub: (cur.sum[`signups|src:${s}`] || 0) ? `${fmtValue(cur.sum[`signups|src:${s}`], "count")} joined` : undefined }))} fmt="count" testId="sources" note="Visitors (tag your links with utm_source to see campaigns)" /></div>
        <div className="admin-card"><BarList title="Sales by where the buyer first came from" rows={breakdown(cur, "gmv", "src").map(([s, v]) => ({ label: SOURCE_LABELS[s] || s, value: v, sub: `${fmtValue(cur.sum[`sales|src:${s}`] || 0, "count")} sold` }))} fmt="money" testId="sales-sources" /></div>
        <div className="admin-card"><BarList title="Devices" rows={breakdown(cur, "visitors", "dev").map(([s, v]) => ({ label: DEVICE_LABELS[s] || s, value: v }))} fmt="count" /></div>
        <div className="admin-card"><BarList title="Pages people look at" rows={breakdown(cur, "views", "page").map(([s, v]) => ({ label: PAGE_LABELS[s] || s, value: v }))} fmt="count" note="Page views" /></div>
        <div className="admin-card"><BarList title="Visitors by state" rows={breakdown(cur, "visitors", "region").filter(([s]) => s !== "?").map(([s, v]) => ({ label: STATE_NAMES[s] || (s === "overseas" ? "Overseas" : s), value: v }))} fmt="count" note="From the host's location data" /></div>
        <div className="admin-card"><BarList title="How vehicles sold" rows={breakdown(cur, "sales", "via").map(([s, v]) => ({ label: ({ auction: "Auction win", referral: "Referred bid accepted", offer: "Offer accepted", buy_now: "Buy Now" } as Record<string, string>)[s] || s, value: v }))} fmt="count" /></div>
        <div className="admin-card"><BarList title="Partner enquiries" rows={breakdown(cur, "partner_leads", "kind").map(([s, v]) => ({ label: s[0].toUpperCase() + s.slice(1), value: v, sub: `${fmtValue(cur.sum[`partner_clicks|kind:${s}`] || 0, "count")} clicks` }))} fmt="count" note="They may pay us a fee" /></div>
      </div>

      <div className="admin-card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>By category</h2>
        <table className="table" data-testid="cat-table"><thead><tr><th>Category</th><th>Live now</th><th>Listed</th><th>Sold</th><th>Sales</th><th>Sell-through</th><th>Bids per vehicle</th></tr></thead>
          <tbody>{catRows.length ? catRows.map((r) => <tr key={r.c}><td><Link className="blue" href={`/for-sale/${r.c}`}>{CAT[r.c].label}</Link></td><td>{r.live}</td><td>{r.listed}</td><td>{r.sold}</td><td>{fmtValue(r.gmv, "money")}</td><td>{fmtValue(r.st, "pct")}</td><td>{fmtValue(r.bpl, "ratio")}</td></tr>) : <tr><td colSpan={7} className="muted">Nothing yet.</td></tr>}</tbody></table>
      </div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>By state</h2>
        <table className="table"><thead><tr><th>State</th><th>Listed</th><th>Sold</th><th>Sales</th><th>Visitors</th></tr></thead>
          <tbody>{stateRows.length ? stateRows.map((r) => <tr key={r.s}><td>{STATE_NAMES[r.s]}</td><td>{r.listed}</td><td>{r.sold}</td><td>{fmtValue(r.gmv, "money")}</td><td>{fmtValue(r.visitors, "count")}</td></tr>) : <tr><td colSpan={5} className="muted">Nothing yet.</td></tr>}</tbody></table>
      </div>

      <div className="dash2" id="searches">
        <div className="admin-card"><BarList title="What people search for" rows={searches.map(([q, v]) => ({ label: q, value: v }))} fmt="count" testId="top-searches" note="The words buyers use: use them in titles and descriptions" /></div>
        <div className="admin-card"><BarList title="Searches that found nothing" rows={zero.map(([q, v]) => ({ label: q, value: v }))} fmt="count" testId="zero-searches" note="Stock buyers want that you don't have" /></div>
      </div>

      <BriefingSettings value={(cfg?.value || {}) as Record<string, never>} />
      <p className="hint">Visitor numbers come from our own counter: no cookies, no IP addresses kept, raw records deleted after 90 days, and browsers that ask not to be tracked aren&apos;t counted. Money is ex GST except vehicle sales (hammer prices). Search engine data is on the <Link className="blue" href="/admin/seo">SEO page</Link>.</p>
    </>
  );
}
