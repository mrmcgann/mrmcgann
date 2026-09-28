import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getSession() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return { supabase, user, profile: profile as Profile | null };
}

export function missingSteps(p: Profile | null): number[] {
  if (!p) return [1, 2, 3, 4, 5];
  const m: number[] = [];
  if (!p.details_done) m.push(2);
  if (!p.mobile_verified) m.push(3);
  if (!p.payment_method_id) m.push(4);
  if (p.id_status !== "verified") m.push(5);
  return m;
}
