import type { MetadataRoute } from "next";
import { supabasePublic } from "@/lib/supabase/anon";
import { CATEGORIES, MAKES, canonicalMake, modelsFor } from "@/lib/vehicles";
import { photoUrl } from "@/lib/photos";
import { SOLD_WINDOW_DAYS, slugify } from "@/lib/seo";
import { env } from "@/lib/env";

export const revalidate = 600;

// Everything search engines should know about: the main pages, every vehicle that's live, waiting on the seller,
// or sold in the last 18 months (with its photo), and the landing pages that have something on them (category, state,
// make and model). Pages with nothing on them are left out, so Google spends its time on the good ones.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const abs = (u: string) => (u.startsWith("http") ? u : `${base}${u}`);
  const pages = ["", "/auctions", "/makes", "/sales", "/sell", "/help", "/listing-promise", "/finance", "/insurance", "/warranty", "/terms", "/website-terms", "/privacy", "/seller-agreement", "/contact", "/delete-account",
    ...CATEGORIES.map((c) => `/for-sale/${c.key}`)]
    .map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.7 }));
  if (!env.supabaseUrl) return pages;
  const db = supabasePublic();
  const since = new Date(Date.now() - SOLD_WINDOW_DAYS * 86400000).toISOString();
  type Row = { id: number; updated_at: string; category: string; state: string | null; make: string | null; model: string | null; status: string; cover_path: string | null; sold_price: number | null };
  // a page at a time: the API returns at most 1,000 rows per request
  const rows: Row[] = [];
  for (let from = 0; from < 45000; from += 1000) {
    const { data, error } = await db.from("lots").select("id, updated_at, category, state, make, model, status, cover_path, sold_price")
      .or(`status.in.(live,offers,referred),and(status.eq.sold,ends_at.gte.${since})`)
      .order("id", { ascending: false }).range(from, from + 999);
    if (error || !data) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  const { data: sales } = await db.from("sales").select("slug, updated_at").eq("published", true).limit(500);
  const pairs = [...new Set(rows.filter((l) => l.state).map((l) => `/for-sale/${l.category}/${String(l.state).toLowerCase()}`))];

  // make and model pages: live stock, or at least 3 sales in the last 18 months (the same rule the pages use)
  const live = new Map<string, number>(), sold = new Map<string, number>();
  for (const l of rows) {
    const make = canonicalMake(l.make);
    if (!make) continue;
    const model = l.model ? modelsFor(make).find((m) => m.toLowerCase() === String(l.model).toLowerCase()) : null;
    if (l.status === "sold" && !(Number(l.sold_price) > 0)) continue;
    const target = l.status === "sold" ? sold : l.status === "live" ? live : null;
    if (!target) continue;
    target.set(make, (target.get(make) || 0) + 1);
    if (model) target.set(`${make}|${model}`, (target.get(`${make}|${model}`) || 0) + 1);
  }
  const worth = (k: string) => (live.get(k) || 0) > 0 || (sold.get(k) || 0) >= 3;
  const makePages = Object.keys(MAKES).filter(worth).map((m) => `/makes/${slugify(m)}`);
  const modelPages = [...new Set([...live.keys(), ...sold.keys()])].filter((k) => k.includes("|") && worth(k))
    .map((k) => { const [m, mo] = k.split("|"); return `/makes/${slugify(m)}/${slugify(mo)}`; });

  return [
    ...pages,
    ...[...pairs, ...makePages, ...modelPages].map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...(sales || []).map((s: { slug: string; updated_at: string }) => ({ url: `${base}/sales/${s.slug}`, lastModified: s.updated_at, changeFrequency: "hourly" as const, priority: 0.7 })),
    ...rows.map((l) => ({
      url: `${base}/lot/${l.id}`, lastModified: l.updated_at,
      changeFrequency: (l.status === "sold" ? "monthly" : "hourly") as "monthly" | "hourly",
      priority: l.status === "sold" ? 0.4 : 0.8,
      ...(l.cover_path ? { images: [abs(photoUrl(l.cover_path))] } : {}),
    })),
  ];
}
