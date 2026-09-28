import { supabasePublic } from "@/lib/supabase/anon";

// The live price of one vehicle. Cached at the edge for 1 second, so 10,000 people
// polling the same car cost the database one query a second.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabasePublic().from("lots")
    .select("id, status, current_bid, bid_count, ends_at, reserve_met, has_reserve, leader_id, decision_by, sold_price, winner_id, buy_now_price")
    .eq("id", Number(id)).maybeSingle();
  if (!data) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } });
  return Response.json({ ...data, server_time: new Date().toISOString() }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=1, stale-while-revalidate=2", "CDN-Cache-Control": "public, s-maxage=1, stale-while-revalidate=2" },
  });
}
