"use client";
import { useState } from "react";
import { INSURANCE_FEATURES } from "@/lib/finance";
import { LeadButton } from "@/components/Partners";
import { money } from "@/lib/format";
import type { Partner } from "@/lib/types";

type LotRef = { id: number; title: string; make: string | null; model: string | null; year: number | null; postcode: string | null } | null;
const COVERS = ["Comprehensive", "Third party, fire and theft", "Third party property damage"];

export function InsuranceTool({ insurers, lot, initial }: { insurers: Partner[]; lot: LotRef; initial: { make: string; model: string; year: string } }) {
  const [make, setMake] = useState(lot?.make || initial.make);
  const [model, setModel] = useState(lot?.model || initial.model);
  const [year, setYear] = useState(String(lot?.year || initial.year || ""));
  const [postcode, setPostcode] = useState("");
  const [cover, setCover] = useState(COVERS[0]);
  const vehicle = lot ? `${lot.title} (lot ${lot.id})` : [year, make, model].filter(Boolean).join(" ") || undefined;
  const q = new URLSearchParams({ src: "insurance", make, model, year, postcode, ...(lot ? { lot: String(lot.id) } : {}) }).toString();
  const shown = (v: string | number | boolean | undefined, k: string) => v == null || v === "" ? "Not stated" : k === "excess_from" && typeof v === "number" ? money(v) : v === true ? "Yes" : v === false ? "No" : String(v);

  return (
    <>
      <div className="soft" style={{ gap: 14, background: "#FFFFFF", border: "1px solid var(--line)" }}>
        <div className="grid3">
          <label className="field"><span>Make</span><input className="input" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Toyota" /></label>
          <label className="field"><span>Model</span><input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. HiLux" /></label>
          <label className="field"><span>Year</span><input className="input" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Where it&apos;ll be kept (postcode)</span><input className="input" inputMode="numeric" maxLength={4} value={postcode} onChange={(e) => setPostcode(e.target.value.replace(/\D/g, ""))} /></label>
          <label className="field"><span>Cover</span><select className="input" value={cover} onChange={(e) => setCover(e.target.value)}>{COVERS.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 className="d3" style={{ fontSize: 40 }}>Compare insurers.</h2>
        {insurers.length === 0 ? (
          <div className="empty"><b style={{ fontSize: 20 }}>Insurance comparisons are coming soon.</b><span className="muted">Arrange cover with your insurer before collection day.</span></div>
        ) : (
          <div className="partners">
            {insurers.map((p) => (
              <article className="partner" key={p.id}>
                <div className="ph-head">
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 20 }}>{p.name}</b><span className="muted" style={{ fontSize: 13 }}>{[p.licence, p.blurb].filter(Boolean).join(" · ")}</span></span>
                  {p.sponsored && <span className="tag" style={{ background: "var(--panel)" }}>Sponsored</span>}
                </div>
                <div className="feat">{INSURANCE_FEATURES.map(([k, label]) => <div key={k}><span>{label}</span><b>{shown(p.features?.[k], k)}</b></div>)}</div>
                <div className="acts">
                  {p.referral_url && <a className="btn btn-blue" href={`/go/${p.slug}?${q}`} target="_blank" rel="sponsored noopener">Get a quote</a>}
                  {p.accepts_leads && <LeadButton partner={p} kind="insurance" lotId={lot?.id} details={{ cover, ...(year ? { vehicle: `${year} ${make} ${model}`.trim() } : {}) }} vehicle={vehicle} needPostcode label="Ask them to call me" className={p.referral_url ? "btn btn-soft" : "btn btn-blue"} />}
                </div>
                <span className="hint">
                  {p.pds_url && <a className="blue" href={p.pds_url} target="_blank" rel="noopener noreferrer">PDS</a>}{p.pds_url && p.tmd_url ? " · " : ""}{p.tmd_url && <a className="blue" href={p.tmd_url} target="_blank" rel="noopener noreferrer">TMD</a>}{(p.pds_url || p.tmd_url) ? ". " : ""}{p.commission_note}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
