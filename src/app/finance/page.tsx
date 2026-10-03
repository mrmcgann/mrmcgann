import type { Metadata } from "next";
import Link from "next/link";
import { getLotCached, getPartnersCached } from "@/lib/cache";
import { COMPARISON_WARNING } from "@/lib/finance";
import { REFERRER_NOTE } from "@/lib/partners";
import { FinanceTool } from "./FinanceTool";

export const metadata: Metadata = {
  title: "Car finance",
  description: "Work out repayments on any car, ute, truck, motorbike, caravan or boat, then compare lenders and brokers side by side.",
};
export const revalidate = 300;

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lotId = Number(sp.lot);
  const bundle = Number.isSafeInteger(lotId) && lotId > 0 ? await getLotCached(lotId).catch(() => null) : null;
  const lot = bundle && bundle.lot.status !== "draft" ? bundle.lot : null;
  const lenders = (await getPartnersCached()).filter((p) => p.kind === "finance");
  const price = lot ? lot.buy_now_price || Math.max(lot.current_bid || 0, lot.start_price || 0) : Math.min(Math.max(Number(sp.price) || 25000, 1000), 2000000);

  return (
    <div className="wrap" style={{ maxWidth: 1080, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
        <span className="eyebrow" style={{ color: "var(--blue)" }}>Car finance</span>
        <h1 className="d2">Finance your next vehicle.</h1>
        <p className="lede" style={{ margin: 0 }}>Work out your repayments, then compare lenders and brokers side by side. Get pre-approved before you bid, so you know exactly what you can spend.</p>
      </div>
      {lot && <div className="notice"><b>Vehicle:</b> <Link className="blue" href={`/lot/${lot.id}`}>{lot.title}</Link> (lot {lot.id}). Price shown is the {lot.buy_now_price ? "Buy Now price" : "current bid"}. Allow for the buyer&apos;s premium and fees.</div>}
      <FinanceTool lenders={lenders} initialPrice={price} lot={lot ? { id: lot.id, title: lot.title, make: lot.make, model: lot.model, year: lot.year } : null} />

      <section id="warning" style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Important information</h2>
        <p className="hint" style={{ margin: 0 }}>Repayments are estimates only, based on the figures you enter and each lender&apos;s advertised &quot;from&quot; rate. They aren&apos;t offers or approvals of credit. Your rate depends on your circumstances and the lender&apos;s criteria. Fees and charges apply.</p>
        <p className="hint" style={{ margin: 0 }}>Comparison rates are each lender&apos;s, based on the example shown (usually a $30,000 secured loan over 5 years). <b>{COMPARISON_WARNING}</b></p>
        <p className="hint" style={{ margin: 0 }}>{REFERRER_NOTE.finance} We don&apos;t compare every lender in the market.</p>
      </section>
    </div>
  );
}
