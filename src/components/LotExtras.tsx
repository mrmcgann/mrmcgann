"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";

export function DeliveryBox({ lotId, email }: { lotId: number; email: string | null }) {
  const [pc, setPc] = useState("");
  const [em, setEm] = useState(email || "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, postcode: pc, email: em }) });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Thanks. We'll email a transport quote to ${em} within 1 business day.` } : { ok: false, text: data.error });
  }
  return (
    <div className="soft">
      <b style={{ fontSize: 17 }}>Delivered to your door.</b>
      {msg?.ok ? <span className="notice ok" style={{ fontSize: 14 }}>{msg.text}</span> : (
        <form style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={submit}>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" inputMode="numeric" maxLength={4} placeholder="Postcode" aria-label="Your postcode" value={pc} onChange={(e) => setPc(e.target.value)} style={{ background: "#FFFFFF", width: 130 }} />
            {!email && <input className="input" type="email" placeholder="Email for the quote" aria-label="Email for the quote" value={em} onChange={(e) => setEm(e.target.value)} style={{ background: "#FFFFFF" }} />}
          </div>
          <button className="btn btn-dark" style={{ height: 50, fontSize: 15 }} disabled={busy}>{busy ? "Sending…" : "Get a transport quote"}</button>
          {msg && <span className="errmsg">{msg.text}</span>}
        </form>
      )}
    </div>
  );
}

export function ReportButton({ lotId, signedIn }: { lotId: number; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, type: f.get("type"), details: f.get("details") }) });
    if (res.ok) { setSent(true); setOpen(false); }
  }
  if (sent) return <span className="hint">Thanks. Our team will review your report.</span>;
  return (
    <>
      <button className="linkbtn" style={{ alignSelf: "flex-start", color: "var(--muted)", fontWeight: 600, marginTop: 6 }} onClick={() => (signedIn ? setOpen(true) : router.push(`/signin?next=/lot/${lotId}`))}>Report a concern about this auction ›</button>
      {open && (
        <Modal title="Report a concern." onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="muted">We review every report. Sellers and their associates aren&apos;t allowed to bid on their own vehicles.</p>
            <label className="field"><span>What&apos;s the concern?</span><select className="input" name="type"><option>Suspicious bidding</option><option>Listing is inaccurate</option><option>Seller contacted me off the site</option><option>Something else</option></select></label>
            <label className="field"><span>Details</span><textarea className="input" name="details" /></label>
            <button className="btn btn-blue">Send report</button>
            <button type="button" className="btn btn-soft" onClick={() => setOpen(false)}>Cancel</button>
          </form>
        </Modal>
      )}
    </>
  );
}
