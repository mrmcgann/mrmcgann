import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { json, fail, friendly } from "@/lib/api";

// The buyer saying they have transferred the registration themselves.
//
// No proof, no receipt number, no upload: since migration 32 their half gates nothing, so a receipt would be
// paperwork we collect and never use. All this does is stop the reminders. A buyer who wants their confirmation
// on file can still upload it through /api/transfers.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.invoiceId || "");
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Which invoice?");
  if (!(await allow(`transfer-done:${user.id}`, 30, 3600))) return fail("Too many attempts. Please call us.", 429);
  const { error } = await db.rpc("transfer_buyer_done", { p_invoice: id });
  if (error) return fail(friendly(error.message));
  return json({ ok: true });
}
