import type { Metadata } from "next";
import Link from "next/link";
import { LISTING_CHECKS, RUNS, RUNS_HINT } from "@/lib/listing";
import { ESTIMATE_NOTE } from "@/lib/estimate";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "How we check listings",
  description: "We're never at the vehicle: before it's listed we check the seller's photos and video against the papers, rego and PPSR: VIN, build date, odometer photo, transmission, fuel, features, warning lights, damage and privacy.",
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
        <p className="lede" style={{ margin: 0 }}>You can&apos;t see our vehicles in person, and neither do we: the seller sends the photos and a walkaround video, and we check them against the papers, the registration record and the PPSR search before anything goes live. Here&apos;s what we check, what we don&apos;t, and what happens if we get something wrong.</p>
      </div>
      {sec("checked", "Checked by us, from the seller's photos, video and records.", <>
        <p className="muted" style={{ margin: 0 }}>Before a listing can be published, our staff check each of these and their name is recorded against it. If a photo or the video doesn&apos;t show something clearly, we ask the seller for another before we tick it. A listing can&apos;t go live until every one is done.</p>
        <div className="rows" data-testid="promise-checks">{LISTING_CHECKS.map(([k, , label]) => <div key={k}><b>{label}</b></div>)}</div>
        <p className="muted" style={{ margin: 0 }}>We also verify the seller&apos;s identity and their ownership papers, and search the PPSR for finance, written-off and stolen records. A statutory write-off is never listed as registered.</p>
      </>)}
      {sec("runs", "Starts and drives.", <div className="rows">{Object.entries(RUNS).map(([k, l]) => <div key={k}><b>{l}</b><span className="muted" style={{ textAlign: "right" }}>{RUNS_HINT[k]}</span></div>)}</div>)}
      {sec("declared", "Told to us by the seller.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Sellers answer in writing, and are legally responsible for their answers: accidents, flood or hail damage, modifications, warning lights, odometer concerns, finance owing, known faults, keys and service books. They&apos;re shown on the listing as the seller&apos;s declarations, in yellow, so you can tell them apart from what we checked (in green).</p>)}
      {sec("not", "What we don't check.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>We never see the vehicle in person, so our checks aren&apos;t a mechanical, electrical or roadworthy inspection, and grades describe how it looks in the seller&apos;s photos and video, not how it runs. Faults that don&apos;t show in photos or on video can&apos;t be seen by us. The odometer comes from the seller&apos;s photo of the dash, and we can&apos;t prove a reading is the true distance travelled. For a mechanic&apos;s opinion, order a mechanical inspection from the listing (or look for listings marked “Inspected”), or call the consultant on it.</p>)}
      {sec("photos", "Photos.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>The photos and video are the seller&apos;s, taken for this listing, with close-ups of any damage. We check they show this vehicle (its plate or VIN in shot), and we never use stock photos or photos from other listings. They show only the vehicle: we remove the location a phone records, and anything that shows who the seller is or where they live.</p>)}
      {sec("estimate", "The auction estimate.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>{ESTIMATE_NOTE} We keep a written record of what each estimate is based on, a range is never wider than 25% (or $1,000 for cheaper vehicles), and if we change an estimate after a vehicle is listed, it&apos;s shown as a correction.</p>)}
      {sec("prices", "Prices.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Every price shows the all-in amount beside it: the buyer&apos;s premium, GST on the premium and the admin fee. There&apos;s no surcharge or payment fee, and no other fee to pay us. Sellers and anyone connected to them can&apos;t bid on their own vehicle, we never bid for a seller, and we watch for shill bidding. &quot;No reserve&quot; means it sells to the highest bidder.</p>)}
      {sec("wrong", "If we get something wrong.", <>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>If we find a mistake while bidding is open, we correct it straight away and show the change, with the date, under &quot;Changes to this listing&quot;. Everyone who has bid on or is watching the vehicle is told by email and SMS, and it isn&apos;t offered in the live auction until at least 24 hours after the change. If you bid early and the change changes your mind, withdraw your bid on the listing: you can until the hammer falls.</p>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>If you find the vehicle isn&apos;t as described when you collect it, make a claim from your invoice. We decide within 2 business days of having what we need, and if your claim is upheld you can cancel for a full refund or agree a price adjustment. The seller isn&apos;t paid while a claim is open. <Link className="blue" href="/terms#t-claims">Claims ›</Link></p>
      </>)}
      {sec("audits", "Checking our own work.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Every month, someone who didn&apos;t write them re-checks a sample of live listings against their photos, papers and the seller&apos;s answers, and we keep a record. Problems are fixed and corrected publicly the same way.</p>)}
      {sec("rights", "Your consumer rights.", <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>Your rights under the Australian Consumer Law aren&apos;t affected by anything here. Every vehicle is sold by auction, with Tyrebiter as the seller&apos;s agent: the guarantees of clear title, undisturbed possession and no undisclosed securities apply, and your rights against misleading descriptions are never affected. Each listing also says whether a statutory warranty applies. <Link className="blue" href="/terms#t-asis">Your consumer rights ›</Link></p>)}
      <p className="hint" style={{ margin: 0 }}>Spotted something wrong in a listing? Use &quot;Report a concern&quot; on the listing, or call {env.phone}.</p>
    </div>
  );
}
