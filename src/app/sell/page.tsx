import type { Metadata } from "next";
import { AppraisalForm } from "./AppraisalForm";
import { CarArt } from "@/components/CarArt";
import { HELP as RAW, fillLegal, legalValues } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";

export const metadata: Metadata = { title: "Sell your car or truck" };

const STEPS = [["1", "Type your plate", "We fill in the vehicle from the plate. Add the kilometres and anything we should know, and we call with a price guide and a suggested reserve.", "tangerine"], ["2", "Inspection and photos", "We photograph the vehicle and prepare its condition report at your place.", "sun"], ["3", "7-day auction", "Listed to registered buyers nationwide. Follow every bid from your phone.", "lime"], ["4", "No viewings", "Buyers don't visit to look at it. Inspections are done by an independent mobile mechanic, booked through us or your consultant.", "sky"], ["5", "Settlement", "The buyer pays Tyrebiter and the registration is transferred, then they collect at a booked time. You're paid within 3 business days of collection.", "grape"]];
const CMP = [["Who deals with buyers", "You", "The dealer", "Tyrebiter"], ["Price achieved", "What you can negotiate", "Usually trade price", "What buyers compete to pay"], ["Photos and listing", "Your own", "Not needed", "Professional, at your place"], ["Visitors to your home", "Every interested buyer", "None", "Only the buyer, to collect"], ["Payment risk", "Scams and bounced transfers", "Low", "Low: the buyer pays us first"], ["Paperwork", "All yours", "Handled", "Handled, including the rego transfer"]];

export default async function Sell() {
  const settings = await getSettingsCached();
  const v = legalValues(settings);
  const HELP = fillLegal(RAW, settings);
  const sellFaq = HELP.find((h) => h[0] === "h-sell")?.[2] || [];
  return (
    <div className="wrap">
      <div className="center hero">
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Sell your car, ute or truck</span>
        <h1 className="d1" style={{ fontSize: "clamp(56px,10vw,124px)" }}>Sold properly.<br /><span className="serif" style={{ color: "var(--grape)" }}>From your driveway.</span></h1>
        <p className="lede">We photograph and inspect your vehicle at your place, auction it to buyers across Australia, and pay you once the buyer has paid and collected.</p>
      </div>
      <div className="sellhero" id="appraisal">
        <div className="stage bg-berry">
          <span style={{ fontSize: "clamp(28px,3.2vw,44px)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.04, maxWidth: 520, position: "relative" }}>No viewings. No haggling. No payment scams.</span>
          <CarArt type="ute" />
          <div className="mini3">
            <div><b>No viewings</b><span style={{ fontSize: 14, color: "var(--ink2)" }}>Independent mobile inspections only.</span></div>
            <div><b>Buyers compete</b><span style={{ fontSize: 14, color: "var(--ink2)" }}>Your reserve protects you.</span></div>
            <div><b>We pay you</b><span style={{ fontSize: 14, color: "var(--ink2)" }}>Buyer pays us first.</span></div>
          </div>
        </div>
        <AppraisalForm />
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
          <a className="btn" style={{ background: "var(--lime)", color: "var(--ink)" }} href="#appraisal">Request an appraisal above</a>
        </div>
      </section>

      <section className="center">
        <h2 className="d2" style={{ marginBottom: 32 }}>Questions.</h2>
        <div className="faq">{sellFaq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>
    </div>
  );
}
