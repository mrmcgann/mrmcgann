"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { env } from "@/lib/env";
import { rulesFor, TRANSPORT, transportLabel } from "@/lib/transfer";

export type TransferRow = {
  status: "waiting" | "submitted" | "complete"; registration: "registered" | "unregistered"; rego_state: string | null;
  buyer_choice: string | null; transport: string | null; reference: string | null; review_note: string | null;
  seller_done_at: string | null; proof_count: number;
};

// Upload one file through a one-off signed link (private bucket), and return its path.
export async function uploadProof(invoiceId: string, file: File) {
  const r = await fetch("/api/transfers/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, size: file.size, mime: file.type }) });
  const s = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(s.error || "Couldn't upload that file.");
  const put = await fetch(s.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type, "x-upsert": "false", ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}) } });
  if (!put.ok) throw new Error("The upload didn't finish. Check your connection and try again.");
  return s.path as string;
}

// Between payment and collection: put the vehicle in the buyer's name. Registered vehicles: the seller
// lodges their part, the buyer transfers the registration and uploads the confirmation, we check it.
// Unregistered: the certificate of sale is the ownership record; the buyer says how it will be moved.
export function TransferStep({ invoiceId, t, title, consultantPhone }: { invoiceId: string; t: TransferRow; title: string; consultantPhone: string }) {
  const router = useRouter();
  const rules = rulesFor(t.rego_state);
  const [choice, setChoice] = useState<"transfer" | "unregistered">(t.buyer_choice === "unregistered" ? "unregistered" : "transfer");
  const [transport, setTransport] = useState(t.transport && t.transport !== "drive" ? t.transport : "");
  const [reference, setReference] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const registered = t.registration === "registered";
  const takeUnreg = !registered || choice === "unregistered";
  const cert = <a className="blue" href={`/api/invoices/${invoiceId}/certificate`} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>Certificate of sale (PDF) ›</a>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (takeUnreg && !transport) return setErr("Choose how the vehicle will be moved.");
    if (!registered && !agree) return setErr("Check the certificate of sale and tick the box.");
    if (registered && choice === "transfer" && !files.length && !reference.trim()) return setErr("Upload the transfer confirmation, or enter the receipt number.");
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of files.slice(0, 5)) paths.push(await uploadProof(invoiceId, f));
      const r = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, choice: registered ? choice : "unregistered", transport: takeUnreg ? transport : null, reference, paths }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save that. Please try again.");
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (t.status === "complete") {
    return (
      <div className="soft" data-testid="transfer">
        <b style={{ fontSize: 20 }}>Transfer of ownership.</b>
        <span className="notice ok">Done. {registered && t.buyer_choice !== "unregistered" ? `The registration is in your name.` : `The ${title} is recorded as yours (sold unregistered).`}{t.transport ? ` ${transportLabel(t.transport)}.` : ""}</span>
        <span>{cert} Keep it with the vehicle&apos;s papers.</span>
      </div>
    );
  }
  if (t.status === "submitted") {
    return (
      <div className="soft" data-testid="transfer">
        <b style={{ fontSize: 20 }}>Transfer of ownership.</b>
        <span className="notice">We&apos;re checking it{t.buyer_choice === "unregistered" ? " and arranging with the seller to cancel the registration" : ""}. We&apos;ll text you when it&apos;s done, usually within one business day. Then you can book your collection.</span>
        <span>{cert}</span>
      </div>
    );
  }

  return (
    <form className="soft" onSubmit={submit} data-testid="transfer" style={{ gap: 14 }} noValidate>
      <b style={{ fontSize: 20 }}>Transfer of ownership.</b>
      <span className="muted">Before you collect, the {title} goes into your name. The pickup address is sent once this is done and your collection time is confirmed.</span>
      {t.review_note && <span className="notice bad" role="alert"><b>We need one more thing:</b> {t.review_note}</span>}

      {registered && (
        <div className="choice" role="radiogroup" aria-label="Registration">
          <label className={choice === "transfer" ? "on" : ""}><input type="radio" name="choice" checked={choice === "transfer"} onChange={() => setChoice("transfer")} /> <span><b>Transfer the registration into my name</b><span className="hint">Registered in {t.rego_state}. You&apos;ll need to do this through {rules.authority}.</span></span></label>
          <label className={choice === "unregistered" ? "on" : ""}><input type="radio" name="choice" checked={choice === "unregistered"} onChange={() => setChoice("unregistered")} /> <span><b>Take it unregistered</b><span className="hint">The seller cancels the registration and keeps the plates. Choose this if you can&apos;t register it in {t.rego_state}.</span></span></label>
        </div>
      )}

      {registered && choice === "transfer" && (
        <ol className="steps-mini">
          <li><b>The seller&apos;s part.</b> The seller lodges their part with {rules.authority}. {t.seller_done_at ? <span className="status-pill" style={{ background: "var(--mint)" }}>Done</span> : <span className="muted">We&apos;re arranging this with the seller.</span>}</li>
          <li><b>Your part.</b> {rules.buyer} <a className="blue" href={rules.buyerUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>Transfer it with {rules.authority} ›</a>{rules.cert ? <span className="hint" style={{ display: "block", marginTop: 4 }}>{rules.cert}</span> : null}</li>
          <li><b>Show us.</b> Upload the confirmation (the receipt, or the new registration certificate in your name), or enter the receipt number. Need the seller&apos;s details or help? Call {consultantPhone}.</li>
        </ol>
      )}

      {!registered && (
        <>
          <span>This vehicle is sold <b>unregistered, without plates</b>. Your certificate of sale, in your name, is your record of ownership. {cert}</span>
          <label className="consent"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>The details on the certificate of sale are correct.</span></label>
        </>
      )}

      {takeUnreg && (
        <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 8 }}>How will it be moved?</legend>
          {TRANSPORT.map(([k, label]) => (
            <label key={k} className={transport === k ? "on" : ""}><input type="radio" name="transport" checked={transport === k} onChange={() => setTransport(k)} /> <span><b>{k === "permit" ? `${label} (${rules.permit})` : label}</b>{k === "permit" && <span className="hint">Apply to {rules.authority} before collection day: <a className="blue" href={rules.permitUrl} target="_blank" rel="noopener noreferrer">{rules.permit} ›</a>. Bring it with you, or upload it here.</span>}</span></label>
          ))}
        </fieldset>
      )}

      {(choice === "transfer" && registered) || transport === "permit" ? (
        <>
          <label className="drop" style={{ cursor: "pointer" }}>
            <b>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} added` : registered && choice === "transfer" ? "Upload the transfer confirmation" : "Upload the permit (optional)"}</b>
            <span className="hint">A photo or PDF, up to 10 MB each.</span>
            <input ref={input} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => { setFiles(Array.from(e.target.files || []).slice(0, 5)); setErr(""); }} data-testid="transfer-files" />
          </label>
          {registered && choice === "transfer" && <label className="field"><span>Or the receipt number</span><input className="input" value={reference} onChange={(e) => { setReference(e.target.value); setErr(""); }} maxLength={60} data-testid="transfer-reference" /></label>}
        </>
      ) : null}

      {err && <div className="notice bad" role="alert">{err}</div>}
      <button className="btn btn-blue" disabled={busy} data-testid="transfer-submit">{busy ? "Sending…" : registered ? (choice === "transfer" ? "Send for checking" : "Ask for it unregistered") : "Confirm"}</button>
    </form>
  );
}
