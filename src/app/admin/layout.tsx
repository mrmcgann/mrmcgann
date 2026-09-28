import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const NAV = [["/admin", "Dashboard"], ["/admin/lots", "Vehicles"], ["/admin/sales", "Referrals & offers"], ["/admin/invoices", "Invoices"], ["/admin/inspections", "Inspections"], ["/admin/appraisals", "Appraisals"], ["/admin/users", "Members"], ["/admin/reports", "Reports"], ["/admin/settings", "Fees & settings"]];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="wrap admin-shell">
      <nav className="side-nav" aria-label="Admin" style={{ display: "flex" }}>
        <span className="h">Tyrebiter admin</span>
        {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>{children}</div>
    </div>
  );
}
