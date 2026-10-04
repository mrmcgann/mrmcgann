import { unstable_cache } from "next/cache";
import { supabasePublic } from "@/lib/supabase/anon";
import { getFeesCached } from "@/lib/cache";
import type { Lot } from "@/lib/types";

// A handful of vehicles by id, for "Recently viewed". Public data only; cached per set of ids.
const cards = (key: string) => unstable_cache(async () => {
  const ids = key.split(",").map(Number);
  const { data } = await supabasePublic().from("lots").select("*").in("id", ids).not("status", "in", "(draft,cancelled)");
  return ((data || []) as Lot[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}, ["cards", key], { revalidate: 30, tags: ["lots"] })();

export async function GET(req: Request) {
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") || "").split(",").map((x) => Number(x)).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 12);
  if (!ids.length) return Response.json({ lots: [], fees: null });
  const [lots, fees] = await Promise.all([cards(ids.join(",")), getFeesCached()]);
  return Response.json({ lots, fees }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" } });
}
