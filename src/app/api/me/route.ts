import { getSession, missingSteps } from "@/lib/auth";
import { json } from "@/lib/api";
import { env, has } from "@/lib/env";

export async function GET(req: Request) {
  const { supabase, user, profile } = await getSession();
  const withWatched = new URL(req.url).searchParams.get("watched") === "1";
  const watched = user && withWatched ? ((await supabase.from("watchlist").select("lot_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000)).data || []).map((r: { lot_id: number }) => r.lot_id) : [];
  const res = json({
    user: user ? { id: user.id, email: user.email } : null,
    profile,
    missing: user ? missingSteps(profile) : [1, 2, 3, 4, 5],
    watched,
    config: { stripe: has.stripe && Boolean(env.stripePublishable), testMode: env.testMode, sms: has.twilioVerify },
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
