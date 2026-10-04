import type { Metadata } from "next";
import Link from "next/link";
import { getLotCached, getPartnersCached } from "@/lib/cache";
import { REFERRER_NOTE } from "@/lib/partners";
import { WarrantyList } from "./WarrantyList";

export const metadata: Metadata = {
  title: "Warranty and roadside assistance",
  description: "Extended mechanical warranty and roadside assistance for vehicles bought at auction, from independent providers. Compare what they cover, then ask for a quote.",
};

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lotId = Number(sp.lot);
  const bundle = Number.isSafeInteger(lotId) && lotId > 0 ? await getLotCached(lotId).catch(() => null) : null;
  const lot = bundle && bundle.lot.status !== "draft" ? bundle.lot : null;
  const providers = (await getPartnersCached()).filter((p) => p.kind === "warranty");
  return (
    <div className="wrap" style={{ maxWidth: 1080, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Warranty &amp; roadside</span>
        <h1 className="d2">Cover for the unexpected.</h1>
        <p className="lede" style={{ margin: 0 }}>Vehicles bought at auction don&apos;t come with a dealer&apos;s statutory warranty. If you&apos;d like cover for mechanical breakdowns or roadside help, compare what these independent providers offer, then ask for a quote.</p>
      </div>
      {lot && <div className="notice"><b>Vehicle:</b> <Link className="blue" href={`/lot/${lot.id}`}>{lot.title}</Link> (lot {lot.id}). We&apos;ll pass the vehicle and its odometer reading to the provider you choose.</div>}
      <WarrantyList providers={providers} lot={lot ? { id: lot.id, title: lot.title } : null} />
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="d3" style={{ fontSize: 40 }}>What you already have.</h2>
        <div className="rows covers">
          <div><b>Manufacturer&apos;s warranty</b><span className="muted" style={{ textAlign: "right" }}>Any that&apos;s left transfers with the vehicle. Check the service books and the manufacturer&apos;s terms.</span></div>
          <div><b>Consumer guarantees</b><span className="muted" style={{ textAlign: "right" }}>At auction you get the guarantees of clear title, undisturbed possession and no undisclosed securities. Buying outright from a business seller, more may apply. They&apos;re free: you don&apos;t need a warranty to keep them.</span></div>
          <div><b>Our claims process</b><span className="muted" style={{ textAlign: "right" }}>If the vehicle isn&apos;t as described, you can claim from your invoice. <Link className="blue" href="/terms#t-claims">Claims ›</Link></span></div>
        </div>
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Important information</h2>
        <p className="hint" style={{ margin: 0 }}>{REFERRER_NOTE.warranty}</p>
        <p className="hint" style={{ margin: 0 }}>Cover is as published by each provider and can change, and it&apos;s subject to their terms, limits and exclusions, including age and kilometre limits. Prices aren&apos;t shown because each provider quotes for the vehicle.</p>
      </section>
    </div>
  );
}
