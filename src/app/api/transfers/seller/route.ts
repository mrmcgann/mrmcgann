import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

// The seller has lodged their part of the registration transfer (notice of disposal or started it online).
export async function POST(req: Request) {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const b = await req.json().catch(() => ({}));
  const { error } = await db.rpc("transfer_seller_done", { p_lot: Number(b.lotId), p_reference: String(b.reference || "").slice(0, 60) });
  if (error) return fail(error.message.includes("forbidden") ? "Only the seller can do that." : "Couldn't save that. Please try again or call us.");
  return json({ ok: true });
}
