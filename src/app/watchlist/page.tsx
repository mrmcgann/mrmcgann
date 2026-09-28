import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCovers } from "@/lib/data";
import type { Lot } from "@/lib/types";
import { CarArt } from "@/components/CarArt";
import { Countdown } from "@/components/Countdown";
import { RemindSwitch, RemoveWatch, DeleteSearch } from "@/components/WatchRowControls";
import { money, km } from "@/lib/format";
import { photoUrl } from "@/lib/photos";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

type Row = { lot_id: number; remind: boolean; lots: Lot };
const TABS = [["all", "All"], ["soon", "Ending today"], ["winning", "Winning"], ["outbid", "Outbid"], ["won", "Won"]];

export default async function Watchlist({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "all" } = await searchParams;
  const { supabase, user } = await getSession();
  if (!user) redirect("/signin?next=/watchlist");
  const [{ data: rows }, { data: maxes }, { data: searches }] = await Promise.all([
    supabase.from("watchlist").select("lot_id, remind, lots(*)").eq("user_id", user.id),
    supabase.from("max_bids").select("lot_id, max_amount").eq("bidder_id", user.id),
    supabase.from("saved_searches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const myMax = new Map((maxes || []).map((m: { lot_id: number; max_amount: number }) => [m.lot_id, m.max_amount]));
  const all = ((rows || []) as unknown as Row[]).filter((r) => r.lots);
  const status = (l: Lot) => {
    const mx = myMax.get(l.id);
    if (l.status === "sold") return l.winner_id === user.id ? { k: "won", t: "Won", c: "var(--mint)" } : { k: "lost", t: "Sold", c: "var(--panel2)" };
    if (l.status === "referred") return l.leader_id === user.id ? { k: "referred", t: "Referred to seller", c: "var(--sun)" } : { k: "lost", t: "Referred", c: "var(--panel2)" };
    if (l.status === "offers") return { k: "offers", t: "Make an offer open", c: "var(--sun)" };
    if (l.status !== "live") return { k: "ended", t: "Ended", c: "var(--panel2)" };
    if (mx == null) return { k: "watch", t: "Not bid yet", c: "#FFFFFF" };
    return l.leader_id === user.id ? { k: "winning", t: `Winning · max ${money(mx)}`, c: "var(--mint)" } : { k: "outbid", t: `Outbid · max ${money(mx)}`, c: "var(--berry)" };
  };
  const soon = (l: Lot) => l.status === "live" && l.ends_at && new Date(l.ends_at).getTime() - Date.now() < 86400000;
  const counts: Record<string, number> = { all: all.length, soon: all.filter((r) => soon(r.lots)).length };
  ["winning", "outbid", "won"].forEach((k) => (counts[k] = all.filter((r) => status(r.lots).k === k).length));
  const list = all.filter((r) => f === "all" || (f === "soon" ? soon(r.lots) : status(r.lots).k === f))
    .sort((a, b) => new Date(a.lots.ends_at || 0).getTime() - new Date(b.lots.ends_at || 0).getTime());
  const covers = await getCovers(supabase, list.map((r) => r.lots));
  const colours = ["sun", "sky", "lime", "berry", "mint", "lilac"];

  return (
    <div className="wrap">
      <div className="acctgrid">
        <nav className="side-nav" aria-label="Account">
          <span className="h">Buying</span>
          <Link href="/watchlist" className="on">Watchlist<span>{all.length}</span></Link>
          <Link href="/watchlist?f=winning">My bids</Link>
          <Link href="/watchlist#searches">Saved searches</Link>
          <span className="h">Account</span>
          <Link href="/account">Account &amp; verification</Link>
          <Link href="/account#invoices">Invoices</Link>
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          <h1 className="d2">Watchlist.</h1>
          <div className="seg" style={{ alignSelf: "flex-start" }}>
            {TABS.map(([k, l]) => <Link key={k} href={`/watchlist?f=${k}`} className={f === k ? "on" : ""} style={{ height: 42, padding: "0 18px", borderRadius: 21, display: "flex", alignItems: "center", fontSize: 14, fontWeight: 700, background: f === k ? "#FFFFFF" : "transparent", boxShadow: f === k ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>{l} {counts[k]}</Link>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {list.length === 0 && <div className="empty"><b style={{ fontSize: 22 }}>{f === "all" ? "Your watchlist is empty." : "Nothing here right now."}</b><span className="muted">Tap the heart on any vehicle to keep an eye on it.</span><Link className="btn btn-blue" href="/auctions">Browse auctions</Link></div>}
            {list.map(({ lots: l, remind }) => {
              const s = status(l);
              const cta = l.status === "live" ? (s.k === "outbid" ? "Bid again" : s.k === "winning" ? "Raise max" : "Place bid") : s.k === "won" ? "View invoice" : s.k === "offers" ? "Make an offer" : "View lot";
              return (
                <div className="wrow" key={l.id}>
                  <Link href={`/lot/${l.id}`} className={`stage bg-${l.backdrop}`} aria-label={l.title}>{covers.get(l.id) ? <img className="lotimg" src={photoUrl(covers.get(l.id)!)} alt="" /> : <CarArt type={l.vehicle_type} />}</Link>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                    <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>LOT {l.id} · {l.suburb?.toUpperCase()} {l.state}</span>
                    <Link href={`/lot/${l.id}`} style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.1 }}>{l.title}</Link>
                    <span className="muted">{km(l.odometer)} · {l.transmission} · Visual grade {l.visual_grade}</span>
                  </div>
                  <div className="c-time"><div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{l.status === "live" ? "Ends in" : "Status"}</div>{l.status === "live" ? <Countdown endsAt={l.ends_at} style={{ fontSize: 22, fontWeight: 800, color: soon(l) ? "var(--urgent)" : "var(--ink)" }} /> : <div style={{ fontSize: 18, fontWeight: 800 }}>Closed</div>}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}><b style={{ fontSize: 28, letterSpacing: "-0.03em" }}>{money(l.status === "sold" ? l.sold_price : l.current_bid)}</b><span className="tag" style={{ background: s.c }}>{s.t}</span></div>
                  <div className="c-act" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
                    <Link className={`btn ${s.k === "watch" || l.status !== "live" ? "btn-white" : "btn-blue"}`} href={s.k === "won" ? "/account#invoices" : `/lot/${l.id}`} style={{ height: 46, fontSize: 15 }}>{cta}</Link>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      {l.status === "live" ? <RemindSwitch lotId={l.id} initial={remind} /> : <span />}
                      <RemoveWatch lotId={l.id} title={l.title} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div id="searches" style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <h2 className="d3" style={{ fontSize: 44 }}>Saved searches.</h2>
              <Link className="more" style={{ fontSize: 17 }} href="/auctions">New saved search ›</Link>
            </div>
            {searches?.length ? (
              <div className="ss">
                {searches.map((s: { id: string; label: string; query: Record<string, string> }, i: number) => (
                  <div key={s.id} className={`bg-${colours[i % colours.length]}`}>
                    <b style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{s.label}</b>
                    <span style={{ fontWeight: 500 }}>We&apos;ll alert you to new matches.</span>
                    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
                      <Link className="tag" style={{ background: "var(--ink)", color: "#FFFFFF", height: 32 }} href={`/auctions?${new URLSearchParams(s.query).toString()}`}>See matches ›</Link>
                      <DeleteSearch id={s.id} label={s.label} />
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty" style={{ padding: 36 }}><span className="muted">No saved searches yet. Search or filter the auctions, then tap <b>Save this search</b>.</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
