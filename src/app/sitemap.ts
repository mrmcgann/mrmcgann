import type { MetadataRoute } from "next";
import { supabasePublic } from "@/lib/supabase/anon";
import { env } from "@/lib/env";

export const revalidate = 600;

// Live and recently closed vehicles, plus the main pages, for search engines.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl;
  const pages = ["", "/auctions", "/auctions?cat=cars", "/auctions?cat=utes", "/auctions?cat=trucks", "/sell", "/help", "/terms", "/privacy", "/seller-agreement", "/contact", "/delete-account"]
    .map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.7 }));
  if (!env.supabaseUrl) return pages;
  const { data } = await supabasePublic().from("lots").select("id, updated_at").in("status", ["live", "offers", "sold"]).order("updated_at", { ascending: false }).limit(5000);
  return [...pages, ...(data || []).map((l: { id: number; updated_at: string }) => ({ url: `${base}/lot/${l.id}`, lastModified: l.updated_at, changeFrequency: "hourly" as const, priority: 0.8 }))];
}
