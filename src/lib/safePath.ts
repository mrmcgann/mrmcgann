// Where to send someone after signing in or joining. Only a path on this site: never another website
// ("https://…", "//evil.example", "/\evil.example"), never a script ("javascript:…"). Shared with the app.
export function safePath(next: string | null | undefined, fallback = "/account"): string {
  const s = String(next ?? "").trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(s)) return fallback;
  try {
    const u = new URL(s, "https://tyrebiter.invalid");
    if (u.origin !== "https://tyrebiter.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
