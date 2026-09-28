import { getHistoryCached } from "@/lib/cache";

// Public bid history (masked bidder tags), cached for 2 seconds at the edge.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await getHistoryCached(Number(id));
  return Response.json(rows, { headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=4", "CDN-Cache-Control": "public, s-maxage=2, stale-while-revalidate=4" } });
}
