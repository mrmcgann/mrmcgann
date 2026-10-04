import { supabaseAdmin } from "@/lib/supabase/admin";
import { processCharges } from "@/lib/charges";
import { drainOutbox } from "@/lib/outbox";
import { authorised } from "@/lib/cron";
import { money, dateLong } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The auction clock. Runs every minute. Every step works in batches and is safe
// to run twice at once (rows are locked and skipped), so a slow minute never
// double-closes an auction, double-charges a card or double-sends an alert.
export async function GET(req: Request) {
  if (!authorised(req)) return new Response("Unauthorised", { status: 401 });
  const db = supabaseAdmin();
  const started = Date.now();
  const left = () => 280_000 - (Date.now() - started);
  const s: Record<string, number> = {};

  // 1. Close auctions whose time is up (500 per pass)
  s.closed = 0;
  for (let n = 1; n > 0 && left() > 200_000;) {
    const { data } = await db.rpc("close_due_lots", { p_limit: 500 });
    n = Number(data || 0);
    s.closed += n;
  }

  // 2. Take payment for new invoices straight away
  s.charged = await processCharges(Math.min(90_000, left() - 150_000));

  // 3. Referral / offers / sold / passed alerts (buyers, watchers, losing bidders, sellers)
  s.statusNotices = 0;
  for (let n = 1; n > 0 && left() > 120_000;) {
    const { data } = await db.rpc("queue_status_notices", { p_limit: 200 });
    n = Number(data || 0);
    s.statusNotices += n;
  }

  // 4. One-hour reminders for watched vehicles
  const { data: rem } = await db.rpc("queue_ending_reminders", { p_limit: 50000 });
  s.reminders = Number(rem || 0);

  // 5. Saved-search alerts (every 15 minutes)
  if (new Date().getMinutes() % 15 === 0) {
    const { data } = await db.rpc("queue_search_alerts");
    s.searchAlerts = Number(data || 0);
  }

  // 6. Seller payouts that are now ready (collected, claim window closed, no claim)
  const { data: ready } = await db.rpc("release_payouts");
  s.payoutsReady = Number(ready || 0);

  // 7. Reminders: balance due tomorrow; collection due tomorrow; storage started
  const soon = new Date(Date.now() + 26 * 3600_000).toISOString();
  const { data: balances } = await db.from("invoices").select("id, ref, buyer_id, balance_due, due_at, lots(title)")
    .eq("status", "deposit_paid").lte("due_at", soon).limit(500);
  for (const i of (balances || []) as unknown as { id: string; ref: string; buyer_id: string; balance_due: number; due_at: string; lots: { title: string } }[]) {
    await db.rpc("queue_notice", { p_user: i.buyer_id, p_kind: "account", p_title: `Balance due for the ${i.lots?.title}`,
      p_body: `Please pay the ${money(i.balance_due, true)} balance by ${dateLong(i.due_at)}, reference ${i.ref}. Details are on your invoice. We never change our bank details by email.`,
      p_link: `/account/invoices/${i.id}`, p_dedupe: `balance-due:${i.id}`, p_meta: {}, p_expires: null });
  }
  const { data: collect } = await db.from("invoices").select("id, buyer_id, collect_by, lots(title)")
    .eq("status", "paid").is("collected_at", null).not("collect_by", "is", null).lte("collect_by", soon).limit(500);
  const today = new Date().toISOString().slice(0, 10);
  for (const i of (collect || []) as unknown as { id: string; buyer_id: string; collect_by: string; lots: { title: string } }[]) {
    const overdue = new Date(i.collect_by).getTime() < Date.now();
    await db.rpc("queue_notice", { p_user: i.buyer_id, p_kind: "account",
      p_title: overdue ? `Storage is now being charged for the ${i.lots?.title}` : `Collect the ${i.lots?.title} by ${dateLong(i.collect_by)}`,
      p_body: overdue ? "The collection window has passed, so daily storage now applies (see your invoice). Book a collection time today." : "Book a collection time from your invoice if you haven't already.",
      p_link: `/account/invoices/${i.id}`, p_dedupe: overdue ? `storage:${i.id}:${today}` : `collect-soon:${i.id}`, p_meta: {}, p_expires: null });
  }

  // 8. Hourly: delete video uploads that never became a request (abandoned or over the limit)
  if (new Date().getMinutes() === 7) {
    const { data: orphans } = await db.rpc("video_orphans", { p_limit: 200 });
    const paths = ((orphans || []) as unknown as (string | { video_orphans: string })[]).map((x) => (typeof x === "string" ? x : x.video_orphans));
    if (paths.length) {
      await db.storage.from("video-uploads").remove(paths);
      await db.from("video_upload_slots").delete().in("path", paths);
    }
    s.videoOrphans = paths.length;
    // Plate lookups older than 90 days (kept only when an appraisal used them)
    const { data: pruned } = await db.rpc("prune_rego_lookups");
    s.lookupsPruned = Number(pruned || 0);
  }

  // 9. The weekly newsletter (only when switched on, at the set day and hour, once a week)
  if (new Date().getMinutes() < 5) {
    const { sendNewsletter } = await import("@/lib/newsletter");
    const nl = await sendNewsletter().catch(() => ({ queued: 0 }));
    if (nl.queued) s.newsletter = nl.queued;
  }

  // 10. Use the rest of the minute to send messages (the sender job also runs every minute)
  const out = await drainOutbox({ max: 5000, deadlineMs: Math.max(0, Math.min(40_000, left() - 20_000)) });
  s.sent = out.sent;
  s.sendFailed = out.failed;
  s.ms = Date.now() - started;
  return Response.json({ ok: true, ...s });
}
