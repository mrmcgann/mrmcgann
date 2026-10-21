import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { kickOutbox } from "@/lib/notify";

// The buyer's answer when our driver noted a change at pickup: go ahead with the purchase, or cancel it for a full
// refund (our team then cancels and refunds the sale). The database checks it's their invoice (transport_decision).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!/^[0-9a-f-]{36}$/.test(String(b.invoiceId || ""))) return fail("Invoice not found.", 404);
  if (typeof b.proceed !== "boolean") return fail("Choose whether you're going ahead.");
  const { data, error } = await db.rpc("transport_decision", { p_invoice: String(b.invoiceId), p_proceed: b.proceed });
  if (error) return fail(friendly(error.message));
  kickOutbox();
  return json({ ok: true, decision: data });
}
