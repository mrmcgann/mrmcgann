import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runHealth, QUICK_FIXES } from "@/lib/health";
import { ago, overall, RANK, type QuickFix, type Status } from "@/lib/healthChecks";
import { claudeConfigured } from "@/lib/claude";
import { githubConfigured, repo, repoIsPublic } from "@/lib/github";
import { SOURCE_LABELS, type ErrorSource } from "@/lib/errorTrack";
import { TrendChart } from "@/components/admin/Charts";
import { AskClaudeButton, FixCard, HealthButton, HealthChat, HealthToast, HealthSettings, type Fix } from "@/components/admin/Health";
import { env } from "@/lib/env";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AREAS = ["Auction clock", "Payments", "Messages", "Database", "Website", "Errors", "Security", "Background jobs", "Setup"];
const PILL: Record<Status, [string, string]> = { fail: ["act", "Broken"], warn: ["watch", "Keep an eye on"], ok: ["good", "OK"], off: ["off", "Off"] };
type CheckRow = { key: string; area: string; status: Status; title: string; detail: string | null; fix: string | null; action: QuickFix | null; value: number | null; since: string; checked_at: string };
type ErrRow = { id: number; source: ErrorSource; name: string | null; message: string; route: string | null; path: string | null; count: number; first_seen: string; last_seen: string; status: string; regressed: boolean };
type Run = { started_at: string; ms: number | null; ok: boolean };

const agoText = (iso: string) => `${ago(Date.now() - new Date(iso).getTime())} ago`;
const hourKey = (d: Date) => {
  const b = new Date(d.toLocaleString("en-US", { timeZone: "Australia/Brisbane" }));
  return `${b.toLocaleDateString("en-CA")}T${String(b.getHours()).padStart(2, "0")}`;
};

// Admin → Site health: is everything running, what's broken, the errors people hit, and Claude to explain
// and fix them. The checks run every minute from the clock; this page runs them too if they're out of date.
export default async function Health({ searchParams }: { searchParams: Promise<{ errors?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const db = supabaseAdmin();
  const { data: latest } = await db.from("health_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle();
  if (!latest || Date.now() - new Date(latest.checked_at).getTime() > 90_000) await runHealth({ db, skipProbe: !!latest }).catch(() => null);

  const tab = ["open", "fixed", "ignored"].includes(sp.errors || "") ? (sp.errors as string) : "open";
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const [{ data: checks }, { data: events }, { data: errors }, open, fixed, ignored, { data: hours }, { data: runs }, { data: fixes }, { data: cfg }] = await Promise.all([
    db.from("health_checks").select("key, area, status, title, detail, fix, action, value, since, checked_at"),
    db.from("health_events").select("id, at, key, area, from_status, to_status, title").order("at", { ascending: false }).limit(40),
    db.from("app_errors").select("id, source, name, message, route, path, count, first_seen, last_seen, status, regressed").eq("status", tab).order("last_seen", { ascending: false }).limit(100),
    db.from("app_errors").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("app_errors").select("id", { count: "exact", head: true }).eq("status", "fixed"),
    db.from("app_errors").select("id", { count: "exact", head: true }).eq("status", "ignored"),
    db.rpc("error_hours", { p_hours: 48 }),
    db.from("clock_runs").select("started_at, ms, ok").eq("job", "process").gte("started_at", hourAgo).order("started_at", { ascending: true }).limit(400),
    db.from("fix_requests").select("id, title, status, issue_number, issue_url, branch, pr_number, pr_url, last_update, last_update_at, created_at, updated_at, error_id").order("created_at", { ascending: false }).limit(15),
    db.from("settings").select("value").eq("key", "health").maybeSingle(),
  ]);

  const list = ((checks || []) as CheckRow[]).sort((a, b) => RANK[a.status] - RANK[b.status] || a.key.localeCompare(b.key));
  const head = overall(list);
  const lastChecked = list.reduce((m, c) => (c.checked_at > m ? c.checked_at : m), "");
  const byKey = new Map(list.map((c) => [c.key, c]));
  const claudeReady = claudeConfigured(), githubReady = githubConfigured();
  const publicRepo = githubReady ? await repoIsPublic().catch(() => null) : null;

  // errors per hour, last 48 hours (Brisbane)
  const h = new Map(Object.entries((hours || {}) as Record<string, number>));
  const pts = Array.from({ length: 48 }, (_, i) => hourKey(new Date(Date.now() - (47 - i) * 3600_000))).map((k) => ({ day: k, value: Number(h.get(k) || 0) }));
  const last24 = pts.slice(24).reduce((a, p) => a + p.value, 0);

  // the clock, minute by minute (most recent on the right)
  const r = (runs || []) as Run[];
  const ever = r.length > 0 || byKey.get("clock.running")?.status === "ok";
  const beat = Array.from({ length: 60 }, (_, i) => {
    const from = Date.now() - (60 - i) * 60_000, to = from + 60_000;
    const inMin = r.filter((x) => { const t = new Date(x.started_at).getTime(); return t >= from && t < to; });
    if (!inMin.length) return ever ? "miss" : "none";
    return inMin.every((x) => x.ok && x.ms != null) ? "ok" : inMin.some((x) => x.ms == null && Date.now() - new Date(x.started_at).getTime() < 6 * 60_000) ? "ok" : "part";
  });

  const fixList = (fixes || []) as Fix[];
  const openFixes = fixList.filter((f) => !["merged", "closed"].includes(f.status)).length;
  const val = (k: string) => byKey.get(k)?.value;
  const clockSecs = val("clock.running");
  const settings = (cfg?.value || {}) as { alerts?: boolean; sms?: boolean; db_limit_gb?: number };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="d2">Site health.</h1>
          <p className="muted" style={{ margin: 0 }}>Checked every minute. When something breaks, admins get an email, a text and an app alert, and again when it&apos;s fixed.</p>
        </div>
        <div className="pill-row">
          <HealthButton action="run" label="Run checks now" tone="soft" testId="health-run" />
          <AskClaudeButton label="Ask Claude" tone="blue" />
        </div>
      </div>

      <div className={`hbanner ${head.status === "off" ? "ok" : head.status}`} data-testid="health-banner" role="status">
        <span className="dot" aria-hidden="true" />
        <b>{head.title}</b>
        <span className="muted" style={{ fontSize: 14 }}>{lastChecked ? `Last checked ${agoText(lastChecked)}` : "Not checked yet"}</span>
        {head.status === "fail" && <span style={{ marginLeft: "auto" }}><AskClaudeButton label="What's wrong?" tone="dark" question="What's broken right now, who does it affect, and what should I do first?" /></span>}
      </div>

      <div className="kpis">
        <div className="kpi"><span className="l">Auction clock</span><span className="v" style={{ fontSize: 22 }}>{clockSecs != null ? `${ago(Number(clockSecs) * 1000)} ago` : "Not running"}</span></div>
        <div className="kpi" data-testid="kpi-errors"><span className="l">Errors in the last 24 hours</span><span className="v">{last24.toLocaleString("en-AU")}</span></div>
        <div className="kpi"><span className="l">Open errors</span><span className="v">{(open.count || 0).toLocaleString("en-AU")}</span></div>
        <div className="kpi"><span className="l">Messages waiting</span><span className="v">{Number(val("messages.queue") || 0).toLocaleString("en-AU")}</span></div>
        <div className="kpi"><span className="l">Database answers in</span><span className="v" style={{ fontSize: 22 }}>{val("db.speed") != null ? `${Math.round(Number(val("db.speed")))} ms` : "–"}</span></div>
        <div className="kpi"><span className="l">Claude Code fixes in progress</span><span className="v">{openFixes}</span></div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="heartbeat">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <b style={{ fontSize: 15 }}>The clock, minute by minute (last hour)</b>
          <div className="beat-legend"><span style={{ ["--c" as string]: "#0ca30c" }}>Ran</span><span style={{ ["--c" as string]: "#fab219" }}>Part failed</span><span style={{ ["--c" as string]: "#d03b3b" }}>Didn&apos;t run</span></div>
        </div>
        <div className="beat" role="img" aria-label={`Clock runs in the last hour: ${beat.filter((b) => b === "ok").length} ran, ${beat.filter((b) => b === "part").length} part failed, ${beat.filter((b) => b === "miss").length} missed`}>
          {beat.map((b, i) => <i key={i} className={b} title={`${60 - i} minute${60 - i === 1 ? "" : "s"} ago: ${b === "ok" ? "ran" : b === "part" ? "part of it failed" : b === "miss" ? "didn't run" : "no runs yet"}`} />)}
        </div>
        {!ever && <span className="hint">No clock runs yet. On the live site Vercel starts it every minute.</span>}
      </div>

      <div className="admin-card" data-testid="health-checks">
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Checks</h2>
        {list.length === 0 && <p className="muted" style={{ margin: 0 }}>No results yet. Press Run checks now.</p>}
        {AREAS.concat([...new Set(list.map((c) => c.area))].filter((a) => !AREAS.includes(a))).map((area) => {
          const rows = list.filter((c) => c.area === area);
          if (!rows.length) return null;
          return (
            <div className="harea" key={area}>
              <h3>{area}</h3>
              {rows.map((c) => {
                const bad = c.status === "fail" || c.status === "warn";
                return (
                  <div className={`hrow${bad ? "" : " quiet"}`} key={c.key} data-testid={`check-${c.key}`}>
                    <span className={`sev ${PILL[c.status][0]}`}><i aria-hidden="true" />{PILL[c.status][1]}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <span className="t">{c.title}</span>
                      {bad && c.detail && <span style={{ fontSize: 14 }}>{c.detail}</span>}
                      {!bad && c.detail && <span className="muted" style={{ fontSize: 13 }}>{c.detail}</span>}
                      {bad && c.fix && <span className="muted" style={{ fontSize: 14 }}><b>What to do:</b> {c.fix}</span>}
                      {bad && <span className="muted" style={{ fontSize: 12 }}>Since {dateTime(c.since)}</span>}
                    </div>
                    {bad ? (
                      <div className="pill-row" style={{ justifyContent: "flex-end" }}>
                        {c.action && QUICK_FIXES[c.action] && <HealthButton action="quick-fix" payload={{ fix: c.action }} label={QUICK_FIXES[c.action].label} tone="blue" confirmText={`${QUICK_FIXES[c.action].does} Go ahead?`} />}
                        <AskClaudeButton checkKey={c.key} question={`About the check "${c.title}": what's going on, how serious is it, and what should I do?`} />
                      </div>
                    ) : <span />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="health-errors">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Errors</h2>
          <nav className="htabs" aria-label="Errors">
            <Link className={tab === "open" ? "on" : ""} href="/admin/health">Open ({open.count || 0})</Link>
            <Link className={tab === "fixed" ? "on" : ""} href="/admin/health?errors=fixed">Fixed ({fixed.count || 0})</Link>
            <Link className={tab === "ignored" ? "on" : ""} href="/admin/health?errors=ignored">Ignored ({ignored.count || 0})</Link>
          </nav>
        </div>
        <TrendChart title="Errors per hour (last 48 hours)" points={pts} fmt="count" unit="hours" testId="chart-errors" />
        <p className="hint" style={{ margin: 0 }}>From visitors&apos; browsers, the server, the phone app and the clock. The same error is grouped and counted. Personal details (emails, phone and card numbers, links with codes in them) are removed before anything is kept.</p>
        <div>
          {((errors || []) as ErrRow[]).length === 0 && <p className="muted" style={{ margin: 0 }}>{tab === "open" ? "No open errors." : `No ${tab} errors.`}</p>}
          {((errors || []) as ErrRow[]).map((e) => {
            const fresh = Date.now() - new Date(e.first_seen).getTime() < 86400000;
            return (
              <div className="hrow" key={e.id} data-testid="error-row">
                <span className="hsrc">{SOURCE_LABELS[e.source] || e.source}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <Link href={`/admin/health/errors/${e.id}`} className="hmsg">{e.name && e.name !== "Error" ? `${e.name}: ` : ""}{e.message}</Link>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {e.route || e.path || "unknown place"} · {e.count.toLocaleString("en-AU")} time{e.count === 1 ? "" : "s"} · last {agoText(e.last_seen)} · first {agoText(e.first_seen)}
                    {fresh && <span className="hbadge">New</span>}{e.regressed && e.status === "open" && <span className="hbadge back">Came back</span>}
                  </span>
                </div>
                <div className="pill-row" style={{ justifyContent: "flex-end" }}>
                  <Link className="btn btn-soft" style={{ height: 38, fontSize: 13, padding: "0 14px" }} href={`/admin/health/errors/${e.id}`}>Details</Link>
                  {e.status === "open" && <AskClaudeButton errorId={e.id} question={`Why is error #${e.id} happening, how many people does it affect, and how do I fix it?`} />}
                  {e.status === "open" ? <HealthButton action="error-status" payload={{ id: e.id, status: "fixed" }} label="Mark fixed" /> : <HealthButton action="error-status" payload={{ id: e.id, status: "open" }} label="Reopen" />}
                  {e.status === "open" && <HealthButton action="error-status" payload={{ id: e.id, status: "ignored" }} label="Ignore" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="health-fixes">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Claude Code fixes</h2>
        <p className="muted" style={{ margin: 0 }}>Problems you&apos;ve sent to Claude Code. It works on a copy of the code and sends back a change, and the tests run on it by themselves. Nothing goes live until you press Put it live.</p>
        {fixList.length === 0 ? <p className="muted" style={{ margin: "8px 0 0" }}>Nothing sent yet. Open an error and press Send to Claude Code, or ask Claude to draft one.</p>
          : <div style={{ marginTop: 6 }}>{fixList.map((f) => <FixCard key={f.id} initial={f} githubReady={githubReady} />)}</div>}
      </div>

      <div className="admin-card" style={{ overflowX: "auto" }} data-testid="health-log">
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>What changed</h2>
        <table className="table"><thead><tr><th>When</th><th>Check</th><th>Change</th></tr></thead>
          <tbody>{(events || []).length ? (events as { id: number; at: string; area: string; from_status: Status | null; to_status: Status; title: string }[]).map((e) => (
            <tr key={e.id}><td style={{ whiteSpace: "nowrap" }}>{dateTime(e.at)}</td><td>{e.area}: {e.title}</td>
              <td style={{ whiteSpace: "nowrap" }}>{e.from_status ? PILL[e.from_status][1] : "New"} → <b>{PILL[e.to_status][1]}</b></td></tr>
          )) : <tr><td colSpan={3} className="muted">Nothing yet. Every time a check changes, it&apos;s listed here.</td></tr>}</tbody></table>
      </div>

      <div className="dash2">
        <div className="admin-card setup" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="health-setup">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Set up Claude</h2>
          <span><b>Ask Claude:</b> {claudeReady ? "connected." : "add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables (a key from console.anthropic.com), then redeploy."}</span>
          <span><b>Claude Code:</b> {githubReady ? `connected to ${repo()}.` : "not connected yet. Six steps, about 15 minutes:"}</span>
          {publicRepo && <p className="errmsg" style={{ margin: 0, fontSize: 14 }} data-testid="public-repo">Your repository is public: anyone can read your code and the problems you send to Claude Code (error messages are left out while it&apos;s public). Make it private in GitHub → the repository → Settings → General → Danger Zone → Change visibility.</p>}
          <details open={!githubReady}>
            <summary className="blue" style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>{githubReady ? "How it's set up" : "Show the steps"}</summary>
            <ol style={{ marginTop: 10 }}>
              <li>Install the Claude app on your GitHub repository: <a className="blue" href="https://github.com/apps/claude" target="_blank" rel="noreferrer">github.com/apps/claude</a>.</li>
              <li>In the repository, open Settings → Secrets and variables → Actions and add <code>ANTHROPIC_API_KEY</code> (or <code>CLAUDE_CODE_OAUTH_TOKEN</code> if you have a Claude Pro or Max plan: run <code>claude setup-token</code> to get one).</li>
              <li>The two workflows are already in the code: <code>.github/workflows/claude.yml</code> (Claude Code, which can read and write code but can&apos;t run commands) and <code>ci.yml</code> (the tests every change must pass before it can go live).</li>
              <li>Make a fine-grained token at <a className="blue" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">github.com/settings/personal-access-tokens/new</a>: only this repository; Contents, Issues and Pull requests: Read and write; Checks, Commit statuses and Deployments: Read.</li>
              <li>In Vercel add <code>GITHUB_TOKEN</code> (the token) and <code>GITHUB_REPO</code> (for example <code>mrmcgann/mrmcgann</code>), then redeploy.</li>
              <li>Protect the main branch: the repository → Settings → Rules → Rulesets → New branch ruleset for <code>main</code>, with &ldquo;Require a pull request before merging&rdquo; and &ldquo;Require status checks to pass&rdquo; (add <code>test</code>). Then nothing reaches the live site without passing the tests and going through this page or GitHub.</li>
            </ol>
          </details>
          <p className="hint" style={{ margin: 0 }}>Claude only looks: it reads the checks, errors and code, and suggests. Fixes and changes happen when you press the button. Claude Code can&apos;t change the live site; you put its change live after the tests pass.</p>
        </div>
        <div className="admin-card setup" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Alerts</h2>
          <HealthSettings value={settings} />
          <p className="hint" style={{ margin: 0 }}>If the whole site goes down it can&apos;t tell you itself. Add a free outside monitor (UptimeRobot or Better Stack) that checks <code>{env.siteUrl}/api/health</code> every few minutes: it answers OK when everything&apos;s fine, and an error when something&apos;s broken or the clock has stopped. Set <code>HEALTH_ALERT_EMAIL</code> in Vercel too, for an email even when the database is down.</p>
        </div>
      </div>

      <HealthChat claudeReady={claudeReady} githubReady={githubReady} />
      <HealthToast />
    </>
  );
}
