import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { toCsv, csvResponse } from "@/lib/csv";

// End-of-sale report for a fleet sale (staff): every vehicle, its result, the fees and the payout.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await getSession();
  if (profile?.role !== "admin") return new Response("Admins only", { status: 403 });
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: sale } = await db.from("sales").select("id, slug, title").eq("id", Number(id)).maybeSingle();
  if (!sale) return new Response("Not found", { status: 404 });
  const { data: lots } = await db.from("lots").select("id, title, vin, rego_plate, status, bid_count, current_bid, sold_price, sold_via, ends_at, views").eq("sale_id", sale.id).order("id");
  const ids = (lots || []).map((l) => l.id);
  const [{ data: priv }, { data: invs }, { data: pays }] = await Promise.all([
    db.from("lot_private").select("lot_id, reserve_price").in("lot_id", ids.length ? ids : [0]),
    db.from("invoices").select("lot_id, ref, status, premium, admin_fee, total").in("lot_id", ids.length ? ids : [0]).neq("status", "cancelled"),
    db.from("seller_payouts").select("lot_id, status, net_amount").in("lot_id", ids.length ? ids : [0]),
  ]);
  const rows = (lots || []).map((l) => {
    const pr = priv?.find((x) => x.lot_id === l.id);
    const inv = invs?.find((x) => x.lot_id === l.id);
    const pay = pays?.find((x) => x.lot_id === l.id);
    return [l.id, l.title, l.vin, l.rego_plate, l.status, l.bid_count, l.current_bid, l.sold_price, l.sold_via, pr?.reserve_price ?? "",
      l.ends_at ? new Date(l.ends_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }) : "", l.views, inv?.ref, inv?.status, inv?.premium, inv?.admin_fee, inv?.total, pay?.status, pay?.net_amount];
  });
  return csvResponse(`${sale.slug}-report.csv`, toCsv(["Lot", "Vehicle", "VIN", "Rego", "Status", "Bids", "Highest bid", "Sold price", "Sold by", "Reserve", "Closed (Brisbane)", "Views", "Invoice", "Invoice status", "Buyer's premium", "Admin fee", "Buyer total", "Payout status", "Payout"], rows));
}
