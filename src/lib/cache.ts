import "server-only";
import { unstable_cache } from "next/cache";
import { supabasePublic } from "@/lib/supabase/anon";
import { searchLots, type Filters, PAGE_SIZE } from "@/lib/data";
import { DEFAULT_FEES, type Fees, type Lot, type LotFlaw, type LotPhoto } from "@/lib/types";

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
}

export function getLotCached(id: number) {
  return unstable_cache(async (): Promise<LotBundle | null> => {
    const db = supabasePublic();
    const { data: lot } = await db.from("lots").select("*").eq("id", id).maybeSingle();
    if (!lot) return null;
    const [{ data: photos }, { data: flaws }, { data: questions }, { data: watchers }] = await Promise.all([
      db.from("lot_photos").select("*").eq("lot_id", id).order("sort"),
      db.from("lot_flaws").select("*").eq("lot_id", id).order("sort"),
      db.from("lot_questions").select("question, answer, answered_at").eq("lot_id", id).eq("public", true).eq("status", "answered").order("created_at").limit(50),
      db.rpc("lot_watchers", { p_lot: id }),
    ]);
    return { lot: lot as Lot, photos: (photos || []) as LotPhoto[], flaws: (flaws || []) as LotFlaw[], questions: questions || [], watchers: Number(watchers || 0) };
  }, ["lot", String(id)], { revalidate: 20, tags: [`lot-${id}`] })();
}

export function searchLotsCached(f: Filters, page = 1) {
  const clean: Filters = Object.fromEntries(Object.entries(f).filter(([k, v]) => v && k !== "page")) as Filters;
  return unstable_cache(
    () => searchLots(supabasePublic(), clean, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    ["search", JSON.stringify(clean), String(page)],
    { revalidate: 15, tags: ["lots"] },
  )();
}

export const getHomeCached = unstable_cache(async () => {
  const db = supabasePublic();
  const [{ data: ending }, { data: feat }, { data: fresh }] = await Promise.all([
    db.from("lots").select("*").eq("status", "live").order("ends_at").limit(8),
    db.from("lots").select("*").eq("status", "live").eq("featured", true).order("ends_at").limit(1),
    db.from("lots").select("*").eq("status", "live").order("published_at", { ascending: false, nullsFirst: false }).limit(4),
  ]);
  return { ending: (ending || []) as Lot[], featured: ((feat || [])[0] || null) as Lot | null, fresh: (fresh || []) as Lot[] };
}, ["home"], { revalidate: 15, tags: ["lots"] });

export function getSimilarCached(category: string, excludeId: number) {
  return unstable_cache(async () => {
    const { data } = await supabasePublic().from("lots").select("*").eq("status", "live").eq("category", category).neq("id", excludeId).order("ends_at").limit(4);
    return (data || []) as Lot[];
  }, ["similar", category, String(excludeId)], { revalidate: 60, tags: ["lots"] })();
}

// seconds: 2 for the live endpoint; pages use a longer value so they aren't rebuilt every 2 s.
export function getHistoryCached(id: number, seconds = 2) {
  return unstable_cache(async () => {
    const { data } = await supabasePublic().rpc("bid_history", { p_lot: id, p_limit: 10 });
    return (data || []) as { amount: number; created_at: string; bidder_tag: string; is_auto: boolean }[];
  }, ["history", String(id), String(seconds)], { revalidate: seconds, tags: [`lot-${id}`] })();
}
