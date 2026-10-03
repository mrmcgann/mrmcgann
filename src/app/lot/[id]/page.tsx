import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFeesCached, getHistoryCached, getLotCached, getPartnersCached, getSettingsCached, getSimilarCached } from "@/lib/cache";
import type { FinanceSettings } from "@/lib/types";
import { LotView } from "@/components/LotView";
import { photoUrl } from "@/lib/photos";
import { money } from "@/lib/format";
import { env } from "@/lib/env";

// Served from the edge cache (refreshed every 20 seconds, or straight away when an admin saves).
// Live prices and your own bids load in the browser, so this page is the same for everyone.
export const revalidate = 20;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const b = await getLotCached(Number(id)).catch(() => null);
  if (!b) return {};
  const img = b.lot.cover_path ? photoUrl(b.lot.cover_path) : undefined;
  const desc = `${b.lot.subtitle || ""} Current bid ${money(b.lot.current_bid)}. Located in ${b.lot.suburb}, ${b.lot.state}.`.trim();
  return {
    title: b.lot.title, description: desc,
    alternates: { canonical: `${env.siteUrl}/lot/${b.lot.id}` },
    openGraph: { title: b.lot.title, description: desc, url: `${env.siteUrl}/lot/${b.lot.id}`, images: img ? [{ url: img }] : undefined, type: "website" },
    twitter: { card: "summary_large_image", title: b.lot.title, description: desc, images: img ? [img] : undefined },
  };
}


export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lotId = Number(id);
  if (!Number.isFinite(lotId)) notFound();
  const bundle = await getLotCached(lotId);
  if (!bundle) notFound();
  const [fees, similar, history, partners, settings] = await Promise.all([getFeesCached(), getSimilarCached(bundle.lot.category, lotId), getHistoryCached(lotId, 20), getPartnersCached(), getSettingsCached()]);
  return <LotView bundle={bundle} fees={fees} similar={similar} history={history} partners={partners} finance={(settings.finance || {}) as FinanceSettings} />;
}
