import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { classifySource, cleanPath, cleanQuery, deviceOf, hostOf, ipKey, isAppAgent, isBot, pageOf, regionOf } from "@/lib/traffic";

export const dynamic = "force-dynamic";

// First-party traffic counter for the Insights dashboard. No cookies and no IP addresses are kept:
// a visitor is an anonymous code made from the browser, network and today's date with a secret,
// so the same person can't be followed from one day to the next. Raw rows are deleted after 90 days.
const KINDS = new Set(["view", "search", "click", "identify"]);
const hits = new Map<string, { n: number; reset: number }>();

function limited(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); if (hits.size > 50_000) hits.clear(); return false; }
  h.n += 1;
  return h.n > 120;
}

const brisbaneDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });

export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  const raw = await req.text().catch(() => "");
  if (raw.length > 4000) return new Response(null, { status: 413 });
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw || "{}"); } catch { return new Response(null, { status: 400 }); }
  // the app's own HTTP clients may say they're the app; browsers must come from our own pages (Origin)
  const app = (b.app === "ios" || b.app === "android") && isAppAgent(ua) ? (b.app as string) : null;
  if (!app && isBot(ua)) return new Response(null, { status: 204 });
  const kind = String(b.k || "");
  if (!KINDS.has(kind)) return new Response(null, { status: 400 });
  const ownHost = hostOf(env.siteUrl);
  const origin = req.headers.get("origin");
  if (!app && (!origin || (ownHost && hostOf(origin) !== ownHost && !hostOf(origin)?.endsWith(`.${ownHost}`)))) return new Response(null, { status: 403 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0";
  if (limited(ipKey(ip))) return new Response(null, { status: 429 });

  const db = supabaseAdmin();
  const u = (b.u || {}) as Record<string, string | null>;
  const src = classifySource({ referrer: b.r as string, utmSource: u.s, utmMedium: u.m, utmCampaign: u.c, ownHost, app: !!app });

  // A new member: record where they first came from (once, and only for new accounts).
  if (kind === "identify") {
    const user = await currentUser(await supabaseServer());
    if (!user) return new Response(null, { status: 204 });
    const { data: p } = await db.from("profiles").select("created_at").eq("id", user.id).maybeSingle();
    if (p && Date.now() - new Date(p.created_at).getTime() < 14 * 86400000) {
      await db.from("member_attribution").upsert({ user_id: user.id, source: src.source, medium: src.medium, campaign: src.campaign,
        landing: cleanPath(b.l), referrer: src.referrer }, { onConflict: "user_id", ignoreDuplicates: true });
    }
    return new Response(null, { status: 204 });
  }

  const path = cleanPath(b.p);
  const { page, lotId } = pageOf(path);
  const visitor = createHash("sha256").update(`${env.linkSecret || "tyrebiter"}|${brisbaneDay()}|${ip}|${ua}|${app || ""}`).digest("hex").slice(0, 20);
  const results = Number.isFinite(Number(b.n)) && b.n !== null && b.n !== undefined ? Math.max(0, Math.min(1_000_000, Math.round(Number(b.n)))) : null;
  await db.from("web_events").insert({
    kind, path, page, lot_id: lotId, visitor,
    // the session's entry source is sent with every view, so internal clicks keep the source that brought the visit
    source: src.source, medium: src.medium, campaign: src.campaign, referrer: src.referrer,
    device: deviceOf(ua, app), region: regionOf(req.headers.get("x-vercel-ip-country"), req.headers.get("x-vercel-ip-country-region")),
    query: kind === "view" ? null : cleanQuery(b.q), results: kind === "search" ? results : null, member: b.m === 1 || b.m === true,
  });
  return new Response(null, { status: 204 });
}
