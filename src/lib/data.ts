import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FEES, type Fees, type Lot } from "@/lib/types";
import type { Facets, SearchFilters } from "@/lib/search";

export async function getFees(db: SupabaseClient): Promise<Fees> {
  const { data } = await db.from("settings").select("value").eq("key", "fees").single();
  return { ...DEFAULT_FEES, ...(data?.value || {}) };
}

export async function getWatchedIds(db: SupabaseClient, userId: string | null | undefined) {
  if (!userId) return new Set<number>();
  const { data } = await db.from("watchlist").select("lot_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  return new Set((data || []).map((r: { lot_id: number }) => r.lot_id));
}

export type Filters = SearchFilters;

export const PAGE_SIZE = 48;

// Listing search. One database function (public.search_lots) does the work, so
// results, the counts beside each filter and saved-search alerts all agree.
export async function searchLots(db: SupabaseClient, f: SearchFilters, limit = PAGE_SIZE, offset = 0) {
  const { data } = await db.rpc("search_lots", { f, p_limit: limit, p_offset: offset });
  return (data || []) as Lot[];
}

// Counts for every filter (each counted with the other filters applied).
export async function lotFacets(db: SupabaseClient, f: SearchFilters) {
  const { data } = await db.rpc("lot_facets", { f });
  return (data || {}) as Facets;
}
