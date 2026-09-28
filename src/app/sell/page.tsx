import type { Metadata } from "next";
import { AppraisalForm } from "./AppraisalForm";
import { CarArt } from "@/components/CarArt";
import { HELP as RAW, fillLegal, legalValues } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";

export const metadata: Metadata = { title: "Sell your car or truck" };

const STEPS = [["1", "Free appraisal", "Tell us about it. We call with a price range and a suggested reserve.", "tangerine"], ["2", "We come to you", "Our photographer shoots a full walkaround and condition report at your place.", "sun"], ["3", "7-day auction", "Live to buyers nationwide. Watch every bid from your phone.", "lime"], ["4", "Viewings by appointment", "We book ID-verified bidders in with you. You just open the gate.", "sky"], ["5", "Get paid", "The buyer pays us and collects from you. Your money lands within 3 business days of collection.", "grape"]];
const CMP = [["Who deals with buyers", "You", "The dealer", "We do, and book every viewing"], ["Price you get", "What you can haggle", "Usually wholesale", "What buyers compete to pay"], ["Photos & listing", "Your phone", "Not needed", "Pro photos at your place"], ["Payment risk", "Scams, bounced transfers", "Low", "Low: buyer pays us first"], ["Paperwork", "All on you", "Handled", "Handled"]];

export default async function Sell() {
  const settings = await getSettingsCached();
  const v = legalValues(settings);
  const HELP = fillLegal(RAW, settings);
  const sellFaq = HELP.find((h) => h[0] === "h-sell")?.[2] || [];
  return (
    <div className="wrap">
      <div className="center hero">
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Sell your car, ute or truck</span>
        <h1 className="d1" style={{ fontSize: "clamp(56px,10vw,124px)" }}>Skip the<br /><span className="serif" style={{ color: "var(--grape)" }}>tyre-kickers.</span></h1>
        <p className="lede">Leave it in your driveway. We photograph it at your place, sell it to buyers right across Australia, and pay you when the buyer settles.</p>
      </div>
      <div className="sellhero" id="appraisal">
        <div className="stage bg-berry">
          <span style={{ fontSize: "clamp(28px,3.2vw,44px)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.04, maxWidth: 520, position: "relative" }}>No lowball texts. No time-wasters. No fake bank transfers.</span>
          <CarArt type="ute" />
          <div className="mini3">
            <div><b>Viewings by appointment</b><span style={{ fontSize: 14, color: "var(--ink2)" }}>ID-verified bidders only.</span></div>
            <div><b>Buyers compete</b><span style={{ fontSize: 14, color: "var(--ink2)" }}>Your reserve protects you.</span></div>
            <div><b>We pay you</b><span style={{ fontSize: 14, color: "var(--ink2)" }}>Buyer pays us first.</span></div>
          </div>
        </div>
        <AppraisalForm />
      </div>

      <section id="how-sell">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>Keys to cash. Five steps.</h2>
        <div className="steps5">{STEPS.map(([n, t, d, c]) => <div key={n}><span className={`dot bg-${c}`} style={c === "grape" ? { color: "#FFFFFF" } : undefined}>{n}</span><h3 style={{ fontSize: 22, fontWeight: 800 }}>{t}</h3><p className="muted">{d}</p></div>)}</div>
      </section>

      <section>
        <div className="panel">
          <div className="center" style={{ gap: 16, marginBottom: 48 }}>
            <h2 className="d2">We make it look <span className="serif">worth buying.</span></h2>
            <p className="lede">Our photographer comes to you, shoots a full walkaround and a graded condition report, and we set every photo on its own colour backdrop. Every vehicle gets the same treatment, whatever it&apos;s worth.</p>
          </div>
          <div className="two" style={{ gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="stage" style={{ height: 380, borderRadius: 32, background: "#A5A29B" }}><CarArt style={{ transform: "translateX(-50%) rotate(-5deg)", opacity: 0.45 }} /></div><b style={{ fontSize: 20, textAlign: "center" }}>Before. $3,000 of car.</b></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="stage bg-sky" style={{ height: 380, borderRadius: 32 }}><CarArt /></div><b style={{ fontSize: 20, textAlign: "center" }}>After. The same car, wanted.</b></div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 40 }}>The better way to sell.</h2>
        <div className="cmp"><table><thead><tr><th scope="col"><span className="hide">Feature</span></th><th scope="col">Private sale</th><th scope="col">Dealer trade-in</th><th scope="col" className="us" style={{ color: "var(--ink)" }}>Tyrebiter</th></tr></thead>
          <tbody>{CMP.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="muted">{r[1]}</td><td className="muted">{r[2]}</td><td className="us">{r[3]}</td></tr>)}</tbody></table></div>
      </section>

      <section id="fees">
        <div className="center" style={{ gap: 14, marginBottom: 40 }}><h2 className="d2">Simple fees.</h2><p className="lede">Agreed before we list. No sale, no commission.</p></div>
        <div className="fees">
          <div className="bg-sun"><span style={{ fontSize: 18, fontWeight: 700 }}>Listing</span><b>$0</b><span>7-day online auction, Australia-wide.</span></div>
          <div className="bg-sky"><span style={{ fontSize: 18, fontWeight: 700 }}>Photos &amp; condition report</span><b>$0</b><span>Walkaround photos, report and PPSR search.</span></div>
          <div className="bg-grape" style={{ color: "#FFFFFF" }}><span style={{ fontSize: 18, fontWeight: 700 }}>Seller fee</span><b>{v.SELLER_FEE.startsWith("none") ? "$0" : v.SELLER_FEE.split(" of")[0]}</b><span>{v.SELLER_FEE.startsWith("none") ? "Buyers pay our fees. You keep the sale price (less any finance we pay out)." : "Only when it sells."}</span></div>
        </div>
      </section>

      <section id="fleet">
        <div className="panel" style={{ background: "var(--ink)", color: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}><h2 className="d3" style={{ color: "#FFFFFF" }}>Trucks, fleets &amp; estates.</h2><p style={{ fontSize: 20, color: "#D2D2D7" }}>Selling several vehicles, a truck fleet or a deceased estate? One contact, one agreement, collected from anywhere in Australia.</p></div>
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
