"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BACKDROPS, GRADES, STATES } from "@/lib/grades";
import { photoUrl } from "@/lib/photos";
import { AdminAction } from "@/components/AdminAction";

export interface SellerInfo {
  inviteUrl: string | null;
  sellerName: string | null;
  idVerified: boolean;
  agreement: { signed_name: string; signed_at: string; reserve_price: number | null; disclosures: Record<string, unknown>; gst_registered: boolean; abn: string | null; owner_type: string; version: string } | null;
  docs: { path: string; url: string | null }[];
  bank: { account_name: string; bsb: string; account_number: string; confirmed_at: string | null } | null;
  sellerId: string | null;
  ownershipCheckedAt: string | null;
  requireChecks: boolean;
}

type Row = Record<string, unknown>;
const ANGLES = ["Front 3/4", "Side", "Rear 3/4", "Rear", "Interior", "Dash", "Rear seats", "Boot", "Engine", "Tyres", "Odometer", "Other"];

const toLocal = (iso: unknown) => {
  if (!iso) return "";
  const d = new Date(String(iso));
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const num = (v: string) => (v === "" ? null : Number(v));

export function LotEditor({ lot, priv, photos: initialPhotos, flaws: initialFlaws, seller }: { lot: Row | null; priv: Row | null; photos: Row[]; flaws: Row[]; seller?: SellerInfo }) {
  const router = useRouter();
  const db = supabaseBrowser();
  const [f, setF] = useState<Row>({
    status: "draft", title: "", short_title: "", subtitle: "", category: "cars", vehicle_type: "car", backdrop: "sun", featured: false,
    start_price: 100, ...(lot || {}),
  });
  const [p, setP] = useState<Row>({ reserve_price: null, seller_name: "", seller_phone: "", seller_email: "", seller_address: "", seller_notes: "", ...(priv || {}) });
  const [photos, setPhotos] = useState<Row[]>(initialPhotos);
  const [flaws, setFlaws] = useState<Row[]>(initialFlaws);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = lot?.id as number | undefined;
  const hasBids = Number(f.bid_count || 0) > 0;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setPriv = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });

  function payload(extra: Row = {}) {
    const out: Row = {};
    const keys = ["status", "title", "short_title", "subtitle", "category", "vehicle_type", "backdrop", "featured", "year", "make", "model", "variant", "body", "engine", "transmission", "fuel", "odometer", "colour", "seats", "keys", "suburb", "state", "postcode", "take", "owner_note", "service_history", "known_faults", "roadworthy_note", "ppsr_clear", "ppsr_note", "visual_grade", "grade_paint", "grade_interior", "grade_tyres", "tyre_tread", "buy_now_price", "start_price", "starts_at", "ends_at",
      "vin", "rego_plate", "rego_state", "rego_expiry", "build_date", "compliance_date", "gvm_kg", "write_off_status", "stolen_clear", "ppsr_cert_no", "ppsr_checked_at", "video_url", "service_books"];
    for (const k of keys) out[k] = f[k] === "" ? null : f[k];
    for (const k of ["year", "odometer", "seats", "keys", "buy_now_price", "start_price", "gvm_kg"]) out[k] = f[k] === "" || f[k] == null ? (k === "start_price" ? 100 : null) : Number(f[k]);
    for (const k of ["stolen_clear", "service_books"]) out[k] = f[k] === "" || f[k] == null ? null : f[k] === true || f[k] === "true";
    out.write_off_status = f.write_off_status || "unknown";
    if (out.vin) out.vin = String(out.vin).toUpperCase().replace(/\s/g, "");
    out.ppsr_clear = f.ppsr_clear === "" || f.ppsr_clear == null ? null : f.ppsr_clear === true || f.ppsr_clear === "true";
    out.featured = f.featured === true || f.featured === "true";
    out.updated_at = new Date().toISOString();
    return { ...out, ...extra };
  }

  async function save(extra: Row = {}, okText = "Saved.") {
    setMsg(null);
    if (!String(f.title || "").trim()) { setMsg({ kind: "bad", text: "Add a title first." }); return null; }
    setBusy(true);
    const body = payload(extra);
    let lotId = id;
    if (!lotId) {
      const { data, error } = await db.from("lots").insert(body).select("id").single();
      if (error) { setBusy(false); setMsg({ kind: "bad", text: error.message }); return null; }
      lotId = data.id as number;
    } else {
      const { error } = await db.from("lots").update(body).eq("id", lotId);
      if (error) {
        setBusy(false);
        const ready = error.message.includes("not_ready:") ? `Not ready to publish: ${error.message.split("not_ready:")[1]}.` : error.message;
        setMsg({ kind: "bad", text: ready });
        return null;
      }
    }
    const privBody = { lot_id: lotId, reserve_price: p.reserve_price === "" || p.reserve_price == null ? null : Number(p.reserve_price), seller_name: p.seller_name || null, seller_phone: p.seller_phone || null, seller_email: p.seller_email || null, seller_address: p.seller_address || null, seller_notes: p.seller_notes || null };
    const { error: pe } = await db.from("lot_private").upsert(privBody);
    setBusy(false);
    if (pe) { setMsg({ kind: "bad", text: pe.message }); return null; }
    setF({ ...f, ...extra });
    setMsg({ kind: "ok", text: okText });
    fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId }) }).catch(() => {});
    if (!id) router.replace(`/admin/lots/${lotId}`);
    else router.refresh();
    return lotId;
  }

  async function publish() {
    const missing = [["title", "Title"], ["suburb", "Suburb"], ["state", "State"], ["ends_at", "Auction end time"], ["visual_grade", "Visual grade"], ["vin", "VIN"], ["ppsr_checked_at", "PPSR search date"], ["year", "Year"], ["transmission", "Transmission"], ["fuel", "Fuel"]].filter(([k]) => !f[k]).map(([, l]) => l);
    if (missing.length) { setMsg({ kind: "bad", text: `Before publishing, add: ${missing.join(", ")}.` }); return; }
    if (new Date(String(f.ends_at)).getTime() < Date.now() + 3600000) { setMsg({ kind: "bad", text: "The end time must be at least an hour away." }); return; }
    if (!photos.length && !confirm("This vehicle has no photos yet. Publish anyway?")) return;
    await save({ status: "live", starts_at: f.starts_at || new Date().toISOString(), ...(hasBids ? {} : { current_bid: Number(f.start_price || 100) }) }, "Published. It's live on the site.");
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || !id) return;
    setBusy(true);
    let sort = photos.length;
    const added: Row[] = [];
    for (const file of Array.from(files)) {
      const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await db.storage.from("lot-photos").upload(path, file, { contentType: file.type });
      if (error) { setMsg({ kind: "bad", text: `Upload failed: ${error.message}` }); continue; }
      const { data } = await db.from("lot_photos").insert({ lot_id: id, path, angle: ANGLES[Math.min(sort, 3)], sort }).select("*").single();
      if (data) added.push(data);
      sort++;
    }
    setPhotos([...photos, ...added]);
    setBusy(false);
  }
  async function updatePhoto(pid: string, patch: Row) {
    await db.from("lot_photos").update(patch).eq("id", pid);
    setPhotos(photos.map((x) => (x.id === pid ? { ...x, ...patch } : x)));
  }
  async function movePhoto(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next);
    await Promise.all(next.map((x, n) => db.from("lot_photos").update({ sort: n }).eq("id", x.id)));
  }
  async function deletePhoto(ph: Row) {
    if (!confirm("Delete this photo?")) return;
    await db.from("lot_photos").delete().eq("id", ph.id);
    await db.storage.from("lot-photos").remove([String(ph.path)]);
    setPhotos(photos.filter((x) => x.id !== ph.id));
  }

  async function addFlaw() {
    if (!id) return;
    const { data } = await db.from("lot_flaws").insert({ lot_id: id, title: "New flaw", sort: flaws.length }).select("*").single();
    if (data) setFlaws([...flaws, data]);
  }
  async function updateFlaw(fid: string, patch: Row) {
    setFlaws(flaws.map((x) => (x.id === fid ? { ...x, ...patch } : x)));
    await db.from("lot_flaws").update(patch).eq("id", fid);
  }
  async function flawPhoto(fid: string, file: File | undefined) {
    if (!file || !id) return;
    const path = `${id}/flaws/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await db.storage.from("lot-photos").upload(path, file, { contentType: file.type });
    if (!error) updateFlaw(fid, { photo_path: path });
  }
  async function deleteFlaw(fid: string) {
    await db.from("lot_flaws").delete().eq("id", fid);
    setFlaws(flaws.filter((x) => x.id !== fid));
  }

  const inp = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input className="input" value={(f[k] as string) ?? ""} onChange={set(k)} {...props} /></label>
  );
  const sel = (k: string, label: string, options: [string, string][]) => (
    <label className="field"><span>{label}</span><select className="input" value={(f[k] as string) ?? ""} onChange={set(k)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );
  const area = (k: string, label: string, hint?: string) => (
    <label className="field"><span>{label}</span><textarea className="input" value={(f[k] as string) ?? ""} onChange={set(k)} />{hint && <span className="hint">{hint}</span>}</label>
  );
  const gradeOpts: [string, string][] = [["", "–"], ...GRADES.map(([g, n]) => [g, `${g} · ${n}`] as [string, string])];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div><Link className="more" style={{ fontSize: 15 }} href="/admin/lots">‹ Vehicles</Link><h1 className="d3">{id ? `Lot ${id}` : "List a vehicle"}</h1><span className="tag" style={{ background: f.status === "live" ? "var(--mint)" : "var(--panel)" }}>{String(f.status)}</span></div>
        <div className="pill-row">
          {id && <Link className="btn btn-soft" href={f.status === "draft" ? `/admin/preview/${id}` : `/lot/${id}`} target="_blank" style={{ height: 48 }}>Preview</Link>}
          <button className="btn btn-dark" style={{ height: 48 }} disabled={busy} onClick={() => save()}>Save</button>
          {f.status === "draft" && <button className="btn btn-blue" style={{ height: 48 }} disabled={busy || !id} onClick={publish} title={id ? "" : "Save first"}>Publish</button>}
          {f.status === "live" && !hasBids && <button className="btn btn-soft" style={{ height: 48 }} disabled={busy} onClick={() => save({ status: "draft" }, "Moved back to draft.")}>Unpublish</button>}
          {["draft", "live"].includes(String(f.status)) && id && <button className="btn btn-soft" style={{ height: 48, color: "#B4123E" }} disabled={busy} onClick={() => { if (confirm("Cancel this listing? Bidders will no longer be able to bid.")) save({ status: "cancelled" }, "Listing cancelled."); }}>Cancel listing</button>}
        </div>
      </div>
      {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}
      {hasBids && <div className="notice">This lot has bids. Prices and the reserve can still be changed, but take care: bidders rely on what&apos;s shown.</div>}

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Listing</h2>
        {inp("title", "Title", { placeholder: "2009 Toyota Corolla Ascent" })}
        <div className="grid2">{inp("short_title", "Short title (big headline)", { placeholder: "2009 Toyota Corolla" })}{inp("subtitle", "One-line summary", { placeholder: "One owner. Every service stamped." })}</div>
        <div className="grid3">
          {sel("category", "Category", [["cars", "Cars"], ["utes", "Utes & 4x4"], ["trucks", "Trucks"]])}
          {sel("vehicle_type", "Silhouette", [["car", "Car"], ["ute", "Ute"], ["truck", "Truck"]])}
          {sel("backdrop", "Backdrop colour", BACKDROPS.map((b) => [b, b[0].toUpperCase() + b.slice(1)]))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{BACKDROPS.map((b) => <button key={b} type="button" onClick={() => setF({ ...f, backdrop: b })} aria-label={b} className={`bg-${b}`} style={{ width: 36, height: 36, borderRadius: 18, border: f.backdrop === b ? "3px solid var(--ink)" : "0" }} />)}</div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={f.featured === true} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Feature as &quot;Lot of the week&quot; on the homepage</label>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Vehicle</h2>
        <div className="grid3">{inp("year", "Year", { inputMode: "numeric" })}{inp("make", "Make")}{inp("model", "Model")}</div>
        <div className="grid3">{inp("variant", "Variant")}{inp("body", "Body", { placeholder: "4-door sedan" })}{inp("engine", "Engine", { placeholder: "1.8L 4-cyl" })}</div>
        <div className="grid3">{sel("transmission", "Transmission", [["", "–"], ["Auto", "Auto"], ["Manual", "Manual"]])}{sel("fuel", "Fuel", [["", "–"], ["Petrol", "Petrol"], ["Diesel", "Diesel"], ["Hybrid", "Hybrid"], ["Electric", "Electric"], ["LPG", "LPG"]])}{inp("odometer", "Odometer (km)", { inputMode: "numeric" })}</div>
        <div className="grid3">{inp("colour", "Colour")}{inp("seats", "Seats", { inputMode: "numeric" })}{inp("keys", "Keys", { inputMode: "numeric" })}</div>
        <div className="grid3">{inp("suburb", "Suburb (shown publicly)")}{sel("state", "State", [["", "–"], ...STATES.map((s) => [s, s] as [string, string])])}{inp("postcode", "Postcode")}</div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Facts &amp; checks</h2>
        <p className="hint">These are the facts buyers can claim on (the ACCC fined Grays $10m for listings with the wrong year, transmission and missing damage). Check them against the rego papers and the PPSR certificate. Required before publishing.</p>
        <div className="grid3">{inp("vin", "VIN", { placeholder: "17 characters" })}{inp("rego_plate", "Rego plate")}{sel("rego_state", "Rego state", [["", "–"], ...STATES.map((s) => [s, s] as [string, string])])}</div>
        <div className="grid3">
          <label className="field"><span>Rego expiry</span><input className="input" type="date" value={String(f.rego_expiry || "")} onChange={set("rego_expiry")} /></label>
          {inp("build_date", "Build date", { placeholder: "03/2009" })}{inp("compliance_date", "Compliance date", { placeholder: "05/2009" })}
        </div>
        <div className="grid3">
          {sel("write_off_status", "Write-off status (PPSR)", [["unknown", "Not checked yet"], ["none", "Not written off"], ["repairable", "Repairable write-off"], ["statutory", "Statutory write-off"]])}
          <label className="field"><span>Stolen check (PPSR)</span><select className="input" value={f.stolen_clear == null ? "" : String(f.stolen_clear)} onChange={(e) => setF({ ...f, stolen_clear: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Not checked</option><option value="true">Not recorded as stolen</option><option value="false">Recorded as stolen: DO NOT LIST</option></select></label>
          {inp("gvm_kg", "GVM (kg, trucks)", { inputMode: "numeric" })}
        </div>
        <div className="grid3">
          {inp("ppsr_cert_no", "PPSR certificate number")}
          <label className="field"><span>PPSR searched on</span><input className="input" type="date" value={f.ppsr_checked_at ? String(f.ppsr_checked_at).slice(0, 10) : ""} onChange={(e) => setF({ ...f, ppsr_checked_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
          <label className="field"><span>Service books</span><select className="input" value={f.service_books == null ? "" : String(f.service_books)} onChange={(e) => setF({ ...f, service_books: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
        </div>
        {inp("video_url", "Walkaround / cold-start video link (optional)", { placeholder: "https://…" })}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Story</h2>
        {area("take", "Tyrebiter's take", "Two or three sentences that make someone want it. Opinion, not facts about condition.")}
        {area("owner_note", "From the owner", "In the owner's words, with their permission.")}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Condition report</h2>
        <p className="hint">Grade only what you can see on the walkaround. See the grade definitions in the Help centre.</p>
        <div className="grid2">{sel("visual_grade", "Overall visual grade", gradeOpts)}{inp("tyre_tread", "Tyre tread", { placeholder: "FL 4.5 · FR 4.0 · RL 5.5 · RR 5.0 mm" })}</div>
        <div className="grid3">{sel("grade_paint", "Paint & body", gradeOpts)}{sel("grade_interior", "Interior", gradeOpts)}{sel("grade_tyres", "Tyres", gradeOpts)}</div>
        <div className="grid2">
          <label className="field"><span>PPSR search</span><select className="input" value={f.ppsr_clear == null ? "" : String(f.ppsr_clear)} onChange={(e) => setF({ ...f, ppsr_clear: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Pending</option><option value="true">Clear</option><option value="false">Not clear (explain below)</option></select></label>
          {inp("ppsr_note", "PPSR note")}
        </div>
        <div className="grid3">{inp("service_history", "Service history (seller declared)")}{inp("known_faults", "Known faults (seller declared)")}{inp("roadworthy_note", "Roadworthy", { placeholder: "Not included" })}</div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Photos</h2>
        {!id ? <p className="muted">Save the listing first, then add photos.</p> : (
          <>
            <label className="drop"><b>Add photos</b><span className="hint">Upload the studio shots on their colour backdrop. The first photo is the cover.</span><input type="file" multiple accept="image/*" hidden onChange={(e) => uploadPhotos(e.target.files)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
              {photos.map((ph, i) => (
                <div key={String(ph.id)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="photo" style={{ aspectRatio: "4/3" }}><img src={photoUrl(String(ph.path))} alt="" /></div>
                  <select className="input" style={{ height: 40, fontSize: 14 }} value={String(ph.angle || "")} onChange={(e) => updatePhoto(String(ph.id), { angle: e.target.value })}>{ANGLES.map((a) => <option key={a}>{a}</option>)}</select>
                  <span style={{ display: "flex", gap: 8, fontSize: 13 }}><button className="linkbtn" onClick={() => movePhoto(i, -1)}>‹ Left</button><button className="linkbtn" onClick={() => movePhoto(i, 1)}>Right ›</button><button className="linkbtn" style={{ color: "#B4123E", marginLeft: "auto" }} onClick={() => deletePhoto(ph)}>Delete</button></span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Flaws</h2>
        {!id ? <p className="muted">Save the listing first, then add flaws.</p> : (
          <>
            {flaws.map((fl) => (
              <div key={String(fl.id)} style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
                <label className="photo" style={{ aspectRatio: "1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--muted)" }}>
                  {fl.photo_path ? <img src={photoUrl(String(fl.photo_path))} alt="" /> : "Add close-up"}
                  <input type="file" accept="image/*" hidden onChange={(e) => flawPhoto(String(fl.id), e.target.files?.[0])} />
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input className="input" value={String(fl.title || "")} onChange={(e) => setFlaws(flaws.map((x) => (x.id === fl.id ? { ...x, title: e.target.value } : x)))} onBlur={(e) => updateFlaw(String(fl.id), { title: e.target.value })} />
                  <input className="input" placeholder="Short note, e.g. Cosmetic, about 8 cm" value={String(fl.note || "")} onChange={(e) => setFlaws(flaws.map((x) => (x.id === fl.id ? { ...x, note: e.target.value } : x)))} onBlur={(e) => updateFlaw(String(fl.id), { note: e.target.value })} />
                  <button className="linkbtn" style={{ color: "#B4123E", alignSelf: "flex-start" }} onClick={() => deleteFlaw(String(fl.id))}>Delete flaw</button>
                </div>
              </div>
            ))}
            <button className="btn btn-soft" style={{ alignSelf: "flex-start", height: 46 }} onClick={addFlaw}>Add a flaw</button>
          </>
        )}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Auction</h2>
        <div className="grid3">
          {inp("start_price", "Starting bid ($)", { inputMode: "numeric" })}
          <label className="field"><span>Reserve ($, private)</span><input className="input" inputMode="numeric" value={(p.reserve_price as string) ?? ""} onChange={setPriv("reserve_price")} placeholder="Leave empty for no reserve" /></label>
          {inp("buy_now_price", "Buy Now price ($, optional)", { inputMode: "numeric" })}
        </div>
        <div className="grid2">
          <label className="field"><span>Starts</span><input className="input" type="datetime-local" value={toLocal(f.starts_at)} onChange={(e) => setF({ ...f, starts_at: fromLocal(e.target.value) })} /><span className="hint">Leave empty to start when published.</span></label>
          <label className="field"><span>Ends</span><input className="input" type="datetime-local" value={toLocal(f.ends_at)} onChange={(e) => setF({ ...f, ends_at: fromLocal(e.target.value) })} /><span className="hint">Bids in the last 10 minutes extend it automatically.</span></label>
        </div>
        <div className="pill-row">{[3, 5, 7].map((d) => <button key={d} type="button" className="pill pill-soft" onClick={() => { const e = new Date(Date.now() + d * 86400000); e.setHours(19, 0, 0, 0); setF({ ...f, ends_at: e.toISOString() }); }}>{d} days, ends 7 pm</button>)}</div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Seller (private)</h2>
        <p className="hint">Never shown on the site. The address is sent to buyers only when you confirm an inspection or a collection.</p>
        {id && seller && (
          <div className="soft" style={{ gap: 8 }}>
            <b>Seller onboarding{seller.requireChecks ? " (required before publishing)" : " (checks switched off in settings)"}</b>
            {([
              [!!seller.agreement, seller.agreement ? `Agreement signed by ${seller.agreement.signed_name}, ${new Date(seller.agreement.signed_at).toLocaleString("en-AU")} (version ${seller.agreement.version})` : "Seller agency agreement not signed yet"],
              [seller.idVerified, seller.idVerified ? `Seller ID verified (${seller.sellerName || ""})` : "Seller ID not verified"],
              [!!seller.ownershipCheckedAt, seller.ownershipCheckedAt ? `Ownership papers checked ${new Date(seller.ownershipCheckedAt).toLocaleDateString("en-AU")}` : "Ownership papers not checked"],
              [!!f.vin && !!f.ppsr_checked_at, f.vin && f.ppsr_checked_at ? "VIN and PPSR recorded" : "VIN and PPSR search needed"],
              [!!seller.bank?.confirmed_at, seller.bank ? (seller.bank.confirmed_at ? "Bank details confirmed by phone" : "Bank details given, not yet confirmed by phone (needed before payout)") : "No bank details yet"],
            ] as [boolean, string][]).map(([ok, t]) => <span key={t}>{ok ? "✅" : "⬜️"} {t}</span>)}
            {seller.inviteUrl && !seller.agreement && (
              <span className="pill-row" style={{ alignItems: "center" }}>
                <input className="input" readOnly value={seller.inviteUrl} style={{ height: 38, fontSize: 13, flex: 1, minWidth: 200 }} onFocus={(e) => e.currentTarget.select()} />
                <AdminAction action="send-seller-link" payload={{ lotId: id }} label="Text + email it to the seller" tone="blue" />
              </span>
            )}
            {seller.docs.length > 0 && <span>Ownership papers: {seller.docs.map((d, i) => d.url ? <a key={d.path} className="blue" href={d.url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>Document {i + 1}</a> : null)}</span>}
            {seller.agreement && !seller.ownershipCheckedAt && <AdminAction action="ownership-checked" payload={{ lotId: id }} label="Papers match the seller and VIN" input={{ name: "note", placeholder: "e.g. QLD rego cert, name matches ID" }} tone="blue" />}
            {seller.bank && !seller.bank.confirmed_at && seller.sellerId && <span>Bank: {seller.bank.account_name} · BSB {seller.bank.bsb} · {seller.bank.account_number} <AdminAction action="bank-confirmed" payload={{ sellerId: seller.sellerId }} label="Confirmed by phone" confirmText="You phoned the seller and they read back these details?" tone="soft" /></span>}
            {seller.agreement && (
              <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>What the seller declared</summary>
                <div className="rows">{Object.entries(seller.agreement.disclosures || {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => <div key={k}><span className="muted">{k.replace(/_/g, " ")}</span><b>{String(v)}</b></div>)}
                  <div><span className="muted">GST registered</span><b>{seller.agreement.gst_registered ? `Yes, ABN ${seller.agreement.abn}` : "No"}</b></div>
                  <div><span className="muted">Owner type</span><b>{seller.agreement.owner_type}</b></div>
                  <div><span className="muted">Reserve at signing</span><b>{seller.agreement.reserve_price ?? "None"}</b></div></div>
              </details>
            )}
          </div>
        )}
        <div className="grid3">
          <label className="field"><span>Name</span><input className="input" value={(p.seller_name as string) ?? ""} onChange={setPriv("seller_name")} /></label>
          <label className="field"><span>Phone</span><input className="input" value={(p.seller_phone as string) ?? ""} onChange={setPriv("seller_phone")} /></label>
          <label className="field"><span>Email</span><input className="input" value={(p.seller_email as string) ?? ""} onChange={setPriv("seller_email")} /></label>
        </div>
        <label className="field"><span>Address</span><input className="input" value={(p.seller_address as string) ?? ""} onChange={setPriv("seller_address")} /></label>
        <label className="field"><span>Notes</span><textarea className="input" value={(p.seller_notes as string) ?? ""} onChange={setPriv("seller_notes")} /></label>
      </div>
      <div className="pill-row"><button className="btn btn-dark" disabled={busy} onClick={() => save()}>Save</button>{f.status === "draft" && id && <button className="btn btn-blue" disabled={busy} onClick={publish}>Publish</button>}</div>
    </>
  );
}
