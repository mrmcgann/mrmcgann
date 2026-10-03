import { revalidatePath, revalidateTag } from "next/cache";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

// Admin edits show on the public site straight away (instead of within 20 seconds).
export async function POST(req: Request) {
  const { lotId, settings, partners } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data: isAdmin } = await db.rpc("is_admin");
  if (!isAdmin) return fail("Admins only.", 403);
  if (lotId) { revalidateTag(`lot-${Number(lotId)}`); revalidatePath(`/lot/${Number(lotId)}`); }
  if (settings) revalidateTag("settings");
  if (partners) { revalidateTag("partners"); revalidatePath("/finance"); revalidatePath("/insurance"); }
  revalidateTag("lots");
  revalidatePath("/");
  return json({ ok: true });
}
