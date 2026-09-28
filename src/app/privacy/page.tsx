import type { Metadata } from "next";
import { PRIVACY } from "@/content/legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <div className="wrap">
      <div className="center hero" style={{ paddingBottom: 0 }}>
        <h1 className="d2">Privacy policy.</h1>
        <p className="lede">How Tyrebiter collects, uses and protects your information under the Privacy Act 1988.</p>
      </div>
      <div className="notice" style={{ margin: "32px auto 0", maxWidth: 880 }}>Draft for review by an Australian lawyer before launch.</div>
      <div style={{ maxWidth: 760, margin: "48px auto 0", display: "flex", flexDirection: "column", gap: 36 }}>
        {PRIVACY.map(([h, p]) => (
          <div key={h} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>{h}</h2>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink2)" }}>{p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
