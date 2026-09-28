import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Your own position on one vehicle (max bid, invoice, offer, inspection, questions).
// One database call; never cached.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return Response.json({ state: null }, { headers: { "Cache-Control": "private, no-store" } });
  const { data } = await db.rpc("my_lot_state", { p_lot: Number(id) });
  return Response.json({ state: data || null }, { headers: { "Cache-Control": "private, no-store" } });
}
