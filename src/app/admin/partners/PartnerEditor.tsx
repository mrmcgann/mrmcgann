"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { INSURANCE_FEATURES } from "@/lib/finance";
import type { Partner, PartnerKind } from "@/lib/types";

const WARRANTY_FEATURES: [string, string][] = [["terms", "Cover terms"], ["roadside", "Roadside assistance"], ["claim_limit", "Claim limit"], ["excess", "Excess"], ["age_limit", "Vehicle limits"]];
type Priv = { lead_email: string | null; contact_name: string | null; notes: string | null } | null;
const NUM = ["rate_from", "comparison_rate", "establishment_fee", "monthly_fee", "min_amount", "max_amount", "min_term_months", "max_term_months", "price_from", "sort"] as const;
const TXT = ["name", "slug", "licence", "blurb", "comparison_basis", "turnaround", "pds_url", "tmd_url", "privacy_url", "referral_url", "commission_note"] as const;
const LABEL: Record<string, string> = {
  name: "Name", slug: "Short name for links (a-z, 0-9, -)", licence: "Licence (e.g. ACL 123456 or AFSL 123456)", blurb: "One line about them", comparison_basis: "Comparison rate example", turnaround: "Turnaround (inspections, quotes)",
  pds_url: "PDS link", tmd_url: "TMD link", privacy_url: "Their privacy policy", referral_url: "Quote link ({amount} {term} {make} {model} {year} {postcode} {lot})", commission_note: "Commission note shown to customers (say how much, or how it's worked out)",
  rate_from: "Rate from (% p.a.)", comparison_rate: "Comparison rate (% p.a.)", establishment_fee: "Establishment fee ($)", monthly_fee: "Monthly fee ($)", min_amount: "Min loan ($)", max_amount: "Max loan ($)",
  min_term_months: "Min term (months)", max_term_months: "Max term (months)", price_from: "Inspection price from ($)", sort: "Order on the page",
};

// Add or edit a partner. Writes with the admin's own session (row level security allows admins).
export function PartnerEditor({ partner, priv }: { partner: Partner | null; priv: Priv }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { kind: partner?.kind || "finance" };
    for (const k of [...NUM, ...TXT]) o[k] = partner?.[k] != null ? String(partner[k]) : k === "comparison_basis" ? "$30,000 secured loan over 5 years" : "";
    for (const [k] of [...INSURANCE_FEATURES, ...WARRANTY_FEATURES]) o[`f_${k}`] = partner?.features?.[k] != null ? String(partner.features[k]) : "";
    o.lead_email = priv?.lead_email || ""; o.contact_name = priv?.contact_name || ""; o.notes = priv?.notes || "";
    return o;
  });
  const [flags, setFlags] = useState({ active: partner?.active ?? false, sponsored: partner?.sponsored ?? false, accepts_leads: partner?.accepts_leads ?? true, sample: partner?.sample ?? false });
  const [msg, setMsg] = useState("");
  const kind = f.kind as PartnerKind;

  async function save() {
    setMsg("");
    if (!f.name.trim() || !/^[a-z0-9-]{2,40}$/.test(f.slug)) return setMsg("Enter a name and a short link name (a-z, 0-9, -).");
    if (kind === "finance" && f.rate_from && !f.comparison_rate) return setMsg("A finance rate must have its comparison rate (credit law).");
    if (flags.active && ["finance", "insurance", "warranty"].includes(kind) && !f.licence.trim()) return setMsg(kind === "warranty" ? "Enter their AFSL (or the insurer behind the warranty) before switching them on." : "Enter their credit licence or AFSL before switching them on.");
    if (flags.active && !f.commission_note.trim()) return setMsg("Enter the commission note before switching them on (customers must be told).");
    const row: Record<string, unknown> = { kind, ...flags, updated_at: new Date().toISOString() };
    for (const k of TXT) row[k] = f[k].trim() || null;
    row.name = f.name.trim(); row.slug = f.slug;
    for (const k of NUM) row[k] = f[k] === "" ? null : Number(f[k]);
    row.sort = Number(f.sort) || 0;
    if (kind === "insurance") row.features = Object.fromEntries(INSURANCE_FEATURES.filter(([k]) => f[`f_${k}`] !== "").map(([k]) => [k, k === "excess_from" ? Number(f[`f_${k}`]) : f[`f_${k}`]]));
    if (kind === "warranty") row.features = Object.fromEntries(WARRANTY_FEATURES.filter(([k]) => f[`f_${k}`] !== "").map(([k]) => [k, f[`f_${k}`]]));
    const db = supabaseBrowser();
    const res = partner ? await db.from("partners").update(row).eq("id", partner.id).select("id").single() : await db.from("partners").insert(row).select("id").single();
    if (res.error) return setMsg(res.error.message);
    const p = await db.from("partner_private").upsert({ partner_id: res.data.id, lead_email: f.lead_email.trim() || null, contact_name: f.contact_name.trim() || null, notes: f.notes.trim() || null });
    if (p.error) return setMsg(p.error.message);
    await fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partners: true }) }).catch(() => undefined);
    setMsg("Saved."); setOpen(false); router.refresh();
  }

  if (!open) return <button className={partner ? "btn btn-soft" : "btn btn-dark"} style={{ height: 38, fontSize: 13, padding: "0 14px", alignSelf: "flex-start" }} onClick={() => setOpen(true)}>{partner ? "Edit" : "Add a partner"}</button>;
  const input = (k: string) => <label className="field" key={k}><span>{LABEL[k] || k}</span><input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
      <label className="field"><span>Type</span><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} disabled={!!partner}><option value="finance">Finance (lender or broker)</option><option value="insurance">Insurance</option><option value="inspection">Mobile inspection</option><option value="transport">Transport (car carrier)</option><option value="warranty">Warranty / roadside assistance</option></select></label>
      <div className="grid2">{["name", "slug", "licence", "sort"].map(input)}</div>
      {input("blurb")}
      {kind === "finance" && <div className="grid3">{["rate_from", "comparison_rate", "comparison_basis", "establishment_fee", "monthly_fee", "min_amount", "max_amount", "min_term_months", "max_term_months"].map(input)}</div>}
      {kind === "inspection" && <div className="grid2">{["price_from", "turnaround"].map(input)}</div>}
      {kind === "transport" && <div className="grid2">{["turnaround"].map(input)}</div>}
      {kind === "warranty" && <><div className="grid3">{WARRANTY_FEATURES.map(([k, l]) => <label className="field" key={k}><span>{l}</span><input className="input" value={f[`f_${k}`]} onChange={(e) => setF({ ...f, [`f_${k}`]: e.target.value })} /></label>)}</div><div className="grid2">{["pds_url", "tmd_url"].map(input)}</div></>}
      {kind === "insurance" && <><div className="grid3">{INSURANCE_FEATURES.map(([k, l]) => <label className="field" key={k}><span>{l}</span><input className="input" value={f[`f_${k}`]} onChange={(e) => setF({ ...f, [`f_${k}`]: e.target.value })} /></label>)}</div><div className="grid2">{["pds_url", "tmd_url"].map(input)}</div></>}
      <div className="grid2">{["referral_url", "privacy_url"].map(input)}</div>
      {input("commission_note")}
      <div className="grid3">
        <label className="field"><span>Leads go to (email)</span><input className="input" type="email" value={f.lead_email} onChange={(e) => setF({ ...f, lead_email: e.target.value })} /></label>
        <label className="field"><span>Contact name</span><input className="input" value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></label>
        <label className="field"><span>Private notes (agreement, fee)</span><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      <div className="pill-row">{(Object.keys(flags) as (keyof typeof flags)[]).map((k) => <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} /> {k === "active" ? "Show on the site" : k === "accepts_leads" ? "Takes call-back requests" : k === "sponsored" ? "Sponsored (labelled)" : "Sample data"}</label>)}</div>
      {msg && <span className={msg === "Saved." ? "notice ok" : "notice bad"}>{msg}</span>}
      <span style={{ display: "flex", gap: 8 }}><button className="btn btn-blue" style={{ height: 42, fontSize: 14 }} onClick={save}>Save</button><button className="btn btn-soft" style={{ height: 42, fontSize: 14 }} onClick={() => setOpen(false)}>Cancel</button></span>
    </div>
  );
}
