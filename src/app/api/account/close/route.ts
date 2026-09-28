import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// Closing an account is handled by the team (open sales, payouts and legal record keeping first).
export async function POST() {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("first_name, last_name, email").eq("id", user.id).single();
  await admin.from("contact_messages").insert({ user_id: user.id, name: `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || "Member", email: p?.email || user.email, topic: "Close account", message: `Please close account ${user.id}.` });
  await sendEmail({ to: env.supportEmail, subject: "Account closure request", text: `${p?.email} (${user.id}) asked to close their account. Check for open invoices, payouts and claims first.` }).catch(() => undefined);
  return json({ ok: true });
}
