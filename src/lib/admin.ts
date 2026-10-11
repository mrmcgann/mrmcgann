import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail } from "@/lib/api";
import { auditDetail } from "@/lib/redact";
export { auditDetail };

// Admin access comes from the database (admin_access(): is_admin() plus, by default, a session that has passed
// two-step sign-in), so the website and the database's own rules can never disagree.
export async function adminAccess() {
  const s = await getSession();
  if (!s.user || s.profile?.role !== "admin") return { s, access: "no" as const };
  const { data } = await s.supabase.rpc("admin_access");
  return { s, access: (data === "ok" ? "ok" : data === "mfa" ? "mfa" : "no") as "ok" | "mfa" | "no" };
}

/** Admin pages: signed out → sign in; not an admin → home; no two-step yet → the two-step page. */
export async function requireAdmin() {
  const { s, access } = await adminAccess();
  if (!s.user) redirect("/signin?next=/admin");
  if (access === "mfa") redirect("/security/two-step?next=/admin");
  if (access !== "ok") redirect("/");
  return s;
}

/** Admin API routes: the session, or a refusal to return. */
export async function adminApi(): Promise<{ s: Awaited<ReturnType<typeof getSession>>; error: Response | null }> {
  const { s, access } = await adminAccess();
  if (access === "mfa") return { s, error: fail("Finish two-step sign-in first (Admin asks for your authenticator code).", 403) };
  if (access !== "ok") return { s, error: fail("Admins only.", 403) };
  return { s, error: null };
}

/** Records an admin action in the append-only admin log (never blocks the action if logging fails). */
export async function audit(actor: string | null | undefined, action: string, target: string | null, detail: unknown, outcome: string) {
  try {
    const h = await headers();
    const ip = (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim();
    await supabaseAdmin().rpc("audit_admin", { p_actor: actor || null, p_action: action, p_target: target, p_detail: auditDetail(detail),
      p_outcome: outcome, p_ip: ip, p_user_agent: h.get("user-agent") || "" });
  } catch { /* the action itself has already happened; Site health picks up database errors */ }
}
