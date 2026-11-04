"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { env } from "@/lib/env";
import { rulesFor, isVessel, vesselFor, trailerNote, permitLine, TRANSPORT, transportLabel } from "@/lib/transfer";

export type TransferRow = {
  status: "waiting" | "submitted" | "complete"; registration: "registered" | "unregistered"; rego_state: string | null;
  buyer_choice: string | null; transport: string | null; reference: string | null; review_note: string | null;
  seller_done_at: string | null; buyer_said_done_at: string | null; permit_ref: string | null; proof_count: number;
};

// Upload one file through a one-off signed link (private bucket), and return its path. Nothing requires this any
// more; it stays for a buyer who wants their copy on file, and for staff who are sorting something out.
export async function uploadProof(invoiceId: string, file: File) {
  const r = await fetch("/api/transfers/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, size: file.size, mime: file.type }) });
  const s = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(s.error || "Couldn't upload that file.");
  const put = await fetch(s.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type, "x-upsert": "false", ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}) } });
  if (!put.ok) throw new Error("The upload didn't finish. Check your connection and try again.");
  return s.path as string;
}

/** Putting it in the buyer's name.
 *
 *  One button. We have already lodged the seller's side with the state as their agent, so the only thing left is
 *  the buyer's own half, and since migration 32 that gates nothing: they can collect whether or not they've done
 *  it, and the clock nudges them rather than a person. So this screen asks for no proof, no receipt number and no
 *  upload. It points at the right office for their state and their product, and gets out of the way.
 *
 *  Sold unregistered is the other shape: there is no registration to move, the certificate of sale is the record,
 *  and the only real question is how they'll get it off our depot. */
export function TransferStep({ invoiceId, t, title, category, consultantPhone, transporter, canPermit = true }: {
  invoiceId: string; t: TransferRow; title: string; category?: string | null; consultantPhone: string;
  transporter?: { slug: string; name: string } | null; canPermit?: boolean;
}) {
  const router = useRouter();
  const rules = rulesFor(t.rego_state);
  const onWater = isVessel(category);
  const vessel = onWater ? vesselFor(t.rego_state) : null;
  // Who the buyer deals with for the transfer itself. The movement permit below stays with the road authority:
  // that part is about towing it out of our depot, which is a road matter even for a boat.
  const authority = vessel ? vessel.authority : rules.authority;
  const where = vessel ? vessel.buyerUrl : rules.buyerUrl;

  // A boat sits on a trailer and machinery goes on a float: neither travels the road under its own power, so the
  // permit question is about the trailer, not the thing itself.
  const onWheels = !["boats", "machinery"].includes(String(category || ""));
  const [unreg, setUnreg] = useState(t.buyer_choice === "unregistered");
  const [transport, setTransport] = useState(t.transport && t.transport !== "drive" ? t.transport : "");
  const [permit, setPermit] = useState(t.permit_ref || "");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const registered = t.registration === "registered";
  const takeUnreg = !registered || unreg;
  const cert = <a className="blue" href={`/api/invoices/${invoiceId}/certificate`} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>Certificate of sale (PDF) ›</a>;
  const done = t.status === "complete" || !!t.buyer_said_done_at;

  async function post(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save that. Please try again.");
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="soft" data-testid="transfer">
        <b style={{ fontSize: 20 }}>Transfer of ownership.</b>
        <span className="notice ok">
          {registered && !unreg ? `Done. The ${title} is in your name.` : `Done. The ${title} is recorded as yours (sold unregistered).`}
          {t.transport ? ` ${transportLabel(t.transport)}.` : ""}
        </span>
        <span>{cert} Keep it with the vehicle&apos;s papers.</span>
      </div>
    );
  }

  return (
    <div className="soft" data-testid="transfer" style={{ gap: 14 }}>
      <b style={{ fontSize: 20 }}>Transfer of ownership.</b>
      {t.review_note && <span className="notice bad" role="alert"><b>We need one more thing:</b> {t.review_note}</span>}

      {registered && !unreg && (
        <>
          <span>
            {t.seller_done_at
              ? <>We&apos;ve lodged the seller&apos;s side with {authority}, so that part is finished. The last step is yours, and the form is already filled in from your account.</>
              : <>We&apos;re lodging the seller&apos;s side with {authority} now. You can do your part straight away &mdash; you don&apos;t have to wait for us.</>}
          </span>

          <a className="btn btn-blue" href={where} target="_blank" rel="noopener noreferrer"
            style={{ alignSelf: "flex-start", height: 48, fontSize: 16 }} data-testid="transfer-go">
            Transfer it into my name ›
          </a>

          <span className="hint" style={{ maxWidth: "64ch" }}>
            You&apos;ll pay your state&apos;s transfer fee and duty, which is a tax in your own name, so it&rsquo;s the
            one part nobody can pay for you. Most states give you 14 days from the sale.
            {vessel ? ` ${trailerNote(t.rego_state)}` : rules.cert ? ` ${rules.cert}` : ""}
          </span>

          {onWater && !vessel && (
            <span className="notice">A boat&apos;s registration goes through {t.rego_state || "the state"}&apos;s marine
            authority, not its road one. Call us on {consultantPhone} and we&apos;ll do that part with you.</span>
          )}

          <span className="hint">
            Does the form ask for the seller&apos;s details? Call us on {consultantPhone} and we&apos;ll complete that
            part &mdash; the seller&apos;s details stay private.
          </span>

          {err && <div className="notice bad" role="alert">{err}</div>}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-dark" disabled={busy} data-testid="transfer-done"
              onClick={() => post("/api/transfers/done", { invoiceId })} style={{ height: 42 }}>
              {busy ? "Saving…" : "I've done it"}
            </button>
            <button className="linkish" disabled={busy} onClick={() => { setUnreg(true); setErr(""); }} data-testid="transfer-take-unreg"
              style={{ background: "none", border: 0, padding: 0, color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>
              I can&apos;t register it in {t.rego_state} &mdash; take it unregistered instead
            </button>
          </div>
          <span className="hint">Telling us stops the reminders. It never holds up your collection: you can book and
          collect whether or not this is finished.</span>
        </>
      )}

      {takeUnreg && (
        <>
          {registered
            ? <span>The seller cancels the registration{onWater ? "" : " and keeps the plates"}, and your certificate of sale, in your name, is your record of ownership. {cert}</span>
            : <span>This {title} is sold <b>unregistered, without plates</b>. Your certificate of sale, in your name, is your record of ownership. {cert}</span>}
          <label className="consent"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>The details on the certificate of sale are correct.</span></label>

          {/* Settled here, where nothing is at stake, rather than at the gate with a paid invoice and a tow-yard
              counter. The depot then confirms this answer instead of adjudicating it. */}
          <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: 8 }}>How will you move it from our depot?</legend>
            {TRANSPORT.filter(([k]) => k !== "permit" || (onWheels && canPermit)).map(([k, label]) => (
              <label key={k} className={transport === k ? "on" : ""}><input type="radio" name="transport" checked={transport === k} onChange={() => { setTransport(k); setErr(""); }} /> <span><b>{k === "permit" ? `${label} (${rules.permit})` : label}</b>{k === "permit" && <span className="hint">{permitLine(t.rego_state)} The depot checks it before they hand over the keys.</span>}</span></label>
            ))}
          </fieldset>

          {transport === "permit" && (
            <div className="soft" style={{ background: "var(--panel)", gap: 9 }}>
              <a className="btn btn-blue" href={rules.permitUrl} target="_blank" rel="noopener noreferrer"
                style={{ alignSelf: "flex-start", height: 44 }} data-testid="permit-go">Get the {rules.permit} ›</a>
              <label className="field" style={{ maxWidth: 320 }}><span>Permit number (if you have it)</span>
                <input className="input" value={permit} onChange={(e) => { setPermit(e.target.value); setErr(""); }} maxLength={40} autoCapitalize="characters" data-testid="permit-ref" /></label>
              <span className="hint">You can leave this blank and get the permit before collection day &mdash; but
              the depot has to see it before they hand over the keys, so don&apos;t turn up without one. It covers
              one direct trip, so get the dates right.</span>
            </div>
          )}

          {transport && transport !== "permit" && transporter && (
            <span className="hint">Need a truck? <a className="blue" href={`/go/${transporter.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>Get a quote from {transporter.name} ›</a></span>
          )}

          {!onWheels && (
            <span className="hint">It travels on a trailer rather than under its own power, so a permit only comes
            into it if the trailer itself is unregistered. Ask us if you&apos;re not sure.</span>
          )}

          {err && <div className="notice bad" role="alert">{err}</div>}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-blue" disabled={busy} data-testid="transfer-submit" style={{ height: 46 }}
              onClick={() => {
                if (!agree) return setErr("Check the certificate of sale and tick the box.");
                if (!transport) return setErr("Choose how it will be moved.");
                void post("/api/transfers", { invoiceId, choice: "unregistered", transport, reference: "", paths: [], permit });
              }}>
              {busy ? "Saving…" : "Confirm"}
            </button>
            {registered && (
              <button className="linkish" disabled={busy} onClick={() => { setUnreg(false); setErr(""); }}
                style={{ background: "none", border: 0, padding: 0, color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>
                Back &mdash; I&apos;ll transfer the registration after all
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
