"use client";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useViewer } from "@/components/Viewer";
import { consentText, isPostcode, REFERRER_NOTE } from "@/lib/partners";
import { money } from "@/lib/format";
import type { Partner, PartnerKind } from "@/lib/types";

// "Have them contact me": a signed-in member with a verified mobile agrees, in so many words, to
// us passing their verified details to one named partner. Sent through /api/leads. Used for
// finance, insurance and mobile inspections (inspections also need a fully verified account).
export function LeadForm({ partner, kind, lotId, details, needPostcode, vehicle, onClose }: {
  partner: Partner; kind: PartnerKind; lotId?: number; details?: Record<string, string | number>; needPostcode?: boolean; vehicle?: string; onClose: () => void;
}) {
  const v = useViewer();
  const p = v.profile;
  const [postcode, setPostcode] = useState(p?.postcode || "");
  const [notes, setNotes] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
  const need = !v.user ? "signin" : v.missing.includes(2) || v.missing.includes(3) ? "mobile" : kind === "inspection" && v.missing.length ? "verify" : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((needPostcode || postcode) && !isPostcode(postcode.trim())) return setErr("Enter a 4-digit postcode.");
    if (!agree) return setErr("Tick the box so we can pass your details on.");
    setBusy(true); setErr("");
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      partnerId: partner.id, kind, lotId, postcode: postcode.trim(), consent: true,
      details: { ...(details || {}), ...(vehicle && !lotId ? { vehicle } : {}), ...(notes ? { notes } : {}) },
    }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error || "Couldn't send that. Please try again.");
    setRef(data.ref);
  }

  const title = kind === "inspection" ? "Order a mobile inspection." : kind === "finance" ? `Talk to ${partner.name}.` : `Get a quote from ${partner.name}.`;
  if (need) {
    return (
      <Modal title={title} onClose={onClose}>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
          {need === "signin" ? `Sign in or join first. We only pass on details you've verified, and only with your permission.`
            : need === "mobile" ? `Add your details and verify your mobile first, so ${partner.name} can reach you.`
            : "Finish verifying your account (mobile, card and ID) before ordering an inspection. It's the same check as bidding."}
        </p>
        {need === "signin" ? (<>
          <a className="btn btn-blue" href={`/signin?next=${encodeURIComponent(here)}`}>Sign in</a>
          <a className="btn btn-soft" href={`/join?next=${encodeURIComponent(here)}`}>Join free</a>
        </>) : <a className="btn btn-blue" href={`/join?step=${v.missing[0] || 2}&next=${encodeURIComponent(here)}`}>Continue</a>}
        {kind !== "inspection" && partner.referral_url && <p className="hint" style={{ margin: 0 }}>Or go straight to {partner.name}&apos;s site without sharing anything with us: use &quot;Check your rate&quot; or &quot;Get a quote&quot;.</p>}
      </Modal>
    );
  }
  return (
    <Modal title={ref ? "Sent." : title} onClose={onClose}>
      {ref ? (
        <>
          <p style={{ fontSize: 17, lineHeight: 1.5 }}>{partner.name} will be in touch{kind === "inspection" ? " to confirm the price and a time. The report comes to you by email" : ""}. Your reference is <b>{ref}</b>. We&apos;ve emailed you a copy.</p>
          <button className="btn btn-blue" onClick={onClose}>Done</button>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
          {kind === "inspection" && (
            <p className="muted" style={{ margin: 0 }}>{partner.blurb} {partner.price_from ? <>From <b>{money(partner.price_from)}</b>, paid to {partner.name}.</> : null} {partner.turnaround}.</p>
          )}
          {vehicle && <div className="notice" style={{ fontSize: 14 }}><b>Vehicle:</b> {vehicle}</div>}
          <div className="rows" style={{ fontSize: 15 }}>
            <div><span className="muted">Name</span><b>{[p?.first_name, p?.last_name].filter(Boolean).join(" ")}</b></div>
            <div><span className="muted">Mobile</span><b>{p?.mobile}</b></div>
            <div><span className="muted">Email</span><b>{v.user?.email}</b></div>
          </div>
          <label className="field"><span>Postcode{needPostcode ? "" : " (optional)"}</span><input className="input" inputMode="numeric" maxLength={4} autoComplete="postal-code" value={postcode} onChange={(e) => setPostcode(e.target.value.replace(/\D/g, ""))} /></label>
          {kind === "inspection" && <label className="field"><span>Anything to check in particular? (optional)</span><textarea className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>}
          <label className="consent"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>{consentText(partner, !!vehicle || !!lotId)}</span></label>
          <span className="hint" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a className="blue" href="/privacy" target="_blank" rel="noopener">Our privacy policy ›</a>
            {partner.privacy_url && <a className="blue" href={partner.privacy_url} target="_blank" rel="noopener noreferrer">{partner.name} privacy policy ›</a>}
          </span>
          {err && <div className="notice bad" role="alert">{err}</div>}
          <button className="btn btn-blue" disabled={busy}>{busy ? "Sending…" : kind === "inspection" ? "Order the inspection" : "Send my details"}</button>
          <p className="hint" style={{ margin: 0 }}>{REFERRER_NOTE[kind]}</p>
        </form>
      )}
    </Modal>
  );
}

// Listing page: an independent mobile inspection is the only way to inspect before bidding.
export function MobileInspection({ lotId, partner, vehicle, consultantPhone, open }: { lotId: number; partner: Partner | null; vehicle: string; consultantPhone: string | null; open: boolean }) {
  const [form, setForm] = useState(false);
  return (
    <div className="soft" style={{ gap: 8 }}>
      <b style={{ fontSize: 17 }}>Mobile inspection.</b>
      <span className="muted" style={{ fontSize: 15 }}>
        In-person viewings aren&apos;t available. {partner ? <>An independent mechanic from {partner.name} can inspect the vehicle where it is and send you a written report with photos{partner.price_from ? <>, from <b style={{ color: "var(--ink)" }}>{money(partner.price_from)}</b></> : null}.</> : <>Your consultant can arrange an independent inspection{consultantPhone ? ` on ${consultantPhone}` : ""}.</>}
      </span>
      {partner && open && <button className="btn btn-dark" style={{ height: 46, fontSize: 15, alignSelf: "flex-start", marginTop: 4 }} onClick={() => setForm(true)}>Order a mobile inspection</button>}
      {partner?.turnaround && open && <span className="hint">{partner.turnaround}. Allow time before bidding closes.</span>}
      {form && partner && <LeadForm partner={partner} kind="inspection" lotId={lotId} vehicle={vehicle} onClose={() => setForm(false)} />}
    </div>
  );
}

// A "Have them contact me" button for one partner (finance and insurance pages).
export function LeadButton({ partner, kind, lotId, details, vehicle, label, needPostcode, className = "btn btn-soft" }: {
  partner: Partner; kind: PartnerKind; lotId?: number; details?: Record<string, string | number>; vehicle?: string; label: string; needPostcode?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <LeadForm partner={partner} kind={kind} lotId={lotId} details={details} vehicle={vehicle} needPostcode={needPostcode} onClose={() => setOpen(false)} />}
    </>
  );
}
