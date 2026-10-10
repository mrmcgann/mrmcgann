import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { QUICK_FIXES, quickFix, runHealth } from "@/lib/health";
import { closeFix, createFix, mergeFix, openPull, previewFix, replyToFix, syncFix } from "@/lib/fixes";
import type { QuickFix } from "@/lib/healthChecks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Admin → Site health: run the checks, the one-press fixes, error status, and everything to do with Claude Code.
export async function POST(req: Request) {
  const { user, profile } = await getSession();
  if (!user || profile?.role !== "admin") return fail("Admins only.", 403);
  const b = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const id = Number(b.id) || 0;
  try {
    switch (b.action) {
      case "run": {
        const r = await runHealth({ probe: true });
        const bad = r.checks.filter((c) => c.status === "fail").length, watch = r.checks.filter((c) => c.status === "warn").length;
        return json({ ok: true, message: bad ? `Checked. ${bad} problem${bad === 1 ? "" : "s"} to fix.` : watch ? `Checked. ${watch} thing${watch === 1 ? "" : "s"} to keep an eye on.` : "Checked. Everything's running normally." });
      }
      case "quick-fix": {
        if (!(b.fix in QUICK_FIXES)) return fail("Unknown fix.");
        return json({ ok: true, message: await quickFix(b.fix as QuickFix) });
      }
      case "error-status": {
        if (!["open", "fixed", "ignored"].includes(b.status)) return fail("Unknown status.");
        await db.from("app_errors").update({ status: b.status, status_at: new Date().toISOString(), status_by: user.id, ...(b.status !== "open" ? { regressed: false } : {}) }).eq("id", id);
        return json({ ok: true, message: b.status === "fixed" ? "Marked fixed. If it happens again it reopens here." : b.status === "ignored" ? "Ignored. It's still counted, but it won't count towards the checks." : "Reopened." });
      }
      case "settings": {
        const { data: cur } = await db.from("settings").select("value").eq("key", "health").maybeSingle();
        const v = (cur?.value || {}) as Record<string, unknown>;
        const limit = Number(b.db_limit_gb);
        const next = { ...v, alerts: b.alerts !== false, sms: b.sms !== false, db_limit_gb: limit >= 0.5 && limit <= 4096 ? limit : v.db_limit_gb ?? 8 };
        await db.from("settings").upsert({ key: "health", value: next });
        return json({ ok: true, message: "Saved." });
      }
      case "fix-preview": return json({ ok: true, ...(await previewFix({ task: String(b.task || ""), errorId: Number(b.errorId) || null, checkKey: b.checkKey || null })) });
      case "fix-create": {
        const f = await createFix({ task: String(b.task || ""), errorId: Number(b.errorId) || null, checkKey: b.checkKey || null, userId: user.id });
        return json({ ok: true, fix: f, message: "Sent. Claude Code usually starts within a minute; its progress shows here." });
      }
      case "fix-sync": return json({ ok: true, fix: await syncFix(id, { detail: true }) });
      case "fix-reply": { await replyToFix(id, String(b.text || "")); return json({ ok: true, message: "Sent to Claude Code." }); }
      case "fix-pr": return json({ ok: true, fix: await openPull(id), message: "Pull request opened. The tests run now, and Vercel makes a preview you can click through." });
      case "fix-merge": return json({ ok: true, message: await mergeFix(id, user.id, String(b.sha || "")) });
      case "fix-close": { await closeFix(id); return json({ ok: true, message: "Closed." }); }
    }
    return fail("Unknown action.");
  } catch (e) {
    return fail((e as Error).message || "That didn't work.", 400);
  }
}
