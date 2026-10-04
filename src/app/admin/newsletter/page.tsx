import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { newsletterBody } from "@/lib/newsletter";
import { DEFAULT_FEES, type Fees, type Lot } from "@/lib/types";
import { NewsletterSettings } from "./NewsletterSettings";

export default async function Newsletter() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: s }, { data: fee }, { count }, { data: fresh }, { data: ending }] = await Promise.all([
    db.from("settings").select("value").eq("key", "newsletter").maybeSingle(),
    db.from("settings").select("value").eq("key", "fees").maybeSingle(),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("suspended", false).filter("notify->marketing->>email", "eq", "true"),
    db.from("lots").select("*").eq("status", "live").gte("published_at", week).order("published_at", { ascending: false }).limit(8),
    db.from("lots").select("*").eq("status", "live").gte("ends_at", new Date().toISOString()).order("ends_at").limit(6),
  ]);
  const ids = new Set((fresh || []).map((l) => l.id));
  const body = newsletterBody((fresh || []) as Lot[], ((ending || []) as Lot[]).filter((l) => !ids.has(l.id)), { ...DEFAULT_FEES, ...((fee?.value || {}) as Partial<Fees>) });
  return (
    <>
      <h1 className="d2">Newsletter.</h1>
      <p className="muted">A weekly email of new vehicles and ones ending soon. It only goes to members who ticked &quot;News and featured vehicles&quot; in their alert settings ({count ?? 0} now). Every copy has our name, ABN and address, and a one-click unsubscribe (Spam Act).</p>
      <NewsletterSettings value={(s?.value || {}) as { enabled?: boolean; weekday?: number; hour?: number }} />
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>This week&apos;s, if it went now</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "var(--panel)", padding: 16, borderRadius: 14 }} data-testid="newsletter-preview">{body}</pre>
        <AdminAction action="newsletter-send" payload={{}} label="Send it now" confirmText={`Send to ${count ?? 0} members now?`} tone="blue" />
      </div>
    </>
  );
}
