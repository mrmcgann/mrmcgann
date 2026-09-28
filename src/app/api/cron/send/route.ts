import { drainOutbox } from "@/lib/outbox";
import { authorised } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The message sender. Runs every minute alongside the clock and works through the
// queue (payments and outbid alerts first) at the providers' safe rates.
export async function GET(req: Request) {
  if (!authorised(req)) return new Response("Unauthorised", { status: 401 });
  const r = await drainOutbox({ max: 50_000, deadlineMs: 270_000 });
  return Response.json({ ok: true, ...r });
}
