import type { Metadata } from "next";
import { SellForm } from "./SellForm";
import { CarArt } from "@/components/CarArt";
import { HELP as RAW, SELLER_AGREEMENT, fillLegal, legalValues } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sell your car or truck", description: "Sell your car, ute, truck, caravan, boat or machinery by online auction to verified buyers Australia-wide. Fill in one short form, sign on your phone, and we photograph it at your place.", alternates: { canonical: "/sell" } };

const STEPS = [
  ["1", "Fill in and sign", "What it is, how it's going, a few phone photos, reserve or no reserve, then sign with your finger. About 10 minutes.", "tangerine"],
  ["2", "We call you", "Within 1 business day, with a price guide. Then you verify your ID in your browser: about 2 minutes.", "sun"],
  ["3", "Photos at your place", "We photograph the vehicle and prepare its condition report where it's kept.", "lime"],
  ["4", "7-day auction", "Listed to verified buyers nationwide. No viewings: buyers book an independent mobile inspection instead.", "sky"],
  ["5", "Settlement", "The buyer pays Tyrebiter and the registration is transferred, then they collect at a booked time. You're paid within 3 business days of collection.", "grape"],
];
const CMP = [["Who deals with buyers", "You", "The dealer", "Tyrebiter"], ["Price achieved", "What you can negotiate", "Usually trade price", "What buyers compete to pay"], ["Photos and listing", "Your own", "Not needed", "Professional, at your place"], ["Visitors to your home", "Every interested buyer", "None", "Only the buyer, to collect"], ["Payment risk", "Scams and bounced transfers", "Low", "Low: the buyer pays us first"], ["Paperwork", "All yours", "Handled", "Handled, including the rego transfer"]];

export default async function Sell() {
  const settings = await getSettingsCached();
  const v = legalValues(settings);
  const HELP = fillLegal(RAW, settings);
  const sellFaq = HELP.find((h) => h[0] === "h-sell")?.[2] || [];
  const clauses = fillLegal(SELLER_AGREEMENT, settings);
  return (
    <div className="wrap">
      <div className="center hero">
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Sell your car, ute or truck</span>
        <h1 className="d1" style={{ fontSize: "clamp(56px,10vw,124px)" }}>Sold properly.<br /><span className="serif" style={{ color: "var(--grape)" }}>From your driveway.</span></h1>
        <p className="lede">We photograph your vehicle and check it against the listing at your place, auction it to buyers across Australia, and pay you once the buyer has paid and collected.</p>
      </div>
      <div className="sf-wrap" id="appraisal">
        <SellForm clauses={clauses} phone={env.phone} />
      </div>

      <section id="how-sell">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>How selling works.</h2>
        <div className="steps5">{STEPS.map(([n, t, d, c]) => <div key={n}><span className={`dot bg-${c}`} style={c === "grape" ? { color: "#FFFFFF" } : undefined}>{n}</span><h3 style={{ fontSize: 22, fontWeight: 800 }}>{t}</h3><p className="muted">{d}</p></div>)}</div>
      </section>

      <section>
        <div className="panel">
          <div className="center" style={{ gap: 16, marginBottom: 48 }}>
            <h2 className="d2">Presented at <span className="serif">its best.</span></h2>
            <p className="lede">Our photographer comes to you for a full walkaround and a graded condition report. Every vehicle is presented to the same standard, whatever it&apos;s worth.</p>
          </div>
          <div className="two" style={{ gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="stage" style={{ height: 380, borderRadius: 32, background: "#A5A29B" }}><CarArt style={{ transform: "translateX(-50%) rotate(-5deg)", opacity: 0.45 }} /></div><b style={{ fontSize: 20, textAlign: "center" }}>Before.</b></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="stage bg-sky" style={{ height: 380, borderRadius: 32 }}><CarArt /></div><b style={{ fontSize: 20, textAlign: "center" }}>After.</b></div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 40 }}>Compare your options.</h2>
        <div className="cmp"><table><thead><tr><th scope="col"><span className="hide">Feature</span></th><th scope="col">Private sale</th><th scope="col">Dealer trade-in</th><th scope="col" className="us" style={{ color: "var(--ink)" }}>Tyrebiter</th></tr></thead>
          <tbody>{CMP.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="muted">{r[1]}</td><td className="muted">{r[2]}</td><td className="us">{r[3]}</td></tr>)}</tbody></table></div>
      </section>

      <section id="fees">
        <div className="center" style={{ gap: 14, marginBottom: 40 }}><h2 className="d2">Simple fees.</h2><p className="lede">Agreed before we list. No sale, no commission.</p></div>
        <div className="fees">
          <div className="bg-sun"><span style={{ fontSize: 18, fontWeight: 700 }}>Listing</span><b>$0</b><span>7-day online auction, Australia-wide.</span></div>
          <div className="bg-sky"><span style={{ fontSize: 18, fontWeight: 700 }}>Photos &amp; condition report</span><b>$0</b><span>Professional photos, condition report and PPSR search.</span></div>
          <div className="bg-grape" style={{ color: "#FFFFFF" }}><span style={{ fontSize: 18, fontWeight: 700 }}>Seller fee</span><b>{v.SELLER_FEE.startsWith("none") ? "$0" : v.SELLER_FEE.split(" of")[0]}</b><span>{v.SELLER_FEE.startsWith("none") ? "Buyers pay our fees. You receive the sale price, less any finance we pay out." : "Only when it sells."}</span></div>
        </div>
      </section>

      <section id="fleet">
        <div className="panel" style={{ background: "var(--ink)", color: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}><h2 className="d3" style={{ color: "#FFFFFF" }}>Trucks, fleets &amp; estates.</h2><p style={{ fontSize: 20, color: "#D2D2D7" }}>Selling several vehicles, a fleet or a deceased estate? One consultant, one agreement, anywhere in Australia.</p></div>
          <a className="btn" style={{ background: "var(--lime)", color: "var(--ink)" }} href="#appraisal">Start the form above</a>
        </div>
      </section>

      <section className="center">
        <h2 className="d2" style={{ marginBottom: 32 }}>Questions.</h2>
        <div className="faq">{sellFaq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>
    </div>
  );
}
