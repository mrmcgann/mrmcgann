import { currentUser } from "@/lib/auth";
import { CAT } from "@/lib/vehicles";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { allow, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const b = await req.json();
  const err: Record<string, string> = {};
  if (!b.rego?.trim()) err.rego = "Enter the rego.";
  if (!b.odometer?.trim()) err.odometer = "Roughly how many kilometres?";
  if (!/^\d{4}$/.test(b.postcode || "")) err.postcode = "Enter a 4-digit postcode.";
  if (!b.name?.trim()) err.name = "Tell us your name.";
  if (!b.mobile?.trim() && !b.email?.trim()) err.mobile = "Add a mobile or an email so we can reach you.";
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) err.email = "Check the email address.";
  if (Object.keys(err).length) return json({ errors: err }, 400);
  if (!(await allow(`appraisal:${await clientIp()}`, 10, 3600))) return fail("Too many requests. Please call us instead.", 429);

  const db = await supabaseServer();
  const user = await currentUser(db);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("appraisals").insert({
    user_id: user?.id || null, kind: CAT[b.kind] ? b.kind : b.kind === "truck" ? "trucks" : "cars", rego: String(b.rego).toUpperCase().slice(0, 12),
    state: b.state, odometer: b.odometer, postcode: b.postcode, name: b.name, mobile: b.mobile || null, email: b.email || null,
    photo_paths: Array.isArray(b.photos) ? b.photos.slice(0, 12) : [],
  }).select("ref").single();
  if (error) return fail("We couldn't send your request. Please try again.");
  await sendEmail({ to: env.supportEmail, subject: `New appraisal request ${data.ref}`, text: `${b.name} · ${b.rego} (${b.state}) · ${b.odometer} km · ${b.postcode}\n${b.mobile || ""} ${b.email || ""}\n${env.siteUrl}/admin/appraisals` }).catch(() => {});
  return json({ ref: data.ref });
}
