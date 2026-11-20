"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STATES = ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"];

// Licence numbers shown in the footer of every page and in the Terms. NSW requires the dealer
// licence number in every advertisement (from 1 September 2025); Victoria requires the LMCT number.
export function BusinessSettings({ value }: { value: { licences?: Record<string, string>; review_url?: string; qld_licence_no?: string; qld_licence_expiry?: string } }) {
  const router = useRouter();
  // Queensland's appointment form (Form 9, Part 2) prints our motor dealer licence number and its expiry date: sellers
  // can't sign until both are set.
  const [qldNo, setQldNo] = useState(value.qld_licence_no || "");
  const [qldExp, setQldExp] = useState(value.qld_licence_expiry || "");
  const [qmsg, setQmsg] = useState("");
  async function saveQld() {
    const no = qldNo.trim().slice(0, 40);
    if (!no || !/^\d{4}-\d{2}-\d{2}$/.test(qldExp)) { setQmsg("Enter the licence number and its expiry date."); return; }
    if (new Date(`${qldExp}T23:59:59+10:00`) < new Date()) { setQmsg("That licence has expired. Renew it before you take on sellers."); return; }
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "business", value: { ...value, qld_licence_no: no, qld_licence_expiry: qldExp } }) });
    const data = await res.json().catch(() => ({}));
    setQmsg(res.ok ? "Saved. Sellers' appointment forms now show it." : data.error || "Couldn't save.");
    if (res.ok) router.refresh();
  }
  const [lic, setLic] = useState<Record<string, string>>(value.licences || {});
  const [msg, setMsg] = useState("");
  const [review, setReview] = useState(value.review_url || "");
  const [rmsg, setRmsg] = useState("");
  async function saveReview() {
    const url = review.trim();
    if (url && !/^https:\/\/[^\s]+$/.test(url)) { setRmsg("Paste the full link, starting with https://"); return; }
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "business", value: { ...value, review_url: url.slice(0, 300) } }) });
    setRmsg(res.ok ? (url ? "Saved. Buyers are asked after collection, sellers after their payout." : "Saved. No review requests will be sent.") : "Couldn't save.");
    if (res.ok) router.refresh();
  }
  async function save() {
    const clean = Object.fromEntries(Object.entries(lic).map(([k, v]) => [k, v.trim().slice(0, 80)]).filter(([, v]) => v));
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "business", value: { ...value, licences: clean } }) });
    setMsg(res.ok ? "Saved. The footer and Terms now show these." : "Couldn't save.");
    if (res.ok) router.refresh();
  }
  const missing = STATES.filter((s) => !lic[s]?.trim());
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="licence-settings">
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>Licences</h2>
      <p className="hint">The motor dealer or auctioneer licence you hold in each state, as it should appear publicly (for example &quot;Motor dealer licence MD 012345&quot; or &quot;LMCT 12345&quot;). Shown in the footer of every page and in the Terms. Confirm with a lawyer which licence each state needs before you sell there.</p>
      {missing.length > 0 && <div className="notice bad">Not set yet: {missing.join(", ")}. Don&apos;t sell in a state until its licence is in place.</div>}
      <div className="grid2">{STATES.map((s) => <label key={s} className="field"><span>{s}</span><input className="input" value={lic[s] || ""} onChange={(e) => setLic({ ...lic, [s]: e.target.value })} data-testid={`licence-${s}`} /></label>)}</div>
      <span className="pill-row" style={{ alignItems: "center" }}><button className="btn btn-dark" style={{ height: 44 }} onClick={save}>Save licences</button>{msg && <span className="hint">{msg}</span>}</span>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>Sellers&apos; appointment form (Queensland, Form 9)</h2>
      <p className="hint">Every seller appoints us on Queensland&apos;s approved form, which prints the company&apos;s motor dealer licence number and when it expires. Sellers can&apos;t sign until both are here. Renew the licence before it expires.</p>
      {(!value.qld_licence_no || !value.qld_licence_expiry) && <div className="notice bad">Not set yet: sellers can&apos;t sign their appointment.</div>}
      <div className="grid2">
        <label className="field"><span>Motor dealer licence number</span><input className="input" value={qldNo} onChange={(e) => setQldNo(e.target.value)} placeholder="As printed on the licence" data-testid="qld-licence-no" /></label>
        <label className="field"><span>Expiry date</span><input className="input" type="date" value={qldExp} onChange={(e) => setQldExp(e.target.value)} data-testid="qld-licence-expiry" /></label>
      </div>
      <span className="pill-row" style={{ alignItems: "center" }}><button className="btn btn-dark" style={{ height: 44 }} onClick={saveQld}>Save licence details</button>{qmsg && <span className="hint">{qmsg}</span>}</span>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>Reviews</h2>
      <p className="hint">Your Google review link (Google Business Profile → Ask for reviews), or a ProductReview page. Every buyer is asked after they collect, and every seller after their payout, happy or not: asking only happy customers is against the ACCC&apos;s rules.</p>
      <label className="field"><span>Review link</span><input className="input" value={review} onChange={(e) => setReview(e.target.value)} placeholder="https://g.page/r/…/review" data-testid="review-url" /></label>
      <span className="pill-row" style={{ alignItems: "center" }}><button className="btn btn-dark" style={{ height: 44 }} onClick={saveReview}>Save review link</button>{rmsg && <span className="hint">{rmsg}</span>}</span>
    </div>
  );
}
