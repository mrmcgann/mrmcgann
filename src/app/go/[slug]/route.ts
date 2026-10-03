import { NextResponse } from "next/server";
import { after } from "next/server";
import { getPartnersCached } from "@/lib/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fillReferral } from "@/lib/finance";
import { allow, clientIp } from "@/lib/ratelimit";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
const SOURCES = new Set(["lot", "finance", "insurance", "invoice", "app"]);

// Outbound link to a partner (lender, insurer). Counts the click for billing, then sends the
// person on with the vehicle and loan details filled in. Partner pages open in a new tab.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = new URL(req.url);
  const p = (await getPartnersCached()).find((x) => x.slug === slug);
  if (!p?.referral_url) return NextResponse.redirect(new URL("/finance", env.siteUrl), 302);
  const n = (k: string, max: number) => { const v = Number(u.searchParams.get(k)); return Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null; };
  const s = (k: string) => (u.searchParams.get(k) || "").replace(/[^\w .-]/g, "").slice(0, 40) || null;
  const lot = n("lot", 1e9), source = s("src");
  const target = fillReferral(p.referral_url, {
    amount: n("amount", 5e6), term: n("term", 120), lot, make: s("make"), model: s("model"), year: n("year", 2100), postcode: (u.searchParams.get("postcode") || "").replace(/\D/g, "").slice(0, 4),
    ref: "tyrebiter",
  });
  // Count real people once per partner per day: skip bots, link previews and browser prefetches.
  const ua = req.headers.get("user-agent") || "";
  const prefetch = /prefetch|prerender/i.test(`${req.headers.get("purpose") || ""} ${req.headers.get("sec-purpose") || ""} ${req.headers.get("x-purpose") || ""}`);
  const bot = !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|headless/i.test(ua);
  if (!prefetch && !bot) {
    const ip = await clientIp();
    after(async () => {
      if (!(await allow(`click:${p.id}:${ip}`, 1, 86400))) return;
      await supabaseAdmin().from("partner_clicks").insert({ partner_id: p.id, lot_id: lot, source: source && SOURCES.has(source) ? source : null });
    });
  }
  let res: NextResponse;
  try { res = NextResponse.redirect(new URL(target), 302); } catch { return NextResponse.redirect(new URL(p.kind === "insurance" ? "/insurance" : "/finance", env.siteUrl), 302); }
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
