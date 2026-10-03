import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money } from "@/lib/format";
import type { Partner } from "@/lib/types";
import { PartnerEditor } from "./PartnerEditor";

type Stat = { partner_id: string; clicks: number; leads: number; converted: number; revenue: number };

// Finance, insurance and inspection partners: what shows on the site, where leads go, and what each earns.
export default async function Partners() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: partners }, { data: priv }, { data: s30 }, { data: sAll }] = await Promise.all([
    db.from("partners").select("*").order("kind").order("sort"),
    db.from("partner_private").select("*"),
    db.rpc("partner_stats", { p_since: since30 }),
    db.rpc("partner_stats", { p_since: "2000-01-01" }),
  ]);
  const stat = (rows: unknown, id: string) => ((rows || []) as Stat[]).find((r) => r.partner_id === id);
  const list = (partners || []) as Partner[];
  const total = ((sAll || []) as Stat[]).reduce((a, r) => a + Number(r.revenue || 0), 0);
  return (
    <>
      <h1 className="d2">Partners.</h1>
      <p className="muted">Lenders and brokers (they need an Australian Credit Licence), insurers (an AFSL) and mobile inspectors. A partner only shows on the site once it&apos;s switched on. Enter rates and fees exactly as the partner advertises them, and the commission note you&apos;ve agreed. Fees recorded on leads: <b>{money(total)}</b> all time.</p>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Partner</th><th>Shows</th><th>Last 30 days</th><th>All time</th><th /></tr></thead>
          <tbody>{list.map((p) => {
            const a = stat(s30, p.id), b = stat(sAll, p.id);
            return (
              <tr key={p.id}>
                <td><b>{p.name}</b>{p.sample && <span className="status-pill" style={{ marginLeft: 6 }}>sample</span>}<br /><span className="muted">{p.kind} · {p.licence || "no licence entered"}</span></td>
                <td>{p.active ? "On" : "Off"}{p.sponsored ? " · sponsored" : ""}<br /><span className="muted">{p.kind === "finance" ? `${p.rate_from ?? "-"}% (comparison ${p.comparison_rate ?? "-"}%)` : p.kind === "inspection" ? `from ${p.price_from ? money(p.price_from) : "-"}` : ""}</span></td>
                <td>{a?.clicks ?? 0} clicks · {a?.leads ?? 0} leads<br /><span className="muted">{a?.converted ?? 0} converted · {money(Number(a?.revenue || 0))}</span></td>
                <td>{b?.clicks ?? 0} clicks · {b?.leads ?? 0} leads<br /><span className="muted">{b?.converted ?? 0} converted · {money(Number(b?.revenue || 0))}</span></td>
                <td><PartnerEditor partner={p} priv={(priv || []).find((x) => x.partner_id === p.id) || null} /></td>
              </tr>
            );
          })}</tbody></table>
      </div>
      <PartnerEditor partner={null} priv={null} />
    </>
  );
}
