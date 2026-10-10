import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// For an outside uptime monitor (UptimeRobot, Better Stack and the like, free): answers 200 when the site and
// its database are up and nothing is failing, 503 otherwise. It says nothing more than that: the details are
// in Admin → Site health. Cached for 30 seconds so a monitor can't load the database.
let last: { at: number; status: number; body: Record<string, unknown> } | null = null;

export async function GET() {
  const headers = { "Cache-Control": "public, s-maxage=30, max-age=0", "X-Robots-Tag": "noindex" };
  // the CDN doesn't keep 503s, so each server keeps the answer for 10 seconds too
  if (last && Date.now() - last.at < 10_000) return Response.json(last.body, { status: last.status, headers });
  const res = await answer();
  last = { at: Date.now(), ...res };
  return Response.json(res.body, { status: res.status, headers });
}

async function answer(): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const db = supabaseAdmin();
    const [fails, latest] = await Promise.all([
      db.from("health_checks").select("key").eq("status", "fail").limit(1),
      db.from("health_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (fails.error || latest.error) return { status: 503, body: { ok: false, reason: "database" } };
    // checks that haven't run for 10 minutes mean the clock and the sender have both stopped
    const stale = !latest.data || Date.now() - new Date(latest.data.checked_at).getTime() > 10 * 60_000;
    const reason = (fails.data || []).length ? "check" : stale ? "clock" : null;
    return { status: reason ? 503 : 200, body: { ok: !reason, ...(reason ? { reason } : {}) } };
  } catch {
    return { status: 503, body: { ok: false, reason: "database" } };
  }
}
