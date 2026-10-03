import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";

// Delete my account (website and apps). App Store and Google Play require members
// to be able to do this themselves. Anything still in progress (live bids, an unpaid
// or uncollected purchase, a vehicle for sale) has to finish first, and we say what.

// What would stop deletion right now (shown before the member confirms).
export async function GET() {
  const user = await currentUser(await supabaseServer());
  if (!user) return fail("Sign in first.", 401);
  const { data } = await supabaseAdmin().rpc("account_deletion_blockers", { p_user: user.id });
  const res = json({ blockers: (data || []) as string[] });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function POST(req: Request) {
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== "DELETE") return fail("Type DELETE to confirm.");
  const user = await currentUser(await supabaseServer());
  if (!user) return fail("Sign in first.", 401);
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("profiles").select("email, stripe_customer_id").eq("id", user.id).single();
  const { data, error } = await admin.rpc("delete_account", { p_user: user.id });
  if (error) return fail("We couldn't delete your account. Please try again or call us.");
  const r = data as { ok: boolean; blockers?: string[] };
  if (!r.ok) return json({ ok: false, blockers: r.blockers || [] }, 409);

  // Remove the saved card (Stripe keeps payment records for the law), then the sign-in itself.
  const stripe = getStripe();
  const customer = (before as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (stripe && customer) await stripe.customers.del(customer).catch(() => undefined);
  // Soft delete: the email is freed and the person can't sign in, while sale records stay linked.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id, true);
  await sendEmail({
    to: env.supportEmail, subject: "Account deleted",
    text: `Member ${user.id} deleted their account${authErr ? ` (sign-in removal failed: ${authErr.message}; remove it in Supabase Auth)` : ""}.`,
  }).catch(() => undefined);
  if (before?.email) {
    await sendEmail({
      to: before.email, subject: "Your Tyrebiter account has been deleted",
      text: `Your Tyrebiter account and personal details have been deleted. We keep records of any purchases or sales only for as long as tax law requires.\n\nIf you didn't ask for this, call us on ${env.phone}.\n\n${env.legalName} · ABN ${env.abn}`,
    }).catch(() => undefined);
  }
  return json({ ok: true });
}
