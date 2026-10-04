"use client";
import { LeadButton } from "@/components/Partners";
import type { Partner } from "@/lib/types";

const FEATURES: [string, string][] = [["terms", "Cover terms"], ["roadside", "Roadside assistance"], ["claim_limit", "Claim limit"], ["excess", "Excess"], ["age_limit", "Vehicle limits"]];

export function WarrantyList({ providers, lot }: { providers: Partner[]; lot: { id: number; title: string } | null }) {
  if (!providers.length) return <div className="empty"><b style={{ fontSize: 20 }}>Warranty comparisons are coming soon.</b><span className="muted">Ask your insurer or the manufacturer about cover in the meantime.</span></div>;
  const q = lot ? `?src=warranty&lot=${lot.id}` : "?src=warranty";
  return (
    <div className="partners" data-testid="warranty-list">
      {providers.map((p) => (
        <article className="partner" key={p.id}>
          <div className="ph-head">
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 20 }}>{p.name}</b><span className="muted" style={{ fontSize: 13 }}>{[p.licence, p.blurb].filter(Boolean).join(" · ")}</span></span>
            {p.sponsored && <span className="tag" style={{ background: "var(--panel)" }}>Sponsored</span>}
          </div>
          <div className="feat">{FEATURES.map(([k, label]) => <div key={k}><span>{label}</span><b>{p.features?.[k] == null || p.features?.[k] === "" ? "Not stated" : String(p.features[k])}</b></div>)}</div>
          <div className="acts">
            {p.referral_url && <a className="btn btn-blue" href={`/go/${p.slug}${q}`} target="_blank" rel="sponsored noopener">Get a quote</a>}
            {p.accepts_leads && <LeadButton partner={p} kind="warranty" lotId={lot?.id} vehicle={lot ? `${lot.title} (lot ${lot.id})` : undefined} label="Ask them to call me" className={p.referral_url ? "btn btn-soft" : "btn btn-blue"} />}
          </div>
          <span className="hint">
            {p.pds_url && <a className="blue" href={p.pds_url} target="_blank" rel="noopener noreferrer">PDS</a>}{p.pds_url && p.tmd_url ? " · " : ""}{p.tmd_url && <a className="blue" href={p.tmd_url} target="_blank" rel="noopener noreferrer">TMD</a>}{(p.pds_url || p.tmd_url) ? ". " : ""}{p.commission_note}
          </span>
        </article>
      ))}
    </div>
  );
}
