import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession, missingSteps } from "@/lib/auth";
import { getCovers, getFees, getWatchedIds } from "@/lib/data";
import type { Lot, LotFlaw, LotPhoto } from "@/lib/types";
import { Gallery } from "@/components/Gallery";
import { BidPanel } from "@/components/BidPanel";
import { InspectionBox, DeliveryBox, ReportButton } from "@/components/LotExtras";
import { LotCard } from "@/components/LotCard";
import { Tick } from "@/components/CarArt";
import { gradeInfo } from "@/lib/grades";
import { km, money } from "@/lib/format";
import { photoUrl } from "@/lib/photos";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await getSession();
  const { data } = await supabase.from("lots").select("title, subtitle").eq("id", Number(id)).single();
  return data ? { title: data.title, description: data.subtitle || undefined } : {};
}

const LETTER = "ABCDE";

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lotId = Number(id);
  const { supabase, user, profile } = await getSession();
  const { data: lotRow } = await supabase.from("lots").select("*").eq("id", lotId).single();
  if (!lotRow) notFound();
  const lot = lotRow as Lot;

  const [{ data: photos }, { data: flaws }, { data: history }, fees, watched] = await Promise.all([
    supabase.from("lot_photos").select("*").eq("lot_id", lotId).order("sort"),
    supabase.from("lot_flaws").select("*").eq("lot_id", lotId).order("sort"),
    supabase.rpc("bid_history", { p_lot: lotId, p_limit: 8 }),
    getFees(supabase),
    getWatchedIds(supabase, user?.id),
  ]);

  let myMax: number | null = null, invoiceId: string | null = null, lastOffer = null, requested: string | null = null;
  if (user) {
    const [{ data: pos }, { data: inv }, { data: off }, { data: insp }] = await Promise.all([
      supabase.rpc("my_position", { p_lot: lotId }),
      supabase.from("invoices").select("id").eq("lot_id", lotId).eq("buyer_id", user.id).neq("status", "cancelled").maybeSingle(),
      supabase.from("offers").select("amount, status").eq("lot_id", lotId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("inspections").select("preferred_day, preferred_time, status").eq("lot_id", lotId).eq("user_id", user.id).neq("status", "cancelled").limit(1),
    ]);
    myMax = pos?.[0]?.my_max ?? null;
    invoiceId = inv?.id ?? null;
    lastOffer = off?.[0] ?? null;
    requested = insp?.[0] ? `${insp[0].preferred_day}, ${insp[0].preferred_time.toLowerCase()}` : null;
  }
  const missing = user ? missingSteps(profile) : [1, 2, 3, 4, 5];
  const cardLabel = profile?.card_brand ? `${profile.card_brand} ending ${profile.card_last4}` : null;

  const { data: simRows } = await supabase.from("lots").select("*").eq("status", "live").eq("category", lot.category).neq("id", lotId).order("ends_at").limit(4);
  const similar = (simRows || []) as Lot[];
  const covers = await getCovers(supabase, similar);
  const g = gradeInfo(lot.visual_grade);
  const cats: [string, string | null, string][] = [["Paint & body", lot.grade_paint, "var(--tangerine)"], ["Interior", lot.grade_interior, "var(--sky)"], ["Tyres", lot.grade_tyres, "var(--berry)"]];

  return (
    <>
      <div className="localnav"><div className="wrap">
        <span className="n">{lot.title}</span>
        <span style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 14, flexShrink: 0 }}>
          <span className="muted hide-sm">Lot {lot.id}</span>
          <a className="pill" href="#bid" style={{ background: "var(--blue)", color: "#FFFFFF", height: 34 }}>{lot.status === "live" ? "Bid" : "Details"}</a>
        </span>
      </div></div>
      <div className="wrap">
        <div className="center" style={{ gap: 14, paddingTop: "clamp(40px,6vw,72px)" }}>
          <span className="eyebrow" style={{ color: "var(--urgent)" }}>At the seller&apos;s location in {lot.suburb}, {lot.state} · Sold on their behalf</span>
          <h1 className="d2" style={{ fontSize: "clamp(44px,7vw,96px)" }}>{lot.short_title || lot.title}.</h1>
          {lot.subtitle && <p className="lede">{lot.subtitle}</p>}
        </div>
        <Gallery photos={(photos || []) as LotPhoto[]} backdrop={lot.backdrop} type={lot.vehicle_type} />

        <div className="lotgrid">
          <div className="lotmain">
            {lot.take && <div style={{ display: "flex", flexDirection: "column", gap: 18 }}><span className="eyebrow" style={{ color: "var(--grape)" }}>Tyrebiter&apos;s take</span><p className="take">{lot.take}</p></div>}
            {lot.owner_note && (
              <div className="quote"><span style={{ width: 56, height: 56, borderRadius: 28, background: "var(--mint)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800 }}>“</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="muted" style={{ fontWeight: 700 }}>From the owner</span><p style={{ fontSize: 20, lineHeight: 1.5, fontWeight: 500 }}>{lot.owner_note}</p></div></div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <h2 className="d3">Condition report.</h2>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "18px 20px", borderRadius: 20, background: "var(--panel)" }}>
                <span style={{ width: 28, height: 28, borderRadius: 14, background: "var(--sun)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>i</span>
                <span style={{ fontSize: 15, lineHeight: 1.55 }}><b>A guide only.</b> Based on a visual walkaround at the seller&apos;s location and what the seller told us. It isn&apos;t a mechanical or roadworthy inspection and may not show every fault. Inspect before you bid. <Link className="blue" href="/terms#t-condition" style={{ fontWeight: 700 }}>Terms of sale ›</Link></span>
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
              {(flaws || []).length > 0 && (
                <>
                  <h3 style={{ fontSize: 22, fontWeight: 800 }}>Every flaw we spotted, photographed.</h3>
                  <div className="flaws">
                    {(flaws as LotFlaw[]).map((f) => (
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
                  {([["Year", lot.year], ["Make", lot.make], ["Model", [lot.model, lot.variant].filter(Boolean).join(" ")], ["Body", lot.body], ["Engine", lot.engine], ["Transmission", lot.transmission], ["Fuel", lot.fuel], ["Odometer", km(lot.odometer)], ["Colour", lot.colour], ["Seats", lot.seats], ["Keys", lot.keys], ["Location", `${lot.suburb}, ${lot.state}`], ["Lot number", lot.id]] as [string, unknown][])
                    .filter(([, v]) => v !== null && v !== "" && v !== undefined).map(([k, v]) => <div key={k}><span className="muted">{k}</span><b>{String(v)}</b></div>)}
                </div>
              </div>
              <div><h2 className="d3" style={{ fontSize: 40, marginBottom: 12 }}>What we know.</h2>
                {([
                  ["PPSR search", lot.ppsr_clear == null ? "Pending" : lot.ppsr_clear ? "No finance owing or write-off recorded at listing" : lot.ppsr_note || "See note from Tyrebiter", true],
                  ["Walkaround photos", "Taken by Tyrebiter at the seller's location", true],
                  ["Odometer", "As shown on the dash. Not independently verified", false],
                  ["Service history", lot.service_history || "As declared by the seller", false],
                  ["Known faults", lot.known_faults || "As declared by the seller", false],
                  ["Roadworthy", lot.roadworthy_note || "Not included unless stated. The buyer's responsibility", false],
                ] as [string, string, boolean][]).map(([k, v, ours]) => (
                  <div className="check" key={k}><span className="tick" style={{ background: ours ? "var(--mint)" : "var(--sun)" }}>{ours ? <Tick /> : <b style={{ fontSize: 14 }}>i</b>}</span><span style={{ display: "flex", flexDirection: "column" }}><b>{k}</b><span className="muted" style={{ fontSize: 14 }}>{v}</span></span></div>
                ))}
                <p className="hint" style={{ marginTop: 12 }}>Green: checked by Tyrebiter. Yellow: declared by the seller.</p>
              </div>
            </div>
          </div>

          <aside className="bidcard" id="bid">
            <BidPanel lot={lot} fees={fees} userId={user?.id || null} missing={missing} cardLabel={cardLabel} myMax={myMax} watched={watched.has(lot.id)} invoiceId={invoiceId} lastOffer={lastOffer} />
            {lot.status === "live" && <InspectionBox lotId={lot.id} suburb={lot.suburb || ""} state={lot.state || ""} signedIn={!!user} verified={!!user && missing.length === 0} endsAt={lot.ends_at} requested={requested} />}
            {lot.status === "live" && <DeliveryBox />}
            <div className="soft"><b style={{ fontSize: 17 }}>Collection.</b><span className="muted">From the seller&apos;s location within 5 business days of payment. Collect it yourself or book transport.</span></div>
            <div className="soft">
              <b style={{ fontSize: 17, marginBottom: 8 }}>Bid history</b>
              <div className="hist">
                {(history || []).length === 0 && <span className="muted">No bids yet. Be the first.</span>}
                {(history || []).map((h: { amount: number; created_at: string; bidder_tag: string; is_me: boolean }, i: number) => (
                  <div key={i}><span className={h.is_me ? "you" : ""} style={{ fontWeight: 600 }}>{h.is_me ? "You" : h.bidder_tag}</span><b>{money(h.amount)}</b><span className="muted" style={{ textAlign: "right" }}>{new Date(h.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })}</span></div>
                ))}
              </div>
              <ReportButton lotId={lot.id} signedIn={!!user} />
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
              <h2 className="d3">You might also like.</h2>
              <Link className="more" href={`/auctions?cat=${lot.category}`}>See more {lot.category} ›</Link>
            </div>
            <div className="grid">{similar.map((l) => <LotCard key={l.id} lot={l} watched={watched.has(l.id)} cover={covers.get(l.id)} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}
