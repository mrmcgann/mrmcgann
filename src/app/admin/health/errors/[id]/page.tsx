import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ago } from "@/lib/healthChecks";
import { SOURCE_LABELS, type ErrorSource } from "@/lib/errorTrack";
import { claudeConfigured } from "@/lib/claude";
import { githubConfigured } from "@/lib/github";
import { TrendChart } from "@/components/admin/Charts";
import { AskClaudeButton, FixCard, HealthButton, HealthChat, HealthToast, Md, SendToClaudeCode, type Fix } from "@/components/admin/Health";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Err = { id: number; source: ErrorSource; name: string | null; message: string; stack: string | null; path: string | null; route: string | null; release: string | null;
  first_release: string | null; context: Record<string, unknown> | null; count: number; first_seen: string; last_seen: string; status: string; status_at: string | null;
  regressed: boolean; diagnosis: string | null; diagnosed_at: string | null };

const hourKey = (d: Date) => {
  const b = new Date(d.toLocaleString("en-US", { timeZone: "Australia/Brisbane" }));
  return `${b.toLocaleDateString("en-CA")}T${String(b.getHours()).padStart(2, "0")}`;
};
const CONTEXT: Record<string, string> = { method: "Request", type: "Kind", render: "Rendering", digest: "Reference", kind: "How it happened", device: "Device", browser: "Browser" };

// One error in full: what, where, how often, Claude's explanation, and the fixes sent to Claude Code.
export default async function ErrorDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = supabaseAdmin();
  const [{ data: e }, { data: hours }, { data: fixes }] = await Promise.all([
    db.from("app_errors").select("id, source, name, message, stack, path, route, release, first_release, context, count, first_seen, last_seen, status, status_at, regressed, diagnosis, diagnosed_at").eq("id", id).maybeSingle(),
    db.rpc("error_hours", { p_hours: 48, p_error: id }),
    db.from("fix_requests").select("id, title, status, issue_number, issue_url, branch, pr_number, pr_url, last_update, last_update_at, created_at, updated_at, error_id").eq("error_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!e) notFound();
  const err = e as Err;
  const h = new Map(Object.entries((hours || {}) as Record<string, number>));
  const pts = Array.from({ length: 48 }, (_, i) => hourKey(new Date(Date.now() - (47 - i) * 3600_000))).map((k) => ({ day: k, value: Number(h.get(k) || 0) }));
  const ctx = Object.entries(err.context || {}).filter(([, v]) => v != null && v !== "");
  const claudeReady = claudeConfigured(), githubReady = githubConfigured();
  const task = `Find out why this ${err.source === "web" ? "error happens in visitors' browsers" : err.source === "app" ? "error happens in the phone app" : err.source === "clock" ? "step of the clock fails" : "server error happens"} and fix the cause. Add a test that would have caught it.`;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link className="blue" href="/admin/health" style={{ fontSize: 14, fontWeight: 700 }}>← Site health</Link>
        <h1 className="d3" style={{ overflowWrap: "anywhere", fontSize: "clamp(24px,3vw,34px)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{err.name && err.name !== "Error" ? `${err.name}: ` : ""}{err.message}</h1>
        <div className="pill-row">
          <span className={`sev ${err.status === "open" ? "act" : err.status === "fixed" ? "good" : "off"}`}><i aria-hidden="true" />{err.status === "open" ? (err.regressed ? "Open (came back)" : "Open") : err.status === "fixed" ? "Fixed" : "Ignored"}</span>
          {err.status === "open" && <AskClaudeButton errorId={err.id} tone="blue" question={`Why is error #${err.id} happening, how many people does it affect, and how do I fix it?`} />}
          {err.status === "open" ? <HealthButton action="error-status" payload={{ id: err.id, status: "fixed" }} label="Mark fixed" /> : <HealthButton action="error-status" payload={{ id: err.id, status: "open" }} label="Reopen" />}
          {err.status === "open" && <HealthButton action="error-status" payload={{ id: err.id, status: "ignored" }} label="Ignore" />}
        </div>
      </div>

      <div className="admin-card">
        <dl className="facts" data-testid="error-facts">
          <dt>Where</dt><dd>{SOURCE_LABELS[err.source] || err.source}{err.route ? `, ${err.route}` : ""}{err.path && err.path !== err.route ? ` (last on ${err.path})` : ""}</dd>
          <dt>How often</dt><dd>{err.count.toLocaleString("en-AU")} time{err.count === 1 ? "" : "s"}</dd>
          <dt>First seen</dt><dd>{dateTime(err.first_seen)} ({ago(Date.now() - new Date(err.first_seen).getTime())} ago){err.first_release ? `, release ${err.first_release}` : ""}</dd>
          <dt>Last seen</dt><dd>{dateTime(err.last_seen)} ({ago(Date.now() - new Date(err.last_seen).getTime())} ago){err.release ? `, release ${err.release}` : ""}</dd>
          {ctx.map(([k, v]) => <Fragment key={k}><dt>{CONTEXT[k] || k}</dt><dd>{String(v)}</dd></Fragment>)}
        </dl>
      </div>

      <div className="admin-card"><TrendChart title="How often, per hour (last 48 hours)" points={pts} fmt="count" unit="hours" testId="chart-error" /></div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="diagnosis">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Claude&apos;s explanation</h2>
        {err.diagnosis ? <><Md text={err.diagnosis} /><span className="hint">From {dateTime(err.diagnosed_at || err.last_seen)}. Ask again for an up-to-date answer.</span></>
          : <p className="muted" style={{ margin: 0 }}>{claudeReady ? "Press Ask Claude: it reads the error, the recent changes and the code, and explains it in plain English." : "Connect Claude (ANTHROPIC_API_KEY) to get an explanation."}</p>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Fix it with Claude Code</h2>
        <SendToClaudeCode errorId={err.id} defaultTask={task} githubReady={githubReady} startOpen={(fixes || []).length === 0} label="Send another job to Claude Code" />
        {(fixes || []).length > 0 && <div>{((fixes || []) as Fix[]).map((f) => <FixCard key={f.id} initial={f} githubReady={githubReady} />)}</div>}
      </div>

      {err.stack && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Stack trace</h2>
          <p className="hint" style={{ margin: 0 }}>Where in the code it happened, for Claude and Claude Code. Website errors point at the built files, so file names look scrambled.</p>
          <pre className="stack" data-testid="error-stack">{err.stack}</pre>
        </div>
      )}

      <HealthChat claudeReady={claudeReady} githubReady={githubReady} />
      <HealthToast />
    </>
  );
}
