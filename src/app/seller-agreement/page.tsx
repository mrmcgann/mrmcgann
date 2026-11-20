import type { Metadata } from "next";
import Link from "next/link";
import { SELLER_AGREEMENT, fillLegal } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";
import { sellCategories, sellNoun } from "@/lib/vehicles";

export const metadata: Metadata = { title: "Seller agency agreement", description: "The agreement attached to every seller's appointment of Super Trucker (Queensland Form 9): fees, reserve, what you promise buyers, and how you get paid.", alternates: { canonical: "/seller-agreement" } };

export default async function SellerAgreement() {
  const settings = await getSettingsCached();
  const clauses = fillLegal(SELLER_AGREEMENT, settings);
  const noun = sellNoun(sellCategories(settings?.selling as { categories?: unknown } | undefined));
  return (
    <div className="wrap" style={{ maxWidth: 820, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <span className="eyebrow" style={{ color: "var(--grape)" }}>Selling with Super Trucker</span>
      <h1 className="d2">Seller agency agreement.</h1>
      <p className="lede" style={{ margin: 0 }}>What we do for you, what you promise buyers, and how you get paid. It&apos;s Annexure A to your appointment of Super Trucker on Queensland&apos;s approved form (Form 9), which you sign online before your {noun} is listed.</p>
      <div className="notice">Draft for review by an Australian lawyer before launch. Items in [brackets] need Super Trucker&apos;s details.</div>
      {clauses.map(([id, title, paras]) => (
        <section key={id} id={id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
          {paras.map((p, i) => <p key={i} style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink2)" }} dangerouslySetInnerHTML={{ __html: p }} />)}
        </section>
      ))}
      <div className="pill-row"><Link className="btn btn-blue" href="/sell">Sell your {noun}</Link><Link className="btn btn-soft" href="/terms">Terms of sale for buyers</Link></div>
    </div>
  );
}
