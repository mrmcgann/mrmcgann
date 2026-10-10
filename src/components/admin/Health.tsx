"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Admin → Site health: the buttons, "Ask Claude" and everything to do with Claude Code.

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "That didn't work.");
  return data;
}

const small = { height: 38, fontSize: 13, padding: "0 14px" } as const;

/** A button that runs a health action and says what happened. */
export function HealthButton({ action, payload = {}, label, tone = "soft", confirmText, testId }: {
  action: string; payload?: Record<string, unknown>; label: string; tone?: "blue" | "soft" | "dark"; confirmText?: string; testId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const d = await post({ action, ...payload });
      setMsg({ ok: true, text: d.message || "Done." }); setAsk(false);
      // the row may disappear once it's fixed, so the result is also shown at the bottom of the screen
      window.dispatchEvent(new CustomEvent("health-toast", { detail: d.message || "Done." }));
      router.refresh();
    }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {ask && <span style={{ fontSize: 13, fontWeight: 600 }}>{confirmText}</span>}
      <button className={`btn btn-${tone}`} style={small} disabled={busy} data-testid={testId}
        onClick={() => (confirmText && !ask ? setAsk(true) : run())}>{busy ? "Working…" : ask ? "Yes, go ahead" : label}</button>
      {ask && !busy && <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setAsk(false)}>Cancel</button>}
      {msg && <span role="status" className={msg.ok ? "okmsg" : "errmsg"} style={{ fontSize: 13 }}>{msg.text}</span>}
    </span>
  );
}

/** What the last button did, shown for a few seconds at the bottom of the screen. */
export function HealthToast() {
  const [text, setText] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => { setText(String((e as CustomEvent).detail || "")); clearTimeout(timer); timer = setTimeout(() => setText(""), 9000); };
    window.addEventListener("health-toast", on);
    return () => { window.removeEventListener("health-toast", on); clearTimeout(timer); };
  }, []);
  if (!text) return null;
  return (
    <div className="htoast" role="status" data-testid="health-toast">
      <span>{text}</span>
      <button className="linkbtn" style={{ color: "#FFFFFF", fontSize: 13 }} onClick={() => setText("")} aria-label="Dismiss">✕</button>
    </div>
  );
}

type Focus = { errorId?: number | null; checkKey?: string | null; question?: string };
/** Opens the Claude panel about one error or check (or in general). */
export function AskClaudeButton({ label = "Ask Claude", tone = "soft", ...focus }: Focus & { label?: string; tone?: "blue" | "soft" | "dark" }) {
  return <button className={`btn btn-${tone}`} style={small} onClick={() => window.dispatchEvent(new CustomEvent("ask-claude", { detail: focus }))}>{label}</button>;
}

// A little Markdown for Claude's answers: paragraphs, lists, **bold**, `code` and links (web links only).
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
    if (/^`[^`]+`$/.test(p)) return <code key={i}>{p.slice(1, -1)}</code>;
    const l = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p);
    if (l) return <a key={i} className="blue" href={l[2]} target="_blank" rel="noreferrer">{l[1]}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
export function Md({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
          return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        if (/^```/.test(b)) return <pre key={i}>{b.replace(/^```\w*\n?|```$/g, "")}</pre>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j ? <br /> : null}{inline(l.replace(/^#+\s*/, ""))}</Fragment>)}</p>;
      })}
    </div>
  );
}

/** "Send to Claude Code": the admin writes (or edits Claude's draft of) the job, can see exactly what's sent, and sends it. */
export function SendToClaudeCode({ errorId, checkKey, defaultTask = "", githubReady, label = "Send to Claude Code", startOpen = false, onSent }: {
  errorId?: number | null; checkKey?: string | null; defaultTask?: string; githubReady: boolean; label?: string; startOpen?: boolean; onSent?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [task, setTask] = useState(defaultTask);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setTask(defaultTask); }, [defaultTask]);
  if (!open) return <button className="btn btn-soft" style={small} onClick={() => setOpen(true)} data-testid="open-send">{label}</button>;
  async function showPreview() {
    try { const d = await post({ action: "fix-preview", task, errorId, checkKey }); setPreview(`${d.title}\n\n${d.body}`); setIsPublic(!!d.publicRepo); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  async function send() {
    setBusy(true); setMsg(null);
    try { const d = await post({ action: "fix-create", task, errorId, checkKey }); setMsg({ ok: true, text: d.message }); onSent?.(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  return (
    <div className="sendcc" data-testid="send-cc">
      <label style={{ fontWeight: 700, fontSize: 14 }} htmlFor={`cc-${errorId || checkKey || "x"}`}>What should Claude Code do?</label>
      <textarea id={`cc-${errorId || checkKey || "x"}`} className="input" rows={5} value={task} onChange={(e) => setTask(e.target.value)}
        placeholder="For example: Find out why this error happens on the vehicle page and fix it. Add a test." />
      <p className="hint" style={{ margin: 0 }}>Claude Code gets this, the error details and the site&apos;s rules (CLAUDE.md). It works on a copy of the code and can&apos;t change the live site: you check its change and put it live from here.</p>
      {!githubReady && <p className="errmsg" style={{ margin: 0, fontSize: 13 }}>Connect GitHub first (Set up Claude Code, at the bottom of this page).</p>}
      <div className="pill-row">
        <button className="btn btn-blue" style={small} disabled={busy || !githubReady || task.trim().length < 10} onClick={send} data-testid="send-cc-go">{busy ? "Sending…" : "Send to Claude Code"}</button>
        <button className="btn btn-soft" style={small} onClick={showPreview}>See exactly what&apos;s sent</button>
        <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => { setOpen(false); setPreview(null); setMsg(null); }}>Cancel</button>
      </div>
      {msg && <span role="status" className={msg.ok ? "okmsg" : "errmsg"} style={{ fontSize: 13 }}>{msg.text}</span>}
      {preview && isPublic && <p className="errmsg" style={{ margin: 0, fontSize: 13 }}>Your GitHub repository is public, so anyone can read this. The error&apos;s message and stack trace are left out; don&apos;t type anything private here. Making the repository private fixes this (see Set up Claude).</p>}
      {preview && <pre className="ccpreview" data-testid="cc-preview">{preview}</pre>}
    </div>
  );
}

type Ev = { type: "step" | "text" | "error"; text: string } | { type: "action"; fix: string; label: string; why: string }
  | { type: "draft"; task: string; errorId: number | null; checkKey: string | null } | { type: "done" };
type Turn = { role: "user"; text: string } | { role: "assistant"; events: Ev[]; text: string; busy: boolean };

/** The Claude panel: opens from any "Ask Claude" button, keeps the conversation while the page is open. */
export function HealthChat({ claudeReady, githubReady }: { claudeReady: boolean; githubReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Focus>({});
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(async (text: string, f: Focus, prior: Turn[]) => {
    const history = [...prior, { role: "user" as const, text }];
    setTurns([...history, { role: "assistant", events: [], text: "", busy: true }]);
    setBusy(true);
    const messages = history.map((t) => ({ role: t.role, text: t.role === "user" ? t.text : t.text })).filter((m) => m.text);
    const events: Ev[] = [];
    let answer = "";
    const paint = (busyNow: boolean) => setTurns([...history, { role: "assistant", events: [...events], text: answer, busy: busyNow }]);
    try {
      const res = await fetch("/api/admin/health/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, errorId: f.errorId, checkKey: f.checkKey }) });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Claude didn't answer."); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as Ev;
          if (ev.type === "text") answer = ev.text;
          else if (ev.type !== "done") events.push(ev);
          paint(true);
        }
      }
    } catch (e) {
      events.push({ type: "error", text: (e as Error).message });
    }
    paint(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    const onAsk = (e: Event) => {
      const f = ((e as CustomEvent).detail || {}) as Focus;
      setOpen(true);
      setFocus(f);
      if (f.question && claudeReady) void send(f.question, f, []);
      else setTimeout(() => input.current?.focus(), 50);
    };
    window.addEventListener("ask-claude", onAsk);
    return () => window.removeEventListener("ask-claude", onAsk);
  }, [claudeReady, send]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  if (!open) return null;
  const submit = () => { const t = draft.trim(); if (!t || busy) return; setDraft(""); void send(t, focus, turns); };
  return (
    <aside className="chat" role="dialog" aria-label="Ask Claude about the site" data-testid="claude-chat">
      <div className="chat-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 17 }}>Ask Claude</b>
          <span className="muted" style={{ fontSize: 13 }}>{focus.errorId ? `About error #${focus.errorId}` : focus.checkKey ? "About this check" : "About the site's health"}. It can look, not change anything.</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {turns.length > 0 && <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => { setTurns([]); setFocus({}); }} disabled={busy}>New</button>}
          <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
        </div>
      </div>
      <div className="chat-body">
        {!claudeReady && <p className="errmsg" style={{ margin: 0 }}>Ask Claude needs an Anthropic API key: add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy.</p>}
        {claudeReady && turns.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="muted" style={{ fontSize: 14 }}>Try:</span>
            {["Is anything wrong right now?", "What broke overnight?", "Why are people seeing errors?", "Is the site ready for a big auction tonight?"].map((q) => (
              <button key={q} className="chip" onClick={() => void send(q, focus, [])}>{q}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => t.role === "user" ? <div key={i} className="bubble me">{t.text}</div> : (
          <div key={i} className="bubble them" data-testid="claude-answer">
            {t.events.filter((e) => e.type === "step").map((e, j) => <div key={j} className="step">{(e as { text: string }).text}</div>)}
            {t.busy && !t.text && <div className="step working">Thinking…</div>}
            {t.text && <Md text={t.text} />}
            {t.events.map((e, j) => e.type === "error" ? <p key={`e${j}`} className="errmsg" style={{ margin: 0 }}>{e.text}</p>
              : e.type === "action" ? (
                <div key={`a${j}`} className="suggest" data-testid="claude-action">
                  <span style={{ fontSize: 13 }}><b>Suggested fix:</b> {e.why}</span>
                  <HealthButton action="quick-fix" payload={{ fix: e.fix }} label={e.label} tone="blue" confirmText={`${e.label}?`} />
                </div>)
              : e.type === "draft" ? (
                <div key={`d${j}`} className="suggest" data-testid="claude-draft">
                  <span style={{ fontSize: 13 }}><b>Claude drafted a job for Claude Code.</b> Read it, change anything you like, then send it.</span>
                  <SendToClaudeCode errorId={e.errorId} checkKey={e.checkKey} defaultTask={e.task} githubReady={githubReady} startOpen />
                </div>) : null)}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chat-foot">
        <textarea ref={input} className="input" rows={2} value={draft} disabled={!claudeReady} placeholder="Ask about an error, a check, or the site…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} data-testid="claude-input" />
        <button className="btn btn-blue" style={small} onClick={submit} disabled={busy || !claudeReady || !draft.trim()}>{busy ? "…" : "Ask"}</button>
      </div>
    </aside>
  );
}

export type Fix = {
  id: number; title: string; status: string; issue_number: number | null; issue_url: string | null; branch: string | null; pr_number: number | null; pr_url: string | null;
  last_update: string | null; last_update_at: string | null; created_at: string; updated_at: string; error_id: number | null;
  checks?: { state: string; failing: string[] } | null; preview?: string | null; mergeable?: boolean | null; head_sha?: string | null; additions?: number; deletions?: number; files?: number;
  changed?: string[]; sensitive?: string[]; waitingTooLong?: boolean;
};
const LABEL: Record<string, string> = { sent: "Waiting for Claude Code", working: "Claude Code is working on it", ready: "Ready for you to check", pr: "Change ready to put live",
  merged: "Live", closed: "Closed", failed: "Claude Code hit a problem" };
const SEVCLASS: Record<string, string> = { sent: "info", working: "watch", ready: "good", pr: "good", merged: "good", closed: "info", failed: "act" };
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** One fix handed to Claude Code, kept up to date while it's on screen. */
export function FixCard({ initial, githubReady }: { initial: Fix; githubReady: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Fix>(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const live = !["merged", "closed"].includes(f.status);
  const refresh = useCallback(async () => {
    try { const d = await post({ action: "fix-sync", id: f.id }); setF((x) => ({ ...x, ...d.fix })); } catch { /* try again next time */ }
  }, [f.id]);
  useEffect(() => {
    if (!live || !githubReady) return;
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, f.status === "working" || f.status === "sent" ? 15_000 : 45_000);
    return () => clearInterval(t);
  }, [live, githubReady, refresh, f.status]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null);
    try { const d = await post({ action, id: f.id, ...extra }); if (d.fix) setF((x) => ({ ...x, ...d.fix })); setMsg({ ok: true, text: d.message || "Done." }); await refresh(); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(""); setConfirmMerge(false);
  }
  const checks = f.checks;
  return (
    <div className="ins fix" id={`fix-${f.id}`} data-testid="fix-card">
      <span className={`sev ${SEVCLASS[f.status] || "info"}`}><i aria-hidden="true" />{LABEL[f.status] || f.status}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <b style={{ fontSize: 15, overflowWrap: "anywhere" }}>{f.title}</b>
        <span className="muted" style={{ fontSize: 13 }}>
          Sent {when(f.created_at)}{f.issue_url && <> · <a className="blue" href={f.issue_url} target="_blank" rel="noreferrer">Issue #{f.issue_number}</a></>}
          {f.pr_url && <> · <a className="blue" href={f.pr_url} target="_blank" rel="noreferrer">Change #{f.pr_number}</a></>}
          {f.branch && !f.pr_url && f.issue_url && <> · <a className="blue" href={`${f.issue_url.replace(/\/issues\/\d+$/, "")}/compare/${encodeURIComponent(f.branch)}`} target="_blank" rel="noreferrer">See the change</a></>}
          {f.error_id && <> · error #{f.error_id}</>}
        </span>
        {f.waitingTooLong && <p className="errmsg" style={{ margin: 0, fontSize: 13 }}>Claude Code hasn&apos;t started after 10 minutes. Check the Claude Code workflow is set up (see Set up Claude Code below) and look at the repository&apos;s Actions tab.</p>}
        {f.last_update && <details className="ccupdate" open={f.status === "ready" || f.status === "failed"}><summary>Claude Code&apos;s update{f.last_update_at ? ` (${when(f.last_update_at)})` : ""}</summary><Md text={f.last_update} /></details>}
        {f.status === "pr" && (
          <span style={{ fontSize: 13 }} data-testid="fix-pr-state">
            {checks ? (checks.state === "passing" ? "Tests passed." : checks.state === "failing" ? `Tests failed: ${checks.failing.join(", ")}.` : checks.state === "running" ? "Tests are running…" : "The tests haven't run yet.") : null}
            {typeof f.files === "number" && ` ${f.files} file${f.files === 1 ? "" : "s"} changed (+${f.additions} −${f.deletions}).`}
            {f.preview && <> <a className="blue" href={f.preview} target="_blank" rel="noreferrer">Try the preview</a> before putting it live.</>}
          </span>
        )}
        {f.status === "pr" && !!f.changed?.length && (
          <details className="ccupdate"><summary>Files changed</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{f.changed.map((x) => <li key={x}><code>{x}</code>{f.sensitive?.includes(x) ? <b style={{ color: "#B42323" }}> (check this one)</b> : null}</li>)}</ul>
          </details>
        )}
        {f.status === "pr" && !!f.sensitive?.length && (
          <p className="errmsg" style={{ margin: 0, fontSize: 13 }}>This change touches {f.sensitive.length === 1 ? "a sensitive file" : `${f.sensitive.length} sensitive files`} (payments, security, the database or the build). Ask Claude what it does, or have someone check it, before you put it live.</p>
        )}
        {showReply && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="For example: The change looks right, but also handle vehicles with no photos." />
            <div className="pill-row">
              <button className="btn btn-blue" style={small} disabled={!!busy || reply.trim().length < 3} onClick={() => act("fix-reply", { text: reply }).then(() => { setReply(""); setShowReply(false); })}>Send to Claude Code</button>
              <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setShowReply(false)}>Cancel</button>
            </div>
          </div>
        )}
        {msg && <span role="status" className={msg.ok ? "okmsg" : "errmsg"} style={{ fontSize: 13 }}>{msg.text}</span>}
      </div>
      <div className="pill-row" style={{ justifyContent: "flex-end" }}>
        {live && githubReady && (f.status === "ready" || f.status === "failed" || f.status === "pr") && !showReply && <button className="btn btn-soft" style={small} onClick={() => setShowReply(true)}>Reply</button>}
        {f.status === "ready" && f.branch && !f.pr_number && <button className="btn btn-blue" style={small} disabled={!!busy} onClick={() => act("fix-pr")} data-testid="fix-pr">{busy === "fix-pr" ? "Opening…" : "Get it ready to go live"}</button>}
        {f.status === "pr" && (confirmMerge
          ? <><span style={{ fontSize: 13, fontWeight: 600 }}>Put this change on the live site?</span>
              <button className="btn btn-blue" style={small} disabled={!!busy} onClick={() => act("fix-merge", { sha: f.head_sha })} data-testid="fix-merge-yes">{busy === "fix-merge" ? "Putting it live…" : "Yes, put it live"}</button>
              <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setConfirmMerge(false)}>Cancel</button></>
          : <button className="btn btn-blue" style={small} disabled={!!busy || checks?.state !== "passing" || f.mergeable === false || !f.head_sha} onClick={() => setConfirmMerge(true)} data-testid="fix-merge">Put it live</button>)}
        {live && <button className="linkbtn" style={{ fontSize: 13 }} disabled={!!busy} onClick={() => act("fix-close")}>Close</button>}
      </div>
    </div>
  );
}

export function HealthSettings({ value }: { value: { alerts?: boolean; sms?: boolean; db_limit_gb?: number } }) {
  const [alerts, setAlerts] = useState(value.alerts !== false);
  const [sms, setSms] = useState(value.sms !== false);
  const [limit, setLimit] = useState(String(value.db_limit_gb ?? 8));
  const [msg, setMsg] = useState("");
  async function save() {
    setMsg("");
    try { const d = await post({ action: "settings", alerts, sms, db_limit_gb: Number(limit) }); setMsg(d.message); } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="hcheck"><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /> Tell admins when something breaks and when it&apos;s fixed (email and the app)</label>
      <label className="hcheck"><input type="checkbox" checked={sms} disabled={!alerts} onChange={(e) => setSms(e.target.checked)} /> Also text admins about problems (needs a verified mobile)</label>
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15 }}>Database size limit (GB, from your Supabase plan)
        <input className="input" style={{ width: 90, height: 40 }} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
      <div className="pill-row"><button className="btn btn-dark" style={small} onClick={save}>Save</button>{msg && <span role="status" style={{ fontSize: 13 }}>{msg}</span>}</div>
    </div>
  );
}
