import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { allow, clientIp } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 120), email = String(b.email || "").trim().slice(0, 200);
  const topic = String(b.topic || "General").slice(0, 60), message = String(b.message || "").trim().slice(0, 4000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || message.length < 10) return fail("Please add your name, a valid email and a message.");
  if (!(await allow(`contact:${await clientIp()}`, 5, 3600))) return fail("Too many messages. Please call us instead.", 429);
  const user = await currentUser(await supabaseServer());
  await supabaseAdmin().from("contact_messages").insert({ user_id: user?.id || null, name, email, topic, message });
  await sendEmail({ to: env.supportEmail, subject: `[${topic}] ${name}`, text: `${message}\n\nReply to: ${email}`, headers: { "Reply-To": email } }).catch(() => undefined);
  return json({ ok: true });
}
