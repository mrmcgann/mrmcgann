import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { allow, clientIp } from "@/lib/ratelimit";
import { kickOutbox } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// The depot confirms handover from its private link by entering the buyer's release code.
// What the handover screen shows (the app; the website renders it server-side).
// The token is the depot's private 32-character link for this one collection.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!/^[0-9a-f]{32}$/.test(token)) return fail("This link isn't valid.", 404);
  if (!(await allow(`handover:${await clientIp()}`, 60, 3600))) return fail("Too many attempts. Call us.", 429);
  const db = supabaseAdmin();
  const { data: c } = await db.from("collections").select("status, confirmed_for, collector_name, buyer_id, lots(title, keys)").eq("seller_token", token).maybeSingle();
  if (!c) return fail("This handover link isn't valid. Call us.", 404);
  const { data: b } = await db.from("profiles").select("first_name, last_name").eq("id", c.buyer_id).single();
  const lot = c.lots as unknown as { title: string; keys: number | null } | null;
  const res = json({ status: c.status, confirmed_for: c.confirmed_for, who: c.collector_name || `${b?.first_name || ""} ${b?.last_name || ""}`.trim(), title: lot?.title || "Your vehicle", keys: lot?.keys ?? null });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || "");
  if (!/^[0-9a-f]{32}$/.test(token)) return fail("This link isn't valid.", 404);
  if (!(await allow(`handover:${await clientIp()}`, 20, 3600))) return fail("Too many attempts. Call us.", 429);
  const odo = Number(String(b.odometer || "").replace(/[^0-9]/g, "")) || null;
  const keys = Number(b.keys) || null;
  // For an unregistered vehicle the depot must say how it left, and name a permit if it was driven. The database
  // refuses the handover otherwise: we are the party permitting the road use, so this cannot be skipped here.
  const leftBy = ["carrier", "trailer", "permit"].includes(String(b.leftBy || "")) ? String(b.leftBy) : null;
  const { data, error } = await supabaseAdmin().rpc("complete_handover", {
    p_token: token, p_code: String(b.code || "").replace(/\D/g, ""), p_odometer: odo, p_keys: keys, p_notes: String(b.notes || "").slice(0, 1000),
    p_left_by: leftBy, p_permit: String(b.permit || "").slice(0, 40),
  });
  if (error) return fail(friendly(error.message));
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) return fail(friendly(r.error));
  kickOutbox();
  await sendEmail({ to: env.supportEmail, subject: "Vehicle handed over", text: `The depot confirmed handover. Odometer ${odo ?? "?"}, keys ${keys ?? "?"}.${leftBy ? ` Unregistered, left ${leftBy}${b.permit ? ` (permit ${b.permit})` : ""}.` : ""} ${b.notes || ""}` }).catch(() => undefined);
  return json(data);
}
