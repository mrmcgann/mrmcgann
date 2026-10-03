import { SITE } from "./env";
import { supabase } from "./supabase";

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Calls the website's API (the same routes the website uses). Signed-in calls send
 * the session as a bearer token. Public reads go without it so the edge cache serves them.
 */
export async function api<T = Record<string, unknown>>(path: string, opts: { method?: "GET" | "POST" | "DELETE"; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const method = opts.method || (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth !== false) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  try {
    res = await fetch(SITE + path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError("You're offline. Check your connection and try again.", 0, {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.", res.status, data);
  return data as T;
}

/** Public, cached GET (no session). */
export const pub = <T,>(path: string) => api<T>(path, { auth: false });

export const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");
