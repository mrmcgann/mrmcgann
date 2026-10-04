"use client";
import { CATEGORIES, CAT, makesFor, modelsFor } from "@/lib/vehicles";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useViewer } from "@/components/Viewer";
import { expiryDate, normalizePlate, normalizeVin, REGO_STATES, vehicleLine, type RegoVehicle } from "@/lib/rego";

type Found = { id: string | null; vehicle: RegoVehicle; sources: string[]; complete: boolean };

const SOURCE: Record<string, string> = { "our records": "our records", vin: "the VIN" };
export const sourceLine = (sources: string[]) => `From ${[...new Set(sources.map((x) => SOURCE[x] || x))].join(" and ")}`;

// Sell your vehicle: the plate (any state) and, if they have it handy, the VIN. Our own free
// lookup fills in what it can (vehicles we've listed, VIN patterns, the VIN itself); the seller
// checks it, adds what only they know (kilometres, condition) and how to reach them.
export function AppraisalForm() {
  const v = useViewer();
  const [registration, setRegistration] = useState<"registered" | "unregistered">("registered");
  const [plate, setPlate] = useState("");
  const [state, setState] = useState<string>("QLD");
  const [vin, setVin] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [details, setDetails] = useState(false);
  const [kind, setKind] = useState<string>("cars");
  const [m, setM] = useState({ year: "", make: "", model: "", variant: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; name: string } | null>(null);

  // Default to the member's state, unless they've already picked one.
  const [stateTouched, setStateTouched] = useState(false);
  useEffect(() => { if (!stateTouched && v.profile?.state && (REGO_STATES as readonly string[]).includes(v.profile.state)) setState(v.profile.state); }, [v.profile?.state, stateTouched]);

  const reset = () => { setFound(null); setLookErr(""); };
  async function lookup() {
    setLookErr(""); setFound(null);
    const p = normalizePlate(plate), vn = normalizeVin(vin);
    if (registration === "registered" && !p) return setLookErr("Enter the plate.");
    if (vn && vn.length !== 17) return setLookErr("A VIN is 17 letters and numbers. For an older chassis number, enter the details yourself.");
    if (registration === "unregistered" && !vn) return setLookErr("Enter the VIN, or enter the details yourself.");
    setLooking(true);
    const res = await fetch("/api/rego-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plate: registration === "registered" ? p : "", state, vin: vn }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setLooking(false);
    setDetails(true);
    if (!res || !res.ok) { setLookErr(data.error || "We couldn't look it up just now. Enter the details below."); return; }
    if (!data.found) {
      setLookErr(vn ? "We couldn't fill this in from the VIN. Enter the details below." : `We don't have ${p} on record yet. Add the VIN to fill in the details, or enter them below.`);
      return;
    }
    const fv = data.vehicle as RegoVehicle;
    setFound({ id: data.id, vehicle: fv, sources: data.sources || [], complete: !!data.complete });
    setM({ year: fv.year ? String(fv.year) : m.year, make: fv.make || m.make, model: fv.model || m.model, variant: fv.variant || m.variant });
    if (fv.category && CAT[fv.category]) setKind(fv.category);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setBusy(true); setErrors({});
    const photos: string[] = [];
    if (files.length) {
      const folder = crypto.randomUUID();
      const db = supabaseBrowser();
      for (const file of files.slice(0, 12)) {
        const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const { error } = await db.storage.from("appraisal-photos").upload(path, file);
        if (!error) photos.push(path);
      }
    }
    const res = await fetch("/api/appraisals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      ...f, kind, registration, rego: registration === "registered" ? normalizePlate(plate) : "", state, vin: normalizeVin(vin), lookupId: found?.id || null, ...m, photos,
    }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErrors(data.errors || { name: data.error || "Couldn't send that. Please try again." }); return; }
    setDone({ ref: data.ref, name: (f.name || "").split(" ")[0] });
  }

  if (done) {
    return (
      <div className="formcard bg-lime" style={{ justifyContent: "center" }}>
        <span className="tag" style={{ background: "var(--ink)", color: "var(--lime)", alignSelf: "flex-start" }}>Request {done.ref}</span>
        <h2 className="d3">Thanks, {done.name}.</h2>
        <p style={{ fontSize: 19, fontWeight: 500 }}>Your consultant will call you within 1 business day with a price guide and a suggested reserve.</p>
        <Link className="btn btn-dark" href="/auctions" style={{ alignSelf: "flex-start" }}>Browse auctions</Link>
      </div>
    );
  }

  const usage = CAT[kind]?.usage;
  const ready = details;
  const fv = found?.vehicle;
  const inp = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input className={`input${errors[id] ? " err" : ""}`} name={id} aria-invalid={!!errors[id]} {...props} />{errors[id] && <span className="errmsg">{errors[id]}</span>}</label>
  );
  const mi = (k: keyof typeof m, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input className={`input${errors[k] ? " err" : ""}`} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} {...props} />{errors[k] && <span className="errmsg">{errors[k]}</span>}</label>
  );
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void lookup(); } };

  return (
    <form className="formcard" onSubmit={submit} noValidate>
      <div><h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em" }}>Sell your vehicle.</h2><span className="muted">Start with the plate and VIN. We fill in what we can.</span></div>

      <div className="seg" role="group" aria-label="Registration">
        {(["registered", "unregistered"] as const).map((r) => (
          <button key={r} type="button" className={registration === r ? "on" : ""} aria-pressed={registration === r} onClick={() => { setRegistration(r); reset(); }}>
            {r === "registered" ? "Registered" : "Unregistered"}
          </button>
        ))}
      </div>

      {registration === "registered" ? (
        <div className="platerow">
          <label className="field"><span>Rego plate</span>
            <input className={`input plate${errors.rego ? " err" : ""}`} value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); reset(); }} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={10} aria-invalid={!!errors.rego} onKeyDown={enter} />
            {errors.rego && <span className="errmsg">{errors.rego}</span>}
          </label>
          <label className="field"><span>State</span><select className="input" value={state} onChange={(e) => { setState(e.target.value); setStateTouched(true); reset(); }}>{REGO_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      ) : (
        <label className="field"><span>State it&apos;s in</span><select className="input" value={state} onChange={(e) => { setState(e.target.value); setStateTouched(true); }}>{REGO_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
      )}
      <label className="field"><span>{registration === "registered" ? "VIN (fills in the details)" : "VIN or chassis number"}</span>
        <input className={`input vin${errors.vin ? " err" : ""}`} value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); reset(); }} placeholder="17 letters and numbers" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={20} onKeyDown={enter} data-testid="sell-vin" />
        <span className="hint">On the rego papers, and on a plate at the bottom of the windscreen or inside the driver&apos;s door.</span>
        {errors.vin && <span className="errmsg">{errors.vin}</span>}
      </label>

      {!details && (
        <div className="pill-row">
          <button type="button" className="btn btn-dark" style={{ height: 54 }} disabled={looking} onClick={lookup}>{looking ? "Looking it up…" : "Fill in the details"}</button>
          <button type="button" className="linkbtn" onClick={() => { setDetails(true); setLookErr(""); }}>Enter them yourself</button>
        </div>
      )}
      {details && !found && !looking && (normalizePlate(plate) || normalizeVin(vin)) && <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={lookup}>Fill in from the plate and VIN again</button>}
      {lookErr && <div className="notice" role="status">{lookErr}</div>}

      {found && fv && (
        <div className="found ok" data-testid="sell-found">
          <span className="eyebrow" style={{ margin: 0 }}>{sourceLine(found.sources)}{fv.test ? " · test data" : ""}</span>
          <b style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{fv.description}</b>
          {vehicleLine(fv) && <span>{vehicleLine(fv)}</span>}
          <span className="muted" style={{ fontSize: 14 }}>
            {[fv.vinEnding ? `VIN ending ${fv.vinEnding}` : null, fv.country ? `Made in ${fv.country}` : null, fv.regoExpiry ? `Rego expires ${expiryDate(fv.regoExpiry)}` : null, fv.engine].filter(Boolean).join(" · ")}
          </span>
          <span style={{ fontSize: 14 }}>{found.complete ? "Check the details below and fix anything that's wrong." : "Fill in the rest below."}</span>
        </div>
      )}

      {details && (
        <>
          <label className="field"><span>What is it?</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </label>
          <div className="row3">
            {mi("year", "Year", { inputMode: "numeric", maxLength: 4, placeholder: "2017" })}
            {mi("make", "Make", { list: "sell-makes", autoComplete: "off" })}
            {mi("model", "Model", { list: "sell-models", autoComplete: "off" })}
          </div>
          <datalist id="sell-makes">{makesFor(kind).map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="sell-models">{modelsFor(m.make, kind).map((x) => <option key={x} value={x} />)}</datalist>
          {mi("variant", "Variant (optional)", { placeholder: "e.g. XLT 3.2 (4x4)" })}
        </>
      )}

      {ready && (
        <>
          <div className="row2">
            {usage === "none" ? <span /> : inp("odometer", usage === "hours" ? "Engine hours" : "Kilometres", { inputMode: "numeric", placeholder: usage === "hours" ? "450" : "185,000" })}
            {inp("postcode", "Postcode where it's kept", { inputMode: "numeric", maxLength: 4, placeholder: "4009", defaultValue: v.profile?.postcode || "" })}
          </div>
          <label className="field"><span>Anything we should know? (optional)</span>
            <textarea className="input" name="description" maxLength={2000} placeholder="Condition, damage, service history, money owing on it, extras" />
          </label>
          <label className="drop">
            <span style={{ width: 44, height: 44, borderRadius: 22, background: "var(--sun)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}><b>{files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} added` : "Add a few phone photos"}</b><span className="hint">Optional. Helps us give a sharper price guide.</span></span>
            <input type="file" multiple accept="image/*" hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </label>
          {inp("name", "Your name", { autoComplete: "name", defaultValue: [v.profile?.first_name, v.profile?.last_name].filter(Boolean).join(" ") })}
          <div className="row2">{inp("mobile", "Mobile", { type: "tel", autoComplete: "tel", placeholder: "04", defaultValue: v.profile?.mobile || "" })}{inp("email", "Email", { type: "email", autoComplete: "email", defaultValue: v.user?.email || "" })}</div>
          {errors.make && <div className="notice bad" role="alert">{errors.make}</div>}
          <button className="btn btn-blue" style={{ height: 62, fontSize: 18 }} disabled={busy}>{busy ? "Sending…" : "Get started"}</button>
          <p className="hint" style={{ margin: 0 }}><b>Privacy:</b> by sending this, you agree to us contacting you about selling this vehicle. Our <Link className="blue" href="/privacy">Privacy Policy</Link> explains how we handle your information and how to access or correct it.</p>
        </>
      )}
    </form>
  );
}
