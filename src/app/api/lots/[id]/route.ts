import { getFeesCached, getHistoryCached, getLotCached, getPartnersCached, getSettingsCached, getSimilarCached } from "@/lib/cache";
import { photoUrl, videoUrl } from "@/lib/photos";
import { listingEstimate } from "@/lib/finance";
import { priceBreakdown, lotFees } from "@/lib/fees";
import { env } from "@/lib/env";
import type { FinanceSettings } from "@/lib/types";

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
  const [fees, similar, history, partners, settings] = await Promise.all([getFeesCached(), getSimilarCached(bundle.lot.category, lotId), getHistoryCached(lotId, 20), getPartnersCached(), getSettingsCached()]);
  const abs = (u: string) => (u.startsWith("/") ? env.siteUrl + u : u);
  const withUrl = <T extends { cover_path?: string | null }>(l: T) => ({ ...l, cover_url: l.cover_path ? abs(photoUrl(l.cover_path)) : null });
  const { lot } = bundle;
  const price = lot.buy_now_price || Math.max(lot.current_bid || 0, lot.start_price || 0);
  const allIn = price ? priceBreakdown(price, lotFees(fees, bundle.lot)).total : 0;
  const est = ["live", "scheduled", "offers", "referred"].includes(lot.status) ? listingEstimate(allIn, partners, (settings.finance || {}) as FinanceSettings) : null;
  const inspector = partners.find((p) => p.kind === "inspection" && p.accepts_leads) || null;
  return Response.json({
    lot: withUrl(bundle.lot),
    photos: bundle.photos.map((p) => ({ ...p, url: abs(photoUrl(p.path)) })),
    flaws: bundle.flaws.map((f) => ({ ...f, url: f.photo_path ? abs(photoUrl(f.photo_path)) : null })),
    videos: bundle.videos.map((v) => ({ ...v, url: videoUrl(v.public_path) })),
    consultant: bundle.consultant ? { ...bundle.consultant, photo_url: bundle.consultant.photo_path ? abs(photoUrl(bundle.consultant.photo_path)) : null } : null,
    // Lender-neutral estimate on the all-in price (no lender is named or recommended).
    finance: est ? { weekly: Math.round(est.weekly), amount: est.amount, months: est.months, rate: est.rate, comparison_rate: est.comparison, basis: est.basis, buyNow: !!lot.buy_now_price } : null,
    inspector,
    insurers: partners.some((p) => p.kind === "insurance"),
    warranty: partners.some((p) => p.kind === "warranty"),
    transporter: partners.find((p) => p.kind === "transport" && p.accepts_leads) || null,
    corrections: bundle.corrections,
    sale: bundle.sale,
    questions: bundle.questions,
    watchers: bundle.watchers,
    similar: similar.map(withUrl),
    history,
    fees,
  }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
