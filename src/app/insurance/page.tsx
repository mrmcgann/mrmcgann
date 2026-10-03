import type { Metadata } from "next";
import Link from "next/link";
import { getLotCached, getPartnersCached } from "@/lib/cache";
import { REFERRER_NOTE } from "@/lib/partners";
import { InsuranceTool } from "./InsuranceTool";

export const metadata: Metadata = {
  title: "Car insurance",
  description: "Compare car, ute, truck, motorbike, caravan and boat insurance side by side, then get a quote.",
};

const COVER: [string, string][] = [
  ["Comprehensive", "Covers damage to your vehicle and other people's property, plus theft, fire, storm and flood, whoever is at fault."],
  ["Third party, fire and theft", "Covers damage you cause to other people's property, plus your vehicle if it's stolen or burnt. Usually not accident damage to your own vehicle."],
  ["Third party property damage", "Covers damage you cause to other people's vehicles and property. Doesn't cover your own vehicle."],
  ["CTP (green slip)", "Compulsory with registration, and covers injury to people, not damage to vehicles or property."],
];

export default async function InsurancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lotId = Number(sp.lot);
  const bundle = Number.isSafeInteger(lotId) && lotId > 0 ? await getLotCached(lotId).catch(() => null) : null;
  const lot = bundle && bundle.lot.status !== "draft" ? bundle.lot : null;
  const insurers = (await getPartnersCached()).filter((p) => p.kind === "insurance");

  return (
    <div className="wrap" style={{ maxWidth: 1080, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Car insurance</span>
        <h1 className="d2">Arrange cover before you collect.</h1>
        <p className="lede" style={{ margin: 0 }}>The vehicle is your responsibility from handover. Compare what insurers offer side by side, then get a quote.</p>
      </div>
      {lot && <div className="notice"><b>Vehicle:</b> <Link className="blue" href={`/lot/${lot.id}`}>{lot.title}</Link> (lot {lot.id}). We&apos;ll pass the make, model and year to the insurer you choose.</div>}
      <InsuranceTool insurers={insurers} lot={lot ? { id: lot.id, title: lot.title, make: lot.make, model: lot.model, year: lot.year, postcode: lot.postcode || null } : null} initial={{ make: sp.make || "", model: sp.model || "", year: sp.year || "" }} />

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 className="d3" style={{ fontSize: 40 }}>Types of cover.</h2>
        <div className="rows covers">{COVER.map(([k, v]) => <div key={k}><b>{k}</b><span className="muted" style={{ textAlign: "right" }}>{v}</span></div>)}</div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Important information</h2>
        <p className="hint" style={{ margin: 0 }}>{REFERRER_NOTE.insurance}</p>
        <p className="hint" style={{ margin: 0 }}>Features are as published by each insurer and can change. Prices aren&apos;t shown because they depend on you and the vehicle; each insurer quotes for itself. Cover is subject to the insurer&apos;s terms, conditions, limits and exclusions.</p>
      </section>
    </div>
  );
}
