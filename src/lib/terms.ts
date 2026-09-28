import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Records acceptance of the current Terms of Sale (the version lives in settings).
export async function acceptCurrentTerms(userId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("settings").select("value").eq("key", "terms").maybeSingle();
  const version = (data?.value as { buyer_version?: string } | null)?.buyer_version || "unversioned";
  await admin.from("profiles").update({ terms_version: version, terms_accepted_at: new Date().toISOString() }).eq("id", userId);
  return version;
}
