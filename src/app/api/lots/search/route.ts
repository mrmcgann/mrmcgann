import { searchLotsCached, facetsCached } from "@/lib/cache";
import { PAGE_SIZE } from "@/lib/data";
import { describeParts, filtersFromParams } from "@/lib/search";

// Listing search as JSON, cached at the edge for 15 seconds per exact query,
// so thousands of people browsing the same filters cost the database almost nothing.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const f = filtersFromParams(sp);
  const page = Math.max(1, Math.min(100, Number(sp.get("page")) || 1));
  const [rows, facets] = await Promise.all([searchLotsCached(f, page), sp.get("facets") === "0" ? null : facetsCached(f)]);
  return Response.json({ lots: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page, facets, filters: f, parts: describeParts(f) }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
