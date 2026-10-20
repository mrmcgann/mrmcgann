import { liveRoom } from "@/lib/liveRoom";

// Everything the live auction room needs in one answer: the sale, the vehicle that's up, what's next and the
// results so far. Cached at the edge for 1 second, so a full room costs the database one query a second.
// Moment-to-moment changes arrive by Broadcast (sale:<id> and lot:<id>); this is the catch-up and fallback.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = await liveRoom(slug);
  if (!room) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } });
  return Response.json(room, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=1, stale-while-revalidate=2", "CDN-Cache-Control": "public, s-maxage=1, stale-while-revalidate=2" },
  });
}
