/* eslint-disable @next/next/no-img-element */
import { CAT } from "@/lib/vehicles";
import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime, money } from "@/lib/format";
import { expiryDate, vehicleLine } from "@/lib/rego";
import { CONDITIONS, OWNER_TYPES, QUESTIONS, SELL_WHEN, WRITE_OFF } from "@/lib/sellForm";

const label = (list: [string, string, ...unknown[]][], k: unknown) => list.find(([x]) => x === k)?.[1] || String(k || "");

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
  // The signed sell forms: the drawn signature and the PDF copy (private bucket, links for an hour).
  const docs = new Map<string, string>();
  const docPaths = (data || []).flatMap((a) => [a.signature_path, a.agreement_path].filter(Boolean) as string[]);
  if (docPaths.length) {
    const { data: urls } = await db.storage.from("seller-docs").createSignedUrls(docPaths, 3600);
    (urls || []).forEach((u) => u.path && u.signedUrl && docs.set(u.path, u.signedUrl));
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
          {a.signed_at && <SellFormFacts a={a} sigUrl={a.signature_path ? docs.get(a.signature_path) : undefined} pdfUrl={a.agreement_path ? docs.get(a.agreement_path) : undefined} />}
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

// What the seller told us on the signed sell form: reserve, condition, every yes/no (the "yes" ones stand out), and the signature.
function SellFormFacts({ a, sigUrl, pdfUrl }: { a: Record<string, any>; sigUrl?: string; pdfUrl?: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const det = (a.details || {}) as Record<string, string | boolean>;
  const d = (a.disclosures || {}) as Record<string, string | boolean>;
  const answers = QUESTIONS.map(([k, q]) => [q, String((k === "runs" ? d.starts_and_drives : d[k]) || "")] as const);
  const flagged = answers.filter(([q, x]) => (q.startsWith("Does it start") ? !x.startsWith("yes") : x.startsWith("Yes") || x === "yes"));
  return (
    <div className="soft" style={{ gap: 8, padding: 18, borderRadius: 20 }} data-testid={`appraisal-form-${a.ref}`}>
      <div className="pill-row">
        <span className="tag" style={{ background: a.reserve_type === "reserve" ? "var(--sky)" : "var(--lime)" }}>{a.reserve_type === "reserve" ? `Reserve ${money(Number(a.reserve_amount))}` : "No reserve"}</span>
        {det.condition && <span className="tag" style={{ background: "var(--sun)" }}>{label(CONDITIONS, det.condition)}</span>}
        <span className="tag" style={{ background: "#FFFFFF" }}>{label(WRITE_OFF, d.write_off)}</span>
        {det.sell_when && <span className="tag" style={{ background: "#FFFFFF" }}>{label(SELL_WHEN, det.sell_when)}</span>}
        {det.owner_type && <span className="tag" style={{ background: "#FFFFFF" }}>Owner: {label(OWNER_TYPES, det.owner_type)}{det.business ? " (business)" : ""}</span>}
      </div>
      <span>{[det.transmission, det.fuel, det.colour, det.suburb ? `kept at ${det.suburb} ${a.postcode}` : null, `${d.keys ?? "?"} keys`, d.service_books ? "service books" : "no service books", d.rego_expiry ? `rego to ${d.rego_expiry}` : null].filter(Boolean).join(" · ")}</span>
      {d.finance === "yes" && <span><b>Finance owing:</b> about {money(Number(d.finance_amount || 0))}{d.lender_name ? ` with ${d.lender_name}` : ""}</span>}
      {flagged.length > 0
        ? <ul style={{ margin: 0, paddingLeft: 18 }}>{flagged.map(([q, x]) => <li key={q}><b>{q}</b> {x}</li>)}</ul>
        : <span className="muted">Every yes/no answer was the all-clear.</span>}
      {d.known_faults && <span><b>Known faults:</b> {String(d.known_faults)}</span>}
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {sigUrl ? <img src={sigUrl} alt={`Signature of ${a.signed_name}`} style={{ height: 56, background: "#FFFFFF", borderRadius: 10, padding: 4 }} /> : <span className="hint">Signed with a typed name (no drawing).</span>}
        <span className="hint">Signed by {a.signed_name} · {dateTime(a.signed_at)} · {a.agreement_version}{a.signed_ip ? ` · ${a.signed_ip}` : ""}</span>
        {pdfUrl && <a className="blue" href={pdfUrl} target="_blank" rel="noopener noreferrer">Signed agreement (PDF)</a>}
      </div>
    </div>
  );
}
