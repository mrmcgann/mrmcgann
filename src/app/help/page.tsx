import Link from "next/link";
import type { Metadata } from "next";
import { HELP } from "@/content/legal";
import { GRADES } from "@/lib/grades";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Help centre" };

export default function Help() {
  return (
    <div className="wrap">
      <div className="center hero" style={{ paddingBottom: 0 }}>
        <span className="eyebrow" style={{ color: "var(--blue)" }}>Help centre</span>
        <h1 className="d2">How can we help?</h1>
        <p className="lede">Everything about buying and selling on Tyrebiter, in plain English.</p>
      </div>
      <div className="four" style={{ marginTop: 40 }}>
        {HELP.map(([id, title, qs], i) => (
          <a key={id} className={`tile bg-${["sun", "sky", "lime", "berry", "mint", "lilac", "coral"][i % 7]}`} href={`#${id}`} style={{ padding: 24 }}>
            <h3>{title}</h3><span style={{ fontWeight: 600 }}>{qs.length} answers ›</span>
          </a>
        ))}
      </div>
      {HELP.map(([id, title, qs]) => (
        <section key={id} id={id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h2 className="d3" style={{ marginBottom: 16, width: "min(880px,100%)" }}>{title}.</h2>
          <div className="faq">
            {qs.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                {a === "INCREMENTS" ? (
                  <><p>Each auto-bid step depends on the current bid.</p>
                    <div className="cmp" style={{ marginTop: 6 }}><table style={{ minWidth: 0 }}><thead><tr><th scope="col">Current bid</th><th scope="col">Increment</th></tr></thead><tbody><tr><td>Under $5,000</td><td>$100</td></tr><tr><td>$5,000 to $19,999</td><td>$250</td></tr><tr><td>$20,000 and over</td><td>$500</td></tr></tbody></table></div></>
                ) : a === "GRADES" ? (
                  <div className="cmp" style={{ marginTop: 10 }}><table style={{ minWidth: 0 }}><thead><tr><th scope="col">Grade</th><th scope="col">What it means</th></tr></thead><tbody>{GRADES.map(([g, n, d]) => <tr key={g}><td style={{ whiteSpace: "nowrap" }}>{g} · {n}</td><td style={{ textAlign: "left", color: "var(--ink2)" }}>{d}</td></tr>)}</tbody></table></div>
                ) : <p>{a}</p>}
              </details>
            ))}
          </div>
        </section>
      ))}
      <section>
        <div className="panel" style={{ display: "flex", justifyContent: "space-between", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><h2 className="d3">Still need help?</h2><p className="muted" style={{ fontSize: 18 }}>Call {env.phone}, Monday to Friday, 8:30 am to 5 pm AEST, or email {env.supportEmail}.</p></div>
          <Link className="btn btn-dark" href="/terms">Read the terms of sale</Link>
        </div>
      </section>
    </div>
  );
}
