import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { chargeInvoice } from "@/lib/charges";
import { kickOutbox } from "@/lib/notify";

export async function POST(req: Request) {
  const { lotId } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to buy.", 401);
  const { data, error } = await db.rpc("buy_now", { p_lot: Number(lotId) });
  if (error) return fail(friendly(error.message), error.message.includes("terms_outdated") ? 409 : 400);
  await chargeInvoice(data as string);
  kickOutbox();
  return json({ invoiceId: data });
}
