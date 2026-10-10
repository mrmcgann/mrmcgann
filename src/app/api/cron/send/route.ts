import { drainOutbox } from "@/lib/outbox";
import { authorised } from "@/lib/cron";
import { reportError } from "@/lib/errors";
import { beginRun, checksAge, endRun, runHealth } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The message sender. Runs every minute alongside the clock and works through the
// queue (payments and outbid alerts first) at the providers' safe rates.
// It also watches the clock: if the health checks haven't run for 3 minutes (the clock has stopped, or keeps
// running out of time before it gets to them), it runs them itself, so admins still hear about it.
export async function GET(req: Request) {
  if (!authorised(req)) return new Response("Unauthorised", { status: 401 });
  const started = Date.now();
  const run = await beginRun("send").catch(() => null);
  const failed: string[] = [];
  let watched = false;
  try {
    const age = await checksAge();
    if (age == null || age > 3 * 60_000) { watched = true; await runHealth(); }
  } catch (e) {
    failed.push("health checks");
    await reportError({ source: "clock", error: e, route: "clock: health checks (sender)", path: "/api/cron/send" });
  }
  let r = { sent: 0, failed: 0 };
  try {
    r = await drainOutbox({ max: 50_000, deadlineMs: 270_000 - (Date.now() - started) });
  } catch (e) {
    failed.push("send messages");
    await reportError({ source: "clock", error: e, route: "clock: send messages", path: "/api/cron/send" });
  }
  await endRun(run, { ms: Date.now() - started, failed, stats: { ...r, watched: watched ? 1 : 0 } }).catch(() => null);
  return Response.json({ ok: failed.length === 0, ...r, watched });
}
