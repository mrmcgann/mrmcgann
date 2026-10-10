import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFeesCached, getHistoryCached, getLotCached, getPartnersCached, getSettingsCached, getSimilarCached } from "@/lib/cache";
import type { FinanceSettings } from "@/lib/types";
import { LotView } from "@/components/LotView";
import { photoUrl } from "@/lib/photos";
import { env } from "@/lib/env";
import { priceBreakdown, lotFees } from "@/lib/fees";
import { breadcrumbJsonLd, jsonLd, lotCrumbs, lotJsonLd, lotSeoDescription, lotSeoTitle } from "@/lib/seo";

const absolute = (u: string) => (u.startsWith("http") ? u : `${env.siteUrl}${u}`);

// Served from the edge cache (refreshed every 20 seconds, or straight away when an admin saves).
// Live prices and your own bids load in the browser, so this page is the same for everyone.
export const revalidate = 20;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const b = await getLotCached(Number(id)).catch(() => null);
  if (!b) return {};
  const fees = await getFeesCached();
  const l = b.lot;
  const price = Math.max(l.current_bid || 0, l.start_price || 0);
  const allIn = price ? priceBreakdown(price, lotFees(fees, l)).total : null;
  const img = l.cover_path ? photoUrl(l.cover_path) : undefined;
  const title = lotSeoTitle(l);
  const desc = lotSeoDescription(l, allIn);
  const url = `${env.siteUrl}/lot/${l.id}`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    // cancelled listings drop out of search; sold ones stay as a record of the result
    robots: ["live", "referred", "offers", "sold", "passed", "scheduled"].includes(l.status) ? undefined : { index: false, follow: true },
    openGraph: { title, description: desc, url, images: img ? [{ url: img, alt: l.title }] : undefined, type: "website", siteName: "Tyrebiter", locale: "en_AU" },
    twitter: { card: "summary_large_image", title, description: desc, images: img ? [img] : undefined },
  };
}

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lotId = Number(id);
  if (!Number.isFinite(lotId)) notFound();
  const bundle = await getLotCached(lotId);
  if (!bundle) notFound();
  const [fees, similar, history, partners, settings] = await Promise.all([getFeesCached(), getSimilarCached(bundle.lot.category, lotId), getHistoryCached(lotId, 20), getPartnersCached(), getSettingsCached()]);
  const l = bundle.lot;
  const ld = [
    lotJsonLd(l, { url: `${env.siteUrl}/lot/${l.id}`, images: bundle.photos.map((p) => absolute(photoUrl(p.path))), siteUrl: env.siteUrl,
      buyNowAllIn: l.buy_now_price ? priceBreakdown(Number(l.buy_now_price), lotFees(fees, l)).total : null }),
    breadcrumbJsonLd([...lotCrumbs(l), [l.title, `/lot/${l.id}`]], env.siteUrl),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <LotView bundle={bundle} fees={fees} similar={similar} history={history} partners={partners} finance={(settings.finance || {}) as FinanceSettings} />
    </>
  );
}
