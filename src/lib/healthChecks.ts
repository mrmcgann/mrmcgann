import { scrub } from "./errorTrack.ts";

// The site health rules: given the database's measurements, the setup and the latest self-test, decide what's
// fine, what to watch and what's broken, in plain English with what to do about it. Pure (no Node or Next
// imports), unit-tested in tests/unit/health.test.mjs. The runner is src/lib/health.ts.

export type Status = "ok" | "warn" | "fail" | "off";
export type Check = { key: string; area: string; status: Status; title: string; detail?: string; fix?: string; action?: QuickFix; value?: number };
export type QuickFix = "run-clock" | "retry-messages";

export type Snapshot = {
  now?: string;
  clock?: Record<string, { started_at: string; ms: number | null; ok: boolean; failed: string[] }>;
  clock_last_done?: string | null;
  clock_unfinished?: number;
  clock_failed_hour?: number;
  clock_runs_hour?: number;
  clock_slow_ms?: number | null;
  auctions_overdue?: number;
  auctions_overdue_since?: string | null;
  offers_overdue?: number;
  charges_waiting?: number;
  charges_stuck?: number;
  invoices_day?: number;
  invoices_failed_day?: number;
  outbox_late?: number;
  outbox_oldest?: string | null;
  outbox_stuck?: number;
  outbox_hour?: Record<string, { sent: number; failed: number; retrying: number; error: string | null }>;
  db_connections?: number;
  db_max_connections?: number;
  db_long_queries?: number;
  db_longest_s?: number;
  db_idle_tx?: number;
  db_bytes?: number;
  no_rls?: string[];
  open_views?: string[];
  errors_recent?: number;
  errors_recent_hours?: number;
  errors_base_hourly?: number;
  errors_by_source?: Record<string, number>;
  errors_new_hour?: number;
  errors_open?: number;
  errors_regressed?: number;
  jobs?: Record<string, string>;
  marks?: Record<string, { at: string; value: Record<string, unknown> }>;
  settings?: { db_limit_gb?: number };
};

export type Setup = {
  production: boolean;    // the live site (Vercel production)
  testMode: boolean;
  siteUrl: string;
  stripe: "live" | "test" | "missing";
  stripeWebhook: boolean;
  email: boolean;
  sms: boolean;
  smsVerify: boolean;
  cronSecret: boolean;
  linkSecret: boolean;    // a separate LINK_SECRET (not falling back to CRON_SECRET)
};

export type Probe = { at: string; results: { path: string; status: number; ms: number; error?: string }[] } | null;

export type Clock = { day: string; hour: number; minute: number }; // Brisbane time now

const MIN = 60_000;
export const ago = (ms: number) => {
  if (ms < 90_000) return `${Math.max(0, Math.round(ms / 1000))} seconds`;
  if (ms < 90 * MIN) return `${Math.round(ms / MIN)} minutes`;
  if (ms < 36 * 60 * MIN) return `${Math.round(ms / (60 * MIN))} hours`;
  return `${Math.round(ms / (24 * 60 * MIN))} days`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;
const since = (iso: string | null | undefined, now: number) => (iso ? now - new Date(iso).getTime() : null);
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(bytes < 1024 ** 3 ? 2 : 1)} GB`;

/** Every check, in the order they're shown. */
export function evaluate(s: Snapshot, setup: Setup, probe: Probe, clock: Clock, opts: { dbMs?: number; now?: number } = {}): Check[] {
  const now = opts.now ?? (s.now ? new Date(s.now).getTime() : Date.now());
  const out: Check[] = [];
  const add = (c: Check) => out.push(c);

  // ---- The auction clock (closes auctions, charges winners, sends alerts; runs every minute)
  const proc = s.clock?.process;
  const procAge = since(proc?.started_at, now);
  const AREA_CLOCK = "Auction clock";
  if (procAge == null) {
    add({ key: "clock.running", area: AREA_CLOCK, status: setup.production ? "fail" : "warn", title: "The auction clock hasn't run yet",
      detail: "Nothing closes auctions, charges winners or sends alerts until it runs.",
      fix: setup.production ? "In Vercel, open the project → Settings → Cron Jobs and check /api/cron/process runs every minute, and that CRON_SECRET is set." : "On the live site Vercel runs it every minute. Here, press Run the clock now.",
      action: "run-clock" });
  } else if (procAge > 5 * MIN) {
    add({ key: "clock.running", area: AREA_CLOCK, status: "fail", title: `The auction clock has stopped (last ran ${ago(procAge)} ago)`,
      detail: "Auctions aren't closing, winners aren't being charged and alerts aren't going out.",
      fix: "Press Run the clock now to catch up. Then in Vercel check Settings → Cron Jobs is on for /api/cron/process and look at its logs.",
      action: "run-clock", value: Math.round(procAge / 1000) });
  } else if (procAge > 2.5 * MIN) {
    add({ key: "clock.running", area: AREA_CLOCK, status: "warn", title: `The auction clock is late (last ran ${ago(procAge)} ago)`, fix: "It normally catches up by itself. If this stays, press Run the clock now.", action: "run-clock", value: Math.round(procAge / 1000) });
  } else {
    add({ key: "clock.running", area: AREA_CLOCK, status: "ok", title: `The auction clock is running (last ran ${ago(procAge)} ago)`, value: Math.round(procAge / 1000) });
  }

  const unfinished = s.clock_unfinished || 0;
  const lastFailed = proc?.failed || [];
  if (unfinished >= 3) add({ key: "clock.finishing", area: AREA_CLOCK, status: "fail", title: `${plural(unfinished, "clock run")} in the last hour didn't finish`,
    detail: "They ran out of time or crashed part-way, so some work may be waiting.", fix: "Look at the errors below for the clock, or ask Claude. Vercel's logs for /api/cron/process show the reason." });
  else if (unfinished > 0 || lastFailed.length || (s.clock_failed_hour || 0) > 0) add({ key: "clock.finishing", area: AREA_CLOCK, status: "warn",
    title: lastFailed.length ? `Part of the last clock run failed: ${lastFailed.join(", ")}` : unfinished ? `${plural(unfinished, "clock run")} in the last hour didn't finish` : `${plural(s.clock_failed_hour || 0, "clock run")} in the last hour had a step fail`,
    detail: "The rest of the run carried on.", fix: "The error is listed under Errors (source: Clock). Ask Claude about it, or send it to Claude Code to fix." });
  else if ((s.clock_slow_ms || 0) > 200_000) add({ key: "clock.finishing", area: AREA_CLOCK, status: "warn", title: `Clock runs are slow (up to ${Math.round((s.clock_slow_ms || 0) / 1000)} seconds of 300)`,
    fix: "Usually a big backlog (many auctions closing or messages at once). If it stays slow, ask Claude to look.", value: s.clock_slow_ms || 0 });
  else add({ key: "clock.finishing", area: AREA_CLOCK, status: procAge == null ? "off" : "ok", title: procAge == null ? "No clock runs yet" : "Every clock run in the last hour finished" });

  const overdue = s.auctions_overdue || 0;
  const overdueFor = since(s.auctions_overdue_since, now);
  add(overdue > 0
    ? { key: "auctions.closing", area: AREA_CLOCK, status: "fail", title: `${plural(overdue, "auction")} past ${overdue === 1 ? "its" : "their"} end time ${overdue === 1 ? "hasn't" : "haven't"} closed`,
        detail: overdueFor ? `The oldest ended ${ago(overdueFor)} ago. Bidders are waiting for a result.` : undefined, fix: "Press Run the clock now. If they still don't close, ask Claude.", action: "run-clock", value: overdue }
    : { key: "auctions.closing", area: AREA_CLOCK, status: "ok", title: "Auctions are closing on time", value: 0 });
  const offers = s.offers_overdue || 0;
  add(offers > 0
    ? { key: "offers.closing", area: AREA_CLOCK, status: "warn", title: `${plural(offers, "vehicle")} still in offers after ${offers === 1 ? "its" : "their"} decision time`, fix: "Press Run the clock now.", action: "run-clock", value: offers }
    : { key: "offers.closing", area: AREA_CLOCK, status: "ok", title: "Offer periods are ending on time", value: 0 });

  const send = s.clock?.send;
  const sendAge = since(send?.started_at, now);
  add(sendAge == null
    ? { key: "clock.sender", area: AREA_CLOCK, status: setup.production ? "warn" : "off", title: "The message sender hasn't run yet", detail: "The clock also sends messages, so they still go out, just more slowly.",
        fix: setup.production ? "In Vercel → Settings → Cron Jobs, check /api/cron/send runs every minute." : undefined }
    : sendAge > 5 * MIN
      ? { key: "clock.sender", area: AREA_CLOCK, status: "warn", title: `The message sender stopped (last ran ${ago(sendAge)} ago)`, detail: "The clock also sends messages, so they still go out, just more slowly.", fix: "In Vercel → Settings → Cron Jobs, check /api/cron/send, and its logs." }
      : { key: "clock.sender", area: AREA_CLOCK, status: "ok", title: "The message sender is running" });

  // ---- Payments
  const AREA_PAY = "Payments";
  const waiting = s.charges_waiting || 0, stuck = s.charges_stuck || 0;
  if (waiting || stuck) add({ key: "payments.charging", area: AREA_PAY, status: "fail",
    title: waiting ? `${plural(waiting, "winner")} not charged yet (waiting over 10 minutes)` : `${plural(stuck, "charge")} stuck part-way for over 20 minutes`,
    detail: "Winners are normally charged within a minute of the auction closing.",
    fix: "Press Run the clock now. If it stays, check the Stripe key in Vercel and the errors below, or ask Claude.", action: "run-clock", value: waiting + stuck });
  else add({ key: "payments.charging", area: AREA_PAY, status: "ok", title: "Winners are being charged straight away", value: 0 });
  const inv = s.invoices_day || 0, declined = s.invoices_failed_day || 0;
  add(inv >= 5 && declined / inv > 0.3
    ? { key: "payments.declines", area: AREA_PAY, status: "warn", title: `${declined} of ${inv} charges in the last day were declined`,
        detail: "More than usual. It can be buyers' cards, but a lot at once can mean a Stripe setting.", fix: "Open Invoices to see the reasons, and check the Stripe dashboard → Payments.", value: declined / inv }
    : { key: "payments.declines", area: AREA_PAY, status: "ok", title: inv ? `${declined} of ${plural(inv, "charge")} declined in the last day` : "No charges in the last day", value: inv ? declined / inv : 0 });

  // ---- Messages (email, SMS, app notifications)
  const AREA_MSG = "Messages";
  const late = s.outbox_late || 0;
  const oldest = since(s.outbox_oldest, now);
  add(late > 0
    ? { key: "messages.queue", area: AREA_MSG, status: oldest != null && oldest > 30 * MIN ? "fail" : "warn",
        title: `${plural(late, "message")} waiting more than 10 minutes to send`, detail: oldest != null ? `The oldest has waited ${ago(oldest)}.` : undefined,
        fix: "Press Run the clock now to send them. If they keep waiting, check the email and SMS checks below.", action: "run-clock", value: late }
    : { key: "messages.queue", area: AREA_MSG, status: "ok", title: "Messages are going out on time", value: 0 });
  const names: Record<string, string> = { email: "Emails", sms: "Text messages", push: "App notifications" };
  for (const ch of ["email", "sms", "push"]) {
    const h = s.outbox_hour?.[ch];
    const bad = (h?.failed || 0) + (h?.retrying || 0);
    const total = bad + (h?.sent || 0);
    const label = names[ch];
    const provider = ch === "email" ? "Resend" : ch === "sms" ? "Twilio" : "Expo";
    if (bad >= 5 && bad / Math.max(1, total) > 0.2) add({ key: `messages.${ch}`, area: AREA_MSG, status: "fail", title: `${label} are failing (${bad} of ${total} in the last hour)`,
      detail: h?.error ? `The latest reason: ${scrub(h.error, 240)}` : undefined, fix: `Check your ${provider} account (and its key in Vercel). Then press Retry failed messages.`, action: (h?.failed || 0) > 0 ? "retry-messages" : undefined, value: bad / Math.max(1, total) });
    else if (bad > 0 && bad / Math.max(1, total) > 0.05) add({ key: `messages.${ch}`, area: AREA_MSG, status: "warn", title: `Some ${label.toLowerCase()} are failing (${bad} of ${total} in the last hour)`,
      detail: h?.error ? `The latest reason: ${scrub(h.error, 240)}` : undefined, fix: "A few failures are normal (a wrong address or number). Many at once means a problem with the provider.", action: (h?.failed || 0) > 0 ? "retry-messages" : undefined, value: bad / Math.max(1, total) });
    else add({ key: `messages.${ch}`, area: AREA_MSG, status: "ok", title: total ? `${label}: ${(h?.sent || 0).toLocaleString("en-AU")} sent in the last hour` : `${label}: none in the last hour`, value: total ? bad / total : 0 });
  }
  const stuckMsgs = s.outbox_stuck || 0;
  add(stuckMsgs
    ? { key: "messages.stuck", area: AREA_MSG, status: "fail", title: `${plural(stuckMsgs, "message")} stuck part-way through sending`, detail: "The sender stopped mid-send and hasn't run since.", fix: "Press Run the clock now.", action: "run-clock", value: stuckMsgs }
    : { key: "messages.stuck", area: AREA_MSG, status: "ok", title: "No messages stuck part-way through sending", value: 0 });

  // ---- Database
  const AREA_DB = "Database";
  const dbMs = opts.dbMs;
  if (dbMs != null) add(dbMs > 3000
    ? { key: "db.speed", area: AREA_DB, status: "fail", title: `The database is very slow (${(dbMs / 1000).toFixed(1)} s to answer)`, fix: "Check Supabase → Reports for load, and ask Claude to look at the slow queries.", value: dbMs }
    : dbMs > 1000
      ? { key: "db.speed", area: AREA_DB, status: "warn", title: `The database is slow (${(dbMs / 1000).toFixed(1)} s to answer)`, fix: "Usually a busy moment. If it stays, check Supabase → Reports.", value: dbMs }
      : { key: "db.speed", area: AREA_DB, status: "ok", title: `The database answers in ${Math.round(dbMs)} ms`, value: dbMs });
  const conns = s.db_connections || 0, maxConns = s.db_max_connections || 0;
  if (maxConns) {
    const r = conns / maxConns;
    add(r > 0.9
      ? { key: "db.connections", area: AREA_DB, status: "fail", title: `The database is almost out of connections (${conns} of ${maxConns})`, fix: "New visitors may see errors. Check Supabase → Reports; a bigger compute size raises the limit.", value: r }
      : r > 0.75
        ? { key: "db.connections", area: AREA_DB, status: "warn", title: `Database connections are getting full (${conns} of ${maxConns})`, fix: "Keep an eye on it during big auctions. Supabase → Reports shows who's connected.", value: r }
        : { key: "db.connections", area: AREA_DB, status: "ok", title: `Database connections: ${conns} of ${maxConns} in use`, value: r });
  }
  const longQ = s.db_long_queries || 0, idle = s.db_idle_tx || 0;
  add(longQ || idle
    ? { key: "db.queries", area: AREA_DB, status: "warn", title: longQ ? `${plural(longQ, "database query", "database queries")} running over 2 minutes` : `${plural(idle, "database connection")} left half-way through a change`,
        detail: longQ ? `The longest has run for ${ago((s.db_longest_s || 0) * 1000)}.` : "They hold locks other work may be waiting on.", fix: "Ask Claude to look. In Supabase → Database → Query performance you can see and stop them.", value: longQ + idle }
    : { key: "db.queries", area: AREA_DB, status: "ok", title: "No long-running database queries", value: 0 });
  const limit = (s.settings?.db_limit_gb || 8) * 1024 ** 3;
  if (s.db_bytes != null) {
    const r = s.db_bytes / limit;
    add(r > 0.9
      ? { key: "db.size", area: AREA_DB, status: "fail", title: `The database is nearly full (${gb(s.db_bytes)} of ${gb(limit)})`, fix: "Upgrade the disk in Supabase → Settings → Compute and disk, or change the limit here if your plan is bigger.", value: r }
      : r > 0.75
        ? { key: "db.size", area: AREA_DB, status: "warn", title: `The database is ${Math.round(r * 100)}% full (${gb(s.db_bytes)} of ${gb(limit)})`, fix: "Plan an upgrade in Supabase → Settings → Compute and disk.", value: r }
        : { key: "db.size", area: AREA_DB, status: "ok", title: `Database size ${gb(s.db_bytes)} of ${gb(limit)}`, value: r });
  }

  // ---- Security: tables or views anyone could read through the public API
  const AREA_SEC = "Security";
  const noRls = s.no_rls || [], views = s.open_views || [];
  add(noRls.length
    ? { key: "security.rls", area: AREA_SEC, status: "fail", title: `${plural(noRls.length, "table")} without row-level security: ${noRls.slice(0, 6).join(", ")}${noRls.length > 6 ? "…" : ""}`,
        detail: "Anyone with the public key could read or change them.", fix: "Send it to Claude Code: it adds a migration that turns row-level security on with the right rules." }
    : { key: "security.rls", area: AREA_SEC, status: "ok", title: "Every table has row-level security" });
  add(views.length
    ? { key: "security.views", area: AREA_SEC, status: "fail", title: `${plural(views.length, "database view")} readable by anyone: ${views.slice(0, 6).join(", ")}`,
        detail: "Views skip row-level security unless they're made with security_invoker.", fix: "Send it to Claude Code to make them security_invoker or move them out of the public schema." }
    : { key: "security.views", area: AREA_SEC, status: "ok", title: "No database views open to the public" });

  // ---- Errors
  const AREA_ERR = "Errors";
  const recent = s.errors_recent || 0, hours = s.errors_recent_hours || 1, base = s.errors_base_hourly || 0;
  const rate = recent / hours;
  const server = (s.errors_by_source?.server || 0) + (s.errors_by_source?.clock || 0);
  const spike = recent >= 20 && rate > 5 * Math.max(base, 1);
  add(spike && server >= 20
    ? { key: "errors.spike", area: AREA_ERR, status: "fail", title: `Errors jumped: ${plural(recent, "error")} in the last ${hours > 1.5 ? "2 hours" : "hour"}`, detail: `About ${Math.round(rate)} an hour, against ${Math.round(base)} an hour normally. Often a deploy that broke something.`,
        fix: "Look at the newest errors below and ask Claude. If a deploy caused it, roll back in Vercel → Deployments (… → Instant Rollback).", value: rate }
    : spike || (recent >= 10 && rate > 3 * Math.max(base, 1))
      ? { key: "errors.spike", area: AREA_ERR, status: "warn", title: `More errors than usual (${recent} recently, about ${Math.round(base)} an hour normally)`,
          detail: server ? undefined : "All from browsers or the app. Often one visitor's device, but look in case a page broke.", fix: "Look at the newest errors below.", value: rate }
      : { key: "errors.spike", area: AREA_ERR, status: "ok", title: recent ? `${plural(recent, "error")} recently (normal)` : "No errors recently", value: rate });
  add(server >= 25
    ? { key: "errors.server", area: AREA_ERR, status: "fail", title: `${plural(server, "server error")} recently`, detail: "People are seeing \"Something went wrong\" pages or failed actions.", fix: "Open the errors below (source: Server or Clock) and ask Claude, or send one to Claude Code.", value: server }
    : server > 0
      ? { key: "errors.server", area: AREA_ERR, status: "warn", title: `${plural(server, "server error")} recently`, fix: "Open the errors below (source: Server or Clock).", value: server }
      : { key: "errors.server", area: AREA_ERR, status: "ok", title: "No server errors recently", value: 0 });
  const fresh = s.errors_new_hour || 0, back = s.errors_regressed || 0;
  add(fresh || back
    ? { key: "errors.new", area: AREA_ERR, status: "warn", title: [fresh ? `${plural(fresh, "new kind")} of error in the last hour` : "", back ? `${plural(back, "error")} came back after being fixed` : ""].filter(Boolean).join("; "),
        fix: "They're at the top of the errors list.", value: fresh + back }
    : { key: "errors.new", area: AREA_ERR, status: "ok", title: "No new kinds of error in the last hour", value: 0 });

  // ---- The website, tested from the outside every 5 minutes
  const AREA_WEB = "Website";
  if (probe?.results?.length) {
    const bad = probe.results.filter((r) => r.error || r.status >= 500 || r.status === 0);
    const slow = probe.results.filter((r) => !r.error && r.status < 500 && r.ms > 4000);
    const age = since(probe.at, now) || 0;
    add(bad.length
      ? { key: "website.up", area: AREA_WEB, status: "fail", title: `${bad.map((r) => r.path).join(" and ")} didn't load (${bad.map((r) => r.error || `error ${r.status}`).join(", ")})`,
          detail: `Tested ${ago(age)} ago.`, fix: "Check Vercel → Deployments for a failed or bad deploy (roll back if so) and the errors below." }
      : slow.length
        ? { key: "website.up", area: AREA_WEB, status: "warn", title: `Pages are slow: ${slow.map((r) => `${r.path} ${(r.ms / 1000).toFixed(1)} s`).join(", ")}`, detail: `Tested ${ago(age)} ago.`, fix: "Usually the database or a slow outside service. Check the database checks above." }
        : { key: "website.up", area: AREA_WEB, status: "ok", title: `The site loads (${probe.results.map((r) => `${r.path} ${Math.round(r.ms)} ms`).join(", ")})`, detail: `Tested ${ago(age)} ago.` });
  }

  // ---- Setup (the live site only)
  const AREA_SET = "Setup";
  if (!setup.production) {
    add({ key: "setup.mode", area: AREA_SET, status: "off", title: "Setup is checked on the live site only", detail: setup.testMode ? "This copy is in test mode (no real payments, SMS or ID checks)." : undefined });
  } else {
    const mode: string[] = [];
    if (setup.testMode) mode.push("Test mode is on: payments, SMS codes and ID checks are fake (NEXT_PUBLIC_TEST_MODE)");
    if (setup.stripe === "test") mode.push("Stripe has a test key: real cards won't be charged (STRIPE_SECRET_KEY starts sk_test)");
    if (/localhost|127\.0\.0\.1/.test(setup.siteUrl)) mode.push("The site address is set to this computer, so links in emails won't work (NEXT_PUBLIC_SITE_URL)");
    add(mode.length
      ? { key: "setup.mode", area: AREA_SET, status: "fail", title: mode[0].split(":")[0], detail: mode.join(". ") + ".", fix: "Change it in Vercel → Settings → Environment Variables, then redeploy." }
      : { key: "setup.mode", area: AREA_SET, status: "ok", title: "Live mode, with live payments" });
    const missing: string[] = [];
    if (setup.stripe === "missing") missing.push("Stripe (STRIPE_SECRET_KEY): no card payments");
    if (setup.stripe !== "missing" && !setup.stripeWebhook) missing.push("Stripe webhook (STRIPE_WEBHOOK_SECRET): ID checks and some payments won't update");
    if (!setup.email) missing.push("Resend (RESEND_API_KEY): no emails");
    if (!setup.smsVerify) missing.push("Twilio Verify (TWILIO_VERIFY_SERVICE_SID): members can't verify their mobile");
    if (!setup.sms) missing.push("Twilio SMS (TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID): no text alerts");
    if (!setup.cronSecret) missing.push("CRON_SECRET: the clock can't run");
    add(missing.length
      ? { key: "setup.keys", area: AREA_SET, status: "fail", title: `${plural(missing.length, "service")} not connected`, detail: missing.join(". ") + ".", fix: "Add the keys in Vercel → Settings → Environment Variables, then redeploy." }
      : { key: "setup.keys", area: AREA_SET, status: "ok", title: "Payments, email and SMS are all connected" });
    const good = s.marks?.stripe_webhook?.at, bad = s.marks?.stripe_webhook_bad?.at;
    const badAge = since(bad, now);
    const rejected = badAge != null && badAge < 24 * 60 * MIN && (!good || new Date(good).getTime() < now - 24 * 60 * MIN);
    if (setup.stripe !== "missing" && setup.stripeWebhook) add(rejected
      ? { key: "setup.stripe_webhook", area: AREA_SET, status: "warn", title: "Stripe's messages are being turned away",
          detail: `The last one was ${ago(badAge || 0)} ago and none has been accepted in the last day, so ID checks and some payments won't update.`,
          fix: "In Stripe → Developers → Webhooks, open the endpoint for /api/stripe/webhook, reveal its signing secret and put it in Vercel as STRIPE_WEBHOOK_SECRET, then redeploy." }
      : { key: "setup.stripe_webhook", area: AREA_SET, status: "ok", title: good ? `Stripe's messages arrive (last ${ago(now - new Date(good).getTime())} ago)` : "No Stripe messages turned away" });
    add(!setup.linkSecret
      ? { key: "setup.secrets", area: AREA_SET, status: "warn", title: "Email links are signed with the clock's secret", fix: "Add a separate LINK_SECRET (any long random text) in Vercel. Existing unsubscribe links will stop working, so do it before launch." }
      : { key: "setup.secrets", area: AREA_SET, status: "ok", title: "Email links have their own secret" });
  }

  // ---- Nightly jobs (each one is due at a Brisbane time and records the day it ran)
  const AREA_JOBS = "Background jobs";
  const JOBS: [string, string, number, number][] = [["metrics_backfill", "Overnight numbers", 0, 20], ["seo_audit", "SEO audit", 3, 10], ["insights", "Morning insights", 6, 30]];
  const lateJobs = JOBS.filter(([k, , h, m]) => (s.jobs?.[k] || "") !== clock.day && clock.hour * 60 + clock.minute >= (h + 2) * 60 + m);
  add(lateJobs.length
    ? { key: "jobs.daily", area: AREA_JOBS, status: "warn", title: `${lateJobs.map(([, n]) => n).join(", ")} didn't run today`,
        detail: "They run from the clock after their time each night; if the clock is fine, one of them is failing.", fix: "Look for clock errors below, or press the job's button on Insights or SEO." }
    : { key: "jobs.daily", area: AREA_JOBS, status: "ok", title: "Last night's jobs all ran" });

  return out;
}

export const RANK: Record<Status, number> = { fail: 0, warn: 1, ok: 2, off: 3 };

/** One line for the top of the page. */
export function overall(checks: { status: Status }[]): { status: Status; title: string } {
  const fail = checks.filter((c) => c.status === "fail").length, warn = checks.filter((c) => c.status === "warn").length;
  if (fail) return { status: "fail", title: `${plural(fail, "problem")} ${fail === 1 ? "needs" : "need"} you now` };
  if (warn) return { status: "warn", title: `Running, with ${plural(warn, "thing")} to keep an eye on` };
  return { status: "ok", title: "Everything's running normally" };
}

/** What admins are told when a check breaks or recovers (null: no alert). Only failures alert; warnings wait for the page. */
export function alertFor(change: { key: string; from: Status | null; to: Status; title: string; detail?: string | null; alerted?: boolean }, siteUrl: string):
  { title: string; body: string; urgent: boolean } | null {
  if (change.to === "fail") return { title: `Tyrebiter problem: ${change.title}`, body: `${change.title}.${change.detail ? ` ${change.detail}` : ""}\n\nOpen Site health to see what to do, or ask Claude about it: ${siteUrl}/admin/health`, urgent: true };
  if (change.from === "fail" && change.alerted && (change.to === "ok" || change.to === "warn")) return { title: `Fixed: ${change.title}`, body: `This is back to normal: ${change.title}.\n\n${siteUrl}/admin/health`, urgent: false };
  return null;
}
