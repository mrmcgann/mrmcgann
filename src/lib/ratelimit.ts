import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Shared limits (all server instances see the same counts). Returns true if allowed.
export async function allow(key: string, max: number, windowSeconds: number) {
  const { data, error } = await supabaseAdmin().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) return true; // never lock people out because the limiter hiccupped
  return data === true;
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

export async function userAgent() {
  return (await headers()).get("user-agent") || "";
}
