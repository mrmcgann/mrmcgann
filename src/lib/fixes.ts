import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { kickOutbox } from "@/lib/notify";
import { checksFor, claudeBot, closeIssue, closePull, commentOn, createIssue, createPull, getPull, gh, githubConfigured, issueComments, mergePull, previewUrl,
  pullFiles, pullsFor, repoIsPublic, sensitiveFiles, type Issue, type Pull } from "@/lib/github";
import { claudeComments, fixState, issueBody, issueTitle, replyBody, type CheckInfo, type ErrorInfo, type FixState } from "@/lib/claudeBrief";

// Fixes handed to Claude Code: a GitHub issue it works on (through the Claude Code GitHub Action), its progress
// read back into Admin → Site health, and a pull request a person reviews and puts live. Nothing goes live
// without an admin pressing "Put it live", and then only the exact change they were shown, once its tests pass.

export type FixRow = {
  id: number; error_id: number | null; check_key: string | null; title: string; brief: string; status: FixState;
  issue_number: number | null; issue_url: string | null; branch: string | null; pr_number: number | null; pr_url: string | null;
  last_update: string | null; last_update_at: string | null; created_at: string; updated_at: string; merged_at: string | null; replied_at: string | null;
};
const COLS = "id, error_id, check_key, title, brief, status, issue_number, issue_url, branch, pr_number, pr_url, last_update, last_update_at, created_at, updated_at, merged_at, replied_at";

async function errorInfo(id: number): Promise<ErrorInfo | null> {
  const { data } = await supabaseAdmin().from("app_errors").select("id, source, name, message, stack, path, route, count, first_seen, last_seen, release, context").eq("id", id).maybeSingle();
  if (!data) return null;
  const e = data as ErrorInfo;
  // Browser and app reports can be sent by anyone, so Claude Code gets their message but not their stack or context.
  return e.source === "web" || e.source === "app" ? { ...e, stack: null, context: null, message: e.message.slice(0, 400) } : e;
}
async function checkInfo(key: string): Promise<CheckInfo | null> {
  const { data } = await supabaseAdmin().from("health_checks").select("key, area, status, title, detail, fix").eq("key", key).maybeSingle();
  return (data as CheckInfo) || null;
}
const isPublic = () => (githubConfigured() ? repoIsPublic().catch(() => true) : Promise.resolve(false));

/** The exact issue that would be sent (shown to the admin before they send it). */
export async function previewFix(o: { task: string; errorId?: number | null; checkKey?: string | null }) {
  const [error, check, publicRepo] = await Promise.all([o.errorId ? errorInfo(o.errorId) : null, o.checkKey ? checkInfo(o.checkKey) : null, isPublic()]);
  return { title: issueTitle(o.task, error, check, publicRepo), body: issueBody({ task: o.task, error, check, fixId: 0, siteUrl: env.siteUrl, publicRepo }), publicRepo };
}

export async function createFix(o: { task: string; errorId?: number | null; checkKey?: string | null; userId: string }): Promise<FixRow> {
  if (!githubConfigured()) throw new Error("Connect GitHub first (see Set up Claude at the bottom of this page).");
  const task = o.task.trim();
  if (task.length < 10) throw new Error("Say what you'd like Claude Code to do (a sentence or two).");
  const db = supabaseAdmin();
  const [error, check, publicRepo] = await Promise.all([o.errorId ? errorInfo(o.errorId) : null, o.checkKey ? checkInfo(o.checkKey) : null, isPublic()]);
  const title = issueTitle(task, error, check, publicRepo);
  const { data: row, error: insErr } = await db.from("fix_requests")
    .insert({ title, brief: task, error_id: error?.id ?? null, check_key: check?.key ?? null, created_by: o.userId, status: "sent" }).select(COLS).single();
  if (insErr || !row) throw new Error(insErr?.message || "Couldn't save the request.");
  const body = issueBody({ task, error, check, fixId: row.id, siteUrl: env.siteUrl, publicRepo });
  let issue: Issue;
  try {
    issue = await createIssue(title, body, ["site-health"]);
  } catch (e) {
    await db.from("fix_requests").delete().eq("id", row.id);
    throw e;
  }
  const { data } = await db.from("fix_requests").update({ issue_number: issue.number, issue_url: issue.html_url, brief: body, updated_at: new Date().toISOString() })
    .eq("id", row.id).select(COLS).single();
  return data as FixRow;
}

async function load(id: number): Promise<FixRow> {
  const { data } = await supabaseAdmin().from("fix_requests").select(COLS).eq("id", id).maybeSingle();
  if (!data) throw new Error("That fix request doesn't exist.");
  return data as FixRow;
}

export type FixDetail = FixRow & {
  checks?: { state: string; failing: string[] } | null; preview?: string | null; mergeable?: boolean | null; head_sha?: string | null;
  additions?: number; deletions?: number; files?: number; changed?: string[]; sensitive?: string[]; waitingTooLong?: boolean;
};

/** Brings one fix up to date from GitHub, tells admins when Claude Code has finished, and marks the error fixed once live. */
export async function syncFix(id: number, opts: { detail?: boolean } = {}): Promise<FixDetail> {
  const f = await load(id);
  if (!f.issue_number || !githubConfigured()) return f;
  if ((f.status === "merged" || f.status === "closed") && !opts.detail) return f;
  const db = supabaseAdmin();
  const [issue, comments] = await Promise.all([gh<Issue>(`/repos/{repo}/issues/${f.issue_number}`), issueComments(f.issue_number)]);
  // only Claude Code's own comments count: on a public repository anyone can comment
  const latest = claudeComments(comments, claudeBot())[0] || null;
  const branch = (latest?.branch && /^claude[/-][\w./-]+$/.test(latest.branch) ? latest.branch : null) || f.branch;
  let pr: Pull | null = null;
  if (f.pr_number) pr = await getPull(f.pr_number);
  else if (branch) pr = (await pullsFor(branch))[0] || null;
  if (pr && f.pr_number !== pr.number) pr = await getPull(pr.number); // the list doesn't include "merged" or "mergeable"
  const state = fixState({ issueOpen: issue.state === "open", latest, pr, repliedAt: f.replied_at });
  const now = new Date().toISOString();
  const update = {
    status: state, branch: branch || null, pr_number: pr?.number ?? null, pr_url: pr?.html_url ?? null,
    last_update: latest?.summary || f.last_update, last_update_at: latest?.at || f.last_update_at,
    ...(state !== f.status ? { updated_at: now } : {}),
    ...(state === "merged" && !f.merged_at ? { merged_at: pr?.merged_at || now } : {}),
  };
  await db.from("fix_requests").update(update).eq("id", id);
  if (state !== f.status) {
    if (state === "ready" || state === "failed") {
      const title = state === "ready" ? (branch ? `Claude Code has a fix ready: ${f.title}` : `Claude Code replied: ${f.title}`) : `Claude Code couldn't finish: ${f.title}`;
      await db.rpc("queue_health_alert", { p_title: title.slice(0, 160), p_body: `${(latest?.summary || "").slice(0, 900)}\n\nReview it in Site health: ${env.siteUrl}/admin/health#fix-${id}`,
        p_link: "/admin/health", p_dedupe: `fix:${id}:${state}:${latest?.at || ""}`, p_urgent: false });
      kickOutbox();
    }
    if (state === "merged" && f.error_id) {
      await db.from("app_errors").update({ status: "fixed", status_at: now, regressed: false }).eq("id", f.error_id).eq("status", "open");
    }
  }
  const out: FixDetail = { ...f, ...update } as FixDetail;
  if (opts.detail && pr && pr.state === "open") {
    const [checks, preview, files] = await Promise.all([checksFor(pr.head.sha).catch(() => null), previewUrl(pr.head.sha), pullFiles(pr.number).catch(() => [])]);
    const changed = files.map((x) => x.filename);
    Object.assign(out, { checks, preview, mergeable: pr.mergeable, head_sha: pr.head.sha, additions: pr.additions, deletions: pr.deletions, files: pr.changed_files,
      changed: changed.slice(0, 30), sensitive: sensitiveFiles(changed) });
  }
  out.waitingTooLong = state === "sent" && Date.now() - new Date(f.replied_at || f.created_at).getTime() > 10 * 60_000;
  return out;
}

export async function syncOpenFixes(): Promise<number> {
  if (!githubConfigured()) return 0;
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await supabaseAdmin().from("fix_requests").select("id").not("status", "in", "(merged,closed)").not("issue_number", "is", null)
    .gte("created_at", since).order("updated_at", { ascending: false }).limit(10);
  let n = 0;
  for (const r of (data || []) as { id: number }[]) { try { await syncFix(r.id); n++; } catch { /* GitHub busy: next time */ } }
  return n;
}

export async function replyToFix(id: number, text: string) {
  const f = await load(id);
  if (!f.issue_number) throw new Error("This request never reached GitHub.");
  if (text.trim().length < 3) throw new Error("Write a reply first.");
  await commentOn(f.issue_number, replyBody(text.trim()));
  const now = new Date().toISOString();
  await supabaseAdmin().from("fix_requests").update({ status: "sent", replied_at: now, updated_at: now }).eq("id", id);
}

export async function openPull(id: number): Promise<FixRow> {
  const f = await syncFix(id);
  if (f.pr_number) return f;
  if (!f.branch) throw new Error("Claude Code hasn't pushed a change for this yet.");
  const pr = await createPull(f.branch, f.title, `Fixes #${f.issue_number}.\n\nOpened from Admin → Site health (fix #${id}). Claude Code's summary is on the issue.`);
  await supabaseAdmin().from("fix_requests").update({ status: "pr", pr_number: pr.number, pr_url: pr.html_url, updated_at: new Date().toISOString() }).eq("id", id);
  return load(id);
}

/** Puts the change live: merges the pull request into the main branch, which Vercel then deploys. Only the exact commit
 *  the admin was shown, only once the required tests have passed on it, and never a change to the GitHub workflows. */
export async function mergeFix(id: number, userId: string, shownSha: string): Promise<string> {
  const f = await load(id);
  if (!f.pr_number) throw new Error("There's no change to put live yet.");
  const pr = await getPull(f.pr_number);
  if (pr.merged) return "It's already live.";
  if (pr.state !== "open") throw new Error("That change was closed on GitHub.");
  if (!shownSha || pr.head.sha !== shownSha) throw new Error("Claude Code changed this since you looked at it. Have a look at the new version, then press Put it live again.");
  if (pr.mergeable === false) throw new Error("The change clashes with newer changes. Reply to Claude Code and ask it to update the branch.");
  const files = (await pullFiles(pr.number)).map((x) => x.filename);
  if (files.some((x) => x.startsWith(".github/"))) throw new Error("This change touches the GitHub workflows, so it can't be put live from here. Have someone review it on GitHub.");
  const checks = await checksFor(pr.head.sha);
  if (checks.state === "failing") throw new Error(`The tests failed (${checks.failing.join(", ")}). Reply to Claude Code and ask it to fix them.`);
  if (checks.state !== "passing") throw new Error(checks.state === "running" ? "The tests are still running. Try again in a few minutes." : "The tests haven't run on this change yet. Try again in a few minutes.");
  const r = await mergePull(pr.number, `${f.title} (#${pr.number})`, pr.head.sha);
  if (!r.merged) throw new Error(r.message || "GitHub didn't merge it.");
  const now = new Date().toISOString();
  await supabaseAdmin().from("fix_requests").update({ status: "merged", merged_at: now, merged_by: userId, updated_at: now }).eq("id", id);
  if (f.error_id) await supabaseAdmin().from("app_errors").update({ status: "fixed", status_at: now, status_by: userId, regressed: false }).eq("id", f.error_id);
  return "Done. Vercel is putting it live now (about 2 minutes). If the error comes back, it'll reopen here by itself.";
}

export async function closeFix(id: number) {
  const f = await load(id);
  if (f.pr_number) await closePull(f.pr_number).catch(() => null);
  if (f.issue_number) await closeIssue(f.issue_number).catch(() => null);
  await supabaseAdmin().from("fix_requests").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", id);
}
