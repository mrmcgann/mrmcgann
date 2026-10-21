import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

// Buyers collect from our depot (never the seller's place), once the vehicle is there and ownership is transferred.
export default async function Collections({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "requested" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("collections").select("*, lots(id, title, suburb, state), profiles(first_name, last_name, mobile)").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const invIds = (data || []).map((c) => c.invoice_id);
  const { data: jobs } = await db.from("transport_jobs").select("invoice_id, depot_id").in("invoice_id", invIds.length ? invIds : ["00000000-0000-0000-0000-000000000000"]);
  const depotIds = [...new Set((jobs || []).map((j) => j.depot_id).filter(Boolean))] as string[];
  const [{ data: depots }, { data: dpriv }] = await Promise.all([
    db.from("depots").select("id, name, suburb, state, hours").in("id", depotIds.length ? depotIds : ["00000000-0000-0000-0000-000000000000"]),
    db.from("depot_private").select("depot_id, address, phone, email").in("depot_id", depotIds.length ? depotIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const depotOf = new Map((jobs || []).map((j) => [j.invoice_id, j.depot_id as string | null]));
  const depot = new Map((depots || []).map((d) => [d.id, d]));
  const priv = new Map((dpriv || []).map((d) => [d.depot_id, d]));
  return (
    <>
      <h1 className="d2">Collections.</h1>
      <p className="muted">The buyer collects from the depot. Check the time with the depot, then confirm it here: the buyer gets the depot&apos;s address and their release code, and the depot gets the collector&apos;s name and the handover link (by email and SMS).</p>
      <div className="pill-row">{["requested", "confirmed", "collected", "all"].map((s) => <Link key={s} className="pill pill-soft" href={`/admin/collections?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s}</Link>)}</div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Vehicle</th><th>Buyer / collector</th><th>Depot</th><th>Time</th><th /></tr></thead>
          <tbody>{(data || []).map((c) => {
            const lot = (Array.isArray(c.lots) ? c.lots[0] : c.lots) as { id: number; title: string; suburb: string; state: string } | null;
            const b = (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { first_name: string; last_name: string; mobile: string } | null;
            const did = depotOf.get(c.invoice_id) || null;
            const d = did ? depot.get(did) : null, dp = did ? priv.get(did) : null;
            return (
              <tr key={c.id}>
                <td><Link href={`/lot/${lot?.id}`} style={{ fontWeight: 700 }}>{lot?.title}</Link></td>
                <td>{b?.first_name} {b?.last_name} · {b?.mobile}{c.collector_name && <><br />Collector: {c.collector_name} · {c.collector_mobile}</>}{c.carrier_ref && <><br />Carrier ref {c.carrier_ref}</>}</td>
                <td>{d ? <>{d.name}<br /><span className="muted">{dp?.address || `${d.suburb} ${d.state}`}{d.hours ? ` · ${d.hours}` : ""}</span><br /><span className="muted">{[dp?.phone, dp?.email].filter(Boolean).join(" · ") || "No depot contact: the link comes to us"}</span></> : <span className="muted">Collected the old way</span>}</td>
                <td>Wants: {c.preferred_day}, {c.preferred_time}<br />{c.confirmed_for && <b>Confirmed: {c.confirmed_for}</b>}{c.collected_at && <><br />Collected {dateTime(c.collected_at)}{c.handover?.odometer ? ` · ${c.handover.odometer} km · ${c.handover.keys} keys` : ""}</>}</td>
                <td><span className="pill-row">
                  {["requested", "confirmed"].includes(c.status) && <AdminAction action="confirm-collection" payload={{ collectionId: c.id }} label={c.status === "confirmed" ? "Change time" : "Confirm time"} input={{ name: "when", placeholder: "e.g. Mon 27 Oct, 10 am" }} tone="blue" />}
                  {c.status === "confirmed" && <AdminAction action="collected" payload={{ invoiceId: c.invoice_id }} label="Handed over (confirmed by phone)" confirmText="The depot confirmed it was handed over for the release code?" tone="soft" />}
                  {c.status !== "collected" && c.status !== "cancelled" && <AdminAction action="cancel-collection" payload={{ collectionId: c.id }} label="Cancel" confirmText="Cancel this booking?" tone="bad" />}
                  {c.status !== "cancelled" && <AdminAction action="tracking" payload={{ collectionId: c.id }} label={c.tracking_url ? "Change tracking link" : "Add carrier tracking link"} input={{ name: "url", placeholder: "https://…" }} tone="soft" />}
                </span></td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
