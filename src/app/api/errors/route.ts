import { reportError } from "@/lib/errors";
import { env } from "@/lib/env";
import { deviceOf, hostOf, ipKey, isAppAgent, isBot } from "@/lib/traffic";

export const dynamic = "force-dynamic";

// Error reports from the website (browsers) and the phone app, for Admin → Site health. Only from our own pages
// (Origin) or the app; small; at most 20 a minute from one network; cleaned of personal details before they're kept.
// Anything here came from a browser, so it's treated as untrusted text everywhere it's shown or sent.
const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); if (hits.size > 50_000) hits.clear(); return false; }
  h.n += 1;
  return h.n > 20;
}

export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  const raw = await req.text().catch(() => "");
  if (raw.length > 8000) return new Response(null, { status: 413 });
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw || "{}"); } catch { return new Response(null, { status: 400 }); }
  const app = (b.app === "ios" || b.app === "android") && isAppAgent(ua) ? (b.app as string) : null;
  if (!app && isBot(ua)) return new Response(null, { status: 204 });
  const ownHost = hostOf(env.siteUrl);
  const origin = req.headers.get("origin");
  if (!app && (!origin || (ownHost && hostOf(origin) !== ownHost && !hostOf(origin)?.endsWith(`.${ownHost}`)))) return new Response(null, { status: 403 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0";
  if (limited(ipKey(ip))) return new Response(null, { status: 429 });
  const message = typeof b.m === "string" ? b.m : "";
  if (!message) return new Response(null, { status: 400 });

  await reportError({
    source: app ? "app" : "web",
    name: typeof b.n === "string" ? b.n.slice(0, 120) : "Error",
    message,
    stack: typeof b.s === "string" ? b.s : "",
    path: typeof b.p === "string" ? b.p : "/",
    release: app ? `app ${String(b.v || "").slice(0, 20)}`.trim() : typeof b.r === "string" ? b.r : undefined,
    context: { kind: typeof b.k === "string" ? b.k.slice(0, 20) : null, device: app ? `${app}-app` : deviceOf(ua), browser: browserOf(ua) },
  });
  return new Response(null, { status: 204 });
}

function browserOf(ua: string) {
  if (/Expo|CFNetwork|okhttp|Tyrebiter/i.test(ua)) return "app";
  if (/Edg\//.test(ua)) return "Edge";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}
