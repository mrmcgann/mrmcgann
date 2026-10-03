// Turns a website link (from an alert, an email or a universal link) into the app screen
// that shows the same thing. Anything the app doesn't have opens on the home screen.
export function appPath(link: string | null | undefined): string {
  if (!link) return "/";
  let path = link.trim();
  const abs = /^https?:\/\/[^/]+(\/.*)?$/i.exec(path);
  if (abs) path = abs[1] || "/";
  if (/^tyrebiter:\/\//i.test(path)) path = "/" + path.replace(/^tyrebiter:\/\/\/?/i, "");
  if (!path.startsWith("/")) path = "/" + path;
  const [p, query = ""] = path.split("?");
  const q = query ? `?${query.split("#")[0]}` : "";
  let m: RegExpExecArray | null;
  if ((m = /^\/lot\/(\d{1,9})\/?$/.exec(p))) return `/lot/${m[1]}`;
  if ((m = /^\/account\/invoices\/([0-9a-f-]{36})\/?$/i.exec(p))) return `/invoice/${m[1]}`;
  if ((m = /^\/invoice\/([0-9a-f-]{36})\/?$/i.exec(p))) return `/invoice/${m[1]}`;
  if ((m = /^\/handover\/([0-9a-f]{32})\/?$/.exec(p))) return `/handover/${m[1]}`;
  if (/^\/sell(\/dashboard)?\/?$/.test(p)) return "/sell";
  if (/^\/watchlist\/?$/.test(p)) return "/watchlist";
  if (/^\/(account\/)?notifications\/?$/.test(p)) return "/notifications";
  if (/^\/account\/?$/.test(p)) return "/account";
  if (/^\/(auctions|search)\/?$/.test(p)) return `/search${q}`;
  if (/^\/join\/?$/.test(p)) return "/join";
  if (/^\/signin\/?$/.test(p)) return "/signin";
  return "/";
}

/** Website search query string → filters object. */
export function queryToObject(qs: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of qs.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = decodeURIComponent(i < 0 ? part : part.slice(0, i));
    const v = i < 0 ? "" : decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
    if (k) o[k] = v;
  }
  return o;
}
