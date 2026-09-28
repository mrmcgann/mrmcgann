import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { allow, clientIp } from "@/lib/ratelimit";
import { kickOutbox } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// The seller confirms handover from their private link by entering the buyer's release code.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || "");
  if (!/^[0-9a-f]{32}$/.test(token)) return fail("This link isn't valid.", 404);
  if (!(await allow(`handover:${await clientIp()}`, 20, 3600))) return fail("Too many attempts. Call us.", 429);
  const odo = Number(String(b.odometer || "").replace(/[^0-9]/g, "")) || null;
  const keys = Number(b.keys) || null;
  const { data, error } = await supabaseAdmin().rpc("complete_handover", {
    p_token: token, p_code: String(b.code || "").replace(/\D/g, ""), p_odometer: odo, p_keys: keys, p_notes: String(b.notes || "").slice(0, 1000),
  });
  if (error) return fail(friendly(error.message));
  kickOutbox();
  await sendEmail({ to: env.supportEmail, subject: "Vehicle handed over", text: `A seller confirmed handover. Odometer ${odo ?? "?"}, keys ${keys ?? "?"}. ${b.notes || ""}` }).catch(() => undefined);
  return json(data);
}
