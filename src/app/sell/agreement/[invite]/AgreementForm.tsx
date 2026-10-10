"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { QUESTIONS, needsDetails, type Signature } from "@/lib/sellForm";

type Clause = [string, string, string[]];
// The same questions as the sell form (src/lib/sellForm.ts), so a seller who used it sees their answers here.
const YN = QUESTIONS;

export function AgreementForm({ invite, userId, reserve, legalName, clauses, prefill, ownerType }: { invite: string; userId: string; reserve: number | null; legalName: string; clauses: Clause[]; prefill?: Record<string, string>; ownerType?: string }) {
  const router = useRouter();
  const [d, setD] = useState<Record<string, string>>({ write_off: "none", keys: "2", service_books: "no", ...(prefill || {}) });
  const [sig, setSig] = useState<Signature | null>(null);
  const [noDraw, setNoDraw] = useState(false);
  const [gst, setGst] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!sig && !noDraw) { setErr("Sign in the box (with your finger, a pen or the mouse)."); return; }
    setBusy(true); setErr("");
    const docs: string[] = [];
    const db = supabaseBrowser();
    for (const file of files.slice(0, 10)) {
      const path = `${userId}/${invite}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await db.storage.from("seller-docs").upload(path, file);
      if (!error) docs.push(path);
    }
    const res = await fetch("/api/seller/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      invite, reserve: f.get("reserve"), disclosures: d, gst, abn: f.get("abn"), ownerType: f.get("ownerType"), docs,
      bank: { name: f.get("bankName"), bsb: f.get("bsb"), account: f.get("account") },
      signedName: f.get("signedName"), agree: f.get("agree") === "on", owner: f.get("owner") === "on", signature: noDraw ? null : sig, noDraw,
    }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); return; }
    router.refresh();
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <section className="formcard">
        <h2 className="d3" style={{ fontSize: 30 }}>1. Your reserve.</h2>
        <label className="field"><span>Lowest price you&apos;ll accept (optional)</span><span className="moneyin"><span className="muted">$</span><input name="reserve" inputMode="numeric" defaultValue={reserve ?? ""} /></span>
          <span className="hint">Kept secret from bidders. If bidding ends below it, you decide whether to accept. Leave blank for no reserve (it sells to the highest bidder).</span></label>
      </section>

      <section className="formcard">
        <h2 className="d3" style={{ fontSize: 30 }}>2. About the vehicle.</h2>
        <p className="muted" style={{ margin: 0 }}>Answer honestly. Your answers are shown to buyers, and you&apos;re legally responsible for them. Being upfront sells cars: buyers bid more when there are no surprises.</p>
        {YN.map(([k, q, det]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
            <b style={{ fontSize: 16 }}>{q}</b>
            <div className="pill-row">{["no", "yes"].map((v) => <button type="button" key={v} className={`pill ${d[k] === v ? "pill-dark" : "pill-soft"}`} onClick={() => set(k, v)}>{v === "yes" ? "Yes" : "No"}</button>)}</div>
            {k === "finance" && d.finance === "yes" && (
              <div className="row2">
                <input className="input" placeholder="Roughly how much owing ($)" inputMode="numeric" value={d.finance_amount || ""} onChange={(e) => set("finance_amount", e.target.value)} />
                <input className="input" placeholder="Lender (e.g. bank name)" value={d.lender_name || ""} onChange={(e) => set("lender_name", e.target.value)} />
                <input className="input" placeholder="Loan reference (if you have it)" value={d.lender_ref || ""} onChange={(e) => set("lender_ref", e.target.value)} />
                <span className="hint">We pay your lender out of the sale price first, so the buyer gets clear title. You get the rest.</span>
              </div>
            )}
            {det && needsDetails(k, d[k] || "") && <textarea className="input" placeholder={k === "runs" ? "What happens when you try? (e.g. flat battery, won't turn over)" : k === "previous_use" ? "How was it used, and for how long?" : k === "recalls" ? "Which recall, and is it booked in to be fixed?" : "Tell buyers what happened and what was fixed"} value={d[det] || ""} onChange={(e) => set(det, e.target.value)} />}
          </div>
        ))}
        <label className="field"><span>Write-off status</span><select className="input" value={d.write_off} onChange={(e) => set("write_off", e.target.value)}><option value="none">Never written off</option><option value="repairable">Repairable write-off</option><option value="inspected">Inspected write-off (VIC)</option><option value="statutory">Statutory write-off</option></select></label>
        <div className="row2">
          <label className="field"><span>Number of keys</span><input className="input" inputMode="numeric" value={d.keys} onChange={(e) => set("keys", e.target.value)} /></label>
          <label className="field"><span>Service books?</span><select className="input" value={d.service_books} onChange={(e) => set("service_books", e.target.value)}><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label className="field"><span>Rego expires</span><input className="input" type="date" value={d.rego_expiry || ""} onChange={(e) => set("rego_expiry", e.target.value)} /></label>
        </div>
        <label className="field"><span>Known faults or anything a buyer should know</span><textarea className="input" value={d.known_faults || ""} onChange={(e) => set("known_faults", e.target.value)} placeholder="e.g. air-con needs a regas, small oil leak, rear left tyre worn" /></label>
      </section>

      <section className="formcard">
        <h2 className="d3" style={{ fontSize: 30 }}>3. Ownership.</h2>
        <label className="field"><span>The vehicle is owned by</span><select className="input" name="ownerType" defaultValue={ownerType || "individual"}><option value="individual">Me</option><option value="joint">Me and someone else</option><option value="company">A company</option><option value="trust">A trust</option></select>
          <span className="hint">If someone else co-owns it, we&apos;ll ask them to confirm by phone before it goes live.</span></label>
        <label className="field"><span>Photo of the registration papers (or other proof of ownership)</span><input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} required />
          <span className="hint">The name must match your verified ID (or the company you act for). Stored privately; only our team can see it.</span></label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={d.business === "yes"} onChange={(e) => set("business", e.target.checked ? "yes" : "no")} style={{ width: 20, height: 20, flexShrink: 0 }} data-testid="seller-business" /><span>I&apos;m selling it as part of a business (for example a fleet, company or work vehicle)<br /><span className="hint">Buyers are told whether the seller is private or a business. It can give them extra consumer rights when they buy outright.</span></span></label>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={gst} onChange={(e) => setGst(e.target.checked)} style={{ width: 20, height: 20 }} /><span>I&apos;m selling as a GST-registered business</span></label>
        {gst && <label className="field"><span>ABN</span><input className="input" name="abn" inputMode="numeric" required /><span className="hint">The sale price then includes GST, and it&apos;s shown that way to buyers.</span></label>}
      </section>

      <section className="formcard">
        <h2 className="d3" style={{ fontSize: 30 }}>4. Where we pay you.</h2>
        <div className="row2">
          <label className="field"><span>Account name</span><input className="input" name="bankName" required defaultValue={legalName} /></label>
          <label className="field"><span>BSB</span><input className="input" name="bsb" inputMode="numeric" required placeholder="000-000" /></label>
          <label className="field"><span>Account number</span><input className="input" name="account" inputMode="numeric" required /></label>
        </div>
        <span className="hint">For your protection we&apos;ll phone you to confirm these before your first payout, and we&apos;ll never ask you to change them by email.</span>
      </section>

      <section className="formcard">
        <h2 className="d3" style={{ fontSize: 30 }}>5. Read and sign.</h2>
        <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 18, padding: "18px 20px", background: "#FFFFFF" }}>
          {clauses.map(([id, title, paras]) => (
            <div key={id} style={{ marginBottom: 16 }}><b>{title}</b>{paras.map((p, i) => <p key={i} style={{ fontSize: 14, lineHeight: 1.6, margin: "6px 0" }} dangerouslySetInnerHTML={{ __html: p }} />)}</div>
          ))}
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" name="owner" style={{ width: 20, height: 20, flexShrink: 0 }} /><span>I own this vehicle, or I&apos;m authorised by every owner (or the company or trust) to sell it, and my answers above are true.</span></label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" name="agree" style={{ width: 20, height: 20, flexShrink: 0 }} /><span>I&apos;ve read and agree to the Seller Agency Agreement above, and appoint Tyrebiter to sell the vehicle for me on those terms.</span></label>
        {!noDraw ? (
          <div className="sf-block"><span className="sf-label">Your signature</span><SignaturePad onChange={setSig} testId="agreement-signature" />
            <span className="hint">Use your finger, a stylus or the mouse. <button type="button" className="linkbtn" style={{ fontSize: 14 }} onClick={() => { setNoDraw(true); setSig(null); }}>Can&apos;t sign in the box?</button></span></div>
        ) : <div className="notice">You&apos;ll sign with your typed name below. <button type="button" className="linkbtn" onClick={() => setNoDraw(false)}>Draw my signature instead</button></div>}
        <label className="field"><span>Type your full legal name</span><input className="input" name="signedName" required placeholder={legalName} autoComplete="off" /><span className="hint">With your signature, this is how you sign. We record the date, time and device.</span></label>
        {err && <div className="notice bad">{err}</div>}
        <button className="btn btn-blue" disabled={busy}>{busy ? "Signing…" : "Sign and send to Tyrebiter"}</button>
      </section>
    </form>
  );
}
