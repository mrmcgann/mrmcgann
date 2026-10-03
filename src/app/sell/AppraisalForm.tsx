"use client";
import { CATEGORIES, CAT } from "@/lib/vehicles";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { STATES } from "@/lib/grades";

export function AppraisalForm() {
  const [kind, setKind] = useState<string>("cars");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; name: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setBusy(true);
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
    const res = await fetch("/api/appraisals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, kind, photos }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErrors(data.errors || { rego: data.error }); return; }
    setDone({ ref: data.ref, name: (f.name || "").split(" ")[0] });
  }

  if (done) {
    return (
      <div className="formcard bg-lime" style={{ justifyContent: "center" }}>
        <span className="tag" style={{ background: "var(--ink)", color: "var(--lime)", alignSelf: "flex-start" }}>Request {done.ref}</span>
        <h2 className="d3">Thanks, {done.name}.</h2>
        <p style={{ fontSize: 19, fontWeight: 500 }}>We&apos;ll call you within 1 business day with a price range and a suggested reserve.</p>
        <Link className="btn btn-dark" href="/auctions" style={{ alignSelf: "flex-start" }}>Browse auctions</Link>
      </div>
    );
  }
  const inp = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input className={`input${errors[id] ? " err" : ""}`} name={id} aria-invalid={!!errors[id]} {...props} />{errors[id] && <span className="errmsg">{errors[id]}</span>}</label>
  );
  return (
    <form className="formcard" onSubmit={submit} noValidate>
      <div><h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em" }}>Free appraisal.</h2><span className="muted">Two minutes. No obligation.</span></div>
      <label className="field"><span>What are you selling?</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px", gap: 12 }}>
        {inp("rego", "Rego", { placeholder: "123ABC", style: { textTransform: "uppercase", fontWeight: 700, letterSpacing: ".06em" } })}
        <label className="field"><span>State</span><select className="input" name="state">{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="row2">{inp("odometer", CAT[kind]?.usage === "hours" ? "Engine hours" : "Kilometres", { inputMode: "numeric", placeholder: CAT[kind]?.usage === "hours" ? "450" : "185,000" })}{inp("postcode", "Postcode", { inputMode: "numeric", maxLength: 4, placeholder: "4009" })}</div>
      {inp("name", "Your name", { autoComplete: "name" })}
      <div className="row2">{inp("mobile", "Mobile", { type: "tel", autoComplete: "tel", placeholder: "04" })}{inp("email", "Email", { type: "email", autoComplete: "email" })}</div>
      <label className="drop">
        <span style={{ width: 44, height: 44, borderRadius: 22, background: "var(--sun)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </span>
        <span style={{ display: "flex", flexDirection: "column" }}><b>{files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} added` : "Add a few phone photos"}</b><span className="hint">Optional. Helps us give a sharper number.</span></span>
        <input type="file" multiple accept="image/*" hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      </label>
      <button className="btn btn-blue" style={{ height: 62, fontSize: 18 }} disabled={busy}>{busy ? "Sending…" : "Get my free appraisal"}</button>
      <span className="hint" style={{ textAlign: "center" }}>We&apos;ll call you within 1 business day.</span>
    </form>
  );
}
