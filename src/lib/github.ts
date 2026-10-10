import "server-only";

// The site's own GitHub access, for handing problems to Claude Code and showing its progress in Admin → Site health.
// GITHUB_TOKEN: a fine-grained personal access token for this one repository (Issues, Pull requests and Contents:
// read and write). GITHUB_REPO: "owner/name". Nothing here runs unless both are set.
const API = () => (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
export const repo = () => process.env.GITHUB_REPO || "";
export const baseBranch = () => process.env.GITHUB_BRANCH || "main";
export const githubConfigured = () => Boolean(process.env.GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(repo()));

export class GitHubError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "GitHubError"; }
}

export async function gh<T = unknown>(path: string, init: { method?: string; body?: unknown; raw?: boolean; timeoutMs?: number } = {}): Promise<T> {
  if (!githubConfigured()) throw new GitHubError(0, "GitHub isn't connected (GITHUB_TOKEN and GITHUB_REPO).");
  const r = await fetch(`${API()}${path.replace("{repo}", repo())}`, {
    method: init.method || "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs || 12_000),
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: init.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tyrebiter-site-health",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* plain text */ }
    throw new GitHubError(r.status, `GitHub said ${r.status}: ${String(msg).slice(0, 200)}`);
  }
  if (r.status === 204) return undefined as T;
  return (init.raw ? await r.text() : await r.json()) as T;
}

export type Issue = { number: number; html_url: string; state: string; title: string };
export type Comment = { id: number; body: string; created_at: string; updated_at: string; html_url: string; user: { login: string; type: string } };
export type Pull = { number: number; html_url: string; state: string; merged: boolean; created_at: string; merged_at: string | null; mergeable: boolean | null; mergeable_state: string;
  draft: boolean; title: string; additions: number; deletions: number; changed_files: number; head: { ref: string; sha: string }; base: { ref: string } };

export const createIssue = (title: string, body: string, labels: string[] = []) =>
  gh<Issue>("/repos/{repo}/issues", { method: "POST", body: { title, body, labels } });
export const commentOn = (issue: number, body: string) => gh<Comment>(`/repos/{repo}/issues/${issue}/comments`, { method: "POST", body: { body } });
export const issueComments = (issue: number) => gh<Comment[]>(`/repos/{repo}/issues/${issue}/comments?per_page=100`);
export const closeIssue = (issue: number) => gh<Issue>(`/repos/{repo}/issues/${issue}`, { method: "PATCH", body: { state: "closed", state_reason: "not_planned" } });
export const getPull = (n: number) => gh<Pull>(`/repos/{repo}/pulls/${n}`);
export const pullsFor = (branch: string) => gh<Pull[]>(`/repos/{repo}/pulls?state=all&head=${encodeURIComponent(`${repo().split("/")[0]}:${branch}`)}`);
export const createPull = (branch: string, title: string, body: string) =>
  gh<Pull>("/repos/{repo}/pulls", { method: "POST", body: { title, head: branch, base: baseBranch(), body } });
export const mergePull = (n: number, title: string, sha: string) =>
  gh<{ merged: boolean; sha: string; message: string }>(`/repos/{repo}/pulls/${n}/merge`, { method: "PUT", body: { merge_method: "squash", commit_title: title, sha } });
export const closePull = (n: number) => gh<Pull>(`/repos/{repo}/pulls/${n}`, { method: "PATCH", body: { state: "closed" } });

/** The test job every change must pass before it can go live (the "test" job in .github/workflows/ci.yml). */
export const REQUIRED_CHECK = () => process.env.GITHUB_REQUIRED_CHECK || "test";

/** The tests on a commit: passing (the required job succeeded), failing, still running, or not run yet. */
export async function checksFor(sha: string): Promise<{ state: "passing" | "failing" | "running" | "none"; failing: string[]; total: number }> {
  const r = await gh<{ total_count: number; check_runs: { name: string; status: string; conclusion: string | null }[] }>(`/repos/{repo}/commits/${sha}/check-runs?per_page=100`);
  const runs = r.check_runs || [];
  const failing = runs.filter((c) => c.status === "completed" && ["failure", "timed_out", "cancelled", "action_required", "startup_failure"].includes(c.conclusion || "")).map((c) => c.name);
  const required = runs.filter((c) => c.name === REQUIRED_CHECK());
  const state = failing.length ? "failing"
    : required.some((c) => c.status === "completed" && c.conclusion === "success") ? "passing"
    : runs.some((c) => c.status !== "completed") || required.length ? "running" : "none";
  return { state, failing, total: runs.length };
}

/** The files a pull request changes. */
export async function pullFiles(n: number): Promise<{ filename: string; status: string; additions: number; deletions: number }[]> {
  return gh(`/repos/{repo}/pulls/${n}/files?per_page=100`);
}

/** Changes a person should look at closely before they go live (money, security, the workflows, dependencies). */
export function sensitiveFiles(files: string[]): string[] {
  return files.filter((f) => /^\.github\/|^package(-lock)?\.json$|^supabase\/migrations\/|^src\/lib\/(charges|fees|stripe|auth|admin|env|links)\.ts$|^src\/middleware\.ts$|^next\.config|^vercel\.json$|^src\/app\/api\/(stripe|cron|admin)\//.test(f));
}

let visibility: { at: number; isPublic: boolean } | null = null;
/** Whether the repository is public (then anyone can read its issues). */
export async function repoIsPublic(): Promise<boolean> {
  if (!visibility || Date.now() - visibility.at > 10 * 60_000) {
    const r = await gh<{ private: boolean }>("/repos/{repo}");
    visibility = { at: Date.now(), isPublic: r.private === false };
  }
  return visibility.isPublic;
}

/** Claude Code's comments come from its GitHub app; anyone else's are ignored (on a public repository anyone can comment). */
export const claudeBot = () => (process.env.CLAUDE_BOT_LOGIN || "claude[bot]").toLowerCase();

/** A preview of the change (Vercel posts one for every pull request when it's connected to GitHub). */
export async function previewUrl(sha: string): Promise<string | null> {
  try {
    const deps = await gh<{ id: number; environment: string }[]>(`/repos/{repo}/deployments?sha=${sha}&per_page=5`);
    for (const d of deps || []) {
      const st = await gh<{ state: string; environment_url?: string; target_url?: string }[]>(`/repos/{repo}/deployments/${d.id}/statuses?per_page=5`);
      const ok = (st || []).find((x) => x.state === "success" && (x.environment_url || x.target_url));
      if (ok) return ok.environment_url || ok.target_url || null;
    }
  } catch { /* no preview */ }
  return null;
}

// What Claude may read while it diagnoses (read-only, the main branch, code and docs only).
const READABLE = /^(src|supabase|mobile\/src|tests|scripts)\/[\w\-./[\]()@]+\.(ts|tsx|js|mjs|sql|json|md|css)$|^(CLAUDE\.md|README\.md|package\.json|next\.config\.ts|vercel\.json|\.env\.example)$/;
export const readablePath = (p: string) => READABLE.test(p) && !p.includes("..");

let tree: { at: number; files: string[] } | null = null;
export async function listFiles(prefix = ""): Promise<string[]> {
  if (!tree || Date.now() - tree.at > 10 * 60_000) {
    const r = await gh<{ tree: { path: string; type: string }[] }>(`/repos/{repo}/git/trees/${baseBranch()}?recursive=1`);
    tree = { at: Date.now(), files: (r.tree || []).filter((t) => t.type === "blob" && readablePath(t.path)).map((t) => t.path) };
  }
  return tree.files.filter((f) => f.startsWith(prefix));
}

export async function readFile(path: string): Promise<string> {
  if (!readablePath(path)) throw new GitHubError(403, "That file can't be read from here (code and docs only).");
  return gh<string>(`/repos/{repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${baseBranch()}`, { raw: true });
}

export async function recentCommits(n = 10) {
  const r = await gh<{ sha: string; html_url: string; commit: { message: string; author: { date: string } } }[]>(`/repos/{repo}/commits?sha=${baseBranch()}&per_page=${n}`);
  return r.map((c) => ({ sha: c.sha.slice(0, 7), date: c.commit.author.date, message: c.commit.message.split("\n")[0].slice(0, 160) }));
}
