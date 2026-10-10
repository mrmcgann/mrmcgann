import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env, has } from "@/lib/env";
import { kickOutbox } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { alertFor, evaluate, type Check, type Clock, type Probe, type QuickFix, type Setup, type Snapshot, type Status } from "@/lib/healthChecks";

// Runs the site health checks (every minute from the clock, and from the message sender when the clock has
// stopped), saves them, logs every change and tells admins when something breaks or recovers. The rules
// themselves are in healthChecks.ts.

type Db = ReturnType<typeof supabaseAdmin>;

export function setupNow(): Setup {
  const sk = process.env.STRIPE_SECRET_KEY || "";
  return {
    production: process.env.VERCEL_ENV === "production",
    testMode: env.testMode,
    siteUrl: env.siteUrl,
    stripe: !sk ? "missing" : /^(sk|rk)_test/.test(sk) ? "test" : "live",
    stripeWebhook: Boolean(env.stripeWebhookSecret),
    email: has.email,
    sms: has.twilioSms,
    smsVerify: has.twilioVerify,
    cronSecret: Boolean(env.cronSecret),
    linkSecret: Boolean(process.env.LINK_SECRET),
  };
}

export function brisbaneClock(now = new Date()): Clock {
  const b = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Brisbane" }));
  return { day: b.toLocaleDateString("en-CA"), hour: b.getHours(), minute: b.getMinutes() };
}

/** Loads the home page and the app's home feed the way a visitor would, and keeps the result. */
export async function probeSite(db: Db = supabaseAdmin()): Promise<Probe> {
  const results = await Promise.all(["/", "/api/home"].map(async (path) => {
    const t = Date.now();
    try {
      const r = await fetch(`${env.siteUrl}${path}`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "TyrebiterHealthCheck/1.0" } });
      await r.arrayBuffer().catch(() => null);
      return { path, status: r.status, ms: Date.now() - t };
    } catch (e) {
      return { path, status: 0, ms: Date.now() - t, error: (e as Error)?.name === "TimeoutError" ? "no answer in 10 seconds" : "couldn't connect" };
    }
  }));
  const probe = { at: new Date().toISOString(), results };
  await db.from("health_marks").upsert({ key: "probe", at: probe.at, value: probe });
  return probe;
}

let lastDirect = 0;
/** When the database itself can't be reached nothing can be queued, so one email goes straight out (if set up). */
async function directAlert(reason: string) {
  const to = process.env.HEALTH_ALERT_EMAIL;
  if (!to || Date.now() - lastDirect < 30 * 60_000) return;
  lastDirect = Date.now();
  await sendEmail({ to, subject: "Tyrebiter problem: the database isn't answering",
    text: `The site's health check couldn't reach the database: ${reason}\n\nCheck status.supabase.com and your Supabase project. Site health: ${env.siteUrl}/admin/health`,
    html: `<p>The site's health check couldn't reach the database: ${reason.replace(/[<>&]/g, "")}</p><p>Check status.supabase.com and your Supabase project. <a href="${env.siteUrl}/admin/health">Site health</a></p>` }).catch(() => null);
}

export type HealthRun = { checks: Check[]; changes: { key: string; from: Status | null; to: Status; title: string }[]; alerts: number; dbMs: number; snapshot: Snapshot };

export async function runHealth(opts: { probe?: boolean; skipProbe?: boolean; db?: Db } = {}): Promise<HealthRun> {
  const db = opts.db || supabaseAdmin();
  // how fast the database answers a tiny question (the snapshot itself does real work, so it isn't the measure)
  const t = Date.now();
  const ping = await db.from("settings").select("key").limit(1);
  const dbMs = Date.now() - t;
  const { data, error } = ping.error ? { data: null, error: ping.error } : await db.rpc("health_snapshot");
  if (error || !data) {
    await directAlert(error?.message || "no answer");
    throw new Error(`The database didn't answer the health check: ${error?.message || "no data"}`);
  }
  const snap = data as Snapshot;
  let probe = (snap.marks?.probe?.value as unknown as Probe) || null;
  if (!opts.skipProbe && (opts.probe || !probe || Date.now() - new Date(probe.at).getTime() > 4.5 * 60_000)) probe = await probeSite(db).catch(() => probe);
  const checks = evaluate(snap, setupNow(), probe, brisbaneClock(), { dbMs });
  const { data: changed, error: saveError } = await db.rpc("save_health", { p_checks: checks });
  if (saveError) throw new Error(`Couldn't save the health checks: ${saveError.message}`);
  const changes = (changed || []) as { key: string; from: Status | null; to: Status; title: string; detail: string | null; alerted: boolean }[];
  let alerts = 0;
  const bucket = Math.floor(Date.now() / 1_800_000); // one alert per check per half hour, however much it flips
  for (const c of changes) {
    const a = alertFor(c, env.siteUrl);
    if (!a) continue;
    const { data: n } = await db.rpc("queue_health_alert", { p_title: a.title.slice(0, 160), p_body: a.body, p_link: "/admin/health",
      p_dedupe: `health:${c.key}:${c.to}:${bucket}`, p_urgent: a.urgent });
    alerts += Number(n || 0);
    await db.from("health_checks").update({ alerted_at: c.to === "fail" ? new Date().toISOString() : null }).eq("key", c.key);
  }
  if (alerts) kickOutbox();
  return { checks, changes, alerts, dbMs, snapshot: snap };
}

// The clock's heartbeat: a row when a run starts, finished when it ends (a row left unfinished means it crashed
// or ran out of time).
export async function beginRun(job: "process" | "send", db: Db = supabaseAdmin()): Promise<number | null> {
  const { data } = await db.from("clock_runs").insert({ job }).select("id").single();
  return (data?.id as number) ?? null;
}
export async function endRun(id: number | null, r: { ms: number; failed: string[]; stats: Record<string, unknown> }, db: Db = supabaseAdmin()) {
  if (id == null) return;
  await db.from("clock_runs").update({ ms: Math.round(r.ms), ok: r.failed.length === 0, failed: r.failed.slice(0, 20), stats: r.stats }).eq("id", id);
}

/** Records the failures so far on a run that's still going (so this minute's checks already see them). */
export async function markRun(id: number | null, failed: string[], db: Db = supabaseAdmin()) {
  if (id == null || !failed.length) return;
  await db.from("clock_runs").update({ ok: false, failed: failed.slice(0, 20) }).eq("id", id);
}

/** How long since the checks last ran (the message sender runs them itself if the clock stops doing it). */
export async function checksAge(db: Db = supabaseAdmin()): Promise<number | null> {
  const { data } = await db.from("health_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle();
  return data?.checked_at ? Date.now() - new Date(data.checked_at).getTime() : null;
}

const marked = new Map<string, number>();
/** Leaves a marker for the checks (at most once a minute per server, so a busy webhook doesn't hammer one row). */
export async function mark(key: string, value: Record<string, unknown> = {}) {
  if (Date.now() - (marked.get(key) || 0) < 60_000) return;
  marked.set(key, Date.now());
  await supabaseAdmin().from("health_marks").upsert({ key, at: new Date().toISOString(), value }).then(() => null, () => null);
}

export const QUICK_FIXES: Record<QuickFix, { label: string; does: string }> = {
  "run-clock": { label: "Run the clock now", does: "Closes auctions that are due, ends offer periods, charges winners and sends waiting messages." },
  "retry-messages": { label: "Retry failed messages", does: "Sends again the emails, texts and app notifications that gave up in the last 24 hours." },
};

/** The safe, one-press fixes offered next to a check (a person presses them; Claude can only suggest them). */
export async function quickFix(kind: QuickFix): Promise<string> {
  const db = supabaseAdmin();
  if (kind === "run-clock") {
    const { processCharges } = await import("@/lib/charges");
    const { drainOutbox } = await import("@/lib/outbox");
    let closed = 0;
    for (let n = 1, i = 0; n > 0 && i < 10; i++) {
      const r = await db.rpc("close_due_lots", { p_limit: 500 });
      if (r.error) throw new Error(`Closing auctions failed: ${r.error.message}`);
      n = Number(r.data || 0); closed += n;
    }
    const charged = await processCharges(20_000);
    for (let n = 1, i = 0; n > 0 && i < 10; i++) n = Number((await db.rpc("queue_status_notices", { p_limit: 200 })).data || 0);
    const out = await drainOutbox({ max: 2000, deadlineMs: 35_000 });
    await runHealth({ db }).catch(() => null);
    return `Done. Closed ${closed} auction${closed === 1 ? "" : "s"}, charged ${charged} winner${charged === 1 ? "" : "s"} and sent ${out.sent} message${out.sent === 1 ? "" : "s"}${out.failed ? ` (${out.failed} failed)` : ""}.`;
  }
  if (kind === "retry-messages") {
    const { data, error } = await db.rpc("retry_failed_messages", { p_hours: 24 });
    if (error) throw new Error(error.message);
    kickOutbox();
    const n = Number(data || 0);
    return n ? `${n} message${n === 1 ? "" : "s"} put back in the queue. They go out within a minute.` : "There were no failed messages to retry.";
  }
  throw new Error("Unknown fix");
}
