import "server-only";
import { env, has } from "@/lib/env";

export async function sendEmail(to: string, subject: string, text: string) {
  if (!has.email) {
    console.log(`[email:test] to ${to}: ${subject}\n${text}`);
    return { ok: true, test: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to, subject, text }),
  });
  return { ok: res.ok, test: false };
}
