import "server-only";
import { unstable_cache } from "next/cache";
import { supabasePublic } from "@/lib/supabase/anon";
import { env } from "@/lib/env";
import { searchLots, lotFacets, PAGE_SIZE } from "@/lib/data";
import type { SearchFilters } from "@/lib/search";
import { DEFAULT_FEES, type Consultant, type Fees, type Lot, type LotFlaw, type LotPhoto, type LotVideo, type Partner } from "@/lib/types";

// Public data, cached and shared by every visitor. At 10,000 people on the site
// the database sees a few queries a second for these pages, not thousands.
// Live prices on a lot page come from /api/lots/[id]/live and Realtime, so a
// few seconds of cache here never shows anyone a stale bid for long.

export const getFeesCached = unstable_cache(async (): Promise<Fees> => {
  const { data } = await supabasePublic().from("settings").select("value").eq("key", "fees").single();
  return { ...DEFAULT_FEES, ...(data?.value || {}) };
}, ["fees"], { revalidate: 300, tags: ["settings"] });

export const getSettingsCached = unstable_cache(async () => {
  const { data } = await supabasePublic().from("settings").select("key, value");
  return Object.fromEntries((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value])) as Record<string, Record<string, unknown>>;
}, ["settings"], { revalidate: 300, tags: ["settings"] });

export interface LotBundle {
  lot: Lot;
  photos: LotPhoto[];
  flaws: LotFlaw[];
  questions: { question: string; answer: string; answered_at: string }[];
  watchers: number;
  videos: LotVideo[];
  consultant: Consultant | null;
}

const CONSULTANT_COLS = "id, name, title, phone, email, photo_path, is_default";

export function getLotCached(id: number) {
  return unstable_cache(async (): Promise<LotBundle | null> => {
    const db = supabasePublic();
    const { data: lot } = await db.from("lots").select("*").eq("id", id).maybeSingle();
    if (!lot) return null;
    const [{ data: photos }, { data: flaws }, { data: questions }, { data: watchers }, { data: videos }, { data: consultants }] = await Promise.all([
      db.from("lot_photos").select("*").eq("lot_id", id).order("sort"),
      db.from("lot_flaws").select("*").eq("lot_id", id).order("sort"),
      db.from("lot_questions").select("question, answer, answered_at").eq("lot_id", id).eq("public", true).eq("status", "answered").order("created_at").limit(50),
      db.rpc("lot_watchers", { p_lot: id }),
      db.rpc("lot_videos_public", { p_lot: id }),
      // The listing's consultant, or the default one.
      lot.consultant_id
        ? db.from("consultants").select(CONSULTANT_COLS).or(`id.eq.${lot.consultant_id},is_default.eq.true`).eq("active", true)
        : db.from("consultants").select(CONSULTANT_COLS).eq("is_default", true).eq("active", true),
    ]);
    const cs = (consultants || []) as Consultant[];
    const consultant = cs.find((c) => c.id === lot.consultant_id) || cs.find((c) => c.is_default) || null;
    return { lot: lot as Lot, photos: (photos || []) as LotPhoto[], flaws: (flaws || []) as LotFlaw[], questions: questions || [], watchers: Number(watchers || 0), videos: (videos || []) as LotVideo[], consultant };
  }, ["lot", String(id)], { revalidate: 20, tags: [`lot-${id}`] })();
}

// Active finance, insurance and inspection partners, in the order admins set.
export const getPartnersCached = unstable_cache(async (): Promise<Partner[]> => {
  let q = supabasePublic().from("partners").select("*").eq("active", true).order("sort").order("name");
  if (!env.testMode) q = q.eq("sample", false); // sample partners from seed.sql only show in test mode
  const { data } = await q;
  return (data || []) as Partner[];
}, ["partners"], { revalidate: 300, tags: ["partners"] });

export function searchLotsCached(f: SearchFilters, page = 1) {
  return unstable_cache(
    () => searchLots(supabasePublic(), f, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    ["search", JSON.stringify(f), String(page)],
    { revalidate: 15, tags: ["lots"] },
  )();
}

// Filter counts don't depend on the sort order, so one cache entry serves every sort.
export function facetsCached(f: SearchFilters) {
  const { sort: _sort, ...key } = f;
  return unstable_cache(() => lotFacets(supabasePublic(), key), ["facets", JSON.stringify(key)], { revalidate: 30, tags: ["lots"] })();
}

export const getHomeCached = unstable_cache(async () => {
  const db = supabasePublic();
  const [{ data: ending }, { data: feat }, { data: fresh }] = await Promise.all([
    db.from("lots").select("*").eq("status", "live").order("ends_at").limit(8),
    db.from("lots").select("*").eq("status", "live").eq("featured", true).order("ends_at").limit(1),
    db.from("lots").select("*").eq("status", "live").order("published_at", { ascending: false, nullsFirst: false }).limit(4),
  ]);
  const featured = ((feat || [])[0] || (ending || [])[0] || null) as Lot | null;
  const { data: featuredPhotos } = featured ? await db.from("lot_photos").select("path, angle").eq("lot_id", featured.id).order("sort").limit(5) : { data: [] };
  return { ending: (ending || []) as Lot[], featured, featuredPhotos: (featuredPhotos || []) as { path: string; angle: string | null }[], fresh: (fresh || []) as Lot[] };
}, ["home"], { revalidate: 15, tags: ["lots"] });

export function getSimilarCached(category: string, excludeId: number) {
  return unstable_cache(async () => {
    const { data } = await supabasePublic().from("lots").select("*").eq("status", "live").eq("category", category).neq("id", excludeId).order("ends_at").limit(4);
    return (data || []) as Lot[];
  }, ["similar", category, String(excludeId)], { revalidate: 60, tags: ["lots"] })();
}

export type BidRow = { amount: number; created_at: string; bidder_tag: string; bidder_mask: string; is_auto: boolean };

// seconds: 2 for the live endpoint; pages use a longer value so they aren't rebuilt every 2 s.
export function getHistoryCached(id: number, seconds = 2) {
  return unstable_cache(async () => {
    const { data } = await supabasePublic().rpc("bid_history", { p_lot: id, p_limit: 10 });
    return ((data || []) as BidRow[]).map(({ amount, created_at, bidder_tag, bidder_mask, is_auto }) => ({ amount, created_at, bidder_tag, bidder_mask, is_auto }));
  }, ["history", String(id), String(seconds)], { revalidate: seconds, tags: [`lot-${id}`] })();
}
