import { supabaseAdmin } from "@/lib/supabase/admin";
import { processCharges } from "@/lib/charges";
import { drainOutbox } from "@/lib/outbox";
import { authorised } from "@/lib/cron";
import { money, dateLong } from "@/lib/format";
import { reportError } from "@/lib/errors";
import { beginRun, endRun, markRun } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STEP_LABELS: Record<string, string> = { metrics: "today's numbers", metricsYesterday: "overnight numbers", indexNow: "search engine ping",
  seoAudit: "SEO audit", searchConsole: "Google Search Console", insights: "insights", health: "health checks", claudeCode: "Claude Code updates",
  healthPrune: "health tidy-up" };

// The auction clock. Runs every minute. Every step works in batches and is safe
// to run twice at once (rows are locked and skipped), so a slow minute never
// double-closes an auction, double-charges a card or double-sends an alert.
// Each step is guarded: one that fails is recorded (Admin → Site health) and the rest still run.
export async function GET(req: Request) {
  if (!authorised(req)) return new Response("Unauthorised", { status: 401 });
  const db = supabaseAdmin();
  const started = Date.now();
  const left = () => 280_000 - (Date.now() - started);
  const s: Record<string, number> = {};
  const failed: string[] = [];
  const run = await beginRun("process", db).catch(() => null);
  const guard = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); return true; } catch (e) {
      failed.push(name);
      await reportError({ source: "clock", error: e, route: `clock: ${name}`, path: "/api/cron/process" });
      return false;
    }
  };
  const call = async (name: string, args?: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw Object.assign(new Error(`${name}: ${error.message}`), { name: "DatabaseError" });
    return data;
  };

  // 1. Close auctions whose time is up (500 per pass)
  s.closed = 0;
  await guard("close auctions", async () => {
    for (let n = 1; n > 0 && left() > 200_000;) {
      n = Number((await call("close_due_lots", { p_limit: 500 })) || 0);
      s.closed += n;
    }
  });

  // 2. Take payment for new invoices straight away
  await guard("charge winners", async () => { s.charged = await processCharges(Math.min(90_000, left() - 150_000)); });

  // 3. Referral / offers / sold / passed alerts (buyers, watchers, losing bidders, sellers)
  s.statusNotices = 0;
  await guard("status alerts", async () => {
    for (let n = 1; n > 0 && left() > 120_000;) {
      n = Number((await call("queue_status_notices", { p_limit: 200 })) || 0);
      s.statusNotices += n;
    }
  });

  // 3b. Damage and flaw edits on live listings: one correction once staff stop editing (Terms of sale, section 3)
  await guard("flaw corrections", async () => { s.flawCorrections = Number((await call("announce_flaw_changes")) || 0); });

  // 4. One-hour reminders for watched vehicles
  await guard("ending reminders", async () => { s.reminders = Number((await call("queue_ending_reminders", { p_limit: 50000 })) || 0); });

  // 5. Saved-search alerts (every 15 minutes)
  if (new Date().getMinutes() % 15 === 0) {
    await guard("saved-search alerts", async () => { s.searchAlerts = Number((await call("queue_search_alerts")) || 0); });
  }

  // 6. Seller payouts that are now ready (collected, claim window closed, no claim)
  await guard("seller payouts", async () => { s.payoutsReady = Number((await call("release_payouts")) || 0); });

  // 7. Reminders: balance due tomorrow; collection due tomorrow; storage started
  await guard("payment reminders", async () => {
    const soon = new Date(Date.now() + 26 * 3600_000).toISOString();
    const { data: balances } = await db.from("invoices").select("id, ref, buyer_id, balance_due, due_at, lots(title)")
      .eq("status", "deposit_paid").lte("due_at", soon).limit(500);
    for (const i of (balances || []) as unknown as { id: string; ref: string; buyer_id: string; balance_due: number; due_at: string; lots: { title: string } }[]) {
      await db.rpc("queue_notice", { p_user: i.buyer_id, p_kind: "account", p_title: `Balance due for the ${i.lots?.title}`,
        p_body: `Please pay the ${money(i.balance_due, true)} balance by ${dateLong(i.due_at)}, reference ${i.ref}. Details are on your invoice. We never change our bank details by email.`,
        p_link: `/account/invoices/${i.id}`, p_dedupe: `balance-due:${i.id}`, p_meta: {}, p_expires: null });
    }
    // The overdue reminder the Terms of Sale (section 11) promise before a sale can be cancelled.
    const { data: late } = await db.from("invoices").select("id, ref, buyer_id, balance_due, lots(title)")
      .eq("status", "deposit_paid").lt("due_at", new Date().toISOString()).limit(500);
    for (const i of (late || []) as unknown as { id: string; ref: string; buyer_id: string; balance_due: number; lots: { title: string } }[]) {
      await db.rpc("queue_notice", { p_user: i.buyer_id, p_kind: "account", p_title: `Your balance for the ${i.lots?.title} is overdue`,
        p_body: `Please pay the ${money(i.balance_due, true)} balance within 1 business day, reference ${i.ref}. If it isn't paid, we may cancel the sale (you'd lose your deposit) and offer the vehicle to the next bidder. Call us if something's holding you up.`,
        p_link: `/account/invoices/${i.id}`, p_dedupe: `balance-overdue:${i.id}`, p_meta: {}, p_expires: null });
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
  });

  // 8. Hourly: delete video uploads that never became a request (abandoned or over the limit)
  if (new Date().getMinutes() === 7) await guard("video clean-up", async () => {
    const orphans = await call("video_orphans", { p_limit: 200 });
    const paths = ((orphans || []) as unknown as (string | { video_orphans: string })[]).map((x) => (typeof x === "string" ? x : x.video_orphans));
    if (paths.length) {
      await db.storage.from("video-uploads").remove(paths);
      await db.from("video_upload_slots").delete().in("path", paths);
    }
    s.videoOrphans = paths.length;
  });
  // Plate lookups older than 90 days (kept only when an appraisal used them)
  if (new Date().getMinutes() === 7) await guard("lookup clean-up", async () => { s.lookupsPruned = Number((await call("prune_rego_lookups")) || 0); });

  // 9. The weekly newsletter (only when switched on, at the set day and hour, once a week)
  if (new Date().getMinutes() < 5) {
    const { sendNewsletter } = await import("@/lib/newsletter");
    const nl = await sendNewsletter().catch(async (e) => { failed.push("newsletter"); await reportError({ source: "clock", error: e, route: "clock: newsletter" }); return { queued: 0 }; });
    if (nl.queued) s.newsletter = nl.queued;
  }

  // 10. The information machine: metrics, insights, briefings and SEO (Brisbane time). Daily jobs run once
  //     at or after their hour (a slow or missed minute just delays them), and record the day they ran.
  const bris = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Brisbane" }));
  const [hh, mm] = [bris.getHours(), bris.getMinutes()];
  const bday = bris.toLocaleDateString("en-CA");
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { const r = await fn(); s[name] = typeof r === "number" ? r : 1; return true; } catch (e) {
      s[`${name}Failed`] = 1; failed.push(STEP_LABELS[name] || name);
      await reportError({ source: "clock", error: e, route: `clock: ${name}`, path: "/api/cron/process" });
      return false;
    }
  };
  const { data: jobsRow } = await db.from("settings").select("value").eq("key", "jobs").maybeSingle();
  const jobs = (jobsRow?.value || {}) as Record<string, string>;
  const due = (name: string, hour: number, minute = 0) => jobs[name] !== bday && (hh > hour || (hh === hour && mm >= minute));
  const done = async (name: string) => { jobs[name] = bday; await db.from("settings").upsert({ key: "jobs", value: jobs }); };

  // today's numbers every 15 minutes
  if (mm % 15 === 3 && left() > 150_000) await step("metrics", async () => Number((await call("compute_daily_metrics", { p_day: bday, p_traffic: true })) || 0));
  // after midnight: finish yesterday (with traffic), redo the business numbers for the last 35 days (late payments,
  // cancellations), one day per call so no call runs long, and delete traffic rows older than 90 days
  if (due("metrics_backfill", 0, 20) && left() > 150_000) {
    const day = (k: number) => new Date(bris.getTime() - k * 86400000).toLocaleDateString("en-CA");
    let ok = await step("metricsYesterday", async () => call("compute_daily_metrics", { p_day: day(1), p_traffic: true }));
    for (let k = 2; k <= 35 && ok && left() > 120_000; k++) ok = (await db.rpc("compute_daily_metrics", { p_day: day(k), p_traffic: false })).error == null;
    let pruned = 0;
    for (let n = 50_000; n === 50_000 && left() > 100_000;) { n = Number((await db.rpc("prune_web_events", { p_days: 90 })).data || 0); pruned += n; }
    s.eventsPruned = pruned;
    if (ok) await done("metrics_backfill");
  }
  if (mm % 10 === 1 && left() > 120_000) {
    const { pingIndexNow } = await import("@/lib/seoEngine");
    await step("indexNow", async () => (await pingIndexNow()).sent);
  }
  if (due("seo_audit", 3, 10) && left() > 180_000) {
    const { audit, syncSearchConsole } = await import("@/lib/seoEngine");
    const a = await step("seoAudit", async () => (await audit({ deadlineMs: 90_000 })).issues);
    await step("searchConsole", async () => (await syncSearchConsole()).rows);
    if (a) await done("seo_audit");
  }
  if (due("insights", 6, 30) && left() > 120_000) {
    const { runInsights } = await import("@/lib/insights");
    if (await step("insights", async () => (await runInsights()).insights.length)) await done("insights");
  }
  if (left() > 120_000) {
    const { data: ins } = await db.from("settings").select("value").eq("key", "insights").maybeSingle();
    const cfg = (ins?.value || {}) as Record<string, unknown>;
    const hour = Number(cfg.hour ?? 7);
    for (const kind of ["weekly", "daily"] as const) {
      const on = kind === "daily" ? !!cfg.daily : cfg.weekly !== false;
      const dayOk = kind === "daily" || bris.getDay() === Number(cfg.weekday ?? 1);
      if (!on || !dayOk || !due(`briefing_${kind}`, hour)) continue;
      await done(`briefing_${kind}`); // marked first: an overlapping minute can't send it twice
      const { sendBriefing } = await import("@/lib/insights");
      const r = await sendBriefing(kind, { force: true }).catch(async (e) => { failed.push(`${kind} briefing`); await reportError({ source: "clock", error: e, route: "clock: briefing" }); return { queued: 0 }; });
      s[`${kind}Briefing`] = r.queued;
    }
  }

  // 11. Site health: every check, every minute (alerts admins when something breaks); the site is loaded from
  //     outside every 5 minutes; Claude Code fixes in progress are checked every 5 minutes; old rows tidied nightly.
  if (left() > 60_000) {
    await markRun(run, failed, db).catch(() => null);
    const { runHealth } = await import("@/lib/health");
    await step("health", async () => (await runHealth({ db })).alerts);
  }
  if (mm % 5 === 4 && left() > 60_000) {
    const { syncOpenFixes } = await import("@/lib/fixes");
    await step("claudeCode", async () => syncOpenFixes());
  }
  if (due("health_prune", 1, 5) && left() > 60_000) {
    if (await step("healthPrune", async () => call("prune_health"))) await done("health_prune");
  }

  // 12. Use the rest of the minute to send messages (the sender job also runs every minute)
  await guard("send messages", async () => {
    const out = await drainOutbox({ max: 5000, deadlineMs: Math.max(0, Math.min(40_000, left() - 20_000)) });
    s.sent = out.sent;
    s.sendFailed = out.failed;
  });
  s.ms = Date.now() - started;
  await endRun(run, { ms: s.ms, failed, stats: s }, db).catch(() => null);
  return Response.json({ ok: failed.length === 0, failed, ...s });
}
