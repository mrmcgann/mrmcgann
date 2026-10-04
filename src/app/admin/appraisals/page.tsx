import { CAT } from "@/lib/vehicles";
import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";
import { expiryDate, vehicleLine } from "@/lib/rego";

export default async function Appraisals() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const { data } = await db.from("appraisals").select("*").order("created_at", { ascending: false }).limit(200);
  const signed = new Map<string, string>();
  const paths = (data || []).flatMap((a) => a.photo_paths || []);
  if (paths.length) {
    const { data: urls } = await db.storage.from("appraisal-photos").createSignedUrls(paths, 3600);
    (urls || []).forEach((u) => u.path && u.signedUrl && signed.set(u.path, u.signedUrl));
  }
  return (
    <>
      <h1 className="d2">Appraisals.</h1>
      {(data || []).map((a) => (
        <div className="admin-card" key={a.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div><b style={{ fontSize: 18 }}>{a.vehicle?.description || CAT[a.kind]?.label || a.kind}</b><br />
              <span className="muted">{a.ref} · {dateTime(a.created_at)} · {a.registration === "unregistered" ? `Unregistered (${a.state})` : `${a.rego} (${a.state})`}{a.lookup_id ? " · from the plate lookup" : " · typed by the seller"}</span></div>
            <span className="tag" style={{ background: a.status === "new" ? "var(--sun)" : "var(--panel)" }}>{a.status}</span>
          </div>
          <span>{a.name} · {a.mobile} · {a.email} · {a.odometer ? `${a.odometer} ${CAT[a.kind]?.usage === "hours" ? "hours" : "km"} · ` : ""}postcode {a.postcode}</span>
          {(a.vehicle && vehicleLine(a.vehicle)) || a.vin ? <span className="muted">{[a.vehicle && vehicleLine(a.vehicle), a.vin ? `VIN ${a.vin}` : null, a.vehicle?.regoExpiry ? `rego expires ${expiryDate(a.vehicle.regoExpiry)}` : null].filter(Boolean).join(" · ")}</span> : null}
          {a.description && <span style={{ whiteSpace: "pre-wrap" }}>&ldquo;{a.description}&rdquo;</span>}
          {(a.photo_paths || []).length > 0 && <div className="pill-row">{a.photo_paths.map((p: string) => signed.get(p) && <a key={p} href={signed.get(p)} target="_blank"><img src={signed.get(p)} alt="" style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 10 }} /></a>)}</div>}
          <div className="pill-row">
            {["contacted", "booked", "closed"].map((s) => a.status !== s && <AdminAction key={s} action="appraisal" payload={{ appraisalId: a.id, status: s }} label={`Mark ${s}`} tone="soft" />)}
            {a.lot_id ? <Link className="btn btn-dark" href={`/admin/lots/${a.lot_id}`} style={{ height: 38, fontSize: 13, padding: "0 14px" }}>Open listing</Link>
              : <AdminAction action="appraisal" payload={{ appraisalId: a.id, createLot: true }} label="Create draft listing" tone="blue" />}
          </div>
        </div>
      ))}
      {!data?.length && <div className="empty"><b>No appraisal requests yet.</b></div>}
    </>
  );
}
