"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, CAT, makesFor, modelsFor, type CategoryKey } from "@/lib/vehicles";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useViewer } from "@/components/Viewer";
import { CarArt } from "@/components/CarArt";
import { SignaturePad } from "@/components/SignaturePad";
import { expiryDate, normalizePlate, normalizeVin, REGO_STATES, vehicleLine, type RegoVehicle } from "@/lib/rego";
import { CONDITIONS, FUELS, OWNER_TYPES, PHOTO_MAX, QUESTIONS, SELL_WHEN, TRANSMISSIONS, WRITE_OFF, needsDetails, photoSlots, validateSell, wholeDollars, type Signature } from "@/lib/sellForm";
import { money } from "@/lib/format";

type Clause = [string, string, string[]];
type Found = { id: string | null; vehicle: RegoVehicle; sources: string[]; complete: boolean };
type Shot = { id: string; slot: string | null; url: string; path: string | null; status: "up" | "ok" | "bad"; src: Blob; note?: string };
type Fields = {
  category: CategoryKey; registration: "registered" | "unregistered"; rego: string; state: string; vin: string;
  year: string; make: string; model: string; variant: string; odometer: string; transmission: string; fuel: string; colour: string;
  condition: string; reserve_type: "" | "none" | "reserve"; reserve_amount: string;
  suburb: string; postcode: string; name: string; mobile: string; email: string; sell_when: string; owner_type: string; business: boolean; signed_name: string;
};

const SOURCE: Record<string, string> = { "our records": "our records", vin: "the VIN" };
// The mobile app keeps a copy of this (mobile/src/app/appraisal.tsx); keep them in step.
export const sourceLine = (sources: string[]) => `From ${[...new Set(sources.map((x) => SOURCE[x] || x))].join(" and ")}`;

const BLANK: Fields = {
  category: "cars", registration: "registered", rego: "", state: "", vin: "", year: "", make: "", model: "", variant: "", odometer: "",
  transmission: "", fuel: "", colour: "", condition: "", reserve_type: "", reserve_amount: "", suburb: "", postcode: "", name: "", mobile: "", email: "",
  sell_when: "now", owner_type: "individual", business: false, signed_name: "",
};
const BLANK_D: Record<string, string> = { write_off: "none", keys: "2", service_books: "no" };
const DRAFT = "tb-sell-draft-v1";
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// The six parts of the form, the answers each one owns (for the progress list and "fix this" jumps) and its colour.
const PARTS: { id: string; title: string; colour: string; owns: (k: string) => boolean }[] = [
  { id: "sf-vehicle", title: "The vehicle", colour: "tangerine", owns: (k) => ["rego", "state", "vin", "year", "make", "model", "odometer"].includes(k) },
  { id: "sf-condition", title: "Condition", colour: "sun", owns: (k) => k === "condition" || k === "disclosures" || k.startsWith("q_") },
  { id: "sf-photos", title: "Photos", colour: "lime", owns: (k) => k === "photos" },
  { id: "sf-reserve", title: "Reserve", colour: "sky", owns: (k) => k === "reserve_type" || k === "reserve_amount" },
  { id: "sf-you", title: "About you", colour: "lilac", owns: (k) => ["name", "mobile", "email", "suburb", "postcode"].includes(k) },
  { id: "sf-sign", title: "Read and sign", colour: "grape", owns: (k) => ["agree", "owner", "signed_name", "signature"].includes(k) },
];

const rand = () => Math.random().toString(36).slice(2, 10);

/** Shrinks a phone photo before it's sent (long side 2048 px, JPEG), so a form full of photos uploads quickly on 4G. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.86));
    if (out && out.size > 0) return out;
  } catch { /* the browser can't read it (HEIC outside Safari): send the original if it's a photo we accept */ }
  return file;
}

// Sell your vehicle: one form, top to bottom. What it is (the plate or VIN fills in what we can), how it's going,
// guided photos laid out exactly like the listing will show them, reserve or no reserve, how to reach them, then the
// Seller Agency Agreement to read, tick and sign with a finger. Checked here and again on the server (validateSell).
export function SellForm({ clauses, phone }: { clauses: Clause[]; phone: string }) {
  const v = useViewer();
  const [f, setF] = useState<Fields>(BLANK);
  const [d, setDState] = useState<Record<string, string>>(BLANK_D);
  const [found, setFound] = useState<Found | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookMsg, setLookMsg] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [photoNote, setPhotoNote] = useState("");
  const [sig, setSig] = useState<Signature | null>(null);
  const [noDraw, setNoDraw] = useState(false);
  const [read, setRead] = useState(false);
  const [agree, setAgree] = useState(false);
  const [owner, setOwner] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErrs, setServerErrs] = useState<Record<string, string>>({});
  const [sendErr, setSendErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [done, setDone] = useState<{ ref: string; first: string; email: string; emailed: boolean; reserve: boolean } | null>(null);
  const folder = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const termsRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  const set = <K extends keyof Fields>(k: K, val: Fields[K]) => { setF((x) => ({ ...x, [k]: val })); setServerErrs({}); };
  const setD = (k: string, val: string) => { setDState((x) => ({ ...x, [k]: val })); setServerErrs({}); };
  const cat = CAT[f.category];
  const usage = cat.usage;
  const slots = useMemo(() => photoSlots(f.category), [f.category]);

  // A half-finished form survives a reload or a lost signal (the words only: never the photos or the signature).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT);
      if (raw) {
        const saved = JSON.parse(raw) as { f?: Partial<Fields>; d?: Record<string, string>; at?: number };
        if (saved.at && Date.now() - saved.at < 14 * 86400_000 && saved.f) {
          setF((x) => ({ ...x, ...saved.f, category: saved.f?.category && CAT[saved.f.category] ? saved.f.category : x.category, signed_name: "" }));
          if (saved.d) setDState((x) => ({ ...x, ...saved.d }));
          setRestored(true);
        }
      }
    } catch { /* no storage here: start fresh */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || done) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT, JSON.stringify({ f: { ...f, signed_name: "" }, d, at: Date.now() })); } catch { /* fine */ }
    }, 600);
    return () => clearTimeout(t);
  }, [f, d, done]);

  // Members get their details filled in (only into empty boxes).
  useEffect(() => {
    const p = v.profile;
    if (!v.ready || !p) return;
    setF((x) => ({
      ...x,
      name: x.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
      mobile: x.mobile || p.mobile || "", email: x.email || v.user?.email || "",
      suburb: x.suburb || p.suburb || "", postcode: x.postcode || p.postcode || "",
      state: x.state || (p.state && (REGO_STATES as readonly string[]).includes(p.state) ? p.state : ""),
    }));
  }, [v.ready, v.profile, v.user?.email]);

  // Photo previews are local copies; let them go when the form does.
  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);
  useEffect(() => () => { for (const s of shotsRef.current) URL.revokeObjectURL(s.url); }, []);

  // The agreement must be scrolled to the end before it can be ticked.
  const checkRead = () => {
    const b = termsRef.current;
    if (b && b.scrollTop + b.clientHeight >= b.scrollHeight - 32) setRead(true);
  };
  useEffect(() => {
    const b = termsRef.current;
    if (b && b.scrollHeight <= b.clientHeight + 32) setRead(true);
  }, []);

  // ---- Plate / VIN lookup (our own records and the VIN itself; Australian sources only, free).
  async function lookup() {
    setLookMsg(""); setFound(null);
    const p = normalizePlate(f.rego), vn = normalizeVin(f.vin);
    if (f.registration === "registered" && !p) return setLookMsg("Enter the plate first.");
    if (!f.state) return setLookMsg("Choose the state first.");
    if (vn && vn.length !== 17) return setLookMsg("A VIN is 17 letters and numbers. For an older chassis number, fill in the details yourself.");
    if (f.registration === "unregistered" && !vn) return setLookMsg("Enter the VIN, or fill in the details yourself.");
    setLooking(true);
    const res = await fetch("/api/rego-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plate: f.registration === "registered" ? p : "", state: f.state, vin: vn }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setLooking(false);
    if (!res || !res.ok) return setLookMsg(data.error || "We couldn't look it up just now. Fill in the details below.");
    if (!data.found) return setLookMsg(vn ? "We couldn't fill this in from the VIN. Fill in the details below." : `We don't have ${p} on record yet. Add the VIN to fill in more, or fill in the details below.`);
    const fv = data.vehicle as RegoVehicle;
    setFound({ id: data.id, vehicle: fv, sources: data.sources || [], complete: !!data.complete });
    setF((x) => ({
      ...x,
      category: fv.category && CAT[fv.category as CategoryKey] ? (fv.category as CategoryKey) : x.category,
      year: fv.year ? String(fv.year) : x.year, make: fv.make || x.make, model: fv.model || x.model, variant: fv.variant || x.variant,
      transmission: fv.transmission && TRANSMISSIONS.some(([k]) => k === fv.transmission) ? fv.transmission : x.transmission,
      fuel: fv.fuel && FUELS.includes(fv.fuel) ? fv.fuel : x.fuel, colour: fv.colour || x.colour,
    }));
    if (fv.regoExpiry) setD("rego_expiry", String(fv.regoExpiry).slice(0, 10));
  }

  // ---- Photos: each one is shrunk and uploaded as soon as it's chosen, so sending the form is instant.
  async function upload(id: string, src: Blob) {
    setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "up", note: undefined } : x)));
    const blob = src instanceof File ? await shrink(src) : src;
    const type = blob.type || "image/jpeg";
    if (!PHOTO_TYPES.includes(type) || blob.size > 12 * 1024 * 1024) {
      setShots((s) => s.map((x) => (x.id === id ? { ...x, status: "bad", note: "This file isn't a photo we can use, or it's too big." } : x)));
      return;
    }
    if (!folder.current) folder.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${rand()}`;
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type.includes("hei") ? "heic" : "jpg";
    const path = `${folder.current}/${Date.now()}-${rand()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from("appraisal-photos").upload(path, blob, { contentType: type });
    setShots((s) => s.map((x) => (x.id === id ? { ...x, status: error ? "bad" : "ok", path: error ? null : path, src: blob, note: error ? "Didn't upload." : undefined } : x)));
  }

  function addPhotos(list: File[], slot?: string | null) {
    setPhotoNote("");
    const files = list.filter((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(x.name));
    if (!files.length) { if (list.length) setPhotoNote("Choose photos (JPG, PNG or HEIC)."); return; }
    let next = [...shots];
    const started: Shot[] = [];
    for (const file of files) {
      const target = slot !== undefined && !started.length ? slot : (slots.find(([k]) => !next.some((s) => s.slot === k))?.[0] ?? null);
      const replaced = target ? next.find((s) => s.slot === target) : undefined;
      if (replaced) { URL.revokeObjectURL(replaced.url); next = next.filter((s) => s !== replaced); }
      if (next.length >= PHOTO_MAX) { setPhotoNote(`That's the most we take here (${PHOTO_MAX}). Remove one to add another.`); break; }
      const shot: Shot = { id: rand(), slot: target, url: URL.createObjectURL(file), path: null, status: "up", src: file };
      next.push(shot);
      started.push(shot);
    }
    setShots(next);
    setServerErrs({});
    for (const s of started) void upload(s.id, s.src);
  }
  function removeShot(id: string) {
    setShots((s) => { const gone = s.find((x) => x.id === id); if (gone) URL.revokeObjectURL(gone.url); return s.filter((x) => x.id !== id); });
  }

  // Photos in the order buyers will see them: the guided shots first (the front corner is the cover), then the rest.
  const ordered = useMemo(() => [
    ...slots.map(([k]) => shots.find((s) => s.slot === k)).filter((s): s is Shot => !!s),
    ...shots.filter((s) => !s.slot),
  ], [shots, slots]);

  const body = {
    ...f, rego: f.registration === "registered" ? normalizePlate(f.rego) : "", vin: normalizeVin(f.vin), disclosures: d,
    photos: ordered.filter((s) => s.status === "ok" && s.path).map((s) => s.path as string),
    signature: noDraw ? null : sig, no_draw: noDraw, agree, owner, lookupId: found?.id || null,
  };
  // Checked as they go (for the progress list); the messages only show after the first "Sign and send".
  const live = validateSell({ ...body, photos: ordered.filter((s) => s.status !== "bad").map((s) => s.path || "x/pending.jpg") }, { requireSignature: !noDraw });
  const errs: Record<string, string> = tried ? { ...live.errors, ...serverErrs } : serverErrs;
  const partDone = (owns: (k: string) => boolean) => !Object.keys(live.errors).some(owns);
  const left = PARTS.filter((p) => !partDone(p.owns)).length;

  function jumpToFirstError() {
    setTimeout(() => {
      const el = formRef.current?.querySelector(".errmsg, .sf-miss");
      (el?.closest(".field, .sf-q, .sf-block") || el)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTried(true); setServerErrs({}); setSendErr("");
    if (shots.some((s) => s.status === "up")) { setSendErr("Your photos are still uploading. Give them a few seconds, then press Sign and send again."); return; }
    const check = validateSell(body, { requireSignature: !noDraw });
    if (Object.keys(check.errors).length) { jumpToFirstError(); return; }
    setBusy(true);
    const res = await fetch("/api/sell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) {
      if (data.errors) { setServerErrs(data.errors); jumpToFirstError(); }
      else setSendErr(data.error || "We couldn't send your form. Check your connection and try again.");
      return;
    }
    try { localStorage.removeItem(DRAFT); } catch { /* fine */ }
    setDone({ ref: data.ref, first: f.name.trim().split(/\s+/)[0], email: f.email.trim(), emailed: !!data.emailed, reserve: f.reserve_type === "reserve" });
    setTimeout(() => document.getElementById("appraisal")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function startAgain() {
    try { localStorage.removeItem(DRAFT); } catch { /* fine */ }
    setF(BLANK); setDState(BLANK_D); setFound(null); setRestored(false); setTried(false);
  }

  if (done) {
    return (
      <div className="sf-done" data-testid="sell-done">
        <span className="tag" style={{ background: "var(--ink)", color: "var(--lime)", alignSelf: "flex-start" }}>Reference {done.ref}</span>
        <h2 className="d3">Signed and sent, {done.first}.</h2>
        <p className="sf-done-lede">{done.emailed ? <>A copy of what you signed is on its way to <b>{done.email}</b>.</> : <>We&apos;ve got your form. We&apos;ll email you a copy of what you signed.</>}</p>
        <ol className="sf-next">
          <li><b>We call you within 1 business day</b> with a price guide{done.reserve ? " and to talk through your reserve" : " and to confirm you're happy with no reserve"}.</li>
          <li><b>You verify your ID.</b> We text you a link: about 2 minutes in your browser, plus a photo of the rego papers and the account we pay you into.</li>
          <li><b>We photograph it at your place</b>, then it goes live for 7 days to buyers across Australia.</li>
        </ol>
        <div className="pill-row"><Link className="btn btn-dark" href="/auctions">Browse auctions</Link><Link className="btn" style={{ background: "#FFFFFF" }} href="/seller-agreement">Read the agreement again</Link></div>
      </div>
    );
  }

  const err = (k: string) => (errs[k] ? <span className="errmsg" id={`e-${k}`}>{errs[k]}</span> : null);
  const input = (k: keyof Fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: React.ReactNode) => (
    <label className="field"><span>{label}</span>
      <input className={`input${errs[k] ? " err" : ""}`} value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!errs[k]} aria-describedby={errs[k] ? `e-${k}` : undefined} data-testid={`sell-${k}`} {...props} />
      {hint && <span className="hint">{hint}</span>}
      {err(k)}
    </label>
  );
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void lookup(); } };
  const title = [f.year, f.make, f.model].filter(Boolean).join(" ");
  const cover = ordered[0]?.url;
  const kmNum = wholeDollars(f.odometer);
  const reserveNum = wholeDollars(f.reserve_amount);

  return (
    <div className="sf-grid">
      <form ref={formRef} className="sf" onSubmit={submit} noValidate data-testid="sell-form">
        <div className="sf-intro">
          <h2 className="d3">Sell your vehicle.</h2>
          <p className="muted">About 10 minutes. Six short parts, then you sign at the bottom. Nothing goes live until we&apos;ve called you and you&apos;ve verified your ID.</p>
          {restored && <div className="notice" role="status">We kept what you typed last time (not the photos or signature). <button type="button" className="linkbtn" onClick={startAgain}>Start again</button></div>}
        </div>

        {/* 1. The vehicle */}
        <Part n={1} id="sf-vehicle" title="What are you selling?" colour="tangerine" done={partDone(PARTS[0].owns)}>
          <div className="sf-types" role="group" aria-label="Type of vehicle">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" aria-pressed={f.category === c.key} className={`sf-type${f.category === c.key ? " on" : ""}`} onClick={() => set("category", c.key)} data-testid={`sell-cat-${c.key}`}>
                <span className={`stage bg-${c.backdrop}`}><CarArt type={c.silhouette} /></span>
                <span className="sf-type-l">{c.short}</span>
              </button>
            ))}
          </div>

          <div className="seg" role="group" aria-label="Registration">
            {(["registered", "unregistered"] as const).map((r) => (
              <button key={r} type="button" className={f.registration === r ? "on" : ""} aria-pressed={f.registration === r} onClick={() => { set("registration", r); setFound(null); setLookMsg(""); }} data-testid={`sell-reg-${r}`}>
                {r === "registered" ? "Registered" : "Unregistered"}
              </button>
            ))}
          </div>
          {f.registration === "unregistered" && <p className="hint" style={{ margin: 0 }}>Sold without plates. Buyers can&apos;t drive it away; they arrange transport or an unregistered vehicle permit.</p>}

          <div className={f.registration === "registered" ? "platerow" : ""}>
            {f.registration === "registered" && (
              <label className="field"><span>Number plate</span>
                <input className={`input plate${errs.rego ? " err" : ""}`} value={f.rego} onChange={(e) => { set("rego", e.target.value.toUpperCase()); setFound(null); }} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={10} aria-invalid={!!errs.rego} onKeyDown={enter} data-testid="sell-plate" />
                {err("rego")}
              </label>
            )}
            <label className="field"><span>{f.registration === "registered" ? "State" : "State it's in"}</span>
              <select className={`input${errs.state ? " err" : ""}`} value={f.state} onChange={(e) => { set("state", e.target.value); setFound(null); }} aria-invalid={!!errs.state} data-testid="sell-state">
                <option value="" disabled>State</option>{REGO_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
              {err("state")}
            </label>
          </div>
          <label className="field"><span>{f.registration === "registered" ? "VIN (optional, fills in more)" : "VIN or chassis number"}</span>
            <input className={`input vin${errs.vin ? " err" : ""}`} value={f.vin} onChange={(e) => { set("vin", e.target.value.toUpperCase()); setFound(null); }} placeholder="17 letters and numbers" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={20} onKeyDown={enter} data-testid="sell-vin" />
            <span className="hint">On the rego papers, and on a plate at the bottom of the windscreen or inside the driver&apos;s door.</span>
            {err("vin")}
          </label>
          <div className="pill-row">
            <button type="button" className="btn btn-dark" style={{ height: 50 }} disabled={looking} onClick={lookup} data-testid="sell-lookup">{looking ? "Looking it up…" : "Fill in the details for me"}</button>
            <span className="hint">Or type them below.</span>
          </div>
          {lookMsg && <div className="notice" role="status">{lookMsg}</div>}
          {found && (
            <div className="found ok" data-testid="sell-found">
              <span className="eyebrow" style={{ margin: 0, fontSize: 14 }}>{sourceLine(found.sources)}{found.vehicle.test ? " · test data" : ""}</span>
              <b style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{found.vehicle.description}</b>
              {vehicleLine(found.vehicle) && <span>{vehicleLine(found.vehicle)}</span>}
              <span className="muted" style={{ fontSize: 14 }}>{[found.vehicle.vinEnding ? `VIN ending ${found.vehicle.vinEnding}` : null, found.vehicle.country ? `Made in ${found.vehicle.country}` : null, found.vehicle.regoExpiry ? `Rego expires ${expiryDate(found.vehicle.regoExpiry)}` : null].filter(Boolean).join(" · ")}</span>
              <span style={{ fontSize: 14 }}>{found.complete ? "Check what we filled in below and fix anything that's wrong." : "We've filled in what we could. Add the rest below."}</span>
            </div>
          )}

          <div className="row3">
            {input("year", "Year", { inputMode: "numeric", maxLength: 4, placeholder: "2018" })}
            {input("make", "Make", { list: "sf-makes", autoComplete: "off", placeholder: "Toyota" })}
            {input("model", "Model", { list: "sf-models", autoComplete: "off", placeholder: "HiLux" })}
          </div>
          <datalist id="sf-makes">{makesFor(f.category).map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="sf-models">{modelsFor(f.make, f.category).map((x) => <option key={x} value={x} />)}</datalist>
          {input("variant", "Variant or badge (optional)", { placeholder: "SR5 (4x4)", autoComplete: "off" })}
          <div className="sf-row3">
            <label className="field"><span>Transmission</span><select className="input" value={f.transmission} onChange={(e) => set("transmission", e.target.value)} data-testid="sell-transmission"><option value="">Not sure</option>{TRANSMISSIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>Fuel</span><select className="input" value={f.fuel} onChange={(e) => set("fuel", e.target.value)} data-testid="sell-fuel"><option value="">Not sure</option>{FUELS.map((x) => <option key={x}>{x}</option>)}</select></label>
            {input("colour", "Colour", { placeholder: "White", autoComplete: "off" })}
          </div>
          <div className="row2">
            {usage !== "none" ? (
              <label className="field"><span>{usage === "hours" ? "Hours on the meter" : "Kilometres"}</span>
                <span className={`sf-unit${errs.odometer ? " err" : ""}`}>
                  <input className="input" value={f.odometer} onChange={(e) => set("odometer", e.target.value.replace(/[^\d,]/g, ""))} inputMode="numeric" placeholder={usage === "hours" ? "1,250" : "142,000"} aria-invalid={!!errs.odometer} data-testid="sell-odometer"
                    onBlur={() => { const n = wholeDollars(f.odometer); if (n != null) set("odometer", n.toLocaleString("en-AU")); }} />
                  <span aria-hidden="true">{usage === "hours" ? "hrs" : "km"}</span>
                </span>
                <span className="hint">As shown on the {usage === "hours" ? "hour meter" : "dash"} today.</span>
                {err("odometer")}
              </label>
            ) : <span />}
            {f.registration === "registered" && (
              <label className="field"><span>Rego expires (if you know it)</span><input className="input" type="date" value={d.rego_expiry || ""} onChange={(e) => setD("rego_expiry", e.target.value)} data-testid="sell-rego-expiry" /></label>
            )}
          </div>
        </Part>

        {/* 2. Condition */}
        <Part n={2} id="sf-condition" title="How is it going?" colour="sun" done={partDone(PARTS[1].owns)}
          sub="Buyers see these answers, and you're responsible for them. Being upfront sells: buyers bid more when there are no surprises.">
          <div className={`sf-conds${errs.condition ? " sf-miss" : ""}`} role="group" aria-label="Overall condition">
            {CONDITIONS.map(([k, label, desc]) => (
              <button key={k} type="button" aria-pressed={f.condition === k} className={`sf-cond${f.condition === k ? " on" : ""}`} onClick={() => set("condition", k)} data-testid={`sell-cond-${k}`}>
                <b>{label}</b><span>{desc}</span>
              </button>
            ))}
          </div>
          {err("condition")}

          <div className="sf-qs">
            {QUESTIONS.map(([k, q, dk]) => {
              const a = d[k] || "";
              const miss = tried && !a;
              return (
                <div key={k} className={`sf-q${miss ? " sf-miss" : ""}`}>
                  <div className="sf-qrow">
                    <span className="sf-qt" id={`q-${k}`}>{q}</span>
                    <div className="sf-yn" role="group" aria-labelledby={`q-${k}`}>
                      {(["no", "yes"] as const).map((x) => (
                        <button key={x} type="button" aria-pressed={a === x} className={a === x ? "on" : ""} onClick={() => setD(k, x)} data-testid={`sell-q-${k}-${x}`}>{x === "yes" ? "Yes" : "No"}</button>
                      ))}
                    </div>
                  </div>
                  {k === "finance" && a === "yes" && (
                    <div className="sf-sub">
                      <div className="row2">
                        <label className="field"><span>Roughly how much is owing?</span><span className="money-in"><i aria-hidden="true">$</i><input className="input" inputMode="numeric" value={d.finance_amount || ""} onChange={(e) => setD("finance_amount", e.target.value)} placeholder="12,000" data-testid="sell-finance-amount" /></span></label>
                        <label className="field"><span>Who is it with?</span><input className="input" value={d.lender_name || ""} onChange={(e) => setD("lender_name", e.target.value)} placeholder="Bank or lender" /></label>
                      </div>
                      <span className="hint">That&apos;s fine: we pay your lender out of the sale price first so the buyer gets clear title, and you get the rest.</span>
                    </div>
                  )}
                  {dk && needsDetails(k, a) && (
                    <div className="sf-sub">
                      <textarea className={`input${errs[`q_${k}`] ? " err" : ""}`} rows={2} maxLength={500} value={d[dk] || ""} onChange={(e) => setD(dk, e.target.value)} data-testid={`sell-q-${k}-details`}
                        placeholder={k === "runs" ? "What happens when you try? (flat battery, won't turn over…)" : k === "previous_use" ? "How was it used, and for how long?" : k === "recalls" ? "Which recall, and is it booked in?" : k === "warning_lights" ? "Which lights?" : "Tell buyers what happened and what was fixed"} />
                      {err(`q_${k}`)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {errs.disclosures && <span className="errmsg">{errs.disclosures}</span>}

          <div className="sf-row3">
            <label className="field"><span>Write-off history</span><select className="input" value={d.write_off} onChange={(e) => setD("write_off", e.target.value)} data-testid="sell-write-off">{WRITE_OFF.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>Keys</span><select className="input" value={d.keys} onChange={(e) => setD("keys", e.target.value)}>{["0", "1", "2", "3", "4"].map((x) => <option key={x} value={x}>{x === "4" ? "4 or more" : x}</option>)}</select></label>
            <label className="field"><span>Service books</span><select className="input" value={d.service_books} onChange={(e) => setD("service_books", e.target.value)}><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div>
          {d.write_off === "statutory" && <div className="notice">A statutory write-off can only be sold unregistered, for parts or scrap, and never re-registered. We&apos;ll list it that way.</div>}
          <label className="field"><span>Anything else a buyer should know? (optional)</span>
            <textarea className="input" maxLength={1000} value={d.known_faults || ""} onChange={(e) => setD("known_faults", e.target.value)} placeholder="Air-con needs a regas, small oil leak, rear tyres worn, new timing belt at 120,000 km…" data-testid="sell-known-faults" />
          </label>
        </Part>

        {/* 3. Photos, laid out exactly like the listing gallery */}
        <Part n={3} id="sf-photos" title="Add a few photos." colour="lime" done={partDone(PARTS[2].owns)}
          sub="Phone photos are perfect: they help us give you a sharper price guide. We take the professional photos for the listing when we visit.">
          <div className={`sf-shots n${Math.min(5, Math.max(1, slots.length))}${errs.photos ? " sf-miss" : ""}`} aria-label="Your photos, laid out the way your listing shows them">
            {slots.map(([k, label, hint], i) => {
              const s = shots.find((x) => x.slot === k);
              return (
                <div key={k} className={`sf-shot t${i}${s ? " has" : ""}`} data-testid={`sell-shot-${k}`}>
                  {s ? (
                    <>
                      <img src={s.url} alt={label} />
                      {s.status === "up" && <span className="sf-shot-state">Uploading…</span>}
                      {s.status === "bad" && <span className="sf-shot-state bad">{s.note || "Didn't upload."} <button type="button" onClick={() => upload(s.id, s.src)}>Try again</button></span>}
                      <span className="sf-shot-acts">
                        <label className="sf-mini">Replace<input type="file" accept="image/*" className="sr-only" onChange={(e) => { addPhotos(Array.from(e.target.files || []), k); e.target.value = ""; }} /></label>
                        <button type="button" className="sf-mini" onClick={() => removeShot(s.id)} aria-label={`Remove the ${label.toLowerCase()} photo`}>Remove</button>
                      </span>
                      {i === 0 && <span className="sf-cover-tag">Cover photo</span>}
                    </>
                  ) : (
                    <label className="sf-empty">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                      <b>{label}</b>
                      <span>{i === 0 ? `${hint} This is your cover photo.` : hint}</span>
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { addPhotos(Array.from(e.target.files || []), k); e.target.value = ""; }} data-testid={`sell-shot-${k}-input`} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {shots.some((s) => !s.slot) && (
            <div className="sf-extras" aria-label="More photos">
              {shots.filter((s) => !s.slot).map((s) => (
                <div key={s.id} className="sf-extra">
                  <img src={s.url} alt="Extra photo" />
                  {s.status === "up" && <span className="sf-shot-state">…</span>}
                  {s.status === "bad" && <span className="sf-shot-state bad"><button type="button" onClick={() => upload(s.id, s.src)}>Retry</button></span>}
                  <button type="button" className="sf-x" onClick={() => removeShot(s.id)} aria-label="Remove this photo">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="pill-row">
            <label className={`btn btn-soft${shots.length >= PHOTO_MAX ? " disabled" : ""}`} style={{ height: 48, fontSize: 15, cursor: "pointer" }}>
              {shots.length ? "Add more photos" : "Choose photos"}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={shots.length >= PHOTO_MAX} onChange={(e) => { addPhotos(Array.from(e.target.files || [])); e.target.value = ""; }} data-testid="sell-photos-input" />
            </label>
            <span className="hint" data-testid="sell-photo-count">{shots.length} of {PHOTO_MAX} photos{shots.some((s) => s.status === "up") ? " · uploading" : ""}</span>
          </div>
          {photoNote && <div className="notice" role="status">{photoNote}</div>}
          {err("photos")}
        </Part>

        {/* 4. Reserve */}
        <Part n={4} id="sf-reserve" title="Reserve or no reserve?" colour="sky" done={partDone(PARTS[3].owns)}>
          <div className={`sf-reserve${errs.reserve_type ? " sf-miss" : ""}`} role="group" aria-label="Reserve">
            <button type="button" aria-pressed={f.reserve_type === "none"} className={`sf-ropt${f.reserve_type === "none" ? " on bg-lime" : ""}`} onClick={() => set("reserve_type", "none")} data-testid="sell-reserve-none">
              <b>No reserve</b>
              <span>It sells to the highest bidder when the auction ends, whatever the price. No-reserve listings get the most bidders.</span>
            </button>
            <button type="button" aria-pressed={f.reserve_type === "reserve"} className={`sf-ropt${f.reserve_type === "reserve" ? " on bg-sky" : ""}`} onClick={() => set("reserve_type", "reserve")} data-testid="sell-reserve-set">
              <b>Set a reserve</b>
              <span>The lowest price you&apos;ll accept. If bidding ends below it, we send you the top bid and you decide.</span>
            </button>
          </div>
          {err("reserve_type")}
          {f.reserve_type === "reserve" && (
            <label className="field"><span>Your reserve</span>
              <span className={`moneyin${errs.reserve_amount ? " err" : ""}`}><span className="muted">$</span>
                <input inputMode="numeric" value={f.reserve_amount} onChange={(e) => set("reserve_amount", e.target.value.replace(/[^\d,]/g, ""))} onBlur={() => { const n = wholeDollars(f.reserve_amount); if (n != null) set("reserve_amount", n.toLocaleString("en-AU")); }}
                  placeholder="25,000" aria-invalid={!!errs.reserve_amount} data-testid="sell-reserve-amount" />
              </span>
              <span className="hint">Kept secret from bidders. You can lower it any time, but not raise it once bidding starts. Not sure? Put your best guess: your consultant talks it through with you before anything goes live.</span>
              {err("reserve_amount")}
            </label>
          )}
          <SoldGuide make={f.make} model={f.model} year={f.year} />
        </Part>

        {/* 5. About you */}
        <Part n={5} id="sf-you" title="About you." colour="lilac" done={partDone(PARTS[4].owns)}>
          {input("name", "Your full name", { autoComplete: "name", placeholder: "First and last name" })}
          <div className="row2">
            {input("mobile", "Mobile", { type: "tel", autoComplete: "tel", placeholder: "04xx xxx xxx" })}
            {input("email", "Email", { type: "email", autoComplete: "email", placeholder: "you@example.com" }, "We email you a copy of what you sign.")}
          </div>
          <div className="row2">
            {input("suburb", "Suburb or town where it's kept", { autoComplete: "address-level2", placeholder: "Toowoomba" })}
            {input("postcode", "Postcode", { inputMode: "numeric", maxLength: 4, autoComplete: "postal-code", placeholder: "4350" })}
          </div>
          <div className="row2">
            <label className="field"><span>Who owns it?</span>
              <select className="input" value={f.owner_type} onChange={(e) => set("owner_type", e.target.value)} data-testid="sell-owner-type">{OWNER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {f.owner_type === "joint" && <span className="hint">We&apos;ll ask the other owner to confirm by phone before it goes live.</span>}
            </label>
            <label className="field"><span>When do you want to sell?</span>
              <select className="input" value={f.sell_when} onChange={(e) => set("sell_when", e.target.value)} data-testid="sell-when">{SELL_WHEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          </div>
          <label className="sf-check"><input type="checkbox" checked={f.business || f.owner_type === "company"} disabled={f.owner_type === "company"} onChange={(e) => set("business", e.target.checked)} data-testid="sell-business" />
            <span>I&apos;m selling it as part of a business (a fleet, company or work vehicle)<br /><span className="hint">Buyers are told whether the seller is private or a business, because it changes their consumer rights.</span></span>
          </label>
        </Part>

        {/* 6. Read and sign */}
        <Part n={6} id="sf-sign" title="Read and sign." colour="grape" done={partDone(PARTS[5].owns)}
          sub="This is the Seller Agency Agreement: it lets us sell the vehicle for you, and sets out our fees, your reserve and what you promise buyers.">
          <div className={`sf-terms-wrap${read ? " read" : ""}`}>
            <div className="sf-terms" ref={termsRef} onScroll={checkRead} tabIndex={0} role="region" aria-label="Seller Agency Agreement" data-testid="sell-terms">
              {clauses.map(([id, t, paras]) => (
                <div key={id} className="sf-clause"><b>{t}</b>{paras.map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: p }} />)}</div>
              ))}
              <p className="sf-end">End of the agreement.</p>
            </div>
            {!read && <span className="sf-more" aria-hidden="true">Scroll to read it all</span>}
          </div>
          <p className="hint" style={{ margin: 0 }}><Link className="blue" href="/seller-agreement" target="_blank">Open it on its own page</Link> to read it larger or print it.</p>

          <label className={`sf-check${errs.owner ? " sf-miss" : ""}`}><input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} data-testid="sell-owner" />
            <span>I own this vehicle, or every owner (or the company or trust) has authorised me to sell it, and my answers above are true.</span>
          </label>
          {err("owner")}
          <label className={`sf-check${errs.agree ? " sf-miss" : ""}${!read ? " locked" : ""}`}><input type="checkbox" checked={agree} disabled={!read} onChange={(e) => setAgree(e.target.checked)} data-testid="sell-agree" />
            <span>I&apos;ve read the Seller Agency Agreement and I agree to it.{!read && <><br /><span className="hint">Scroll to the end of the agreement to tick this.</span></>}</span>
          </label>
          {err("agree")}

          <div className={`sf-block${errs.signature ? " sf-miss" : ""}`}>
            {!noDraw ? (
              <>
                <span className="sf-label">Your signature</span>
                <SignaturePad onChange={setSig} invalid={!!errs.signature} />
                <span className="hint">Use your finger, a stylus or the mouse. <button type="button" className="linkbtn" style={{ fontSize: 14 }} onClick={() => { setNoDraw(true); setSig(null); }}>Can&apos;t sign in the box?</button></span>
              </>
            ) : (
              <div className="notice">You&apos;ll sign with your typed name below. <button type="button" className="linkbtn" onClick={() => setNoDraw(false)}>Draw my signature instead</button></div>
            )}
            {err("signature")}
          </div>
          {input("signed_name", "Type your full name", { autoComplete: "off", placeholder: f.name || "Your full name" }, "The same name as above. With your signature, this is how you sign. We record the date, time and device.")}

          <p className="hint" style={{ margin: 0 }}><b>Privacy:</b> we use these details to sell this vehicle and to contact you about it. Our <Link className="blue" href="/privacy">Privacy Policy</Link> explains how we handle them and how to see or correct them.</p>
          {tried && Object.keys(errs).length > 0 && <div className="notice bad" role="alert">{Object.keys(errs).length === 1 ? "One answer needs fixing." : `${Object.keys(errs).length} answers need fixing.`} <button type="button" className="linkbtn" style={{ color: "var(--ink)", textDecoration: "underline" }} onClick={jumpToFirstError}>Show me</button></div>}
          {sendErr && <div className="notice bad" role="alert">{sendErr}</div>}
          <button className="btn btn-blue sf-send" disabled={busy} data-testid="sell-submit">{busy ? "Sending…" : "Sign and send"}</button>
          <p className="hint" style={{ margin: 0, textAlign: "center" }}>Free to list. Nothing goes live until we&apos;ve called you and you&apos;ve verified your ID.</p>
        </Part>
      </form>

      <aside className="sf-side" data-testid="sell-side" aria-label="Your listing so far">
        <div className="sf-peek">
          <div className={`sf-cover${cover ? "" : ` stage bg-${cat.backdrop}`}`}>{cover ? <img src={cover} alt="" /> : <CarArt type={cat.silhouette} />}</div>
          <b className="sf-ptitle">{title || `Your ${cat.one}`}</b>
          <span className="muted" style={{ fontSize: 14 }}>
            {[f.variant, usage !== "none" && kmNum != null ? `${kmNum.toLocaleString("en-AU")} ${usage === "hours" ? "hrs" : "km"}` : null, CONDITIONS.find(([k]) => k === f.condition)?.[1], f.registration === "registered" ? (f.state ? `Registered ${f.state}` : "Registered") : "Unregistered"].filter(Boolean).join(" · ")}
          </span>
          {f.reserve_type && <span className={`tag ${f.reserve_type === "none" ? "bg-lime" : "bg-sky"}`} style={{ alignSelf: "flex-start" }}>{f.reserve_type === "none" ? "No reserve" : reserveNum ? `Reserve ${money(reserveNum)} (secret)` : "Reserve"}</span>}
        </div>
        <ol className="sf-progress">
          {PARTS.map((p, i) => {
            const ok = partDone(p.owns);
            return <li key={p.id} className={ok ? "ok" : ""}><a href={`#${p.id}`}><span className={`sf-pdot${ok ? "" : ` bg-${p.colour}`}`} aria-hidden="true">{ok ? "✓" : i + 1}</span>{p.title}<span className="sr-only">{ok ? " (done)" : " (to do)"}</span></a></li>;
          })}
        </ol>
        <p className="hint" style={{ margin: 0 }}>{left ? `${left} part${left === 1 ? "" : "s"} to go.` : "All done. Sign and send when you're ready."} Stuck? Call us on <a className="blue" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>.</p>
      </aside>
    </div>
  );
}

function Part({ n, id, title, sub, colour, done, children }: { n: number; id: string; title: string; sub?: string; colour: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="sf-part" id={id} aria-labelledby={`${id}-h`}>
      <header className="sf-head">
        <span className={`sf-num${done ? " ok" : ` bg-${colour}`}`} aria-hidden="true">{done ? "✓" : n}</span>
        <div><h3 id={`${id}-h`}>{title}</h3>{sub && <p className="muted">{sub}</p>}</div>
      </header>
      {children}
    </section>
  );
}

// What similar vehicles have sold for here: our own results, and only with at least 3 sales.
function SoldGuide({ make, model, year }: { make: string; model: string; year: string }) {
  const [r, setR] = useState<{ count: number; low?: number; high?: number } | null>(null);
  useEffect(() => {
    setR(null);
    if (make.trim().length < 2 || model.trim().length < 1) return;
    const t = setTimeout(() => {
      fetch(`/api/estimate?${new URLSearchParams({ make, model, year })}`).then((x) => x.json()).then(setR).catch(() => setR(null));
    }, 400);
    return () => clearTimeout(t);
  }, [make, model, year]);
  if (!r || r.count < 3 || r.low == null || r.high == null) return null;
  return (
    <div className="notice" data-testid="sold-guide">
      <b>Similar vehicles we&apos;ve sold: {money(r.low)} to {money(r.high)}.</b> The middle half of {r.count} {make} {model} sales{year ? ` from about ${Number(year) - 2} to ${Number(year) + 2}` : ""} on Tyrebiter in the last 18 months (hammer prices). It&apos;s based on past results, not a valuation of your vehicle.
    </div>
  );
}
