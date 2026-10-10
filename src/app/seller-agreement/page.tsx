import type { Metadata } from "next";
import Link from "next/link";
import { SELLER_AGREEMENT, fillLegal } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";

export const metadata: Metadata = { title: "Seller agency agreement", description: "The agreement sellers sign before their vehicle goes live at Tyrebiter: fees, reserve, what you promise buyers, and how you get paid.", alternates: { canonical: "/seller-agreement" } };

export default async function SellerAgreement() {
  const clauses = fillLegal(SELLER_AGREEMENT, await getSettingsCached());
  return (
    <div className="wrap" style={{ maxWidth: 820, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <span className="eyebrow" style={{ color: "var(--grape)" }}>Selling with Tyrebiter</span>
      <h1 className="d2">Seller agency agreement.</h1>
      <p className="lede" style={{ margin: 0 }}>What we do for you, what you promise buyers, and how you get paid. You sign it online before your vehicle goes live.</p>
      <div className="notice">Draft for review by an Australian lawyer before launch. Items in [brackets] need Tyrebiter&apos;s details.</div>
      {clauses.map(([id, title, paras]) => (
        <section key={id} id={id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
          {paras.map((p, i) => <p key={i} style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink2)" }} dangerouslySetInnerHTML={{ __html: p }} />)}
        </section>
      ))}
      <div className="pill-row"><Link className="btn btn-blue" href="/sell">Sell your vehicle</Link><Link className="btn btn-soft" href="/terms">Terms of sale for buyers</Link></div>
    </div>
  );
}
