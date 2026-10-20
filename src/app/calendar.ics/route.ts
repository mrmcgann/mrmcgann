import { getCalendarCached } from "@/lib/cache";
import { icsCalendar, saleEvents } from "@/lib/calendar";
import { env } from "@/lib/env";

// The auction calendar as a calendar file (.ics): live auctions and fleet sales, with a reminder 30 minutes before.
// Calendar apps that subscribe to this address pick up new sales by themselves.
export async function GET() {
  const cal = await getCalendarCached();
  const body = icsCalendar("Tyrebiter auctions", saleEvents(cal.sales, env.siteUrl));
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="tyrebiter-auctions.ics"', "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
