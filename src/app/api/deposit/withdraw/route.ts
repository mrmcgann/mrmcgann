import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { kickOutbox } from "@/lib/notify";
import { env } from "@/lib/env";
import { money } from "@/lib/format";

// "Withdraw my deposit": what isn't holding a bid goes back to the account it came from. Our team sends it from the
// trust account (Admin → Deposits), usually the same or next business day.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`withdraw:${user.id}`, 10, 3600))) return fail("Too many requests. Call us.", 429);
  const amount = Math.round(Number(String(b.amount ?? "").replace(/[^0-9.]/g, "")) * 100) / 100;
  if (!(amount > 0)) return fail("Enter how much to withdraw.");
  const { data: id, error } = await db.rpc("request_deposit_withdrawal", { p_amount: amount });
  if (error) return fail(friendly(error.message));
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("first_name, last_name, deposit_ref").eq("id", user.id).single();
  await admin.from("outbox").insert({ channel: "email", to_addr: env.supportEmail, kind: "lead", priority: 2, dedupe_key: `withdraw:${id}`, link: "/admin/deposits",
    title: `Deposit refund to send: ${money(amount, true)} to ${p?.first_name} ${p?.last_name}`,
    body: `${p?.first_name} ${p?.last_name} (${p?.deposit_ref}) asked for ${money(amount, true)} of their bidding deposit back. Send it to the account it came from (details in Admin → Deposits), then mark it sent.` });
  kickOutbox();
  return json({ ok: true, id });
}
