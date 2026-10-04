import { unstable_cache } from "next/cache";
import { supabasePublic } from "@/lib/supabase/anon";

// What similar vehicles sold for on Tyrebiter (Sell page): same make and model, within two
// years, sold in the last 18 months. Only with at least 3 sales, so the range has a real basis.
const estimate = (make: string, model: string, year: number | null) => unstable_cache(async () => {
  const { data } = await supabasePublic().rpc("price_estimate", { p_make: make, p_model: model, p_year: year });
  return (data || { count: 0 }) as { count: number; low?: number; mid?: number; high?: number };
}, ["estimate", make.toLowerCase(), model.toLowerCase(), String(year)], { revalidate: 3600, tags: ["lots"] })();

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const make = (sp.get("make") || "").trim().slice(0, 40), model = (sp.get("model") || "").trim().slice(0, 40);
  const y = Number(sp.get("year"));
  if (!make || !model) return Response.json({ count: 0 });
  const r = await estimate(make, model, Number.isInteger(y) && y > 1900 && y < 2100 ? y : null);
  return Response.json(r, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
}
