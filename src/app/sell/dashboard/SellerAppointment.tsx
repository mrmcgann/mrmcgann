"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NOTICE_DAYS } from "@/lib/appointment";

export type SellerAppointmentView = {
  id: string; signed_at: string; countersigned_at: string | null; countersigned_name: string | null; copy_sent_at: string | null;
  ends_at: string | null; notice_at: string | null; notice_by: "seller" | "us" | null; has_form: boolean;
};

const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" }) : "");

// The seller's appointment of us (Form 9) on their dashboard: where it stands, their signed copy, and their right to end
// it with 30 days' written notice (Part 4, section 4). Giving notice here is written notice; the engine records it.
export function SellerAppointment({ lotId, view, canEnd }: { lotId: number; view: SellerAppointmentView; canEnd: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ended = !!view.ends_at && new Date(view.ends_at) <= new Date();
  const noticeEnd = day(new Date(Date.now() + NOTICE_DAYS * 86400000).toISOString());

  async function give() {
    setBusy(true); setErr("");
    const res = await fetch("/api/seller/appointment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, confirm: sure }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "That didn't work. Call us."); return; }
    setOpen(false);
    router.refresh();
  }

  if (!view.has_form) return <span className="muted" data-testid="seller-appointment">You signed your agreement before appointments were on Queensland&apos;s form (Form 9). We&apos;ll send you a link to sign it again before anything is listed.</span>;
  return (
    <div className="f9-panel" data-testid="seller-appointment">
      <span>
        <b>Your appointment of Super Trucker.</b>{" "}
        {!view.countersigned_at ? `You signed it on ${day(view.signed_at)}. We'll countersign it and email you a signed copy.`
          : `Signed by you on ${day(view.signed_at)} and by us on ${day(view.countersigned_at)}.`}{" "}
        {ended ? `It ended on ${day(view.ends_at)}.`
          : view.notice_at ? `It ends on ${day(view.ends_at)}: ${view.notice_by === "us" ? "we" : "you"} gave notice on ${day(view.notice_at)}.`
          : view.ends_at ? `It runs until ${day(view.ends_at)}.` : ""}
      </span>
      <span className="pill-row">
        {view.countersigned_at && <a className="blue" style={{ fontWeight: 700 }} href={`/api/seller/appointment/${view.id}`} target="_blank" rel="noreferrer" data-testid="seller-appointment-pdf">Your signed copy (PDF)</a>}
        {canEnd && !ended && !view.notice_at && !open && <button type="button" className="linkbtn" onClick={() => setOpen(true)} data-testid="seller-appointment-end">End it with {NOTICE_DAYS} days&apos; notice</button>}
      </span>
      {open && (
        <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 10, fontWeight: 400 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} data-testid="seller-appointment-sure" />
            <span>I give Super Trucker written notice to end my appointment. It ends {NOTICE_DAYS} days from today, on {noticeEnd}, and carries on as agreed until then: if it&apos;s in an auction before that, it can still sell. To end it sooner, call us (section 8 of your agreement).</span>
          </label>
          <span className="pill-row">
            <button type="button" className="btn btn-dark" style={{ height: 42 }} disabled={busy || !sure} onClick={give}>{busy ? "Sending…" : "Give notice"}</button>
            <button type="button" className="linkbtn" onClick={() => { setOpen(false); setSure(false); }}>Cancel</button>
          </span>
          {err && <span className="notice bad">{err}</span>}
        </div>
      )}
    </div>
  );
}
