import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanPath } from "@/lib/traffic";
import { errorFields, fingerprint, isNoise, routeOf, scrub, scrubStack, type ErrorSource } from "@/lib/errorTrack";

// Records errors for Admin → Site health. Reporting never throws and never slows a page down for long: if the
// database is the thing that's broken, the report is dropped (the health checks notice that separately).
// The same error from this server instance is written at most once every 2 seconds, with the count carried,
// so a sudden flood can't pile onto one row.
const recent = new Map<string, { at: number; pending: number }>();

export const release = () => (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local";

export type Report = {
  source: ErrorSource;
  error?: unknown;
  name?: string;
  message?: string;
  stack?: string;
  path?: string;
  route?: string;
  context?: Record<string, unknown>;
  release?: string;
};

export async function reportError(r: Report): Promise<{ id: number; new: boolean; reopened: boolean } | null> {
  try {
    const f = r.error !== undefined ? errorFields(r.error) : { name: r.name || "Error", message: r.message || "", stack: r.stack || "" };
    if (r.name) f.name = r.name;
    if (r.message && r.error === undefined) f.message = r.message;
    if (isNoise(f, r.source)) return null;
    const message = scrub(f.message, 1000) || "Unknown error";
    const path = r.path ? scrub(cleanPath(r.path), 200) : null;
    const route = r.route || routeOf(r.path);
    const fp = fingerprint(r.source, f.name, message, route);
    const now = Date.now();
    const seen = recent.get(fp);
    if (seen && now - seen.at < 2000) { seen.pending += 1; return null; }
    const count = 1 + (seen?.pending || 0);
    recent.set(fp, { at: now, pending: 0 });
    if (recent.size > 5000) recent.clear();
    const context = Object.fromEntries(Object.entries(r.context || {}).filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => [k.slice(0, 40), typeof v === "string" ? scrub(v, 200) : typeof v === "number" || typeof v === "boolean" ? v : scrub(JSON.stringify(v), 200)]));
    const { data, error } = await supabaseAdmin().rpc("record_error", {
      p_fingerprint: fp, p_source: r.source, p_name: scrub(f.name, 120) || "Error", p_message: message, p_stack: scrubStack(f.stack) || null,
      p_path: path, p_route: route, p_release: (r.release || release()).slice(0, 40), p_context: context, p_count: count,
    });
    if (error) return null;
    return data as { id: number; new: boolean; reopened: boolean };
  } catch {
    return null;
  }
}

/** Report after the response has gone (inside a request), or straight away otherwise. */
export function reportLater(r: Report) {
  void (async () => {
    // on Vercel the request carries the route it matched; use it when the caller didn't say where this happened
    if (!r.path && !r.route) {
      try { const h = await headers(); const p = h.get("x-matched-path") || h.get("x-invoke-path"); r = p ? { ...r, path: p, route: routeOf(p) } : { ...r, route: "server" }; } catch { r = { ...r, route: "server" }; }
    }
    try { after(() => reportError(r)); } catch { await reportError(r); }
  })();
}
