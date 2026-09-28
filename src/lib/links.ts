import "server-only";
import crypto from "crypto";
import { env } from "@/lib/env";

// Tamper-proof links (unsubscribe, manage alerts) that work without signing in.
const secret = () => env.linkSecret || env.supabaseServiceKey || "tyrebiter-dev-secret";
const mac = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 22);

export function sign(payload: string) {
  return `${Buffer.from(payload).toString("base64url")}.${mac(payload)}`;
}

export function verify(token: string): string | null {
  const [p, m] = String(token || "").split(".");
  if (!p || !m) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const want = mac(payload);
  if (want.length !== m.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m))) return null;
  return payload;
}

export const manageAlertsUrl = (userId: string) => `${env.siteUrl}/u/${sign(`u:${userId}`)}`;
export const userFromToken = (token: string) => {
  const p = verify(token);
  return p?.startsWith("u:") ? p.slice(2) : null;
};
