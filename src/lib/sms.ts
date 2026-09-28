import "server-only";
import { env, has, TEST_SMS_CODE } from "@/lib/env";
import { toE164 } from "@/lib/format";

const twilioAuth = () => "Basic " + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64");

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; status: number; error?: string; test?: boolean }> {
  if (!has.twilioSms) {
    console.log(`[sms:test] to ${to}: ${body}`);
    return { ok: true, status: 200, test: true };
  }
  // A Messaging Service (sender pool, registered "Tyrebiter" sender ID) is preferred over a single number.
  const params: Record<string, string> = { To: toE164(to), Body: body };
  if (env.twilioMessagingService) params.MessagingServiceSid = env.twilioMessagingService;
  else params.From = env.twilioFrom;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : (await res.text()).slice(0, 300) };
}

// Mobile verification via Twilio Verify. In test mode the code is always 123456.
export async function startVerification(mobile: string) {
  if (!has.twilioVerify) {
    if (!env.testMode) throw new Error("SMS verification isn't set up yet.");
    return { test: true };
  }
  const res = await fetch(`https://verify.twilio.com/v2/Services/${env.twilioVerifySid}/Verifications`, {
    method: "POST",
    headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: toE164(mobile), Channel: "sms" }),
  });
  if (!res.ok) throw new Error("We couldn't send a code to that number. Check it and try again.");
  return { test: false };
}

export async function checkVerification(mobile: string, code: string) {
  if (!has.twilioVerify) return env.testMode && code === TEST_SMS_CODE;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${env.twilioVerifySid}/VerificationCheck`, {
    method: "POST",
    headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: toE164(mobile), Code: code }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.status === "approved";
}
