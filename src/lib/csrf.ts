// A request that changes something (POST, DELETE…) and carries a sign-in cookie must come from this site.
// Browsers always say where a request came from (Origin, or Sec-Fetch-Site), so another website can't make a
// signed-in member bid, pay or change their details behind their back (cross-site request forgery). The phone app
// and webhooks send no cookies, so they're unaffected (the app signs its requests with a token instead).
// Pure, so it's unit-tested (tests/unit/security.test.mjs).
export function crossSite(r: { method: string; headers: { get(name: string): string | null }; cookieNames: string[]; host: string }): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(r.method.toUpperCase())) return false;
  const cookieAuth = r.cookieNames.some((n) => n.startsWith("sb-") && n.includes("-auth-token"));
  if (!cookieAuth) return false;
  const host = r.headers.get("x-forwarded-host") || r.headers.get("host") || r.host;
  const origin = r.headers.get("origin");
  if (origin) {
    try { return new URL(origin).host !== host; } catch { return true; }
  }
  const site = r.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}
