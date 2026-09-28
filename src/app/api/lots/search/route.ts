import { searchLotsCached } from "@/lib/cache";
import { PAGE_SIZE, type Filters } from "@/lib/data";

const KEYS = ["cat", "q", "state", "max", "sort", "view", "make", "ymin", "ymax", "km", "trans", "fuel", "body"] as const;

// Listing search as JSON, cached at the edge for 15 seconds per exact query,
// so thousands of people browsing the same filters cost the database almost nothing.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const f: Filters = {};
  for (const k of KEYS) { const v = sp.get(k); if (v) f[k] = v.slice(0, 80); }
  const page = Math.max(1, Math.min(100, Number(sp.get("page")) || 1));
  const rows = await searchLotsCached(f, page);
  return Response.json({ lots: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
