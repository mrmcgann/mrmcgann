import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

export type NotifyKind = "outbid" | "ending" | "won" | "searches" | "marketing" | "account";

// Records a notification and sends it by SMS/email according to the member's settings.
// "account" messages (payments, inspections) always go out by both channels.
export async function notify(userId: string, kind: NotifyKind, title: string, body: string, link?: string) {
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("email, mobile, mobile_verified, notify").eq("id", userId).single();
  if (!p) return;
  const prefs = kind === "account" ? { sms: true, email: true } : p.notify?.[kind] || { sms: false, email: true };
  const channels: string[] = [];
  const url = link ? env.siteUrl + link : env.siteUrl;
  if (prefs.sms && p.mobile && p.mobile_verified) {
    await sendSms(p.mobile, `Tyrebiter: ${title}. ${url}`);
    channels.push("sms");
  }
  if (prefs.email && p.email) {
    await sendEmail(p.email, title, `${body}\n\n${url}\n\nTyrebiter`);
    channels.push("email");
  }
  await db.from("notifications").insert({ user_id: userId, kind, title, body, link, channels });
}
