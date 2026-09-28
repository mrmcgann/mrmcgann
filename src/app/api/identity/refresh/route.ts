import { getSession } from "@/lib/auth";
import { json, fail } from "@/lib/api";
import { syncIdentity } from "@/lib/identity";

export async function POST() {
  const { user, profile } = await getSession();
  if (!user || !profile) return fail("Sign in first.", 401);
  const sid = (profile as unknown as { id_session_id?: string }).id_session_id;
  const status = sid ? await syncIdentity(sid) : profile.id_status;
  return json({ status: status || profile.id_status });
}
