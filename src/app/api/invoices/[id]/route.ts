import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFeesCached } from "@/lib/cache";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";
import type { Invoice } from "@/lib/types";

type Coll = { id: string; status: string; preferred_day: string; preferred_time: string; confirmed_for: string | null; collector_name: string | null; release_code: string; collected_at: string | null };

// One invoice for the app, with what the website's invoice page shows: the tax invoice
// lines, payment state, collection booking (and the seller's address once confirmed),
// claims, and the bank details for a balance. The buyer's own invoices only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Invoice not found.", 404);
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data } = await db.from("invoices").select("*, lots(title, suburb, state, vin, gst_status, category, backdrop, cover_path)").eq("id", id).eq("buyer_id", user.id).maybeSingle();
  if (!data) return fail("Invoice not found.", 404);
  const inv = data as Invoice & { lots: { title: string; suburb: string; state: string; vin: string | null; gst_status: string; category: string; backdrop: string; cover_path: string | null } };
  const [{ data: coll }, { data: claims }, fees, { data: tr }] = await Promise.all([
    db.from("collections").select("id, status, preferred_day, preferred_time, confirmed_for, collector_name, release_code, collected_at").eq("invoice_id", inv.id).maybeSingle(),
    db.from("claims").select("id, reason, status, resolution, created_at").eq("invoice_id", inv.id).order("created_at", { ascending: false }),
    getFeesCached(),
    db.from("ownership_transfers").select("status, registration, rego_state, buyer_choice, transport, reference, review_note, seller_done_at, proof_paths").eq("invoice_id", inv.id).maybeSingle(),
  ]);
  // Transfer of ownership (between payment and collection); the app shows the same steps as the website.
  const transfer = tr ? { ...tr, proof_paths: undefined, proof_count: (tr.proof_paths || []).length } : null;
  const c = coll as Coll | null;
  let address: string | null = null;
  if (c?.status === "confirmed" || c?.status === "collected") {
    const { data: pr } = await supabaseAdmin().from("lot_private").select("seller_address").eq("lot_id", inv.lot_id).maybeSingle();
    address = pr?.seller_address || null;
  }
  const paidCard = ["paid", "deposit_paid"].includes(inv.status);
  const collectBy = inv.collect_by ? new Date(inv.collect_by) : null;
  const overdueDays = collectBy && !inv.collected_at ? Math.max(0, Math.ceil((Date.now() - collectBy.getTime()) / 86400000)) : 0;
  const claimOpen = (claims || []).some((x: { status: string }) => x.status === "open");
  const canClaim = paidCard && !claimOpen && (!inv.collected_at || (!!inv.claim_until && new Date(inv.claim_until).getTime() > Date.now()));
  const lines: [string, number][] = [
    [inv.sold_via === "buy_now" ? "Buy Now price" : inv.sold_via === "offer" ? "Accepted offer" : "Winning bid", Number(inv.price)],
    ["Buyer's premium", Number(inv.premium)], ["GST on premium", Number(inv.gst)], ["Admin fee (incl. GST)", Number(inv.admin_fee)],
    ...(Number(inv.surcharge) > 0 ? [["Card surcharge", Number(inv.surcharge)] as [string, number]] : []),
    ...(Number(inv.storage_fee) > 0 ? [["Storage", Number(inv.storage_fee)] as [string, number]] : []),
  ];
  const res = json({
    invoice: inv,
    lines,
    total: Number(inv.total) + Number(inv.storage_fee || 0),
    gstTotal: Number(inv.gst) + Math.round((Number(inv.admin_fee) / 11) * 100) / 100 + Number(inv.vehicle_gst || 0),
    transfer,
    certificateUrl: inv.status === "paid" ? `${env.siteUrl}/api/invoices/${inv.id}/certificate` : null,
    collection: c,
    address,
    claims: claims || [],
    canClaim,
    overdueDays,
    storagePerDay: Number(fees.storage_per_day || 50),
    bank: inv.status === "deposit_paid" ? { name: env.bankName, bsb: env.bankBsb, account: env.bankAccount, payId: env.payId || null, reference: inv.ref } : null,
    seller: { legalName: env.legalName, abn: env.abn, phone: env.phone, supportEmail: env.supportEmail },
    pdfUrl: `${env.siteUrl}/api/invoices/${inv.id}/pdf`,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
