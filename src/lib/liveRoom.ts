import "server-only";
import { supabasePublic } from "@/lib/supabase/anon";
import { getLotCached } from "@/lib/cache";
import { photoUrl, videoUrl } from "@/lib/photos";
import { env } from "@/lib/env";
import type { LiveLot, LiveMedia, LiveSale } from "@/lib/live";

// The live auction room's data (the page's first render and /api/sales/[slug]/live), read with the cookie-less
// public client: only public columns of published sales and listed vehicles. There's no video stream: the room shows
// the vehicle's own photos and the seller's walkaround video (from the cached listing, so no extra database load).
const LOT_COLS = "id, title, status, live_state, sale_order, current_bid, start_price, bid_count, ends_at, reserve_met, has_reserve, leader_id, sold_price, cover_path, category, year, odometer, hours, suburb, state, fees, estimate_low, estimate_high, statutory_warranty, winner_id, sold_via";
const SALE_COLS = "id, slug, title, intro, state, seller_label, mode, starts_at, auctioneer, live_status, current_lot_id, live_message, live_message_at, lot_seconds, extend_seconds";

export type LiveRoomData = { sale: LiveSale; current: LiveLot | null; next: LiveLot[]; done: LiveLot[]; waiting: number; media: LiveMedia | null; server_time: string };

const abs = (u: string) => (u.startsWith("/") ? env.siteUrl + u : u);

async function mediaFor(lotId: number | null | undefined): Promise<LiveMedia | null> {
  if (!lotId) return null;
  const b = await getLotCached(lotId);
  if (!b) return null;
  return {
    lot_id: lotId,
    photos: b.photos.map((p) => ({ ...p, url: abs(photoUrl(p.path)) })),
    videos: b.videos.map((v) => ({ ...v, url: abs(videoUrl(v.public_path)) })),
    video_url: (b.lot as { video_url?: string | null }).video_url || null,
  };
}

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
  const cur = (current as LiveLot) || null;
  const nx = (next || []) as LiveLot[];
  const media = await mediaFor(cur?.id ?? (sale.live_status === "scheduled" ? nx[0]?.id : null));
  return { sale: sale as LiveSale, current: cur, next: nx, done: (done || []) as LiveLot[], waiting: waiting || 0, media, server_time: new Date().toISOString() };
}
