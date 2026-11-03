import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { cleanSignature } from "@/lib/sellForm";
import { json, fail, friendly } from "@/lib/api";

// The buyer acknowledges their sale contract by typing their verified name.
//
// It is a receipt, never a condition of the sale: the contract was made at the fall of the hammer, and a buyer who
// never signs still owns the vehicle and still owes the invoice. In New South Wales and South Australia the state's
// own auction notice is signed by the buyer with a copy back to them, and this is what discharges that.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Which invoice?");
  if (!(await allow(`ack-sale:${user.id}`, 30, 3600))) return fail("Too many attempts. Please call us.", 429);
  // Never store a picture the browser sends: the strokes are checked here and drawn back by us. A drawing that
  // doesn't pass the check becomes null, and acknowledge_sale then refuses with sign_draw — the signature is
  // required in every state. The typed verified name is still what identifies the signer.
  const signature = cleanSignature(b.signature);
  const { data, error } = await db.rpc("acknowledge_sale", {
    p_invoice: id, p_name: String(b.name || "").slice(0, 120), p_signature: signature,
  });
  if (error) return fail(friendly(error.message));
  return json({ ok: true, ...((data || {}) as Record<string, unknown>) });
}
