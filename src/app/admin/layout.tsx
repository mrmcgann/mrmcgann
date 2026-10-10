import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const NAV = [["/admin", "Dashboard"], ["/admin/insights", "Insights"], ["/admin/seo", "SEO"], ["/admin/health", "Site health"], ["/admin/lots", "Vehicles"], ["/admin/import", "Bulk upload"], ["/admin/sale-events", "Fleet sales"], ["/admin/audits", "Listing audits"], ["/admin/check", "Rego & VIN check"], ["/admin/sales", "Referrals & offers"], ["/admin/invoices", "Invoices"], ["/admin/transfers", "Transfers"], ["/admin/collections", "Collections"], ["/admin/claims", "Claims"], ["/admin/payouts", "Seller payouts"], ["/admin/questions", "Questions"], ["/admin/videos", "Videos"], ["/admin/leads", "Leads"], ["/admin/partners", "Partners"], ["/admin/consultants", "Consultants"], ["/admin/appraisals", "Appraisals"], ["/admin/quotes", "Transport quotes"], ["/admin/messages", "Contact messages"], ["/admin/users", "Members"], ["/admin/reports", "Reports"], ["/admin/newsletter", "Newsletter"], ["/admin/settings", "Fees & settings"]];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  // a red dot on Site health while something is broken
  const { count: broken } = await supabaseAdmin().from("health_checks").select("key", { count: "exact", head: true }).eq("status", "fail");
  return (
    <div className="wrap admin-shell">
      <nav className="side-nav" aria-label="Admin" style={{ display: "flex" }}>
        <span className="h">Tyrebiter admin</span>
        {NAV.map(([href, label]) => <Link key={href} href={href}>{label}{href === "/admin/health" && !!broken && <span className="navdot" aria-label={`${broken} broken`} title={`${broken} broken`} />}</Link>)}
      </nav>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>{children}</div>
    </div>
  );
}
