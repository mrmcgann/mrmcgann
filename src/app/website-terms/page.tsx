import type { Metadata } from "next";
import Link from "next/link";
import { WEBSITE_TERMS, WEBSITE_TERMS_VERSION_LABEL, fillLegal } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";

export const metadata: Metadata = { title: "Website terms" };

export default async function WebsiteTerms() {
  const clauses = fillLegal(WEBSITE_TERMS, await getSettingsCached());
  return (
    <div className="wrap" style={{ maxWidth: 820, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <span className="eyebrow" style={{ color: "var(--grape)" }}>Using Tyrebiter</span>
      <h1 className="d2">Website terms.</h1>
      <p className="lede" style={{ margin: 0 }}>The rules for using the website and app: your account, fair use, our content, and when an account can be suspended.</p>
      <div className="notice">{WEBSITE_TERMS_VERSION_LABEL}. Draft for review by an Australian lawyer before launch. Items in [brackets] need Tyrebiter&apos;s details.</div>
      {clauses.map(([id, title, paras]) => (
        <section key={id} id={id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
          {paras.map((p, i) => <p key={i} style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink2)" }} dangerouslySetInnerHTML={{ __html: p }} />)}
        </section>
      ))}
      <div className="pill-row"><Link className="btn btn-blue" href="/terms">Terms of sale</Link><Link className="btn btn-soft" href="/privacy">Privacy policy</Link></div>
    </div>
  );
}
