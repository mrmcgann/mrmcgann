"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ruleFor, ACK_TEXT, ackNote } from "@/lib/buyerContract";

/** The winning bidder's sale contract, on their invoice page.
 *
 *  The contract was made at the fall of the hammer. This box hands them the record of it and takes their
 *  acknowledgement. Signing is never a condition of the sale, and the wording here says so, so nobody reads the
 *  button as "the sale isn't real until I press this". In New South Wales and South Australia their state's own
 *  auction notice is signed by the buyer with a copy back, and this is what discharges it. */
export function SaleContract({ id, state, signedName, signedAt, verifiedName }: {
  id: string; state: string | null; signedName: string | null; signedAt: string | null; verifiedName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const rule = ruleFor(state);
  const formal = rule.signed && rule.document;

  const link = (
    <a className="blue" href={`/api/invoices/${id}/contract`} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>
      Read your sale contract ›
    </a>
  );

  if (signedName && signedAt) {
    return (
      <div className="soft" data-testid="sale-contract">
        <b style={{ fontSize: 20 }}>Your sale contract.</b>
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
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
          });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (res.ok) router.refresh();
          else setErr(data.error || "We couldn't record that. Please try again.");
        }}
      >
        <label className="hint" htmlFor="ack-name" style={{ maxWidth: "62ch" }}>{ACK_TEXT}</label>
        <input
          id="ack-name" className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={`Type your name: ${verifiedName}`} autoComplete="off" style={{ background: "#FFFFFF", maxWidth: 420 }}
        />
        {err && <span className="errmsg">{err}</span>}
        <button className="btn btn-dark" disabled={busy || name.trim().length < 3} style={{ alignSelf: "flex-start", height: 46, fontSize: 15 }}>
          {busy ? "Signing…" : formal ? `Sign the ${rule.document}` : "Sign my copy"}
        </button>
        <span className="hint">{ackNote(state)}</span>
      </form>
    </div>
  );
}
