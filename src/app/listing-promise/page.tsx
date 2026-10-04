import type { Metadata } from "next";
import Link from "next/link";
import { LISTING_CHECKS, RUNS, RUNS_HINT } from "@/lib/listing";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "How we check listings",
  description: "Every vehicle is checked against the vehicle itself before it's listed: VIN, build date, odometer photo, transmission, fuel, features, warning lights, damage and photos.",
};

// Our listing promise. Plain facts about what we check, what we don't, and what happens if we get it wrong.
export default function ListingPromise() {
  const sec = (id: string, title: string, children: React.ReactNode) => (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 12 }}><h2 className="d3" style={{ fontSize: 36 }}>{title}</h2>{children}</section>
  );
  return (
    <div className="wrap" style={{ maxWidth: 860, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 36 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Our listing promise</span>
        <h1 className="d2">How we check listings.</h1>
        <p className="lede" style={{ margin: 0 }}>You can&apos;t see our vehicles in person, so the listing has to be right. Every vehicle is checked against the vehicle itself before it goes live. Here&apos;s what we check, what we don&apos;t, and what happens if we get something wrong.</p>
      </div>
      {sec("checked", "Checked by us, on the vehicle.", <>
        <p className="muted" style={{ margin: 0 }}>At the walkaround, before a listing can be published, our staff check each of these and their name is recorded against it. A listing can&apos;t go live until every one is done.</p>
        <div className="rows" data-testid="promise-checks">{LISTING_CHECKS.map(([k, , label]) => <div key={k}><b>{label}</b></div>)}</div>
        <p className="muted" style={{ margin: 0 }}>We also verify the seller&apos;s identity and their ownership papers, and search the PPSR for finance, written-off and stolen records. A statutory write-off is never listed as registered.</p>
      </>)}
      {sec("runs", "Starts and drives.", <div className="rows">{Object.entries(RUNS).map(([k, l]) => <div key={k}><b>{l}</b><span className="muted" style={{ textAlign: "right" }}>{RUNS_HINT[k]}</span></div>)}</div>)}
      {sec("declared", "Told to us by the seller.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Sellers answer in writing, and are legally responsible for their answers: accidents, flood or hail damage, modifications, warning lights, odometer concerns, finance owing, known faults, keys and service books. They&apos;re shown on the listing as the seller&apos;s declarations, in yellow, so you can tell them apart from what we checked (in green).</p>)}
      {sec("not", "What we don't check.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Our walkaround isn&apos;t a mechanical, electrical or roadworthy inspection, and grades describe how a vehicle looks, not how it runs. We photograph the odometer, but we can&apos;t prove a reading is the true distance travelled. For a mechanic&apos;s opinion, order an independent mobile inspection from the listing, or call the consultant on it.</p>)}
      {sec("photos", "Photos.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Photos are of the vehicle for sale, taken for its listing, with close-ups of the damage we found. We never use stock photos or photos from other listings.</p>)}
      {sec("prices", "Prices.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Every price shows the all-in amount beside it: the buyer&apos;s premium, GST on the premium and the admin fee. There&apos;s no card surcharge and no other fee to pay us. Sellers and anyone connected to them can&apos;t bid on their own vehicle, and we watch for shill bidding. &quot;No reserve&quot; means it sells to the highest bidder.</p>)}
      {sec("wrong", "If we get something wrong.", <>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>If we find a mistake while bidding is open, we correct it straight away and show the change, with the date, under &quot;Changes to this listing&quot;. Everyone who has bid on or is watching the vehicle is told by email and SMS, and bidding stays open for at least 24 hours after the change. If you bid before the change and it changes your mind, call us before bidding closes and we&apos;ll cancel your bids.</p>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>If you find the vehicle isn&apos;t as described when you collect it, make a claim from your invoice. We decide within 2 business days of having what we need, and if your claim is upheld you can cancel for a full refund or agree a price adjustment. The seller isn&apos;t paid while a claim is open. <Link className="blue" href="/terms#t-claims">Claims ›</Link></p>
      </>)}
      {sec("audits", "Checking our own work.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Every month, someone who didn&apos;t write them re-checks a sample of live listings against their photos, papers and the seller&apos;s answers, and we keep a record. Problems are fixed and corrected publicly the same way.</p>)}
      {sec("rights", "Your consumer rights.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Your rights under the Australian Consumer Law aren&apos;t affected by anything here. Which consumer guarantees apply depends on whether you buy at auction or outright, and whether the seller is private or a business: each listing says which. <Link className="blue" href="/terms#t-asis">Your consumer rights ›</Link></p>)}
      <p className="hint" style={{ margin: 0 }}>Spotted something wrong in a listing? Use &quot;Report a concern&quot; on the listing, or call {env.phone}.</p>
    </div>
  );
}
