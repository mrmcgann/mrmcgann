import { env } from "@/lib/env";

// security.txt (RFC 9116): tells security researchers how to report a hole to us privately instead of publishing it.
// SECURITY_EMAIL sets the address (defaults to the support address). The expiry date moves forward on its own.
export const dynamic = "force-dynamic";

export function GET() {
  const email = process.env.SECURITY_EMAIL || env.supportEmail;
  const site = env.siteUrl.replace(/\/$/, "");
  const expires = new Date(Date.now() + 180 * 24 * 3600_000);
  expires.setUTCHours(0, 0, 0, 0);
  const body = [
    `Contact: mailto:${email}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${site}/.well-known/security.txt`,
    `Policy: ${site}/security-policy`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
