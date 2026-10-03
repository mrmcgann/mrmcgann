import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerOf, supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface SessionUser { id: string; email: string }

// Who is signed in. getClaims() checks the session token's signature locally
// (no call to the auth server) when the project uses asymmetric JWT keys.
// From the app the token arrives as a bearer header rather than a cookie.
export async function currentUser(db: SupabaseClient): Promise<SessionUser | null> {
  const { data } = await db.auth.getClaims(bearerOf(db));
  const c = data?.claims as { sub?: string; email?: string } | undefined;
  return c?.sub ? { id: c.sub, email: c.email || "" } : null;
}

// One database call per page for the member's profile, watch count and unread alerts.
// Cached per request, so the header and the page share it.
export const getSession = cache(async () => {
  const supabase = await supabaseServer();
  const user = await currentUser(supabase);
  if (!user) return { supabase, user: null as SessionUser | null, profile: null as Profile | null };
  const { data } = await supabase.rpc("me");
  const profile = (data || null) as Profile | null;
  if (profile && !user.email) user.email = profile.email || "";
  return { supabase, user, profile };
});

export function missingSteps(p: Profile | null): number[] {
  if (!p) return [1, 2, 3, 4, 5];
  const m: number[] = [];
  if (!p.details_done) m.push(2);
  if (!p.mobile_verified) m.push(3);
  if (!p.payment_method_id) m.push(4);
  if (p.id_status !== "verified") m.push(5);
  return m;
}
