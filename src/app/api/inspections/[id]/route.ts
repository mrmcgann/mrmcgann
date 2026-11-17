import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

// Cancel your own mechanic booking: free before it's paid, a full refund until 24 hours before the visit
// (cancel_inspection decides; the owner is told, so nobody waits).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("We couldn't find that booking.", 404);
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data, error } = await db.rpc("cancel_inspection", { p_id: id });
  if (error) return fail(friendly(error.message));
  return json({ ok: true, ...(data as { refund: number | null }) });
}
