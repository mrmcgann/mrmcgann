import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money, dateTime } from "@/lib/format";

export default async function AdminHome() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const day = new Date(Date.now() + 86400000).toISOString();
  const c = async (q: PromiseLike<{ count: number | null }>) => (await q).count || 0;
  const [live, endingToday, referred, offers, failed, balance, appraisals, inspections, reports, drafts, quotes, collections, claims, questions, payouts, messages, videos, leads, transfers] = await Promise.all([
    c(db.from("lots").select("id", { count: "exact", head: true }).eq("status", "live")),
    c(db.from("lots").select("id", { count: "exact", head: true }).eq("status", "live").lte("ends_at", day).gte("ends_at", now)),
    c(db.from("lots").select("id", { count: "exact", head: true }).eq("status", "referred")),
    c(db.from("offers").select("id", { count: "exact", head: true }).eq("status", "pending")),
    c(db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "payment_failed")),
    c(db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "deposit_paid")),
    c(db.from("appraisals").select("id", { count: "exact", head: true }).eq("status", "new")),
    c(db.from("partner_leads").select("id", { count: "exact", head: true }).eq("kind", "inspection").in("status", ["new", "sent"])),
    c(db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open")),
    c(db.from("lots").select("id", { count: "exact", head: true }).eq("status", "draft")),
    c(db.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new")),
    c(db.from("collections").select("id", { count: "exact", head: true }).eq("status", "requested")),
    c(db.from("claims").select("id", { count: "exact", head: true }).eq("status", "open")),
    c(db.from("lot_questions").select("id", { count: "exact", head: true }).eq("status", "open")),
    c(db.from("seller_payouts").select("id", { count: "exact", head: true }).eq("status", "ready")),
    c(db.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new")),
    c(db.from("lot_videos").select("id", { count: "exact", head: true }).eq("status", "pending")),
    c(db.from("partner_leads").select("id", { count: "exact", head: true }).in("kind", ["finance", "insurance"]).in("status", ["new", "sent"])),
    c(db.from("ownership_transfers").select("id", { count: "exact", head: true }).eq("status", "submitted")),
  ]);
  const { data: recent } = await db.from("invoices").select("ref, total, status, created_at, lots(title)").order("created_at", { ascending: false }).limit(8);
  const tiles: [string, number, string, string][] = [
    ["Live auctions", live, "/admin/lots?status=live", "sky"], ["Ending in 24 hours", endingToday, "/admin/lots?status=live", "tangerine"],
    ["Referred to sellers", referred, "/admin/sales", "sun"], ["Offers to decide", offers, "/admin/sales", "sun"],
    ["Failed card payments", failed, "/admin/invoices?status=payment_failed", "berry"], ["Balances due", balance, "/admin/invoices?status=deposit_paid", "lilac"], ["Transfers to check", transfers, "/admin/transfers?status=submitted", "sky"],
    ["New appraisals", appraisals, "/admin/appraisals", "lime"], ["Mobile inspections to arrange", inspections, "/admin/leads?kind=inspection", "mint"], ["Videos to approve", videos, "/admin/videos", "grape"], ["New finance & insurance leads", leads, "/admin/leads", "lime"],
    ["Open reports", reports, "/admin/reports", "coral"], ["Transport quotes", quotes, "/admin/quotes", "sky"], ["Collections to confirm", collections, "/admin/collections", "sun"], ["Open claims", claims, "/admin/claims", "coral"], ["Questions to answer", questions, "/admin/questions", "sky"], ["Payouts ready", payouts, "/admin/payouts", "mint"], ["Contact messages", messages, "/admin/messages", "panel"], ["Draft listings", drafts, "/admin/lots?status=draft", "panel"],
  ];
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <h1 className="d2">Today.</h1>
        <Link className="btn btn-blue" href="/admin/lots/new">List a vehicle</Link>
      </div>
      <div className="four">
        {tiles.map(([label, n, href, bg]) => (
          <Link key={label} href={href} className={`tile ${bg === "panel" ? "" : `bg-${bg}`}`} style={{ padding: 22, background: bg === "panel" ? "var(--panel)" : undefined }}>
            <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>{n}</span><b>{label}</b>
          </Link>
        ))}
      </div>
      <div className="admin-card">
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Latest sales</h2>
        <table className="table"><thead><tr><th>Invoice</th><th>Vehicle</th><th>Total</th><th>Status</th><th>When</th></tr></thead>
          <tbody>{(recent || []).map((r: { ref: string; total: number; status: string; created_at: string; lots: { title: string } | { title: string }[] | null }) => (
            <tr key={r.ref}><td>{r.ref}</td><td>{Array.isArray(r.lots) ? r.lots[0]?.title : r.lots?.title}</td><td>{money(r.total, true)}</td><td>{r.status.replace("_", " ")}</td><td>{dateTime(r.created_at)}</td></tr>
          ))}</tbody></table>
      </div>
      <p className="hint">The auction clock runs every minute: it closes auctions, charges winners and sends alerts.</p>
    </>
  );
}
