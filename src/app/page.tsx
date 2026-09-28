import Link from "next/link";
import { getHomeCached } from "@/lib/cache";
import { LotCard } from "@/components/LotCard";
import { JoinOrWatchlist } from "@/components/HeaderUser";
import { CarArt } from "@/components/CarArt";
import { Countdown } from "@/components/Countdown";
import { Tile } from "@/components/Tile";
import { money, km } from "@/lib/format";
import { photoUrl } from "@/lib/photos";

// Served from the edge cache and refreshed every 15 seconds (personal bits load in the browser).
export const revalidate = 15;

export default async function Home() {
  const home = await getHomeCached();
  const lots = home.ending;
  const featured = home.featured || lots[0];
  const covers = new Map(lots.concat(featured ? [featured] : []).map((l) => [l.id, l.cover_path || undefined]));

  return (
    <>
      <div className="wrap">
        <div className="center hero">
          <span className="eyebrow" style={{ color: "var(--urgent)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--tangerine)" }} />Live auctions · Australia-wide
          </span>
          <h1 className="d1">Every car.<br />Beautifully <span className="serif" style={{ color: "var(--blue)" }}>sold.</span></h1>
          <p className="lede">Cars, utes and trucks from real owners right across Australia. Photographed beautifully, described honestly, and sold to the highest bidder.</p>
          <div className="ctas">
            <Link className="btn btn-blue" href="/auctions">Browse live auctions</Link>
            <Link className="more" href="/sell">Sell your vehicle ›</Link>
          </div>
        </div>
        <div className="lineup">
          {[["cars", "tangerine", "car", "Cars"], ["utes", "sky", "ute", "Utes & 4x4"], ["trucks", "lime", "truck", "Trucks"]].map(([cat, bg, type, label]) => (
            <Link key={cat} href={`/auctions?cat=${cat}`} style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
              <span className={`stage bg-${bg}`} style={{ display: "block", width: "100%", aspectRatio: "1.15", borderRadius: 32 }}><CarArt type={type} style={{ width: "84%", bottom: "24%" }} /></span>
              <span className="t" style={{ fontSize: "clamp(24px,2.6vw,34px)", fontWeight: 800, letterSpacing: "-0.03em" }}>{label}</span>
              <span className="more" style={{ fontSize: 17 }}>Browse {label.split(" ")[0].toLowerCase()} ›</span>
            </Link>
          ))}
        </div>
      </div>

      {featured && (
        <section className="wrap">
          <div className={`feature bg-${featured.backdrop}`}>
            <div className="copy">
              <span className="tag" style={{ background: "var(--ink)", color: "#FFFFFF", alignSelf: "flex-start", height: 34, fontSize: 14 }}>Lot of the week</span>
              <h2 className="d3" style={{ fontSize: "clamp(40px,5vw,72px)" }}>Priced like a runabout. Shot like a <span className="serif">supercar.</span></h2>
              <p style={{ fontSize: 20, fontWeight: 500 }}>{featured.title}. {featured.subtitle} {km(featured.odometer)}. {featured.suburb}, {featured.state}.</p>
              <div className="stat">
                <span><span className="k">Current bid</span><span className="v">{money(featured.current_bid)}</span></span>
                <span><span className="k">Ends in</span><Countdown className="v" endsAt={featured.ends_at} /></span>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                <Link className="btn btn-dark" href={`/lot/${featured.id}`}>View the lot</Link>
                {featured.has_reserve && featured.reserve_met && <span style={{ fontWeight: 700 }}>Reserve met. It will sell.</span>}
              </div>
            </div>
            <div className="stage" style={{ minHeight: 320 }}>
              {covers.get(featured.id) ? <img className="lotimg" src={photoUrl(covers.get(featured.id)!)} alt="" /> : <CarArt type={featured.vehicle_type} />}
            </div>
          </div>
        </section>
      )}

      <section className="wrap" id="lots">
        <div className="center" style={{ gap: 22, marginBottom: 40 }}>
          <h2 className="d2">Ending soonest.</h2>
          <form className="searchbox" action="/auctions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input name="q" type="search" placeholder="Search make, model, suburb or lot number" aria-label="Search vehicles" />
          </form>
          <div className="seg">
            {[["", "All"], ["cars", "Cars"], ["utes", "Utes"], ["trucks", "Trucks"], ["cheap", "Under $5k"]].map(([k, l]) => (
              <Link key={k} href={`/auctions${k ? `?cat=${k}` : ""}`} style={{ height: 42, padding: "0 20px", borderRadius: 21, display: "flex", alignItems: "center", fontSize: 15, fontWeight: 600, color: "var(--ink2)" }}>{l}</Link>
            ))}
          </div>
        </div>
        <div className="grid">
          {lots.length ? lots.map((l) => <LotCard key={l.id} lot={l} cover={covers.get(l.id)} />) : (
            <div className="empty"><b style={{ fontSize: 22 }}>New auctions are on their way.</b><span className="muted">Join free and we&apos;ll tell you when they go live.</span><Link className="btn btn-blue" href="/join">Join free</Link></div>
          )}
        </div>
        <div className="center" style={{ marginTop: 40 }}><Link className="more" href="/auctions">See all live auctions ›</Link></div>
      </section>

      <section className="wrap">
        <div className="panel">
          <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>Honest by <span className="serif">design.</span></h2>
          <div className="four">
            <Tile colour="tangerine" path='<path d="M9 12l2 2 4-4"/><path d="M5 4h14v16H5z"/>' title="Condition report on every lot.">A visual grade and a photo of every flaw we spot. It&apos;s a guide, so you can decide whether to inspect before you bid.</Tile>
            <Tile colour="sky" path='<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>' title="Inspect before you bid.">Every vehicle stays at its owner&apos;s place. Book a viewing through us and see it in person.</Tile>
            <Tile colour="lime" path='<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>' title="PPSR searched.">We run a PPSR search on every vehicle at listing and show you the result.</Tile>
            <Tile colour="berry" path='<path d="M4 7h16M4 12h16M4 17h10"/>' title="All-in price.">Buyer&apos;s premium, GST and fees are added up as you type your bid. What you see is what you pay.</Tile>
          </div>
        </div>
      </section>

      <section className="wrap">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 40 }}>Find your kind of car.</h2>
        <div className="bento">
          <Link className="big bg-berry" href="/auctions?cat=cheap" style={{ borderRadius: 32, padding: 48, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>Collection</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 12 }}><span className="n" style={{ fontSize: "clamp(56px,7vw,88px)", lineHeight: 0.92, fontWeight: 800, letterSpacing: "-0.055em" }}>Under<br />$5,000.</span><span style={{ fontSize: 20, maxWidth: 420, fontWeight: 500 }}>First cars, runabouts, honest second cars. Every one shot like it matters.</span></span>
          </Link>
          {[["bg-sky", "/auctions?cat=utes", "Tradie utes", "Dual cabs & tray backs ›", ""], ["bg-lime", "/auctions?cat=trucks", "Tippers", "Light trucks ›", ""], ["bg-blueberry on-dark", "/auctions?cat=trucks", "Prime movers", "Heavy haulage ›", ""], ["bg-mint", "/auctions?cat=cheap", "First cars", "Cheap to run & insure ›", ""], ["bg-tangerine", "/auctions?sort=ending", "Ending today", "Last calls, live now ›", "wide"], ["bg-grape on-dark", "/auctions?cat=cars", "Every car", "Sedans, hatches, SUVs ›", "wide"]].map(([cls, href, n, s, w]) => (
            <Link key={n + href} className={`${cls} ${w}`} href={href} style={{ borderRadius: 32, padding: 32, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4 }}>
              <span className="n" style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em" }}>{n}</span><span className="s" style={{ fontSize: 16, fontWeight: 500 }}>{s}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap" id="how">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>Buying is easy.</h2>
        <div className="steps3">
          <div><span className="num" style={{ color: "var(--tangerine)" }}>1</span><h3>Join free.</h3><p className="muted" style={{ fontSize: 17, maxWidth: 320 }}>Verify your mobile, add a card and verify your ID once.</p></div>
          <div><span className="num" style={{ color: "var(--sky)" }}>2</span><h3>Watch. Inspect. Bid.</h3><p className="muted" style={{ fontSize: 17, maxWidth: 320 }}>Read the condition report, book a viewing at the seller&apos;s place, then set a max bid and we bid for you.</p></div>
          <div><span className="num" style={{ color: "var(--grape)" }}>3</span><h3>Pay. Collect.</h3><p className="muted" style={{ fontSize: 17, maxWidth: 320 }}>Payment is taken when you win. Collect from the seller or book transport.</p></div>
        </div>
        <div className="center" style={{ marginTop: 40, gap: 14 }}>
          <JoinOrWatchlist />
          <Link className="more" style={{ fontSize: 17 }} href="/terms">Read the terms of sale ›</Link>
        </div>
      </section>

      <section className="wrap">
        <div className="sellband">
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <span className="eyebrow" style={{ color: "var(--sun)" }}>Sell with Tyrebiter</span>
            <h2 className="d2" style={{ color: "#FFFFFF" }}>Skip the <span className="serif">tyre-kickers.</span></h2>
            <p style={{ fontSize: 21, fontWeight: 500 }}>Leave it in your driveway. We photograph it at your place, list it Australia-wide, book every viewing and pay you when the buyer settles.</p>
            <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
              <Link className="btn btn-white" href="/sell">Get a free appraisal</Link>
              <Link href="/sell#how-sell" style={{ fontSize: 19, fontWeight: 600 }}>How selling works ›</Link>
            </div>
          </div>
          <div className="ba">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="stage" style={{ background: "#A5A29B" }}><CarArt style={{ transform: "translateX(-50%) rotate(-5deg)", opacity: 0.45 }} /></div><b>Before.</b></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="stage bg-sun"><CarArt /></div><b>After.</b></div>
          </div>
        </div>
      </section>
    </>
  );
}
