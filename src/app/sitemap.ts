import type { MetadataRoute } from "next";
import { supabasePublic } from "@/lib/supabase/anon";
import { CATEGORIES } from "@/lib/vehicles";
import { env } from "@/lib/env";

export const revalidate = 600;

// Live and recently closed vehicles, the landing pages that have vehicles on them, published
// sales and the main pages, for search engines.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const pages = ["", "/auctions", "/sales", "/sell", "/help", "/listing-promise", "/finance", "/insurance", "/warranty", "/terms", "/privacy", "/seller-agreement", "/contact", "/delete-account",
    ...CATEGORIES.map((c) => `/for-sale/${c.key}`)]
    .map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.7 }));
  if (!env.supabaseUrl) return pages;
  const db = supabasePublic();
  const [{ data }, { data: sales }] = await Promise.all([
    db.from("lots").select("id, updated_at, category, state").in("status", ["live", "offers", "sold"]).order("updated_at", { ascending: false }).limit(5000),
    db.from("sales").select("slug, updated_at").eq("published", true).limit(500),
  ]);
  const rows = (data || []) as { id: number; updated_at: string; category: string; state: string | null }[];
  const pairs = [...new Set(rows.filter((l) => l.state).map((l) => `/for-sale/${l.category}/${String(l.state).toLowerCase()}`))];
  return [
    ...pages,
    ...pairs.map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...(sales || []).map((s: { slug: string; updated_at: string }) => ({ url: `${base}/sales/${s.slug}`, lastModified: s.updated_at, changeFrequency: "hourly" as const, priority: 0.7 })),
    ...rows.map((l) => ({ url: `${base}/lot/${l.id}`, lastModified: l.updated_at, changeFrequency: "hourly" as const, priority: 0.8 })),
  ];
}
