import { getFeesCached, getHistoryCached, getLotCached, getSimilarCached } from "@/lib/cache";
import { photoUrl } from "@/lib/photos";

// Everything public about one vehicle, for the app's lot screen: the listing, photos,
// flaws, answered questions, similar vehicles, recent bids and the fee table.
// Same cached data as the website's lot page, so the app adds no database load.
// Live prices come from /api/lots/[id]/live and Realtime, as on the website.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lotId = Number(id);
  const notFound = () => Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } });
  if (!Number.isSafeInteger(lotId) || lotId <= 0) return notFound();
  const bundle = await getLotCached(lotId);
  if (!bundle || ["draft", "scheduled", "cancelled"].includes(bundle.lot.status)) return notFound();
  const [fees, similar, history] = await Promise.all([getFeesCached(), getSimilarCached(bundle.lot.category, lotId), getHistoryCached(lotId, 20)]);
  const withUrl = <T extends { cover_path?: string | null }>(l: T) => ({ ...l, cover_url: l.cover_path ? photoUrl(l.cover_path) : null });
  return Response.json({
    lot: withUrl(bundle.lot),
    photos: bundle.photos.map((p) => ({ ...p, url: photoUrl(p.path) })),
    flaws: bundle.flaws.map((f) => ({ ...f, url: f.photo_path ? photoUrl(f.photo_path) : null })),
    questions: bundle.questions,
    watchers: bundle.watchers,
    similar: similar.map(withUrl),
    history,
    fees,
  }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
