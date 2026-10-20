import { adminApi } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

// The auctioneer's console view of a live sale (staff only, never cached): every vehicle in order with its reserve,
// and the latest bids on the one that's up, with who placed them and whether online or on the floor.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error: denied } = await adminApi();
  if (denied) return denied;
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: sale } = await db.from("sales").select("*").eq("id", Number(id)).maybeSingle();
  if (!sale) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: lots } = await db.from("lots")
    .select("id, title, status, live_state, sale_order, current_bid, start_price, bid_count, ends_at, reserve_met, has_reserve, sold_price, leader_id, buy_now_price")
    .eq("sale_id", sale.id).order("sale_order", { ascending: true, nullsFirst: false }).order("id").limit(500);
  const ids = (lots || []).map((l) => l.id);
  const [{ data: priv }, { data: bids }] = await Promise.all([
    db.from("lot_private").select("lot_id, reserve_price").in("lot_id", ids.length ? ids : [0]),
    sale.current_lot_id
      ? db.from("bids").select("id, amount, created_at, is_auto, source, bidder_id, profiles!bids_bidder_id_fkey(first_name, last_name, deposit_ref)").eq("lot_id", sale.current_lot_id).order("id", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
  ]);
  const reserve = new Map((priv || []).map((p) => [p.lot_id, p.reserve_price]));
  return Response.json({
    sale, server_time: new Date().toISOString(),
    lots: (lots || []).map((l) => ({ ...l, reserve_price: reserve.get(l.id) ?? null })),
    bids: (bids || []).map((b) => {
      const p = (Array.isArray(b.profiles) ? b.profiles[0] : b.profiles) as { first_name: string | null; last_name: string | null; deposit_ref: string | null } | null;
      return { id: b.id, amount: b.amount, created_at: b.created_at, is_auto: b.is_auto, source: b.source, who: p ? `${p.first_name || ""} ${(p.last_name || "").slice(0, 1)}`.trim() : "Member", ref: p?.deposit_ref || null };
    }),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
