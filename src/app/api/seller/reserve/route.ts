import { revalidateTag } from "next/cache";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

// The seller's reserve on their own vehicle: GET shows it, POST lowers it (or removes it, with reserve: null) until the
// hammer falls. The engine refuses anything but a lower reserve and records it as the seller's instruction.
export async function GET(req: Request) {
  const lotId = Number(new URL(req.url).searchParams.get("lot"));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data, error } = await db.rpc("seller_lot_reserve", { p_lot: lotId });
  if (error) return fail(friendly(error.message), 403);
  return json(data);
}

export async function POST(req: Request) {
  const { lotId, reserve } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const amount = reserve === null ? null : Math.round(Number(String(reserve ?? "").replace(/[^0-9.]/g, "")));
  if (amount !== null && !(amount > 0)) return fail("Enter the new reserve in whole dollars.");
  const { data, error } = await db.rpc("seller_set_reserve", { p_lot: Number(lotId), p_reserve: amount });
  if (error) return fail(friendly(error.message));
  revalidateTag(`lot-${Number(lotId)}`);
  return json({ ok: true, ...(data as Record<string, unknown>) });
}
