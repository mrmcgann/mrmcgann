import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";
import { payIdEnabled } from "@/lib/payid";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// The member's bidding deposit: balance, what's holding it, their limit, history and how to pay (web and app).
export async function GET() {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data, error } = await db.rpc("my_deposit");
  if (error) return fail("We couldn't load your deposit.");
  const res = json({ deposit: data, payId: payIdEnabled(), bank: { name: env.bankName, bsb: env.bankBsb, account: env.bankAccount, payId: env.payId || null } });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
