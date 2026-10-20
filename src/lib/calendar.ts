// The auction calendar: live sales, fleet sales and tenders, plus how many timed auctions close each day
// (from auction_calendar() in the database), and an .ics file people can add to their own calendar. Pure.

export type CalSale = { id: number; slug: string; title: string; mode: "timed" | "live"; state: string | null; starts_at: string | null;
  live_status: string; seller_label: string | null; first_end: string | null; last_end: string | null; count: number };
export type CalDay = { day: string; timed: number; tenders: number; cats: Record<string, number> | null };
export type Calendar = { sales: CalSale[]; days: CalDay[] };
export type IcsEvent = { uid: string; title: string; start: string; end?: string | null; url: string; description?: string; location?: string };

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Text in an .ics line: commas, semicolons, backslashes and new lines escaped. */
export const icsText = (s: string) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines over 75 characters are folded (continuation lines start with a space), as the format requires. */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}

export function icsCalendar(name: string, events: IcsEvent[], now = new Date().toISOString()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tyrebiter//Auction calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`];
  for (const e of events) {
    const end = e.end && new Date(e.end) > new Date(e.start) ? e.end : new Date(new Date(e.start).getTime() + 60 * 60_000).toISOString();
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${icsText(e.title)}`, `URL:${e.url}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    lines.push("BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Calendar events for the sales on the calendar (live sales at their start; fleet sales over their closing window). */
export function saleEvents(sales: CalSale[], site: string): IcsEvent[] {
  return sales.flatMap((s) => {
    const start = s.mode === "live" ? s.starts_at : s.first_end;
    if (!start) return [];
    const url = s.mode === "live" ? `${site}/live/${s.slug}` : `${site}/sales/${s.slug}`;
    return [{
      uid: `sale-${s.id}@tyrebiter.com.au`, start, end: s.mode === "live" ? null : s.last_end, url,
      title: s.mode === "live" ? `Live auction: ${s.title}` : `Sale closing: ${s.title}`,
      description: `${s.count} vehicle${s.count === 1 ? "" : "s"}. ${s.mode === "live" ? "Bid online as the auctioneer offers each one, or bid early now." : "Vehicles close a few minutes apart."} ${url}`,
      location: s.state ? `Online · vehicles in ${s.state}` : "Online",
    }];
  });
}

/** "Wed 22 Oct" for a calendar day ("2026-10-22"). */
export const calDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
