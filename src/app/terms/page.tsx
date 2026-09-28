import type { Metadata } from "next";
import Link from "next/link";
import { TERMS as RAW, fillLegal, TERMS_VERSION_LABEL } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";

export const metadata: Metadata = { title: "Terms of sale" };

export default async function Terms() {
  const TERMS = fillLegal(RAW, await getSettingsCached());
  return (
    <div className="wrap">
      <div className="center hero" style={{ paddingBottom: 0 }}>
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Buying with Tyrebiter</span>
        <h1 className="d2">Terms of sale.</h1>
        <p className="lede">Plain English, because you should know exactly what you&apos;re agreeing to before you bid.</p>
      </div>
      <div className="notice" style={{ margin: "32px auto 0", maxWidth: 880 }}>{TERMS_VERSION_LABEL}. Draft for review. Items in [brackets] need Tyrebiter&apos;s details, and the whole document should be checked by an Australian lawyer before launch.</div>
      <div className="acctgrid" style={{ paddingTop: 48 }}>
        <nav className="side-nav" aria-label="Sections" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
          {TERMS.map(([id, title]) => <a key={id} href={`#${id}`} style={{ height: "auto", minHeight: 40, padding: "8px 16px", fontSize: 14 }}>{title}</a>)}
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 48, maxWidth: 760 }}>
          {TERMS.map(([id, title, paras], i) => (
            <section key={id} id={id} style={{ padding: i === 0 ? 32 : 0, borderRadius: 32, background: i === 0 ? "var(--panel)" : "transparent", display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 style={{ fontSize: i === 0 ? 32 : 28, fontWeight: 800, letterSpacing: "-0.03em" }}>{title}</h2>
              {i === 0
                ? <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10, fontSize: 17 }}>{paras.map((p) => <li key={p} dangerouslySetInnerHTML={{ __html: p }} />)}</ul>
                : paras.map((p) => <p key={p} style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink2)" }} dangerouslySetInnerHTML={{ __html: p }} />)}
            </section>
          ))}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="btn btn-blue" href="/auctions">Browse auctions</Link><Link className="btn btn-soft" href="/sell">Selling? See how it works</Link></div>
        </div>
      </div>
    </div>
  );
}
