// Error reports, cleaned and grouped. Shared by the website (browser and server) and the app, so no Node or Next
// imports. Nothing personal is kept: emails, phone and card numbers, tokens, ids and query strings are replaced
// before anything is stored or shown to Claude. Pure functions, unit-tested (tests/unit/health.test.mjs).

export type ErrorSource = "web" | "server" | "app" | "clock";
export type ErrorFields = { name: string; message: string; stack: string };

const URL_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/g;
const OWN_ASSETS = /https?:\/\/[^/\s"'<>]+(\/_next\/)/g;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const BEARER = /\bbearer\s+(?!\[)[^\s"',;]+/gi;
const SECRET = /\b(token|key|secret|password|passwd|apikey|api_key|access_token|refresh_token|sig|signature|code|otp)(["']?\s*[=:]\s*["']?)(?!\[)[^\s&"',;)}]+/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
const LONG_TOKEN = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;
const NUMBER = /\+?\d(?:[\d \-]{5,}\d)/g; // phone, card and account numbers: 7 or more digits, with spaces or dashes

/** Removes personal details and secrets from any text that might end up in an error report. */
export function scrub(text: unknown, max = 1000): string {
  return String(text ?? "")
    .slice(0, max * 3)
    .replace(URL_QUERY, "$1")
    .replace(OWN_ASSETS, "$1")
    .replace(EMAIL, "[email]")
    .replace(JWT, "[token]")
    .replace(BEARER, "Bearer [hidden]")
    .replace(SECRET, "$1$2[hidden]")
    .replace(UUID, "[id]")
    .replace(LONG_TOKEN, "[token]")
    .replace(NUMBER, (m) => (m.replace(/\D/g, "").length >= 7 ? "[number]" : m))
    .slice(0, max)
    .trim();
}

/** A stack trace, cleaned and cut to the first 25 lines. */
export function scrubStack(stack: unknown): string {
  return String(stack ?? "").split("\n").slice(0, 25).map((l) => scrub(l, 300)).filter(Boolean).join("\n");
}

/** Name, message and stack from anything thrown (an Error, a database error object, a string). */
export function errorFields(err: unknown): ErrorFields {
  if (err instanceof Error) return { name: err.name || "Error", message: err.message || String(err), stack: err.stack || "" };
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = [o.message, o.details, o.hint].filter((x) => typeof x === "string" && x).join(" · ");
    return { name: String(o.name || (o.code ? `Error ${o.code}` : "Error")), message: msg || safeJson(o), stack: typeof o.stack === "string" ? o.stack : "" };
  }
  return { name: "Error", message: String(err ?? "Unknown error"), stack: "" };
}
const safeJson = (o: unknown) => { try { return JSON.stringify(o).slice(0, 300); } catch { return "Unknown error"; } };

/** The page or API path as a pattern: /lot/123 → /lot/:id (so one bug on many vehicles is one error). */
export function routeOf(path: unknown): string {
  const p = String(path ?? "/").split(/[?#]/)[0] || "/";
  return p.split("/").map((s) => (/^\d+$/.test(s) ? ":id" : s.length >= 20 || IS_UUID.test(s) ? ":private" : s)).join("/").slice(0, 200) || "/";
}

/** What makes two reports "the same error": where, what type, and the message with numbers and ids taken out. */
export function normalise(message: string): string {
  return scrub(message, 400).toLowerCase()
    .replace(/\[(email|token|id|number|hidden)\]/g, "#")
    .replace(/\b0x[0-9a-f]+\b/g, "#")
    .replace(/\d+(\.\d+)?/g, "#")
    .replace(/(["'`])[^"'`]{30,}\1/g, "'…'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** A short, stable hash (cyrb53), the same in browsers, Node and the app. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function fingerprint(source: ErrorSource, name: string, message: string, route: string): string {
  return `${source}:${hash(`${source}|${(name || "Error").slice(0, 60)}|${normalise(message)}|${routeOf(route)}`)}`;
}

/** Things that aren't our bugs: redirects, and from browsers and the app, extensions, people's flaky connections and
 *  old tabs after a deploy. (On the server a timeout or a dropped connection is a real problem, so it's kept.) */
export function isNoise(f: { name?: string; message?: string; stack?: string }, source: ErrorSource = "web"): boolean {
  const m = `${f.name || ""}: ${f.message || ""}`;
  if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING/i.test(m)) return true;
  if (source === "server" || source === "clock") return false;
  if (/^(\w*: )?script error\.?$/i.test(m.trim()) && !f.stack) return true;
  if (/ResizeObserver loop/i.test(m)) return true;
  if (/AbortError|The (user|operation) (aborted|was aborted)|signal is aborted/i.test(m)) return true;
  if (/Failed to fetch|NetworkError when attempting|^\w*:? ?Load failed|Network request failed|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|The network connection was lost/i.test(m)) return true;
  if (/ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(m)) return true;
  if (/chrome-extension:|moz-extension:|safari(-web)?-extension:|webkit-masked-url:/i.test(f.stack || "") ) return true;
  return false;
}

export const SOURCE_LABELS: Record<ErrorSource, string> = { web: "Website (browser)", server: "Server", app: "Phone app", clock: "Clock" };
