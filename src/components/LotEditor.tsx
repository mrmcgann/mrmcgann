"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { BACKDROPS, GRADES, STATES } from "@/lib/grades";
import { CATEGORIES, CAT, VEHICLE_TYPES, LICENCES, makesFor, modelsFor } from "@/lib/vehicles";
import { photoUrl, videoUrl } from "@/lib/photos";
import { MEDIA_MAX, VIDEO_MAX, VIDEO_STATUS, VIDEO_TYPES } from "@/lib/videos";
import { env } from "@/lib/env";
import { rulesFor } from "@/lib/transfer";
import { AdminAction } from "@/components/AdminAction";
import { CHECK_KEYS, LISTING_CHECKS, RUNS, isElectrified } from "@/lib/listing";
import { ZONES } from "@/lib/damage";
import { cleanPhoto } from "@/lib/photoPrep";
import { money } from "@/lib/format";
import type { Depot } from "@/lib/types";

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

export function LotEditor({ lot, priv, photos: initialPhotos, flaws: initialFlaws, seller, videos = [] }: { lot: Row | null; priv: Row | null; photos: Row[]; flaws: Row[]; seller?: SellerInfo; videos?: Row[] }) {
  const router = useRouter();
  const db = supabaseBrowser();
  const [consultants, setConsultants] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { db.from("consultants").select("id, name").eq("active", true).order("sort").then(({ data }: { data: { id: string; name: string }[] | null }) => setConsultants(data || [])); }, [db]);
  const [depots, setDepots] = useState<Depot[]>([]);
  useEffect(() => { db.from("depots").select("id, name, suburb, state, postcode, hours, active").order("state").order("suburb").then(({ data }: { data: Depot[] | null }) => setDepots(data || [])); }, [db]);
  const [sales, setSales] = useState<{ id: number; title: string; mode: string }[]>([]);
  useEffect(() => { db.from("sales").select("id, title, mode").order("created_at", { ascending: false }).limit(50).then(({ data }: { data: { id: number; title: string; mode: string }[] | null }) => setSales(data || [])); }, [db]);
  const [f, setF] = useState<Row>({
    status: "draft", title: "", short_title: "", subtitle: "", category: "cars", vehicle_type: "car", backdrop: "sun", featured: false,
    start_price: 100, ...(lot || {}),
  });
  const [p, setP] = useState<Row>({ reserve_price: null, seller_name: "", seller_phone: "", seller_email: "", seller_address: "", seller_notes: "", pickup_notes: "", ...(priv || {}) });
  const [photos, setPhotos] = useState<Row[]>(initialPhotos);
  const [flaws, setFlaws] = useState<Row[]>(initialFlaws);
  const [vids, setVids] = useState<Row[]>(videos);
  const [vidProgress, setVidProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = lot?.id as number | undefined;
  const hasBids = Number(f.bid_count || 0) > 0;
  const verified = (Array.isArray(f.verified) ? f.verified : []) as string[];
  const toggleCheck = (k: string, on: boolean) => {
    const next = on ? [...new Set([...verified, k])] : verified.filter((x) => x !== k);
    setF({ ...f, verified: CHECK_KEYS.filter((x) => next.includes(x)), verified_at: new Date().toISOString() });
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setPriv = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });

  // Only fields that actually changed are saved, so an editor left open during an
  // auction can't overwrite the status, end time or price the bidding engine has moved on.
  const [base, setBase] = useState<Row>(() => normalize(lot || {}));
  function payload(extra: Row = {}) {
    const full = normalize(f);
    if (!id) return { ...full, ...extra };
    const changed: Row = {};
    for (const k of Object.keys(full)) if (k !== "updated_at" && JSON.stringify(full[k]) !== JSON.stringify(base[k])) changed[k] = full[k];
    delete changed.status;
    return { ...changed, updated_at: new Date().toISOString(), ...extra };
  }
  function normalize(f: Row) {
    const out: Row = {};
    const keys = ["status", "title", "short_title", "subtitle", "category", "vehicle_type", "backdrop", "featured", "year", "make", "model", "variant", "body", "engine", "transmission", "fuel", "odometer", "colour", "seats", "keys", "suburb", "state", "postcode", "take", "owner_note", "service_history", "known_faults", "roadworthy_note", "ppsr_clear", "ppsr_note", "visual_grade", "grade_paint", "grade_interior", "grade_tyres", "tyre_tread", "buy_now_price", "start_price", "starts_at", "ends_at",
      "vin", "registration", "engine_no", "rego_plate", "rego_state", "rego_expiry", "build_date", "compliance_date", "gvm_kg", "write_off_status", "stolen_clear", "ppsr_cert_no", "ppsr_checked_at", "video_url", "service_books", "consultant_id",
      "kind", "drive", "engine_cc", "hours", "licence_class", "lams", "berths", "length_m",
      "runs", "seller_type", "ev_battery_soh", "ev_battery_report", "sale_id", "verified", "verified_at", "inspected_at", "inspected_by", "inspection_summary", "method", "sale_order",
      "depot_id", "transport_fee", "statutory_warranty"];
    for (const k of keys) out[k] = f[k] === "" ? null : f[k];
    out.method = f.method === "tender" ? "tender" : "auction";
    out.sale_order = f.sale_order === "" || f.sale_order == null ? null : Number(f.sale_order);
    // in a live auction the closing time belongs to the auctioneer (and the estimate to the clock): never write it from here
    if (f.live_state) delete out.ends_at;
    for (const k of ["year", "odometer", "seats", "keys", "buy_now_price", "start_price", "gvm_kg", "engine_cc", "hours", "berths", "length_m", "ev_battery_soh", "sale_id"]) out[k] = f[k] === "" || f[k] == null ? (k === "start_price" ? 100 : null) : Number(f[k]);
    for (const k of ["stolen_clear", "service_books", "lams", "statutory_warranty"]) out[k] = f[k] === "" || f[k] == null ? null : f[k] === true || f[k] === "true";
    out.transport_fee = f.transport_fee === "" || f.transport_fee == null ? null : Math.round(Number(String(f.transport_fee).replace(/[^0-9.]/g, "")) * 100) / 100;
    out.write_off_status = f.write_off_status || "unknown";
    out.seller_type = f.seller_type || "private";
    out.verified = Array.isArray(f.verified) ? f.verified : [];
    if (out.vin) out.vin = String(out.vin).toUpperCase().replace(/\s/g, "");
    if (out.rego_plate) out.rego_plate = String(out.rego_plate).toUpperCase().replace(/[^A-Z0-9]/g, "");
    out.ppsr_clear = f.ppsr_clear === "" || f.ppsr_clear == null ? null : f.ppsr_clear === true || f.ppsr_clear === "true";
    out.featured = f.featured === true || f.featured === "true";
    out.updated_at = new Date().toISOString();
    return out;
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
    const checkedNow = JSON.stringify(normalize(f).verified) !== JSON.stringify(base.verified);
    const me = checkedNow ? (await db.auth.getSession()).data.session?.user.id || null : null;
    const privBody = { lot_id: lotId, ...(me ? { checked_by: me } : {}), reserve_price: p.reserve_price === "" || p.reserve_price == null ? null : Number(p.reserve_price), seller_name: p.seller_name || null, seller_phone: p.seller_phone || null, seller_email: p.seller_email || null, seller_address: p.seller_address || null, seller_notes: p.seller_notes || null, pickup_notes: p.pickup_notes || null };
    const { error: pe } = await db.from("lot_private").upsert(privBody);
    setBusy(false);
    if (pe) { setMsg({ kind: "bad", text: pe.message.includes("reserve_locked:") ? `Not saved: ${pe.message.split("reserve_locked:")[1]}.` : pe.message }); return null; }
    setF({ ...f, ...extra });
    setBase(normalize({ ...f, ...extra }));
    setMsg({ kind: "ok", text: okText });
    fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId }) }).catch(() => {});
    if (!id) router.replace(`/admin/lots/${lotId}`);
    else router.refresh();
    return lotId;
  }

  async function publish() {
    const missing = [["title", "Title"], ...(f.depot_id ? [] : [["suburb", "Suburb"], ["state", "State"]]), ["ends_at", "Auction end time"], ["visual_grade", "Visual grade"], ["vin", "VIN"], ["ppsr_checked_at", "PPSR search date"], ["year", "Year"], ["transmission", "Transmission"], ["fuel", "Fuel"], ["registration", "Registered or unregistered"],
      ...(f.registration === "registered" ? [["rego_plate", "Rego plate"], ["rego_state", "Rego state"], ["rego_expiry", "Rego expiry"]] : [])].filter(([k]) => !f[k]).map(([, l]) => l);
    if (!f.runs) missing.push("Starts and drives");
    if (!f.write_off_status || f.write_off_status === "unknown") missing.push("Write-off status");
    if (seller?.requireChecks !== false) {
      if (!f.depot_id) missing.push("Collection depot");
      if (f.transport_fee === "" || f.transport_fee == null) missing.push("Transport amount");
      if (f.statutory_warranty === "" || f.statutory_warranty == null) missing.push("Statutory warranty");
      if (!String(p.seller_address || "").trim()) missing.push("Pickup address (Seller, private)");
    }
    if (missing.length) { setMsg({ kind: "bad", text: `Before publishing, add: ${missing.join(", ")}.` }); return; }
    const todo = LISTING_CHECKS.filter(([k]) => !verified.includes(k)).map(([, label]) => label);
    if (todo.length) { setMsg({ kind: "bad", text: `Before publishing, check the listing against the vehicle: ${todo.join("; ")}.` }); return; }
    if (f.registration === "registered" && f.write_off_status === "statutory") { setMsg({ kind: "bad", text: "A statutory write-off can never be registered. List it as unregistered." }); return; }
    if (new Date(String(f.ends_at)).getTime() < Date.now() + 3600000) { setMsg({ kind: "bad", text: "The end time must be at least an hour away." }); return; }
    if (f.registration === "registered" && f.rego_expiry && String(f.rego_expiry) < new Date().toISOString().slice(0, 10)) { setMsg({ kind: "bad", text: "The registration has expired. Renew it, or list the vehicle as unregistered." }); return; }
    if (!photos.length && !confirm("This vehicle has no photos yet. Publish anyway?")) return;
    await save({ status: "live", starts_at: f.starts_at || new Date().toISOString(), ...(hasBids ? {} : { current_bid: Number(f.start_price || 100) }) }, "Published. It's live on the site.");
  }

  const liveVideos = vids.filter((v) => v.status === "pending" || v.status === "approved");
  const mediaUsed = photos.length + liveVideos.length;
  async function uploadPhotos(files: FileList | null) {
    if (!files || !id) return;
    const room = MEDIA_MAX - mediaUsed;
    if (room <= 0) { setMsg({ kind: "bad", text: "A listing can have 10 photos and videos in total. Delete one first." }); return; }
    if (files.length > room) setMsg({ kind: "bad", text: `Only ${room} more fit (10 photos and videos in total). The first ${room} were added.` });
    setBusy(true);
    let sort = photos.length;
    const added: Row[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      // redrawn first: the place the photo was taken (a phone records it) never reaches the listing
      let clean: Blob;
      try { clean = await cleanPhoto(file); } catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Couldn't prepare that photo." }); continue; }
      const path = `${id}/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage.from("lot-photos").upload(path, clean, { contentType: "image/jpeg" });
      if (error) { setMsg({ kind: "bad", text: `Upload failed: ${error.message}` }); continue; }
      const { data, error: ie } = await db.from("lot_photos").insert({ lot_id: id, path, angle: ANGLES[Math.min(sort, 3)], sort }).select("*").single();
      if (ie) { await db.storage.from("lot-photos").remove([path]); setMsg({ kind: "bad", text: ie.message.includes("media_limit") ? "A listing can have 10 photos and videos in total." : ie.message }); break; }
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

  // One video per listing, inside the 10. Staff uploads go straight onto the listing.
  async function uploadVideo(file: File | undefined) {
    if (!file || !id) return;
    if (!VIDEO_TYPES[file.type]) { setMsg({ kind: "bad", text: "Use an MP4, MOV or WebM video." }); return; }
    if (file.size > VIDEO_MAX) { setMsg({ kind: "bad", text: "Videos can be up to 250 MB." }); return; }
    setMsg(null); setVidProgress(0);
    try {
      const r1 = await fetch("/api/videos/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id, size: file.size, mime: file.type }) });
      const s1 = await r1.json();
      if (!r1.ok) throw new Error(s1.error || "Couldn't start the upload.");
      await new Promise<void>((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("PUT", s1.signedUrl);
        x.setRequestHeader("content-type", file.type);
        x.setRequestHeader("x-upsert", "false");
        if (env.supabaseAnonKey) x.setRequestHeader("apikey", env.supabaseAnonKey);
        x.upload.onprogress = (e) => { if (e.lengthComputable) setVidProgress(Math.round((e.loaded / e.total) * 100)); };
        x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("The upload didn't finish.")));
        x.onerror = () => reject(new Error("The upload didn't finish."));
        x.send(file);
      });
      const r2 = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id, path: s1.path, title: "Walkaround" }) });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || "Couldn't add the video.");
      const { data } = await db.from("lot_videos").select("*").eq("lot_id", id).in("status", ["pending", "approved"]);
      setVids(data || []);
      setMsg({ kind: "ok", text: "Video added. It's on the listing now." });
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Couldn't upload the video." });
    } finally {
      setVidProgress(null);
    }
  }
  async function removeVideo(v: Row) {
    if (!confirm("Remove this video from the listing?")) return;
    const r = await fetch(`/api/videos/${v.id}`, { method: "DELETE" });
    if (r.ok) setVids(vids.filter((x) => x.id !== v.id));
    else setMsg({ kind: "bad", text: "Couldn't remove the video." });
  }

  // Fill empty vehicle fields from our own free lookup (plate memory, learned VIN patterns, the VIN).
  const [vinMsg, setVinMsg] = useState("");
  async function fillFromVin() {
    setVinMsg("Looking it up…");
    const r = await fetch("/api/rego-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin: f.vin, plate: f.rego_plate, state: f.rego_state }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setVinMsg(d.error || "Couldn't look it up.");
    if (!d.found) return setVinMsg("Nothing found for this VIN yet. Enter the details; we'll learn them when it's published.");
    const v = d.vehicle || {};
    const next: Row = { ...f };
    const put = (k: string, x: unknown) => { if (x != null && x !== "" && (next[k] == null || next[k] === "")) next[k] = x; };
    put("year", v.year); put("make", v.make); put("model", v.model); put("variant", v.variant); put("body", v.body); put("colour", v.colour);
    put("fuel", v.fuel); put("transmission", v.transmission); put("drive", v.drive); put("engine", v.engine);
    if (v.category && !id) { next.category = v.category; next.vehicle_type = CAT[v.category]?.silhouette || next.vehicle_type; }
    put("kind", v.kind);
    setF(next);
    setVinMsg(`Filled in the empty fields (${(d.sources || []).join(", ")}). Check them against the papers.`);
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
    let clean: Blob;
    try { clean = await cleanPhoto(file); } catch (e) { setMsg({ kind: "bad", text: e instanceof Error ? e.message : "Couldn't prepare that photo." }); return; }
    const path = `${id}/flaws/${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from("lot-photos").upload(path, clean, { contentType: "image/jpeg" });
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
      {hasBids && <div className="notice">This lot has bids. The reserve can be lowered or removed but not raised. Any change to a key fact, the description or the damage list is shown on the listing as a correction, every bidder and watcher is told, and bidding is kept open for at least 24 hours.</div>}

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Listing</h2>
        {inp("title", "Title", { placeholder: "2009 Toyota Corolla Ascent" })}
        <div className="grid2">{inp("short_title", "Short title (big headline)", { placeholder: "2009 Toyota Corolla" })}{inp("subtitle", "One-line summary", { placeholder: "One owner. Every service stamped." })}</div>
        <div className="grid3">
          <label className="field"><span>Category</span><select className="input" value={String(f.category || "cars")} onChange={(e) => { const c = CAT[e.target.value]; setF({ ...f, category: e.target.value, vehicle_type: c.silhouette, kind: c.kinds.some(([k]) => k === f.kind) ? f.kind : null }); }}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
          <label className="field"><span>Type</span><select className="input" value={String(f.kind || "")} onChange={(e) => setF({ ...f, kind: e.target.value || null })}><option value="">–</option>{(CAT[String(f.category || "cars")]?.kinds || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span className="hint">Shown in search filters.</span></label>
          {sel("vehicle_type", "Silhouette (no photos yet)", VEHICLE_TYPES.map((v) => [v, v[0].toUpperCase() + v.slice(1)] as [string, string]))}
          {sel("backdrop", "Backdrop colour", BACKDROPS.map((b) => [b, b[0].toUpperCase() + b.slice(1)]))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{BACKDROPS.map((b) => <button key={b} type="button" onClick={() => setF({ ...f, backdrop: b })} aria-label={b} className={`bg-${b}`} style={{ width: 36, height: 36, borderRadius: 18, border: f.backdrop === b ? "3px solid var(--ink)" : "0" }} />)}</div>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={f.featured === true} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Feature as &quot;Lot of the week&quot; on the homepage</label>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Vehicle</h2>
        <div className="grid3">{inp("year", "Year", { inputMode: "numeric" })}{inp("make", "Make", { list: "make-list" })}{inp("model", "Model", { list: "model-list" })}</div>
        <datalist id="make-list">{makesFor(String(f.category || "")).map((m) => <option key={m} value={m} />)}</datalist>
        <datalist id="model-list">{modelsFor(String(f.make || ""), String(f.category || "")).map((m) => <option key={m} value={m} />)}</datalist>
        <p className="hint" style={{ marginTop: -6 }}>Pick the make and model from the list where you can, so they appear in search and saved-search alerts.</p>
        <div className="grid3">{inp("variant", "Variant")}{inp("body", "Body", { placeholder: "4-door sedan" })}{inp("engine", "Engine", { placeholder: "1.8L 4-cyl" })}</div>
        <div className="grid3">{sel("transmission", "Transmission", [["", "–"], ["Auto", "Auto"], ["Manual", "Manual"], ["Automated manual", "Automated manual"], ["CVT", "CVT"]])}{sel("fuel", "Fuel", [["", "–"], ["Petrol", "Petrol"], ["Diesel", "Diesel"], ["Hybrid", "Hybrid"], ["Electric", "Electric"], ["LPG", "LPG"]])}{inp("odometer", "Odometer (km)", { inputMode: "numeric" })}</div>
        <div className="grid3">{sel("drive", "Drive", [["", "–"], ["2WD", "2WD"], ["4WD", "4WD"], ["AWD", "AWD"]])}{inp("engine_cc", "Engine size (cc)", { inputMode: "numeric", placeholder: "Motorbikes: 689" })}{inp("hours", "Engine hours", { inputMode: "numeric", placeholder: "Boats and machinery" })}</div>
        <div className="grid3">
          {sel("licence_class", "Licence needed (trucks, buses)", [["", "–"], ...LICENCES])}
          <label className="field"><span>LAMS approved (motorbikes)</span><select className="input" value={f.lams == null ? "" : String(f.lams)} onChange={(e) => setF({ ...f, lams: e.target.value === "" ? null : e.target.value === "true" })}><option value="">–</option><option value="true">Yes</option><option value="false">No</option></select></label>
          <div className="grid2">{inp("berths", "Sleeps", { inputMode: "numeric" })}{inp("length_m", "Length (m)", { inputMode: "decimal" })}</div>
        </div>
        <div className="grid3">{inp("colour", "Colour")}{inp("seats", "Seats", { inputMode: "numeric" })}{inp("keys", "Keys", { inputMode: "numeric" })}</div>
        <div className="field" data-testid="depot-select"><span>Collection depot (shown on the listing)</span>
          <select className="input" value={String(f.depot_id || "")} onChange={(e) => { const d = depots.find((x) => x.id === e.target.value); setF({ ...f, depot_id: d?.id || null, ...(d ? { suburb: d.suburb, state: d.state, postcode: d.postcode } : {}) }); }}>
            <option value="">Choose the depot…</option>
            {depots.filter((d) => d.active !== false || d.id === f.depot_id).map((d) => <option key={d.id} value={d.id}>{d.name} · {d.suburb}, {d.state}{d.active === false ? " (inactive)" : ""}</option>)}
          </select>
          <span className="hint">Where our transport partner takes it after it&apos;s paid for, and where the buyer collects. The listing shows the depot&apos;s suburb, never the seller&apos;s. Add depots in <a className="blue" href="/admin/depots">Depots</a>.</span>
        </div>
        {f.depot_id
          ? <span className="hint" style={{ marginTop: -6 }} data-testid="depot-location">Shown on the listing: {String(f.suburb || "")}, {String(f.state || "")} {String(f.postcode || "")}.</span>
          : <div className="grid3">{inp("suburb", "Suburb (shown publicly)")}{sel("state", "State", [["", "–"], ...STATES.map((s) => [s, s] as [string, string])])}{inp("postcode", "Postcode")}</div>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Facts &amp; checks</h2>
        <p className="hint">These are the facts buyers can claim on (the ACCC fined Grays $10m for listings with the wrong year, transmission and missing damage). Check them against the rego papers and the PPSR certificate. Required before publishing.</p>
        <div className="grid3">
          {sel("registration", "Registration (required)", [["", "Choose…"], ["registered", "Registered"], ["unregistered", "Unregistered (sold without plates)"]])}
          {inp("vin", "VIN", { placeholder: "17 characters" })}{inp("engine_no", "Engine number", { placeholder: "On the certificate of sale" })}
        </div>
        <span className="hint" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="linkbtn" onClick={fillFromVin} disabled={String(f.vin || "").replace(/\s/g, "").length !== 17} data-testid="fill-from-vin">Fill in empty fields from the VIN ›</button>
          {f.registration !== "unregistered" && <a className="blue" href={rulesFor(String(f.rego_state || f.state || "QLD")).checkUrl} target="_blank" rel="noopener noreferrer">Check the rego free with {rulesFor(String(f.rego_state || f.state || "QLD")).authority} ›</a>}
          {vinMsg && <span>{vinMsg}</span>}
        </span>
        <div className="grid3">
          {inp("rego_plate", f.registration === "unregistered" ? "Previous rego plate (if any)" : "Rego plate")}
          {sel("rego_state", f.registration === "unregistered" ? "Previous rego state" : "Rego state", [["", "–"], ...STATES.map((s) => [s, s] as [string, string])])}
          {f.registration === "unregistered" ? <span className="hint" style={{ alignSelf: "center" }}>Buyers move it by carrier, trailer or permit. The certificate of sale is their record of ownership.</span>
            : <label className="field"><span>Rego expiry</span><input className="input" type="date" value={String(f.rego_expiry || "")} onChange={set("rego_expiry")} /></label>}
        </div>
        <div className="grid2">{inp("build_date", "Build date", { placeholder: "03/2009" })}{inp("compliance_date", "Compliance date", { placeholder: "05/2009" })}</div>
        <div className="grid3">
          {sel("write_off_status", "Write-off status (PPSR)", [["unknown", "Not checked yet"], ["none", "Not written off"], ["repairable", "Repairable write-off"], ["inspected", "Inspected write-off (VIC)"], ["statutory", "Statutory write-off"]])}
          <label className="field"><span>Stolen check (PPSR)</span><select className="input" value={f.stolen_clear == null ? "" : String(f.stolen_clear)} onChange={(e) => setF({ ...f, stolen_clear: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Not checked</option><option value="true">Not recorded as stolen</option><option value="false">Recorded as stolen: DO NOT LIST</option></select></label>
          {inp("gvm_kg", "GVM (kg, trucks)", { inputMode: "numeric" })}
        </div>
        <div className="grid3">
          {inp("ppsr_cert_no", "PPSR certificate number")}
          <label className="field"><span>PPSR searched on</span><input className="input" type="date" value={f.ppsr_checked_at ? String(f.ppsr_checked_at).slice(0, 10) : ""} onChange={(e) => setF({ ...f, ppsr_checked_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
          <label className="field"><span>Service books</span><select className="input" value={f.service_books == null ? "" : String(f.service_books)} onChange={(e) => setF({ ...f, service_books: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
        </div>
        <div className="grid3">
          {sel("seller_type", "Seller", [["private", "Private seller"], ["business", "Business seller (fleet, company, GST-registered)"]])}
          <label className="field"><span>Statutory warranty (required)</span><select className="input" value={f.statutory_warranty == null || f.statutory_warranty === "" ? "" : String(f.statutory_warranty)} onChange={(e) => setF({ ...f, statutory_warranty: e.target.value === "" ? null : e.target.value === "true" })} data-testid="statutory-warranty"><option value="">Choose…</option><option value="false">Doesn&apos;t apply to this sale</option><option value="true">Applies to this sale</option></select><span className="hint">Stated on the listing before bidding opens (Queensland requires it). A vehicle we sell at auction for its private owner generally has none.</span></label>
          {isElectrified(String(f.fuel || "")) && inp("ev_battery_soh", "Battery health (% state of health)", { inputMode: "numeric", placeholder: "e.g. 94" })}
          {isElectrified(String(f.fuel || "")) && inp("ev_battery_report", "Battery certificate link", { placeholder: "https://…" })}
        </div>
        <span className="hint" style={{ marginTop: -6 }}>Business sellers can mean extra consumer guarantees for Buy Now and offer sales. The seller&apos;s agreement sets this; change it only if it&apos;s wrong.</span>
        <div className="grid2">
          {inp("video_url", "External video link (optional, e.g. YouTube)", { placeholder: "https://…" })}
          <label className="field"><span>Consultant shown on the listing</span><select className="input" value={String(f.consultant_id || "")} onChange={(e) => setF({ ...f, consultant_id: e.target.value || null })}><option value="">Default consultant</option>{consultants.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <span className="hint">Add the listing&apos;s own video under Photos and video. Sellers&apos; videos are approved in <a className="blue" href="/admin/videos">Videos</a>.</span>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="listing-checks">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Checked against the vehicle</h2>
        <p className="hint">Tick each one only after checking it on the vehicle itself, at the walkaround. All are needed to publish. Buyers see them as verified by Tyrebiter, and your name is recorded. If you change a fact once it&apos;s live, the change is shown on the listing and sent to bidders and watchers, and bidding gets at least 24 more hours.</p>
        <label className="field" style={{ maxWidth: 420 }}><span>Starts and drives?</span><select className="input" value={String(f.runs || "")} onChange={(e) => setF({ ...f, runs: e.target.value || null })} data-testid="runs"><option value="">Choose…</option>{Object.entries(RUNS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LISTING_CHECKS.map(([k, label]) => (
            <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15 }}>
              <input type="checkbox" checked={verified.includes(k)} onChange={(e) => toggleCheck(k, e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} data-testid={`check-${k}`} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {verified.length > 0 && <span className="hint">{verified.length} of {LISTING_CHECKS.length} checked{f.verified_at ? ` · last changed ${new Date(String(f.verified_at)).toLocaleString("en-AU")}` : ""}.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Story</h2>
        {area("take", "Overview", "Two or three plain, factual sentences shown at the top of the listing: what it is, how it's equipped, what it suits. No hype, and nothing about condition the report doesn't support.")}
        {area("owner_note", "Seller's comments", "In the seller's words, with their permission.")}
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
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Photos and video</h2>
        {!id ? <p className="muted">Save the listing first, then add photos.</p> : (
          <>
            <span className="muted" data-testid="media-count">{mediaUsed} of {MEDIA_MAX} used: up to 10 photos and videos, one of them a video. The first photo is the cover; the video shows second.</span>
            <div className="grid2">
              <label className="drop" aria-disabled={mediaUsed >= MEDIA_MAX}><b>Add photos</b><span className="hint">Studio shots on their colour backdrop. The location the phone recorded is removed. Nothing that shows the seller&apos;s house, street or neighbours.</span><input type="file" multiple accept="image/*" hidden disabled={mediaUsed >= MEDIA_MAX} onChange={(e) => uploadPhotos(e.target.files)} /></label>
              {liveVideos.length === 0 ? (
                <label className="drop" aria-disabled={mediaUsed >= MEDIA_MAX || vidProgress != null}><b>{vidProgress != null ? `Uploading video… ${vidProgress}%` : "Add a video"}</b><span className="hint">One walkaround, MP4 (H.264) or MOV, up to 250 MB. Goes on the listing straight away, without the location the phone recorded.</span><input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" hidden disabled={mediaUsed >= MEDIA_MAX || vidProgress != null} onChange={(e) => uploadVideo(e.target.files?.[0])} data-testid="editor-video" /></label>
              ) : (
                <div className="soft" style={{ gap: 8 }}>
                  {liveVideos.map((v) => (
                    <div key={String(v.id)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {v.public_path ? <video src={videoUrl(String(v.public_path))} controls preload="metadata" style={{ width: "100%", borderRadius: 12, background: "#000", aspectRatio: "16 / 9" }} /> : null}
                      <span style={{ display: "flex", gap: 8, fontSize: 14 }}><b>Video</b><span className="muted">{VIDEO_STATUS[String(v.status)]}</span>{v.status === "pending" && <a className="blue" href="/admin/videos">Review ›</a>}<button className="linkbtn" style={{ color: "#B4123E", marginLeft: "auto" }} onClick={() => removeVideo(v)}>Remove</button></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
              {photos.map((ph, i) => (
                <div key={String(ph.id)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="photo" style={{ aspectRatio: "4/3" }}><img src={photoUrl(String(ph.path))} alt="" /></div>
                  <select className="input" style={{ height: 40, fontSize: 14 }} value={String(ph.angle || "")} onChange={(e) => updatePhoto(String(ph.id), { angle: e.target.value })}>{ANGLES.map((a) => <option key={a}>{a}</option>)}</select>
                  <input className="input" style={{ height: 40, fontSize: 13 }} placeholder="Photo credit (if not ours)" defaultValue={String(ph.credit || "")} onBlur={(e) => { if (e.target.value !== String(ph.credit || "")) void updatePhoto(String(ph.id), { credit: e.target.value || null }); }} aria-label="Photo credit" />
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
                  <select className="input" aria-label="Where on the vehicle" value={String(fl.zone || "")} onChange={(e) => updateFlaw(String(fl.id), { zone: e.target.value || null })} data-testid="flaw-zone">
                    <option value="">Where on the vehicle? (for the damage map)</option>{ZONES.map(([z, l]) => <option key={z} value={z}>{l}</option>)}
                  </select>
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
        <label className="field" style={{ maxWidth: 520 }} data-testid="transport-fee"><span>Transport to the depot ($, before GST)</span>
          <input className="input" inputMode="decimal" value={(f.transport_fee as string) ?? ""} onChange={set("transport_fee")} placeholder="From the transport quote" disabled={!["draft", "scheduled"].includes(String(f.status))} />
          <span className="hint">{["draft", "scheduled"].includes(String(f.status))
            ? "Our transport partner's quote to pick it up from the seller and take it to the depot. It's part of the buyer's premium (GST is added) and in every all-in price. Locked once bidding opens. Enter 0 if the seller is bringing it to the depot."
            : `Locked into the buyer's premium when bidding opened${f.fees && (f.fees as Row).transport != null ? `: ${money(Number((f.fees as Row).transport))}` : ""}.`}</span>
        </label>
        <div className="grid2">
          <label className="field"><span>Starts</span><input className="input" type="datetime-local" value={toLocal(f.starts_at)} onChange={(e) => setF({ ...f, starts_at: fromLocal(e.target.value) })} /><span className="hint">Leave empty to start when published.</span></label>
          {f.live_state
            ? <div className="field"><span>Ends</span><span className="hint" style={{ margin: 0 }}>In a live auction: offered {f.live_state === "waiting" ? "in its turn" : f.live_state === "open" ? "now" : "already"} by the auctioneer. The time on the listing is an estimate.</span></div>
            : <label className="field"><span>Ends</span><input className="input" type="datetime-local" value={toLocal(f.ends_at)} onChange={(e) => setF({ ...f, ends_at: fromLocal(e.target.value) })} /><span className="hint">{f.method === "tender" ? "Tenders close on time (no extensions)." : "Bids in the last 10 minutes extend it automatically."}</span></label>}
        </div>
        <div className="field"><span>How it&apos;s sold</span>
          <div className="chipset" data-testid="method-select">
            <button type="button" className={f.method !== "tender" ? "on" : ""} aria-pressed={f.method !== "tender"} onClick={() => setF({ ...f, method: "auction" })}>Auction</button>
            <button type="button" className={f.method === "tender" ? "on" : ""} aria-pressed={f.method === "tender"} onClick={() => setF({ ...f, method: "tender", buy_now_price: "" })} data-testid="method-tender">Tender (sealed offers)</button>
          </div>
          <span className="hint">{f.method === "tender" ? "Buyers put in one sealed amount each; the highest buys at that price when it closes, if it meets the reserve. No Buy Now. Can't change once there are tenders." : "A timed auction, or a live auction if it's in a live sale."}</span>
        </div>
        <label className="field" style={{ maxWidth: 420 }}><span>Part of a sale (optional)</span><select className="input" value={String(f.sale_id || "")} onChange={(e) => setF({ ...f, sale_id: e.target.value ? Number(e.target.value) : null })} data-testid="sale-select"><option value="">Not part of a sale</option>{sales.map((x) => <option key={x.id} value={x.id}>{x.title}{x.mode === "live" ? " (live auction)" : ""}</option>)}</select><span className="hint">Group a fleet&apos;s vehicles in one sale page, or put it in a live auction. Set up sales in <a className="blue" href="/admin/sale-events">Sales</a>.</span></label>
        {sales.find((x) => x.id === Number(f.sale_id))?.mode === "live" && inp("sale_order", "Order in the live auction (1 goes first)", { inputMode: "numeric" })}
        <div className="pill-row">{[3, 5, 7].map((d) => <button key={d} type="button" className="pill pill-soft" onClick={() => { const e = new Date(Date.now() + d * 86400000); e.setHours(19, 0, 0, 0); setF({ ...f, ends_at: e.toISOString() }); }}>{d} days, ends 7 pm</button>)}</div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="editor-inspection">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Mechanical inspection</h2>
        <p className="hint">There are no viewings: buyers never go to the seller&apos;s place. Bidders can order an inspection from our partner mechanic (Admin → Leads); we give the mechanic the address and arrange the time with the seller.</p>
        {p.pre_inspection_requested === true && <div className="notice" data-testid="pre-inspection-wanted">The seller asked for an inspection before listing (the fee comes out of the proceeds when it sells). Book the mechanic, then fill this in and upload the report.</div>}
        <div className="grid3">
          <label className="field"><span>Inspected on</span><input className="input" type="date" value={String(f.inspected_at || "").slice(0, 10)} onChange={(e) => setF({ ...f, inspected_at: e.target.value || null })} /></label>
          {inp("inspected_by", "Inspected by (mechanic or business)")}
        </div>
        {area("inspection_summary", "Inspection summary", "A few plain lines from the mechanic's report: what's good, what needs attention. Shown on the listing with an \"Inspected\" badge.")}
        {id && <ReportUpload lotId={id} current={(p.inspection_report_path as string) || null} />}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Seller (private)</h2>
        <p className="hint">Never shown to buyers, in any message or paperwork. Only our transport partner gets the pickup address and phone (to collect it once it&apos;s paid for), and our partner mechanic if a bidder orders an inspection. Questions from buyers come to us.</p>
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
        <label className="field"><span>Pickup address (where our transport partner collects it)</span><input className="input" value={(p.seller_address as string) ?? ""} onChange={setPriv("seller_address")} data-testid="pickup-address" /></label>
        <label className="field"><span>Pickup notes (for the driver)</span><input className="input" value={(p.pickup_notes as string) ?? ""} onChange={setPriv("pickup_notes")} placeholder="Gate code, where it's parked, best time to call" /></label>
        <label className="field"><span>Notes</span><textarea className="input" value={(p.seller_notes as string) ?? ""} onChange={setPriv("seller_notes")} /></label>
      </div>
      <div className="pill-row"><button className="btn btn-dark" disabled={busy} onClick={() => save()}>Save</button>{f.status === "draft" && id && <button className="btn btn-blue" disabled={busy} onClick={publish}>Publish</button>}</div>
    </>
  );
}

// The mechanic's report (PDF) for an inspected listing: uploaded through the server into a private bucket.
function ReportUpload({ lotId, current }: { lotId: number; current: string | null }) {
  const [msg, setMsg] = useState<string>(current ? "A report is uploaded." : "");
  const [busy, setBusy] = useState(false);
  async function up(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 15 * 1024 * 1024) { setMsg("Choose a PDF of 15 MB or less."); return; }
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.set("lotId", String(lotId)); fd.set("file", file);
    const res = await fetch("/api/admin/inspection-report", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Report uploaded. Members can read it from the listing." : data.error || "Couldn't upload it.");
  }
  return (
    <label className="field"><span>Mechanic&apos;s report (PDF)</span>
      <input className="input" type="file" accept="application/pdf" onChange={up} disabled={busy} data-testid="report-upload" />
      {msg && <span className="hint" role="status">{msg}</span>}
    </label>
  );
}
