import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { notify } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

const REASONS = ["identity", "transmission_fuel", "write_off_stolen", "finance", "odometer", "missing_feature", "undisclosed_damage", "other"];

// A buyer claims the vehicle is materially different from the listing. Allowed before
// collection, or within the claim window after it. It holds the seller's payout.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data: inv } = await db.from("invoices").select("id, lot_id, status, collected_at, claim_until, ref").eq("id", b.invoiceId).eq("buyer_id", user.id).maybeSingle();
  if (!inv || inv.status === "cancelled") return fail("Invoice not found.", 404);
  if (inv.collected_at && inv.claim_until && new Date(inv.claim_until).getTime() < Date.now()) return fail("The claim window for this vehicle has closed. Call us if you need help.");
  const reason = REASONS.includes(b.reason) ? b.reason : "other";
  const details = String(b.details || "").trim().slice(0, 4000);
  if (details.length < 20) return fail("Please describe what's different from the listing.");
  const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p: unknown) => typeof p === "string" && p.startsWith(`${user.id}/`)).slice(0, 12);
  const admin = supabaseAdmin();
  const { data: open } = await admin.from("claims").select("id").eq("invoice_id", inv.id).eq("status", "open").maybeSingle();
  if (open) return fail("You already have an open claim on this vehicle. We'll be in touch.");
  const { error } = await admin.from("claims").insert({ invoice_id: inv.id, lot_id: inv.lot_id, buyer_id: user.id, reason, details, photo_paths: photos });
  if (error) return fail("Couldn't lodge your claim.");
  await notify(user.id, "account", `We've received your claim on invoice ${inv.ref}`, "We'll review the listing as it was at the time of sale, speak to the seller, and reply within 2 business days. Please don't modify, register or use the vehicle in the meantime.", `/account/invoices/${inv.id}`, { dedupe: `claim:${inv.id}` });
  await sendEmail({ to: env.supportEmail, subject: `CLAIM lodged on ${inv.ref}`, text: `${reason}\n\n${details}\n\n${env.siteUrl}/admin/claims` }).catch(() => undefined);
  return json({ ok: true });
}
