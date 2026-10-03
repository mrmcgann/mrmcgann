import { facetsCached } from "@/lib/cache";
import { filtersFromParams } from "@/lib/search";

// Live counts for the search bar and the homepage search ("Show 1,284 vehicles").
// Edge-cached for 30 seconds per query.
export async function GET(req: Request) {
  const facets = await facetsCached(filtersFromParams(new URL(req.url).searchParams));
  return Response.json(facets, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120", "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
