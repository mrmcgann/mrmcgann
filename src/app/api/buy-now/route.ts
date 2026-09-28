import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { chargeInvoice } from "@/lib/charges";

export async function POST(req: Request) {
  const { lotId } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in to buy.", 401);
  const { data, error } = await db.rpc("buy_now", { p_lot: Number(lotId) });
  if (error) return fail(friendly(error.message));
  await chargeInvoice(data as string);
  return json({ invoiceId: data });
}
