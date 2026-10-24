import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

// The seller doesn't want a vehicle that didn't sell offered at the next auction: free while the relist is a draft
// (seller agreement, section 12). The engine cancels the draft, records the decision and tells the consultant; once
// the relisted vehicle is listed, taking it out is a withdrawal (section 8), so it refuses and says to call us.
export async function POST(req: Request) {
  const { lotId } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const id = Number(lotId);
  if (!Number.isSafeInteger(id) || id <= 0) return fail("Which vehicle?");
  const { error } = await db.rpc("seller_decline_relist", { p_lot: id });
  if (error) return fail(friendly(error.message));
  return json({ ok: true });
}
