import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { kickOutbox } from "@/lib/notify";

// The seller gives written notice to end their appointment of us (Form 9, Part 4 section 4): it ends 30 days from now
// (MDCA Act s 82(1)(i)). The engine records it, tells them and our team, and lists any auction that falls after the end:
// those can't go ahead. Ending it sooner is by agreement with us (seller agreement, section 8).
export async function POST(req: Request) {
  const { lotId, confirm } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`appt-end:${user.id}`, 10, 3600))) return fail("Too many attempts. Call us.", 429);
  const id = Number(lotId);
  if (!Number.isSafeInteger(id) || id <= 0) return fail("Which truck?");
  if (confirm !== true) return fail("Tick the box to confirm you're giving notice.");
  const { data, error } = await db.rpc("seller_end_appointment", { p_lot: id });
  if (error) return fail(friendly(error.message));
  kickOutbox();
  return json(data);
}
