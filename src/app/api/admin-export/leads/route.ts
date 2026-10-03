import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Quote anything with commas, quotes or line breaks, and stop spreadsheet formulas (=, +, -, @, tab, CR).
const cell = (v: unknown) => {
  let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
};

// Leads as a spreadsheet (for invoicing partners).
export async function GET(req: Request) {
  const { profile } = await getSession();
  if (profile?.role !== "admin") return new Response("Admins only", { status: 403 });
  const kind = new URL(req.url).searchParams.get("kind");
  let q = supabaseAdmin().from("partner_leads").select("ref, created_at, kind, status, name, email, phone, postcode, lot_id, details, price, revenue, sent_at, partners(name)").order("created_at", { ascending: false }).limit(10000);
  if (kind && ["finance", "insurance", "inspection"].includes(kind)) q = q.eq("kind", kind);
  const { data } = await q;
  const head = ["ref", "created_at", "partner", "kind", "status", "name", "email", "phone", "postcode", "lot_id", "details", "price", "revenue", "sent_at"];
  const rows = (data || []).map((r) => {
    const p = (Array.isArray(r.partners) ? r.partners[0] : r.partners) as { name: string } | null;
    return [r.ref, r.created_at, p?.name, r.kind, r.status, r.name, r.email, r.phone, r.postcode, r.lot_id, r.details, r.price, r.revenue, r.sent_at].map(cell).join(",");
  });
  return new Response([head.join(","), ...rows].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tyrebiter-leads-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
