import { facetsCached, getCalendarCached, getHomeCached } from "@/lib/cache";
import { photoUrl } from "@/lib/photos";
import type { Lot } from "@/lib/types";

// The app's home screen: ending soonest, the featured lot, just listed, and how many
// are live in each category. The same cached data as the website's homepage.
export async function GET() {
  const [home, facets, cal] = await Promise.all([getHomeCached(), facetsCached({}), getCalendarCached()]);
  const week = Date.now() + 7 * 86400_000;
  const live = cal.sales.filter((x) => x.mode === "live" && (x.live_status === "running" || x.live_status === "paused" || (x.starts_at && new Date(x.starts_at).getTime() < week)))
    .slice(0, 3).map((x) => ({ slug: x.slug, title: x.title, starts_at: x.starts_at, live_status: x.live_status, count: x.count }));
  const withUrl = (l: Lot) => ({ ...l, cover_url: l.cover_path ? photoUrl(l.cover_path) : null });
  return Response.json({
    ending: home.ending.map(withUrl),
    featured: home.featured ? withUrl(home.featured) : null,
    fresh: home.fresh.map(withUrl),
    cats: facets.cats || {},
    cheap: facets.cheap || 0,
    total: facets.total || 0,
    live,
  }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
