import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FEES, type Fees, type Lot } from "@/lib/types";

export async function getFees(db: SupabaseClient): Promise<Fees> {
  const { data } = await db.from("settings").select("value").eq("key", "fees").single();
  return { ...DEFAULT_FEES, ...(data?.value || {}) };
}

export async function getWatchedIds(db: SupabaseClient, userId: string | null | undefined) {
  if (!userId) return new Set<number>();
  const { data } = await db.from("watchlist").select("lot_id").eq("user_id", userId);
  return new Set((data || []).map((r: { lot_id: number }) => r.lot_id));
}

export async function getCovers(db: SupabaseClient, lots: Lot[]) {
  const map = new Map<number, string>();
  if (!lots.length) return map;
  const { data } = await db.from("lot_photos").select("lot_id, path, sort").in("lot_id", lots.map((l) => l.id)).order("sort");
  (data || []).forEach((p: { lot_id: number; path: string }) => { if (!map.has(p.lot_id)) map.set(p.lot_id, p.path); });
  return map;
}

export interface Filters { cat?: string; q?: string; state?: string; max?: string; sort?: string; view?: string }

export async function searchLots(db: SupabaseClient, f: Filters, limit = 60) {
  let q = db.from("lots").select("*");
  if (f.view === "closed") q = q.in("status", ["sold", "passed", "offers", "referred"]);
  else if (f.view === "offers") q = q.eq("status", "offers");
  else q = q.eq("status", "live");
  if (f.cat === "cheap") q = q.lt("current_bid", 5000);
  else if (f.cat && ["cars", "utes", "trucks"].includes(f.cat)) q = q.eq("category", f.cat);
  if (f.state) q = q.eq("state", f.state);
  if (f.max) q = q.lte("current_bid", Number(f.max));
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (/^\d{5}$/.test(term)) q = q.eq("id", Number(term));
    else if (term) q = q.or(`title.ilike.%${term}%,suburb.ilike.%${term}%,make.ilike.%${term}%,model.ilike.%${term}%,body.ilike.%${term}%`);
  }
  if (f.sort === "newest") q = q.order("created_at", { ascending: false });
  else if (f.sort === "price") q = q.order("current_bid", { ascending: true });
  else if (f.sort === "price_desc") q = q.order("current_bid", { ascending: false });
  else q = q.order("ends_at", { ascending: true });
  const { data } = await q.limit(limit);
  return (data || []) as Lot[];
}
