import Link from "next/link";
import { getHomeCached } from "@/lib/cache";
import { LotCard } from "@/components/LotCard";
import { JoinOrWatchlist } from "@/components/HeaderUser";
import { CarArt } from "@/components/CarArt";
import { Countdown } from "@/components/Countdown";
import { Tile } from "@/components/Tile";
import { money, km } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { SearchBar } from "@/components/SearchBar";
import { MotorsSearch } from "@/components/MotorsSearch";
import { CATEGORIES } from "@/lib/vehicles";

// Served from the edge cache and refreshed every 15 seconds (personal bits load in the browser).
export const revalidate = 15;

export default async function Home() {
  const home = await getHomeCached();
  const lots = home.ending;
  const featured = home.featured;
  const fp = home.featuredPhotos;
  const covers = new Map(lots.concat(featured ? [featured] : []).map((l) => [l.id, l.cover_path || undefined]));

  return (
    <>
      <div className="wrap">
        <div className="center hero">
          <span className="eyebrow" style={{ color: "var(--urgent)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--tangerine)" }} />Live auctions · Australia-wide
          </span>
          <h1 className="d1">Every car.<br />Beautifully <span className="serif" style={{ color: "var(--blue)" }}>sold.</span></h1>
          <p className="lede">Online auctions for cars, utes, trucks, motorbikes, caravans, boats and machinery across Australia. Professionally photographed, PPSR searched and sold to the highest bidder.</p>
          <div style={{ width: "min(780px,100%)", marginTop: 8 }}><SearchBar variant="hero" /></div>
          <div className="try-row" aria-label="Try a search">
            {[["HiLux under 30k", "/auctions?make=Toyota&model=HiLux&cat=utes&max=30000"], ["LAMS bikes", "/auctions?cat=motorbikes&lams=1"], ["Caravan sleeps 4", "/auctions?cat=caravans&berths=4"], ["Tipper on a car licence", "/auctions?cat=trucks&type=tipper&lic=C"], ["First car under $5k", "/auctions?cat=cars&max=5000"], ["Ending today", "/auctions?ending=today"]].map(([l, h]) => <Link key={h} href={h}>{l}</Link>)}
          </div>
          <div className="ctas"><Link className="more" href="/sell">Sell your vehicle ›</Link></div>
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
        <div className="catrow">
          {CATEGORIES.filter((c) => !["cars", "utes", "trucks"].includes(c.key)).map((c) => (
            <Link key={c.key} href={`/auctions?cat=${c.key}`}>
              <span className={`stage bg-${c.backdrop}`}><CarArt type={c.silhouette} /></span>{c.short}
            </Link>
          ))}
        </div>
      </div>

      <section className="wrap">
        <div className="center" style={{ gap: 12, marginBottom: 28 }}>
          <h2 className="d2">Find exactly <span className="serif">the one.</span></h2>
          <p className="lede">Choose a make and model, set your budget, and see how many are live now.</p>
        </div>
        <MotorsSearch />
      </section>

      {featured && (
        <section className="wrap">
          <div className={`feature bg-${featured.backdrop}`}>
            <div className="copy">
              <span className="tag" style={{ background: "var(--ink)", color: "#FFFFFF", alignSelf: "flex-start", height: 34, fontSize: 14 }}>Lot of the week</span>
              <h2 className="d3" style={{ fontSize: "clamp(40px,5vw,72px)" }}>{featured.short_title || featured.title}.</h2>
              <p style={{ fontSize: 20, fontWeight: 500 }}>{[featured.subtitle, featured.odometer != null ? km(featured.odometer) : null, `${featured.suburb}, ${featured.state}`].filter(Boolean).join(" · ")}</p>
              <div className="stat">
                <span><span className="k">Current bid</span><span className="v">{money(featured.current_bid)}</span></span>
                <span><span className="k">Ends in</span><Countdown className="v" endsAt={featured.ends_at} /></span>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                <Link className="btn btn-dark" href={`/lot/${featured.id}`}>View lot</Link>
                {featured.has_reserve && featured.reserve_met && <span style={{ fontWeight: 700 }}>Reserve met</span>}
                {!featured.has_reserve && <span style={{ fontWeight: 700 }}>No reserve</span>}
              </div>
            </div>
            {fp.length >= 5 ? (
              <Link href={`/lot/${featured.id}`} className="mosaic n5 feature-mosaic" aria-label={featured.title}>
                {fp.map((p, k) => <span key={k} className={`tile t${k}`}><img src={photoUrl(p.path)} alt={k === 0 ? featured.title : ""} loading="lazy" /></span>)}
              </Link>
            ) : (
              <div className="stage" style={{ minHeight: 320 }}>
                {covers.get(featured.id) ? <img className="lotimg" src={photoUrl(covers.get(featured.id)!)} alt="" /> : <CarArt type={featured.vehicle_type} />}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="wrap" id="lots">
        <div className="center" style={{ gap: 22, marginBottom: 40 }}>
          <h2 className="d2">Ending soonest.</h2>
          <div className="seg">
            {[["", "All"], ["cars", "Cars"], ["utes", "Utes"], ["trucks", "Trucks"], ["motorbikes", "Bikes"], ["caravans", "Caravans"], ["cheap", "Under $5k"]].map(([k, l]) => (
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
          <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>Bid with <span className="serif">confidence.</span></h2>
          <div className="four">
            <Tile colour="tangerine" path='<path d="M9 12l2 2 4-4"/><path d="M5 4h14v16H5z"/>' title="Condition report on every lot.">A visual grade, close-up photos of damage and wear, and the seller&apos;s written declarations.</Tile>
            <Tile colour="sky" path='<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>' title="Independent inspections.">Order a mobile inspection by a qualified mechanic before you bid, with a written report and photos.</Tile>
            <Tile colour="lime" path='<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>' title="PPSR searched.">Every vehicle is searched for finance owing, write-offs and theft before listing.</Tile>
            <Tile colour="berry" path='<path d="M4 7h16M4 12h16M4 17h10"/>' title="All-in price.">Buyer&apos;s premium, GST and fees are calculated as you bid. No card surcharge.</Tile>
          </div>
        </div>
      </section>

      <section className="wrap">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 40 }}>Browse by category.</h2>
        <div className="bento">
          <Link className="big bg-berry" href="/auctions?cat=cheap" style={{ borderRadius: 32, padding: 48, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>Collection</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 12 }}><span className="n" style={{ fontSize: "clamp(56px,7vw,88px)", lineHeight: 0.92, fontWeight: 800, letterSpacing: "-0.055em" }}>Under<br />$5,000.</span><span style={{ fontSize: 20, maxWidth: 420, fontWeight: 500 }}>First cars and second cars, each with a full condition report and PPSR search.</span></span>
          </Link>
          {[["bg-sky", "/auctions?cat=utes", "Work utes", "Dual cabs & tray backs ›", ""], ["bg-lime", "/auctions?cat=trucks", "Tippers", "Light trucks ›", ""], ["bg-blueberry on-dark", "/auctions?cat=trucks", "Prime movers", "Heavy haulage ›", ""], ["bg-mint", "/auctions?cat=cheap", "First cars", "Economical to run ›", ""], ["bg-tangerine", "/auctions?ending=today", "Closing today", "Final hours ›", "wide"], ["bg-grape on-dark", "/auctions?cat=cars", "Every car", "Sedans, hatches, SUVs ›", "wide"]].map(([cls, href, n, s, w]) => (
            <Link key={n + href} className={`${cls} ${w}`} href={href} style={{ borderRadius: 32, padding: 32, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4 }}>
              <span className="n" style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em" }}>{n}</span><span className="s" style={{ fontSize: 16, fontWeight: 500 }}>{s}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap" id="how">
        <h2 className="d2" style={{ textAlign: "center", marginBottom: 56 }}>How buying works.</h2>
        <div className="steps3">
          <div><span className="num" style={{ color: "var(--tangerine)" }}>1</span><h3>Register.</h3><p className="muted" style={{ fontSize: 17, maxWidth: 320 }}>Verify your mobile, add a card and confirm your ID once. It&apos;s free.</p></div>
          <div><span className="num" style={{ color: "var(--sky)" }}>2</span><h3>Research. Bid.</h3><p className="muted" style={{ fontSize: 17, maxWidth: 320 }}>Read the condition report, order a mobile inspection if you&apos;d like one, then set your maximum bid.</p></div>
          <div><span className="num" style={{ color: "var(--grape)" }}>3</span><h3>Pay. Collect.</h3><p className="muted" style={{ fontSize: 17, maxWidth: 320 }}>Payment is taken when you win. Collect at a booked time, or arrange transport.</p></div>
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
            <h2 className="d2" style={{ color: "#FFFFFF" }}>Sold properly. <span className="serif">From your driveway.</span></h2>
            <p style={{ fontSize: 21, fontWeight: 500 }}>We photograph and inspect it at your place, list it Australia-wide and handle every enquiry. You&apos;re paid once the buyer has paid and collected.</p>
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
