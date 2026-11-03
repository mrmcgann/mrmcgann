"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ruleFor, ACK_TEXT, ackNote } from "@/lib/buyerContract";
import { SignaturePad } from "@/components/SignaturePad";
import type { Signature } from "@/lib/sellForm";

/** The winning bidder's sale contract, on their invoice page.
 *
 *  The contract was made at the fall of the hammer. This box hands them the record of it and takes their
 *  acknowledgement. Signing is never a condition of the sale, and the wording here says so, so nobody reads the
 *  button as "the sale isn't real until I press this". In New South Wales and South Australia their state's own
 *  auction notice is signed by the buyer with a copy back, and this is what discharges it. */
/** The drawn signature as a path, built only from the numbers the server checked. Kept out of
 *  dangerouslySetInnerHTML on purpose: this draws it as real JSX. */
function sigPath(s: Signature): string {
  return s.strokes.map((st) => st.length === 2
    ? `M${st[0]} ${st[1]}l0.1 0`
    : st.reduce((acc, v, i) => acc + (i % 2 ? ` ${v}` : `${i ? " L" : "M"}${v}`), "")).join(" ");
}

export function SaleContract({ id, state, signedName, signedAt, signature, verifiedName }: {
  id: string; state: string | null; signedName: string | null; signedAt: string | null;
  signature: Signature | null; verifiedName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sig, setSig] = useState<Signature | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const rule = ruleFor(state);
  const formal = rule.signed && rule.document;
  // The date goes on the signature, the way it does on a paper form. It is today's date in the buyer's own clock;
  // what is recorded against the invoice is the server's time, and the contract prints that.
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const link = (
    <a className="blue" href={`/api/invoices/${id}/contract`} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>
      Read your sale contract ›
    </a>
  );

  if (signedName && signedAt) {
    return (
      <div className="soft" data-testid="sale-contract">
        <b style={{ fontSize: 20 }}>Your sale contract.</b>
        {signature && Array.isArray(signature.strokes) && signature.strokes.length > 0 && (
          <svg viewBox={`0 0 ${signature.w} ${signature.h}`} width="200" height={Math.round((signature.h / signature.w) * 200)}
            role="img" aria-label={`Signature of ${signedName}`} style={{ display: "block" }}>
            <path d={sigPath(signature)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span>Signed by <b>{signedName}</b> on {new Date(signedAt).toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" })}.</span>
        <span>{link}</span>
        <span className="hint">{ackNote(state)}</span>
      </div>
    );
  }

  return (
    <div className="soft" data-testid="sale-contract">
      <b style={{ fontSize: 20 }}>Your sale contract.</b>
      <span>
        You bought this vehicle at the fall of the hammer, so it&apos;s already yours to pay for — signing here
        doesn&apos;t make the sale, it records it.{" "}
        {formal ? <>Your state&apos;s {rule.document} is signed by us and by you, and your copy comes back with it.</> : null}
      </span>
      <span>{link}</span>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          const res = await fetch(`/api/invoices/${id}/acknowledge`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, signature: sig }),
          });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (res.ok) router.refresh();
          else setErr(data.error || "We couldn't record that. Please try again.");
        }}
      >
        <span className="hint" style={{ maxWidth: "62ch" }}>{ACK_TEXT}</span>

        <div style={{ maxWidth: 460 }}>
          <span className="hint" style={{ display: "block", marginBottom: 5, fontWeight: 600 }}>Sign here</span>
          <SignaturePad onChange={setSig} invalid={!!err && !sig} testId="ack-signature" />
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 8 }}>
            <span className="hint" style={{ fontWeight: 600 }}>Date</span>
            <b style={{ fontSize: 15 }}>{today}</b>
          </div>
        </div>

        <label className="hint" htmlFor="ack-name" style={{ marginTop: 2 }}>And confirm your name as it is on your account</label>
        <input
          id="ack-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={verifiedName} autoComplete="off" style={{ background: "#FFFFFF", maxWidth: 420 }}
        />
        {err && <span className="errmsg">{err}</span>}
        <button className="btn btn-dark" disabled={busy || !sig || name.trim().length < 3} style={{ alignSelf: "flex-start", height: 46, fontSize: 15 }}>
          {busy ? "Signing…" : formal ? `Sign the ${rule.document}` : "Sign my copy"}
        </button>
        {!sig && <span className="hint">Draw your signature in the box above to sign.</span>}
        <span className="hint">{ackNote(state)}</span>
      </form>
    </div>
  );
}
