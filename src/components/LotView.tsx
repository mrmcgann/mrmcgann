import Link from "next/link";
import type { LotBundle } from "@/lib/cache";
import type { Disclosures, Fees, Lot } from "@/lib/types";
import { Gallery } from "@/components/Gallery";
import { ShareButton, ViewBeacon } from "@/components/LotBits";
import { LotInteractive, LotQuestions } from "@/components/LotInteractive";
import { LotCard } from "@/components/LotCard";
import { Tick } from "@/components/CarArt";
import { gradeInfo } from "@/lib/grades";
import { km } from "@/lib/format";
import { CAT, kindLabel, LICENCES } from "@/lib/vehicles";
import { photoUrl } from "@/lib/photos";
import { env } from "@/lib/env";

const LETTER = "ABCDE";
const WRITE_OFF: Record<string, string> = { none: "Not recorded as written off", repairable: "Repairable write-off", statutory: "Statutory write-off (can't be re-registered)", unknown: "Being checked" };
const yes = (v: unknown) => (v === true || v === "yes" ? "Yes" : v === false || v === "no" ? "No" : v ? String(v) : null);
type Hist = { amount: number; created_at: string; bidder_tag: string; is_auto: boolean }[];

// The vehicle page. Identical for every visitor (so it can be cached at the edge);
// personal parts are in <LotInteractive> and <LotQuestions>, which load in the browser.
export function LotView({ bundle, fees, similar, history, preview = false }: { bundle: LotBundle; fees: Fees; similar: Lot[]; history: Hist; preview?: boolean }) {
  const { lot, photos, flaws, questions, watchers } = bundle;
  const g = gradeInfo(lot.visual_grade);
  const cats: [string, string | null, string][] = [["Paint & body", lot.grade_paint, "var(--tangerine)"], ["Interior", lot.grade_interior, "var(--sky)"], ["Tyres", lot.grade_tyres, "var(--berry)"]];
  const d: Disclosures = lot.disclosures || {};
  const facts: [string, unknown][] = [
    ["VIN", lot.vin],
    ["Registration", lot.rego_plate ? `${lot.rego_plate} (${lot.rego_state || lot.state})` : "Unregistered or not supplied"],
    ["Rego expires", lot.rego_expiry ? new Date(lot.rego_expiry).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null],
    ["Build date", lot.build_date],
    ["Compliance date", lot.compliance_date],
    ["Odometer", lot.odometer != null ? `${km(lot.odometer)} (as shown on the dash)` : null],
    ["Engine hours", lot.hours != null ? `${lot.hours.toLocaleString("en-AU")} hours (as shown on the meter)` : null],
    ["GVM", lot.gvm_kg ? `${lot.gvm_kg.toLocaleString("en-AU")} kg` : null],
    ["Licence needed", lot.licence_class ? LICENCES.find((l) => l[0] === lot.licence_class)?.[1] || lot.licence_class : null],
    ["LAMS approved", lot.lams == null ? null : lot.lams ? "Yes, learner approved" : "No"],
    ["Write-off status", WRITE_OFF[lot.write_off_status || "unknown"]],
    ["Stolen check", lot.stolen_clear == null ? null : lot.stolen_clear ? "Not recorded as stolen" : "See note"],
    ["Keys", lot.keys],
    ["Service books", yes(lot.service_books)],
    ["GST", lot.gst_status === "inc" ? "Price includes GST (business seller)" : "Private sale, no GST on the price"],
  ];
  const declared: [string, unknown][] = [
    ["Accident damage", d.accident], ["Flood damage", d.flood], ["Hail damage", d.hail], ["Modifications", d.modifications],
    ["Warning lights on the dash", d.warning_lights], [lot.odometer == null && lot.hours != null ? "Hour meter concerns" : "Odometer concerns", d.odometer_concerns],
    ["Finance owing", d.finance === "yes" ? "Yes. Paid out from the sale before the seller is paid" : d.finance],
    ["Known faults", d.known_faults || lot.known_faults],
  ];
  const questionsOpen = ["live", "scheduled", "referred", "offers"].includes(lot.status);

  return (
    <>
      {!preview && <ViewBeacon lotId={lot.id} />}
      <div className="localnav"><div className="wrap">
        <span className="n">{lot.title}</span>
        <span style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 14, flexShrink: 0 }}>
          <span className="muted hide-sm">Lot {lot.id}</span>
          <a className="pill" href="#bid" style={{ background: "var(--blue)", color: "#FFFFFF", height: 34 }}>{lot.status === "live" ? "Bid" : "Details"}</a>
        </span>
      </div></div>
      <div className="wrap">
        {preview && <div className="notice bad" style={{ marginTop: 20 }}>Admin preview ({lot.status}). {lot.status === "draft" ? "Only admins can see this." : ""}</div>}
        <div className="center" style={{ gap: 14, paddingTop: "clamp(40px,6vw,72px)" }}>
          <span className="eyebrow" style={{ color: "var(--urgent)" }}>At the seller&apos;s location in {lot.suburb}, {lot.state} · Sold on their behalf</span>
          <h1 className="d2" style={{ fontSize: "clamp(44px,7vw,96px)" }}>{lot.short_title || lot.title}.</h1>
          {lot.subtitle && <p className="lede">{lot.subtitle}</p>}
          <div className="stat-row"><span>{watchers} watching</span><span>{(lot.views || 0).toLocaleString("en-AU")} views</span><ShareButton title={lot.title} /></div>
        </div>
        <Gallery photos={photos} backdrop={lot.backdrop} type={lot.vehicle_type} video={lot.video_url} />

        <div className="lotgrid">
          <div className="lotmain">
            {lot.take && <div style={{ display: "flex", flexDirection: "column", gap: 18 }}><span className="eyebrow" style={{ color: "var(--grape)" }}>Tyrebiter&apos;s take</span><p className="take">{lot.take}</p></div>}
            {lot.owner_note && (
              <div className="quote"><span style={{ width: 56, height: 56, borderRadius: 28, background: "var(--mint)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800 }}>“</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="muted" style={{ fontWeight: 700 }}>From the owner</span><p style={{ fontSize: 20, lineHeight: 1.5, fontWeight: 500 }}>{lot.owner_note}</p></div></div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <h2 className="d3">The facts.</h2>
              <div className="facts">
                {facts.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => <div className="fact" key={k}><span className="k">{k}</span><span className="v">{String(v)}</span></div>)}
              </div>
              <p className="hint">VIN, registration and PPSR details are checked by Tyrebiter before listing. Run your own history check with the VIN if you like. Registration rules differ by state: <Link className="blue" href="/terms#t-states" style={{ fontWeight: 700 }}>what happens to rego and plates ›</Link></p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <h2 className="d3">Condition report.</h2>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "18px 20px", borderRadius: 20, background: "var(--panel)" }}>
                <span style={{ width: 28, height: 28, borderRadius: 14, background: "var(--sun)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>i</span>
                <span style={{ fontSize: 15, lineHeight: 1.55 }}><b>A guide only.</b> Based on a visual walkaround at the seller&apos;s location and what the seller told us. It isn&apos;t a mechanical or roadworthy inspection and may not show every fault. Inspect before you bid. If the vehicle turns out to be materially different from this listing (wrong year, VIN or transmission, an undisclosed write-off or finance, or major damage we didn&apos;t show), you can make a claim. <Link className="blue" href="/terms#t-claims" style={{ fontWeight: 700 }}>How claims work ›</Link></span>
              </div>
              {lot.visual_grade && (
                <div className="gradebox">
                  <div className="orb"><span style={{ fontWeight: 700 }}>Visual grade</span><b>{lot.visual_grade}</b><span style={{ fontWeight: 700 }}>{g[1]}</span></div>
                  <div className="bars">
                    <p style={{ fontSize: 15, lineHeight: 1.5 }}><b>{g[0]} · {g[1]}.</b> {g[2]}</p>
                    {cats.map(([label, grade, colour]) => grade && (
                      <div className="bar" key={label}><span>{label}</span><span className="tr"><i style={{ width: `${(5 - LETTER.indexOf(grade)) * 20}%`, background: colour }} /></span><span style={{ textAlign: "right" }}>{grade}</span></div>
                    ))}
                    {lot.tyre_tread && <span className="hint">Tyre tread: {lot.tyre_tread}</span>}
                    <span className="hint">Graded from what we can see on a walkaround. Mechanical condition isn&apos;t graded. <Link className="blue" href="/help#h-grade" style={{ fontWeight: 700 }}>What the grades mean ›</Link></span>
                  </div>
                </div>
              )}
              {flaws.length > 0 && (
                <>
                  <h3 style={{ fontSize: 22, fontWeight: 800 }}>Every flaw we spotted, photographed.</h3>
                  <div className="flaws">
                    {flaws.map((f) => (
                      <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="ph" style={{ padding: 0, overflow: "hidden" }}>{f.photo_path ? <img src={photoUrl(f.photo_path)} alt={f.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ padding: 14 }}>Close-up photo</span>}</div>
                        <b>{f.title}</b>{f.note && <span className="muted">{f.note}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="two">
              <div><h2 className="d3" style={{ fontSize: 40, marginBottom: 12 }}>Specs.</h2>
                <div className="rows">
                  {([["Year", lot.year], ["Make", lot.make], ["Model", [lot.model, lot.variant].filter(Boolean).join(" ")], ["Type", kindLabel(lot.category, lot.kind) || CAT[lot.category]?.label], ["Body", lot.body], ["Engine", [lot.engine, lot.engine_cc ? `${lot.engine_cc.toLocaleString("en-AU")} cc` : null].filter(Boolean).join(" · ")], ["Transmission", lot.transmission], ["Fuel", lot.fuel], ["Drive", lot.drive],
                    ["Odometer", lot.odometer != null ? km(lot.odometer) : null], ["Engine hours", lot.hours != null ? `${lot.hours.toLocaleString("en-AU")} hrs` : null], ["Sleeps", lot.berths], ["Length", lot.length_m ? `${lot.length_m} m` : null], ["Colour", lot.colour], ["Seats", lot.seats], ["Keys", lot.keys], ["Location", `${lot.suburb}, ${lot.state}`], ["Lot number", lot.id]] as [string, unknown][])
                    .filter(([, v]) => v !== null && v !== "" && v !== undefined).map(([k, v]) => <div key={k}><span className="muted">{k}</span><b>{String(v)}</b></div>)}
                </div>
              </div>
              <div><h2 className="d3" style={{ fontSize: 40, marginBottom: 12 }}>What we know.</h2>
                {([
                  ["PPSR search", lot.ppsr_checked_at ? `Searched ${new Date(lot.ppsr_checked_at).toLocaleDateString("en-AU")}${lot.ppsr_cert_no ? `, certificate ${lot.ppsr_cert_no}` : ""}. ${lot.ppsr_clear === false ? lot.ppsr_note || "Finance recorded: paid out from the sale" : "No finance or write-off recorded"}` : lot.ppsr_clear == null ? "Pending" : lot.ppsr_clear ? "No finance owing or write-off recorded at listing" : lot.ppsr_note || "See note from Tyrebiter", true],
                  ["Seller identity", "ID-verified and ownership papers checked by Tyrebiter", true],
                  ["Walkaround photos", "Taken by Tyrebiter at the seller's location", true],
                  lot.odometer != null ? ["Odometer", "As shown on the dash. Not independently verified", false] : lot.hours != null ? ["Engine hours", "As shown on the meter. Not independently verified", false] : null,
                  ["Service history", lot.service_history || "As declared by the seller", false],
                  ["Roadworthy / safety certificate", lot.roadworthy_note || "Not included unless stated. See your state's rules", false],
                ] as ([string, string, boolean] | null)[]).filter((r): r is [string, string, boolean] => r != null).map(([k, v, ours]) => (
                  <div className="check" key={k}><span className="tick" style={{ background: ours ? "var(--mint)" : "var(--sun)" }}>{ours ? <Tick /> : <b style={{ fontSize: 14 }}>i</b>}</span><span style={{ display: "flex", flexDirection: "column" }}><b>{k}</b><span className="muted" style={{ fontSize: 14 }}>{v}</span></span></div>
                ))}
                <p className="hint" style={{ marginTop: 12 }}>Green: checked by Tyrebiter. Yellow: declared by the seller.</p>
              </div>
            </div>

            {declared.some(([, v]) => v) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <h2 className="d3" style={{ fontSize: 40 }}>What the seller declared.</h2>
                <p className="muted">The seller answered these questions in writing when they signed their agreement with us. They&apos;re legally responsible for their answers.</p>
                <div className="rows">{declared.filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="muted">{k}</span><b style={{ textAlign: "right" }}>{String(v)}</b></div>)}</div>
              </div>
            )}

            <div id="questions" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="d3" style={{ fontSize: 40 }}>Questions.</h2>
              {questions.length === 0 && <p className="muted">No public questions yet.</p>}
              {questions.map((q, i) => <div className="qa" key={i}><b>Q. {q.question}</b><span>A. {q.answer}</span></div>)}
              <LotQuestions lotId={lot.id} open={questionsOpen && !preview} />
            </div>
          </div>

          <aside className="bidcard" id="bid">
            <LotInteractive lot={lot} fees={fees} history={history} phone={env.phone} />
          </aside>
        </div>

        {similar.length > 0 && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
              <h2 className="d3">You might also like.</h2>
              <Link className="more" href={`/auctions?cat=${lot.category}`}>See more {(CAT[lot.category]?.label || lot.category).toLowerCase()} ›</Link>
            </div>
            <div className="grid">{similar.map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path || undefined} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}
