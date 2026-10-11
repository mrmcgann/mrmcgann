import "server-only";
import { env } from "@/lib/env";

import crypto from "node:crypto";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Vercel Cron (and the Supabase backup job in supabase/cron.sql) send "Authorization: Bearer <CRON_SECRET>".
// Compared in constant time. A secret in the web address is still accepted outside production, for local testing,
// because addresses end up in logs.
export function authorised(req: Request) {
  if (!env.cronSecret || env.cronSecret.length < 16) return false;
  const auth = req.headers.get("authorization") || "";
  if (same(auth, `Bearer ${env.cronSecret}`)) return true;
  const qs = new URL(req.url).searchParams.get("secret") || "";
  return process.env.VERCEL_ENV !== "production" && qs !== "" && same(qs, env.cronSecret);
}
