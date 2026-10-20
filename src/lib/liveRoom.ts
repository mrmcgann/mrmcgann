import "server-only";
import { supabasePublic } from "@/lib/supabase/anon";
import type { LiveLot, LiveSale } from "@/lib/live";

// The live auction room's data (the page's first render and /api/sales/[slug]/live), read with the cookie-less
// public client: only public columns of published sales and listed vehicles.
const LOT_COLS = "id, title, status, live_state, sale_order, current_bid, start_price, bid_count, ends_at, reserve_met, has_reserve, leader_id, sold_price, cover_path, category, year, odometer, hours, suburb, state, fees";
const SALE_COLS = "id, slug, title, intro, state, seller_label, mode, starts_at, stream_url, auctioneer, live_status, current_lot_id, live_message, live_message_at, lot_seconds, extend_seconds";

export type LiveRoomData = { sale: LiveSale; current: LiveLot | null; next: LiveLot[]; done: LiveLot[]; waiting: number; server_time: string };

export async function liveRoom(slug: string): Promise<LiveRoomData | null> {
  const db = supabasePublic();
  const { data: sale } = await db.from("sales").select(SALE_COLS).eq("slug", String(slug).slice(0, 60)).eq("published", true).maybeSingle();
  if (!sale || sale.mode !== "live") return null;
  const [{ data: current }, { data: next }, { data: done }, { count: waiting }] = await Promise.all([
    sale.current_lot_id ? db.from("lots").select(LOT_COLS).eq("id", sale.current_lot_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("lots").select(LOT_COLS).eq("sale_id", sale.id).eq("live_state", "waiting").eq("status", "live").order("sale_order", { ascending: true, nullsFirst: false }).order("id").limit(12),
    db.from("lots").select(LOT_COLS).eq("sale_id", sale.id).eq("live_state", "closed").order("updated_at", { ascending: false }).limit(30),
    db.from("lots").select("id", { count: "exact", head: true }).eq("sale_id", sale.id).eq("live_state", "waiting").eq("status", "live"),
  ]);
  return { sale: sale as LiveSale, current: (current as LiveLot) || null, next: (next || []) as LiveLot[], done: (done || []) as LiveLot[], waiting: waiting || 0, server_time: new Date().toISOString() };
}
