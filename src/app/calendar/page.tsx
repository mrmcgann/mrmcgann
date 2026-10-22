import type { Metadata } from "next";
import Link from "next/link";
import { getCalendarCached, getSettingsCached } from "@/lib/cache";
import { calDay } from "@/lib/calendar";
import { CAT } from "@/lib/vehicles";

export const revalidate = 120;
export const metadata: Metadata = {
  title: "Auction calendar",
  description: "Upcoming live auctions at Tyrebiter: the day and time of each one and how many vehicles are in it.",
  alternates: { canonical: "/calendar" },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const ymd = (iso: string) => new Date(new Date(iso).getTime() + 10 * 3600_000).toISOString().slice(0, 10);

// What's on: live auction events (and, with the older timed rules, fleet sales, then each day's timed auctions and tenders).
export default async function CalendarPage() {
  const [cal, settings] = await Promise.all([getCalendarCached(), getSettingsCached().catch(() => ({} as Record<string, Record<string, unknown>>))]);
  const liveOnly = settings.auction?.live_only === true;
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
        <h1 className="d2">Auction calendar.</h1>
        <p className="lede" style={{ margin: 0 }}>{liveOnly
          ? "Every vehicle is sold in a live auction: at a set time, one vehicle after another, with our auctioneer. Watch and bid online, or leave an early bid on any vehicle before its auction starts. Times are Brisbane time."
          : "Timed online auctions close every day. Live auctions run at a set time, one vehicle after another with an auctioneer. Tenders close at a set time with sealed offers. Times are Brisbane time."}</p>
        <div className="pill-row">
          <a className="btn btn-dark" href="/calendar.ics" style={{ height: 46, fontSize: 15 }} data-testid="cal-ics">Add to my calendar</a>
          <Link className="btn btn-soft" href="/auctions?view=closed" style={{ height: 46, fontSize: 15 }}>Recent results</Link>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Sales">
        <h2 className="d3" style={{ fontSize: 34 }}>{liveOnly ? "Live auctions." : "Live auctions and sales."}</h2>
        {cal.sales.length === 0 ? <p className="muted" style={{ margin: 0 }}>{liveOnly ? "No live auctions are scheduled right now. Join free and we'll tell you when the next one is set." : "No live auctions or fleet sales are scheduled right now. Timed auctions run every day below."}</p> : (
          <div className="cal-list">
            {cal.sales.map((s) => (
              <Link key={s.id} className={`cal-ev${s.mode === "live" ? " live" : ""}`} href={s.mode === "live" ? `/live/${s.slug}` : `/sales/${s.slug}`} data-testid="cal-sale">
                <span className="cal-when"><b>{s.mode === "live" ? calDay(ymd(s.starts_at!)) : s.first_end ? calDay(ymd(s.first_end)) : ""}</b><span className="muted">{s.mode === "live" ? when(s.starts_at).split(", ").pop() : "closing"}</span></span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <b style={{ fontSize: 19 }}>{s.title}</b>
                  <span className="muted" style={{ fontSize: 15 }}>{s.mode === "live" ? (s.live_status === "running" ? "Live now" : "Live auction") : "Fleet sale, closing a few minutes apart"} · {s.count} vehicle{s.count === 1 ? "" : "s"}{s.state ? ` · ${s.state}` : ""}{s.mode === "timed" && s.last_end && s.last_end !== s.first_end ? ` · last closes ${when(s.last_end)}` : ""}</span>
                </span>
                <span style={{ fontWeight: 700 }}>{s.mode === "live" ? (s.live_status === "running" ? "Join now ›" : "Bid early ›") : "View ›"}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!liveOnly && <section style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Timed auctions by day">
        <h2 className="d3" style={{ fontSize: 34 }}>Timed auctions and tenders, by day.</h2>
        {cal.days.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing closing in the next three weeks yet.</p> : (
          <div className="cal-days">
            {cal.days.map((d) => {
              const top = Object.entries(d.cats || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
              return (
                <div key={d.day} className="cal-day" data-testid="cal-day">
                  <span className="muted" style={{ fontWeight: 700 }}>{calDay(d.day)}</span>
                  <b>{d.timed}</b>
                  <span style={{ fontSize: 14 }}>closing{d.tenders ? ` · ${d.tenders} tender${d.tenders === 1 ? "" : "s"}` : ""}</span>
                  {top.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{top.map(([c, n]) => `${n} ${(n === 1 ? CAT[c]?.one : CAT[c]?.short?.toLowerCase()) || c}`).join(", ")}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="pill-row">
          <Link className="btn btn-soft" href="/auctions?ending=today" style={{ height: 44, fontSize: 14 }}>Closing in 24 hours</Link>
          <Link className="btn btn-soft" href="/auctions?how=tender" style={{ height: 44, fontSize: 14 }}>Tenders</Link>
          <Link className="btn btn-soft" href="/auctions?how=live" style={{ height: 44, fontSize: 14 }}>In live auctions</Link>
        </div>
      </section>}
    </div>
  );
}
