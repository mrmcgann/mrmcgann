import "server-only";
import crypto from "node:crypto";

/** The secret our tamper-proof values are signed with: unsubscribe and alert links, the payments provider's
 *  per-request webhook secret, the anonymous visitor count and the IndexNow key. LINK_SECRET, or CRON_SECRET until
 *  LINK_SECRET is set (Site health warns about that). There is deliberately no built-in fallback on the live site: a
 *  secret written into the code is no secret, so without one these fail loudly instead of signing with something anyone
 *  can read on GitHub. Off the live site (a laptop, the test harness) a per-purpose development value keeps things
 *  working. */
export function signingSecret(purpose: string): string {
  const s = process.env.LINK_SECRET || process.env.CRON_SECRET || "";
  if (s) return s;
  if (process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_TEST_MODE !== "true" && process.env.VERCEL_ENV !== "preview")) {
    throw new Error(`No signing secret for ${purpose}: set LINK_SECRET`);
  }
  return `supertrucker-dev-${purpose}`;
}

/** For a value that only needs to be unguessable for the life of this server process (it must never fail). */
let fallback: string | null = null;
export function softSecret(purpose: string): string {
  try { return signingSecret(purpose); } catch { return (fallback ||= crypto.randomBytes(32).toString("hex")); }
}
