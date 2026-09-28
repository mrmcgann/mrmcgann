import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FEES, type Fees, type Lot } from "@/lib/types";

export async function getFees(db: SupabaseClient): Promise<Fees> {
  const { data } = await db.from("settings").select("value").eq("key", "fees").single();
  return { ...DEFAULT_FEES, ...(data?.value || {}) };
}

export async function getWatchedIds(db: SupabaseClient, userId: string | null | undefined) {
  if (!userId) return new Set<number>();
  const { data } = await db.from("watchlist").select("lot_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  return new Set((data || []).map((r: { lot_id: number }) => r.lot_id));
}

export interface Filters {
  cat?: string; q?: string; state?: string; max?: string; sort?: string; view?: string;
  make?: string; ymin?: string; ymax?: string; km?: string; trans?: string; fuel?: string; body?: string; page?: string;
}

export const PAGE_SIZE = 48;

const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

// Listing search. Uses the trigram-indexed `search` column, so it stays fast at any size.
export async function searchLots(db: SupabaseClient, f: Filters, limit = PAGE_SIZE, offset = 0) {
  let q = db.from("lots").select("*");
  const closed = f.view === "closed";
  if (closed) q = q.in("status", ["sold", "passed", "offers", "referred"]);
  else if (f.view === "offers") q = q.eq("status", "offers");
  else q = q.eq("status", "live");
  if (f.cat === "cheap") q = q.lt("current_bid", 5000);
  else if (f.cat && ["cars", "utes", "trucks"].includes(f.cat)) q = q.eq("category", f.cat);
  if (f.state) q = q.eq("state", f.state);
  if (num(f.max)) q = q.lte("current_bid", num(f.max)!);
  if (f.make) q = q.ilike("make", f.make.replace(/[%_,()]/g, ""));
  if (num(f.ymin)) q = q.gte("year", num(f.ymin)!);
  if (num(f.ymax)) q = q.lte("year", num(f.ymax)!);
  if (num(f.km)) q = q.lte("odometer", num(f.km)!);
  if (f.trans) q = q.ilike("transmission", `${f.trans.replace(/[%_,()]/g, "")}%`);
  if (f.fuel) q = q.ilike("fuel", `${f.fuel.replace(/[%_,()]/g, "")}%`);
  if (f.body) q = q.ilike("body", `%${f.body.replace(/[%_,()]/g, "")}%`);
  if (f.q) {
    const term = f.q.toLowerCase().replace(/[%_,()\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (/^\d{5,6}$/.test(term)) q = q.eq("id", Number(term));
    else if (term) for (const word of term.split(" ").slice(0, 4)) q = q.ilike("search", `%${word}%`);
  }
  if (f.sort === "newest") q = q.order("published_at", { ascending: false, nullsFirst: false });
  else if (f.sort === "price") q = q.order("current_bid", { ascending: true });
  else if (f.sort === "price_desc") q = q.order("current_bid", { ascending: false });
  else q = q.order("ends_at", { ascending: !closed });
  const { data } = await q.order("id").range(offset, offset + limit - 1);
  return (data || []) as Lot[];
}
