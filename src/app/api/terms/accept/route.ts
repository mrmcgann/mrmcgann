import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { acceptCurrentTerms } from "@/lib/terms";
import { json, fail } from "@/lib/api";

// Records that the member accepted the current Terms of Sale (version from settings).
export async function POST() {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const version = await acceptCurrentTerms(user.id);
  return json({ ok: true, version });
}
