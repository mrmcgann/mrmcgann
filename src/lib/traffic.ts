// Where a visit came from, what kind of device and page it is, and whether it's a robot.
// Pure functions (no Node or Next imports): used by the tracking endpoint and the unit tests.

export const SOURCES = ["google", "bing", "other-search", "facebook", "instagram", "tiktok", "youtube", "linkedin", "reddit", "x",
  "email", "sms", "newsletter", "app", "referral", "direct"] as const;

const SEARCH: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "google"], [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)(duckduckgo\.com|search\.yahoo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|startpage\.com|baidu\.com|yandex\.[a-z]+)$/, "other-search"],
];
const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com)$/, "facebook"], [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"], [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"], [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
  [/(^|\.)reddit\.com$/, "reddit"], [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "x"],
];

const clean = (s: unknown, max = 60) => String(s ?? "").toLowerCase().replace(/[^a-z0-9._ -]/g, "").trim().slice(0, max) || null;

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** The source of a visit: tagged links (utm_*) first, then the referring site. Own-site referrers are "direct". */
export function classifySource(input: { referrer?: string | null; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; ownHost?: string | null; app?: boolean }) {
  const utm = clean(input.utmSource, 40);
  const medium = clean(input.utmMedium, 40);
  const campaign = clean(input.utmCampaign, 80);
  if (input.app) return { source: "app", medium: medium || "app", campaign, referrer: null };
  if (utm) {
    const known = (SOURCES as readonly string[]).includes(utm) ? utm : utm === "fb" ? "facebook" : utm === "ig" ? "instagram" : utm;
    return { source: known, medium: medium || (known === "email" || known === "newsletter" ? "email" : known === "sms" ? "sms" : "tagged"), campaign, referrer: hostOf(input.referrer) };
  }
  const host = hostOf(input.referrer);
  if (!host || (input.ownHost && (host === input.ownHost || host.endsWith(`.${input.ownHost}`)))) return { source: "direct", medium: null, campaign: null, referrer: null };
  if (/(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/.test(host)) return { source: "email", medium: "email", campaign: null, referrer: host };
  for (const [re, s] of SEARCH) if (re.test(host)) return { source: s, medium: "organic", campaign: null, referrer: host };
  for (const [re, s] of SOCIAL) if (re.test(host)) return { source: s, medium: "social", campaign: null, referrer: host };
  return { source: "referral", medium: "referral", campaign: null, referrer: host };
}

export function deviceOf(ua: string, app?: string | null): string {
  if (app === "ios") return "ios-app";
  if (app === "android") return "android-app";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return "mobile";
  return "desktop";
}

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link|whatsapp|telegram|skype|preview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|undici|go-http|java\/|okhttp|httpclient|scrapy|phantom|selenium|playwright|puppeteer/i;
export const isBot = (ua: string | null | undefined) => !ua || ua.length < 12 || BOT.test(ua);

/** The kind of page, for "views by page" (paths are grouped, never stored with query strings). */
export function pageOf(path: string): { page: string; lotId: number | null } {
  const p = path.split("?")[0].split("#")[0];
  const lot = /^\/lot\/(\d{1,12})(\/|$)/.exec(p);
  if (lot) return { page: "lot", lotId: Number(lot[1]) };
  if (p === "/" || p === "") return { page: "home", lotId: null };
  const first = p.split("/")[1] || "";
  const map: Record<string, string> = {
    auctions: "auctions", "for-sale": "for-sale", makes: "for-sale", sold: "sold", sell: "sell", sales: "sales", help: "help", join: "join", signin: "account",
    account: "account", watchlist: "account", finance: "partners", insurance: "partners", warranty: "partners", terms: "legal", privacy: "legal",
    "website-terms": "legal", "seller-agreement": "legal", "listing-promise": "legal", contact: "help", offers: "account",
  };
  return { page: map[first] || "other", lotId: null };
}

// Pages whose address carries a private link (unsubscribe, handover, seller agreement, password reset,
// invoices and offers): the secret part is never stored.
const PRIVATE = /^\/(u|handover|sell\/agreement|reset|auth|account\/invoices|invoice|offers)\/[^/]+/;

/** A path safe to store: path only, at most 200 characters, no query string, fragment or private token. */
export function cleanPath(path: unknown): string {
  let p = String(path ?? "/").split("?")[0].split("#")[0];
  p = (p.startsWith("/") ? p : `/${p}`).replace(/[^\w\-./]/g, "");
  p = p.replace(PRIVATE, (m) => `${m.slice(0, m.lastIndexOf("/"))}/:private`);
  // anything that looks like a token or an id from a link (long random strings, UUIDs) is dropped too
  p = p.split("/").map((seg) => (seg.length >= 20 || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ? ":private" : seg)).join("/");
  return p.slice(0, 200) || "/";
}

/** Rate-limit key: the IPv4 address, or the /64 network of an IPv6 address (one home or phone). */
export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const parts = ip.split(":");
  return parts.slice(0, 4).join(":");
}

/** The app's own HTTP clients (React Native on iOS and Android). */
export const isAppAgent = (ua: string) => /CFNetwork|okhttp|Dalvik|Expo|Tyrebiter/i.test(ua);

/** Australian state from the hosting provider's location headers (country + region code). */
export function regionOf(country: string | null | undefined, region: string | null | undefined): string | null {
  if (!country) return null;
  if (country.toUpperCase() !== "AU") return "overseas";
  const r = String(region || "").toUpperCase().replace(/^AU-/, "");
  return ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].includes(r) ? r : null;
}

/** Search text to store: trimmed, lower case, at most 120 characters, digits kept (prices, years). */
export const cleanQuery = (q: unknown) => String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
