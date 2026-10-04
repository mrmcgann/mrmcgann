import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

// A seller's own report: every vehicle they've listed with us, how it went and what they were paid.
// Read with their own session, so row-level security keeps it to their vehicles.
export async function GET() {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: lots } = await db.from("lots").select("id, title, status, bid_count, current_bid, sold_price, sold_via, ends_at, views").eq("seller_id", user.id).order("id");
  const { data: pays } = await db.from("seller_payouts").select("lot_id, sale_price, seller_fee, fee_gst, lender_payout, other_deductions, net_amount, status, paid_at");
  const rows = (lots || []).map((l) => {
    const p = pays?.find((x) => x.lot_id === l.id);
    return [l.id, l.title, l.status, l.bid_count, l.current_bid, l.sold_price, l.sold_via, l.ends_at ? new Date(l.ends_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }) : "", l.views,
      p?.sale_price, p?.seller_fee, p?.fee_gst, p?.lender_payout, p?.other_deductions, p?.net_amount, p?.status, p?.paid_at ? new Date(p.paid_at).toLocaleDateString("en-AU") : ""];
  });
  return csvResponse("tyrebiter-my-vehicles.csv", toCsv(["Lot", "Vehicle", "Status", "Bids", "Highest bid", "Sold price", "Sold by", "Closed (Brisbane)", "Views", "Sale price", "Seller fee", "GST on fee", "Paid to lender", "Other deductions", "Paid to you", "Payout status", "Paid on"], rows));
}
