import type { Metadata } from "next";
import { SellForm } from "./SellForm";
import { PHOTO_RULES, VIDEO_STEPS } from "@/lib/sellForm";
import { HELP as RAW, SELLER_AGREEMENT, fillLegal, legalValues } from "@/content/legal";
import { getSettingsCached } from "@/lib/cache";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sell your car or truck", description: "Sell your car, ute, truck, caravan, boat or machinery in a live online auction to verified buyers Australia-wide. Fill in one short form, add your phone photos and a short video, and sign on your phone. Nobody comes to your place until it's paid for.", alternates: { canonical: "/sell" } };

const steps = (v: Record<string, string>) => [
  ["1", "Fill in and sign", "What it is, how it's going, your phone photos, reserve or no reserve, then sign with your finger. About 10 minutes.", "tangerine"],
  ["2", "We call you", "Within 1 business day, with the auction estimate we'd put on it. Then you verify your ID in your browser: about 2 minutes.", "sun"],
  ["3", "Your video, our checks", "You film a short walkaround (we tell you exactly what). We check your photos, video and papers from here: we're never at your place.", "lime"],
  ["4", "Live auction", "Offered by our auctioneer in a live online auction to verified buyers nationwide, with the estimate on the listing. You can lower your reserve until the hammer falls. Buyers never visit and never get your name or address.", "sky"],
  ["5", "Pickup and payout", `The buyer pays Tyrebiter first. Then our transport partner picks it up from you and takes it to our depot, where the buyer collects it. You're paid within ${v.PAYOUT_DAYS} business days after their claim window closes.`, "grape"],
];
const CMP = [["Who deals with buyers", "You", "The dealer", "Tyrebiter"], ["Price achieved", "What you can negotiate", "Usually trade price", "What buyers compete to pay"], ["Photos and listing", "Your own", "Not needed", "Your phone photos and video, checked and written up by us"], ["Visitors to your home", "Every interested buyer", "None", "None: no buyers, no staff. Just the pickup, once it's paid for"], ["Payment risk", "Scams and bounced transfers", "Low", "Low: the buyer pays us first"], ["Paperwork", "All yours", "Handled", "Handled, including the rego transfer"]];

export default async function Sell() {
  const settings = await getSettingsCached();
  const v = legalValues(settings);
  const HELP = fillLegal(RAW, settings, { text: true });
  const sellFaq = HELP.find((h) => h[0] === "h-sell")?.[2] || [];
  const clauses = fillLegal(SELLER_AGREEMENT, settings);
  return (
    <div className="wrap">
      <div className="center hero">
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Sell your car, ute or truck</span>
        <h1 className="d1" style={{ fontSize: "clamp(56px,10vw,124px)" }}>Sold properly.<br /><span className="serif" style={{ color: "var(--grape)" }}>From your driveway.</span></h1>
        <p className="lede">Send us your phone photos and a short video. We check them and the papers, write the listing, put it in our next live auction for buyers across Australia, and pick it up once the buyer has paid. Nobody comes to your place before then.</p>
      </div>
      <div className="sf-wrap" id="appraisal">
        <SellForm clauses={clauses} phone={env.phone} />
      </div>

      <section id="how-sell">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>How selling works.</h2>
        <div className="steps5">{steps(v).map(([n, t, d, c]) => <div key={n}><span className={`dot bg-${c}`} style={c === "grape" ? { color: "#FFFFFF" } : undefined}>{n}</span><h3 style={{ fontSize: 22, fontWeight: 800 }}>{t}</h3><p className="muted">{d}</p></div>)}</div>
      </section>

      <section>
        <div className="panel" data-testid="sell-remote">
          <div className="center" style={{ gap: 16, marginBottom: 48 }}>
            <h2 className="d2">Your phone. <span className="serif">Our checks.</span></h2>
            <p className="lede">We&apos;re never at your vehicle: your photos and video are the listing. We check every one against the papers, the rego and the PPSR search before it goes up, and say on the listing what came from you and what we checked.</p>
          </div>
          <div className="two" style={{ gap: 24 }}>
            <div className="soft bg-lime" style={{ gap: 12 }}>
              <b style={{ fontSize: 22 }}>The photos.</b>
              <ul className="sf-rules" style={{ color: "var(--ink)" }}>{PHOTO_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            <div className="soft bg-sky" style={{ gap: 12 }}>
              <b style={{ fontSize: 22 }}>The walkaround video.</b>
              <ol className="sf-rules" style={{ color: "var(--ink)" }}>{VIDEO_STEPS.map((r) => <li key={r}>{r}</li>)}</ol>
            </div>
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
          <div className="bg-sun"><span style={{ fontSize: 18, fontWeight: 700 }}>Listing</span><b>$0</b><span>A live online auction, Australia-wide, with an estimate on the listing.</span></div>
          <div className="bg-sky"><span style={{ fontSize: 18, fontWeight: 700 }}>Checks &amp; condition report</span><b>$0</b><span>We check your photos and video, write the condition report and do the PPSR search.</span></div>
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
