import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { consumerRights, type SellerType } from "@/lib/listing";
import { afterWarrantyLine, coolingLine, stateTime, STATE_NAMES, type AfterOffer, type AfterRule } from "@/lib/afterAuction";

const INK = rgb(0.114, 0.114, 0.122);
const MUTED = rgb(0.43, 0.43, 0.45);
const BLUE = rgb(0.184, 0.357, 1);
const aud = (n: number | null | undefined) => `$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" }) : "");
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "long", timeStyle: "short" }) : "");
// A sale made after the auction (migration 26): its offer, as the buyer signed it.
type AfterSale = Pick<AfterOffer, "warranty" | "warranty_text" | "cooling_off_until" | "rule" | "signed_name" | "accepted_at" | "state">;
async function afterSaleOf(invoiceId: string): Promise<AfterSale | null> {
  const { data } = await supabaseAdmin().from("second_chance_offers").select("warranty, warranty_text, cooling_off_until, rule, signed_name, accepted_at, state")
    .eq("invoice_id", invoiceId).eq("kind", "after_auction").maybeSingle();
  return (data as AfterSale | null) || null;
}
// Standard PDF fonts only cover Western characters; keep text within that set.
// The notice every buyer gets with their paperwork: how it was sold, the statutory warranty statement, the PPSR search.
function buyerNotice(lot: Record<string, unknown>, after?: AfterSale | null) {
  const ppsr = lot.ppsr_checked_at ? ` We searched the PPSR on ${day(String(lot.ppsr_checked_at))}${lot.ppsr_cert_no ? ` (search certificate ${lot.ppsr_cert_no})` : ""}; any finance it showed is paid out of the sale.` : "";
  if (after) {
    const rule = after.rule as AfterRule | null;
    const cool = rule && rule.cooling_days > 0
      ? (after.cooling_off_until ? `Your cooling-off period ended ${stateTime(after.cooling_off_until, rule.tz, rule.state)}.` : "")
      : (rule?.cooling_law || "No cooling-off period applies.");
    return `Notice to the buyer: this vehicle was sold after the auction, by agreement (not by auction), by ${env.legalName} as agent for its owner, under the written offer you signed. ${afterWarrantyLine(after)} ${cool}${ppsr} The odometer reading is as indicated on the dash; we can't verify the true distance.`;
  }
  const warranty = lot.statutory_warranty === true ? "A statutory warranty applies to this sale: its details are with your paperwork." : "No statutory warranty applies to this sale, and no dealer guarantee or duty to repair applies unless it says otherwise above.";
  return `Notice to the buyer: this vehicle was sold by auction, at the fall of the hammer in a live online auction run by a licensed auctioneer, by ${env.legalName} as agent for its owner. ${warranty}${ppsr} The odometer reading is as indicated on the dash; we can't verify the true distance. No cooling-off period applies.`;
}
const soldBy = (via: string | null | undefined) => via === "buy_now" ? "Buy Now" : via === "offer" ? "Accepted offer" : via === "after_auction" ? "After the auction, by agreement" : "Live online auction, at the fall of the hammer";
const safe = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF·]/g, "");

class Sheet {
  y = 790;
  constructor(public page: PDFPage, public font: PDFFont, public bold: PDFFont) {}
  text(t: unknown, x: number, size = 10, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; right?: number } = {}) {
    const f = opts.bold ? this.bold : this.font;
    const s = safe(t);
    const px = opts.right != null ? opts.right - f.widthOfTextAtSize(s, size) : x;
    this.page.drawText(s, { x: px, y: this.y, size, font: f, color: opts.color || INK });
  }
  line(gap = 14) { this.y -= gap; }
  rule() { this.page.drawLine({ start: { x: 50, y: this.y + 6 }, end: { x: 545, y: this.y + 6 }, thickness: 0.6, color: rgb(0.85, 0.85, 0.87) }); this.line(10); }
  wrap(t: unknown, x: number, width: number, size = 9, color = MUTED) {
    const words = safe(t).split(/\s+/);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (this.font.widthOfTextAtSize(next, size) > width) { this.text(cur, x, size, { color }); this.line(size + 3); cur = w; }
      else cur = next;
    }
    if (cur) { this.text(cur, x, size, { color }); this.line(size + 3); }
  }
  row(label: string, value: string, opts: { bold?: boolean } = {}) {
    this.text(label, 50, 10, { bold: opts.bold });
    this.text(value, 0, 10, { bold: opts.bold, right: 545 });
    this.line(16);
  }
}

async function newSheet() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const sheet = new Sheet(page, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  sheet.text("Tyrebiter", 50, 22, { bold: true });
  sheet.text(".", 50 + sheet.bold.widthOfTextAtSize("Tyrebiter", 22), 22, { bold: true, color: BLUE });
  sheet.text(`${env.legalName}  ·  ABN ${env.abn}`, 0, 9, { color: MUTED, right: 545 });
  sheet.line(12);
  sheet.text(env.address, 0, 9, { color: MUTED, right: 545 });
  sheet.line(12);
  sheet.text(`${env.phone}  ·  ${env.supportEmail}`, 0, 9, { color: MUTED, right: 545 });
  sheet.line(34);
  return { doc, sheet };
}

// Tax invoice for a buyer (our fees are taxable supplies; the vehicle is sold as the seller's agent).
export async function invoicePdf(invoiceId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("*, lots(title, vin, rego_plate, rego_state, suburb, state, gst_status, statutory_warranty, ppsr_checked_at, ppsr_cert_no)").eq("id", invoiceId).maybeSingle();
  if (!inv) return null;
  const { data: buyer } = await db.from("profiles").select("first_name, last_name, street, suburb, state, postcode, email, company_name, abn").eq("id", inv.buyer_id).single();
  const lot = inv.lots || {};
  const { doc, sheet: s } = await newSheet();

  s.text("Tax invoice", 50, 26, { bold: true }); s.line(26);
  s.text(`Invoice ${inv.ref}`, 50, 11, { bold: true }); s.text(`Issued ${day(inv.created_at)}`, 0, 10, { right: 545 }); s.line(24);

  s.text("Billed to", 50, 9, { color: MUTED }); s.text("Vehicle", 300, 9, { color: MUTED }); s.line(14);
  const biz = (inv.buyer_business as { name?: string | null; abn?: string | null } | null) || { name: buyer?.company_name, abn: buyer?.abn };
  const left = [biz.name, `${buyer?.first_name || ""} ${buyer?.last_name || ""}`.trim(), biz.abn ? `ABN ${biz.abn}` : null, buyer?.street, [buyer?.suburb, buyer?.state, buyer?.postcode].filter(Boolean).join(" "), buyer?.email].filter(Boolean);
  const right = [lot.title, `Lot ${inv.lot_id}`, lot.vin ? `VIN ${lot.vin}` : null, lot.rego_plate ? `Rego ${lot.rego_plate} (${lot.rego_state || ""})` : null, `Collect from our depot in ${lot.suburb || ""}, ${lot.state || ""}`, `Sold by ${inv.sold_via === "buy_now" ? "Buy Now" : inv.sold_via === "auction" ? "live auction" : inv.sold_via === "after_auction" ? "agreement after the auction" : inv.sold_via}`].filter(Boolean);
  const after = inv.sold_via === "after_auction" ? await afterSaleOf(invoiceId) : null;
  for (let i = 0; i < Math.max(left.length, right.length); i++) { if (left[i]) s.text(left[i], 50, 10); if (right[i]) s.text(right[i], 300, 10); s.line(14); }
  s.line(14); s.rule();

  const privateSale = lot.gst_status !== "inc";
  s.row(`Vehicle price (sold as agent for the seller${privateSale ? ", private sale, no GST" : ""})`, aud(inv.price));
  if (!privateSale) s.row("   includes GST on the vehicle (seller is GST-registered)", aud(inv.vehicle_gst));
  s.row(Number(inv.transport) > 0 ? `Buyer's premium (includes ${aud(inv.transport)} transport to our depot)` : "Buyer's premium", aud(inv.premium));
  s.row("GST on buyer's premium", aud(inv.gst));
  s.row("Administration fee (includes GST)", aud(inv.admin_fee));
  if (Number(inv.surcharge) > 0) s.row("Card surcharge", aud(inv.surcharge));
  if (Number(inv.storage_fee) > 0) s.row("Storage", aud(inv.storage_fee));
  s.rule();
  const total = Number(inv.total) + Number(inv.storage_fee || 0);
  s.row("Total (AUD)", aud(total), { bold: true });
  const gstTotal = Number(inv.gst) + Math.round(Number(inv.admin_fee) / 11 * 100) / 100 + Number(inv.vehicle_gst || 0);
  s.row("Total GST included", aud(gstTotal));
  s.line(10);

  s.text("Payment", 50, 12, { bold: true }); s.line(18);
  const paidCard = ["paid", "deposit_paid"].includes(inv.status);
  const bank = inv.pay_method === "bank";
  const fromDeposit = Number(inv.deposit_applied ?? 0);
  if (!bank || fromDeposit > 0) s.row(bank ? "From your bidding deposit" : inv.mode === "card" ? "Charged to your card" : "Deposit charged to your card", `${aud(bank ? fromDeposit : inv.card_amount)}${paidCard ? `  (${day(inv.paid_at)})` : "  (not yet paid)"}`);
  if (inv.mode === "deposit" && Number(inv.balance_due) > 0) {
    const balancePaid = inv.status === "paid";
    s.row(bank ? (fromDeposit > 0 ? "Balance by PayID or bank transfer" : "By PayID or bank transfer") : "Balance by bank transfer", `${aud(inv.balance_due)}${balancePaid ? `  (received ${day(inv.balance_paid_at)})` : `  (due ${day(inv.due_at)})`}`);
    if (!balancePaid) {
      s.line(4);
      s.wrap(`Pay to ${env.bankName}, BSB ${env.bankBsb}, account ${env.bankAccount}${env.payId ? `, or PayID ${env.payId}` : ""}. Reference ${inv.ref}. We never change these details by email or SMS. Call ${env.phone} to confirm before you pay.`, 50, 495);
    }
  }
  s.row("Status", inv.status === "paid" ? "PAID IN FULL" : inv.status === "deposit_paid" ? (bank ? (fromDeposit > 0 ? "Deposit applied, balance due" : "Payment due") : "Deposit paid, balance due") : inv.status.replace("_", " "), { bold: true });
  s.line(10); s.rule();
  s.wrap(`Tyrebiter sells this vehicle as agent for the seller, as is, where is, under our Terms of Sale (tyrebiter.com.au/terms). The vehicle price is held in our trust account and paid to the seller. The buyer's premium (which includes the transport from the seller to our depot) and administration fee are taxable supplies made by ${env.legalName}. Where the seller is GST-registered, the vehicle price includes GST and this tax invoice covers the vehicle too: we're treated as its supplier under Subdivision 153-B of the GST Act.`, 50, 495, 8);
  s.line(4);
  s.wrap(buyerNotice(lot, after), 50, 495, 8);

  return { bytes: await doc.save(), filename: `Tyrebiter-${inv.ref}.pdf` };
}

// Certificate of sale: the buyer's proof that they own the vehicle. For an unregistered vehicle it's
// the ownership record (a bill of sale from the auction house); for a registered one it goes with the
// transfer of registration.
export async function saleCertificatePdf(invoiceId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("id, ref, lot_id, buyer_id, price, sold_via, status, paid_at, lots(title, year, make, model, variant, body, colour, vin, engine_no, rego_plate, rego_state, rego_expiry, registration, odometer, hours, suburb, state, statutory_warranty, ppsr_checked_at, ppsr_cert_no)").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.status !== "paid") return null;
  const lot = (inv.lots || {}) as unknown as Record<string, string | number | null>;
  const [{ data: buyer }, { data: t }] = await Promise.all([
    db.from("profiles").select("first_name, last_name, street, suburb, state, postcode, company_name, abn").eq("id", inv.buyer_id).single(),
    db.from("ownership_transfers").select("registration, buyer_choice, transport, status, completed_at").eq("invoice_id", invoiceId).maybeSingle(),
  ]);
  const after = inv.sold_via === "after_auction" ? await afterSaleOf(invoiceId) : null;
  const { doc, sheet: s } = await newSheet();
  s.text("Certificate of sale", 50, 26, { bold: true }); s.line(26);
  s.text(`Sale ${inv.ref}  ·  Lot ${inv.lot_id}`, 50, 11, { bold: true }); s.text(`Paid in full ${day(inv.paid_at)}`, 0, 10, { right: 545 }); s.line(26);

  s.text("Buyer (new owner)", 50, 9, { color: MUTED }); s.line(14);
  for (const l of [buyer?.company_name ? `${buyer.company_name}${buyer.abn ? ` (ABN ${buyer.abn})` : ""}` : null, `${buyer?.first_name || ""} ${buyer?.last_name || ""}`.trim(), buyer?.street, [buyer?.suburb, buyer?.state, buyer?.postcode].filter(Boolean).join(" ")].filter(Boolean)) { s.text(l, 50, 11); s.line(15); }
  s.line(6);
  s.text("Seller", 50, 9, { color: MUTED }); s.line(14);
  s.text(`${env.legalName}, as agent for the owner`, 50, 11); s.line(15);
  s.line(10); s.rule();

  s.text("Vehicle", 50, 12, { bold: true }); s.line(18);
  const unreg = (t?.registration || lot.registration) !== "registered";
  const rows: [string, unknown][] = [
    ["Description", lot.title], ["Year, make, model", [lot.year, lot.make, lot.model, lot.variant].filter(Boolean).join(" ")], ["Body and colour", [lot.body, lot.colour].filter(Boolean).join(", ")],
    ["VIN / chassis number", lot.vin || "Not recorded"], ["Engine number", lot.engine_no || "Not recorded"],
    [unreg ? "Previous registration" : "Registration", lot.rego_plate ? `${lot.rego_plate} (${lot.rego_state || ""})` : unreg ? "None" : ""],
    ["Registration status", unreg || t?.buyer_choice === "unregistered" ? "Sold unregistered, without plates" : `Registered${lot.rego_expiry ? `, expires ${day(String(lot.rego_expiry))}` : ""}. To be transferred to the buyer.`],
    [lot.hours != null ? "Hours (as indicated)" : "Odometer (as indicated)", lot.hours != null ? `${Number(lot.hours).toLocaleString("en-AU")} hours` : lot.odometer != null ? `${Number(lot.odometer).toLocaleString("en-AU")} km` : "Not recorded"],
    ["Sale price", aud(Number(inv.price))], ["Sold by", soldBy(inv.sold_via)],
    ["Statutory warranty", after ? (after.warranty ? "Applies (see your contract)" : "None") : (lot.statutory_warranty as unknown) === true ? "Applies (see your paperwork)" : "None"], ["Collected from", `Our depot in ${lot.suburb || ""}, ${lot.state || ""}`],
  ];
  for (const [k, v] of rows) s.row(k, safe(v));
  s.line(10); s.rule();
  s.wrap(`${env.legalName} sold this vehicle as agent for its owner under our Terms of Sale (tyrebiter.com.au/terms), and has received payment in full. Ownership passes to the buyer named above. ${unreg ? "The vehicle is unregistered and must not be driven on a road without a permit; move it by carrier or trailer, or under a permit from the state transport authority. To register it, the new owner applies to their state transport authority with this certificate and any inspection that state requires." : "The registration is transferred to the buyer through the state transport authority before collection."} Keep this certificate with the vehicle's papers.`, 50, 495, 9);
  s.line(4);
  s.wrap(buyerNotice(lot, after), 50, 495, 8);
  s.line(8);
  s.wrap(`Issued ${day(new Date().toISOString())}. Check it at ${env.siteUrl.replace(/^https?:\/\//, "")} or call ${env.phone}, quoting ${inv.ref}.`, 50, 495, 8);
  return { bytes: await doc.save(), filename: `Tyrebiter-certificate-of-sale-${inv.ref}.pdf` };
}

// Settlement statement for a seller.
export async function statementPdf(payoutId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const db = supabaseAdmin();
  const { data: p } = await db.from("seller_payouts").select("*, lots(title, vin), invoices(ref, created_at, collected_at)").eq("id", payoutId).maybeSingle();
  if (!p) return null;
  const { data: seller } = p.seller_id ? await db.from("profiles").select("first_name, last_name, email").eq("id", p.seller_id).single() : { data: null };
  const { doc, sheet: s } = await newSheet();
  s.text("Settlement statement", 50, 24, { bold: true }); s.line(26);
  s.text(`${p.lots?.title || ""}  ·  Lot ${p.lot_id}`, 50, 11, { bold: true }); s.line(16);
  if (p.lots?.vin) { s.text(`VIN ${p.lots.vin}`, 50, 10); s.line(14); }
  s.text(`Seller: ${seller ? `${seller.first_name || ""} ${seller.last_name || ""}` : ""}`, 50, 10); s.line(14);
  s.text(`Sale invoice ${p.invoices?.ref || ""} · sold ${day(p.invoices?.created_at)} · collected ${day(p.invoices?.collected_at) || "not yet"}`, 50, 10); s.line(24);
  s.rule();
  const forfeit = p.kind === "forfeit";
  s.row(forfeit ? "Deposit or cancellation fee the buyer forfeited" : "Sale price", aud(p.sale_price));
  if (!forfeit) {
    s.row("Less seller fee", `-${aud(p.seller_fee)}`);
    s.row("Less GST on seller fee", `-${aud(p.fee_gst)}`);
  }
  if (Number(p.lender_payout) > 0) s.row(`Less finance paid out to ${p.lender_name || "your lender"}${p.lender_ref ? ` (ref ${p.lender_ref})` : ""}`, `-${aud(p.lender_payout)}`);
  if (Number(p.other_deductions) > 0) s.row(`Less ${p.deductions_note || "other agreed costs"}`, `-${aud(p.other_deductions)}`);
  s.rule();
  s.row("Net amount to you", aud(p.net_amount), { bold: true });
  s.row("Status", p.status === "paid" ? `Paid ${day(p.paid_at)}${p.payment_ref ? ` · ref ${p.payment_ref}` : ""}` : p.status === "on_hold" ? `On hold: ${p.hold_reason || ""}` : p.status === "ready" ? "Ready to pay" : "Waiting for collection and the buyer's claim window");
  s.line(10);
  s.wrap(`Paid under your Seller Agency Agreement with ${env.legalName}. GST on our fee is a taxable supply by us; this statement is a tax invoice for that fee.`, 50, 495, 8);
  return { bytes: await doc.save(), filename: `Tyrebiter-settlement-${p.lot_id}.pdf` };
}

// The Seller Agency Agreement as the seller signed it on the sell form: what they told us, every clause, and their
// drawn signature (or typed name), with the date and time. Emailed to the seller and kept privately for staff.
export async function sellerAgreementPdf(o: {
  ref: string; version: string; signedName: string; signedAt: string; signature: { w: number; h: number; strokes: number[][] } | null;
  facts: [string, string][]; clauses: [string, string, string[]][];
}): Promise<Uint8Array> {
  const { doc, sheet } = await newSheet();
  let s = sheet;
  const fresh = () => {
    const page = doc.addPage([595.28, 841.89]);
    s = new Sheet(page, s.font, s.bold);
    s.text(`Seller Agency Agreement · ${o.ref}`, 50, 9, { color: MUTED });
    s.line(24);
  };
  const room = (h: number) => { if (s.y - h < 56) fresh(); };
  const strip = (t: string) => t.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
  const para = (t: string, size = 9, color = MUTED, x = 50, width = 495) => {
    const words = safe(strip(t)).split(/\s+/);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (s.font.widthOfTextAtSize(next, size) > width) { room(size + 3); s.text(cur, x, size, { color }); s.line(size + 3); cur = w; } else cur = next;
    }
    if (cur) { room(size + 3); s.text(cur, x, size, { color }); s.line(size + 3); }
  };
  s.text("Seller Agency Agreement", 50, 22, { bold: true }); s.line(18);
  s.text(`${o.version}  ·  Reference ${o.ref}`, 50, 10, { color: MUTED }); s.line(24);
  s.text("What you told us", 50, 12, { bold: true }); s.line(16);
  for (const [k, v] of o.facts) {
    room(14);
    s.text(k, 50, 9, { color: MUTED });
    const val = safe(v);
    const fits = s.font.widthOfTextAtSize(val, 9) <= 330;
    if (fits) { s.text(val, 215, 9); s.line(13); } else { s.line(12); para(val, 9, INK, 215, 330); }
  }
  s.line(8);
  for (const [, title, paras] of o.clauses) {
    room(30);
    s.line(4);
    s.text(title, 50, 11, { bold: true }); s.line(15);
    for (const p of paras) { para(p); s.line(3); }
  }
  room(150);
  s.line(10); s.rule();
  s.text("Signed", 50, 12, { bold: true }); s.line(16);
  if (o.signature) {
    const scale = Math.min(240 / o.signature.w, 80 / o.signature.h);
    const top = s.y;
    for (const st of o.signature.strokes) {
      if (st.length < 4) continue;
      let d = "";
      for (let i = 0; i < st.length; i += 2) d += `${i ? " L" : "M"} ${(st[i] * scale).toFixed(1)} ${(st[i + 1] * scale).toFixed(1)}`;
      s.page.drawSvgPath(d, { x: 50, y: top, borderColor: INK, borderWidth: 1.4 });
    }
    s.line(80 + 8);
  }
  s.text(`${o.signedName}`, 50, 11, { bold: true }); s.line(14);
  s.text(`Signed electronically on ${new Date(o.signedAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "long", timeStyle: "short" })} (Brisbane time).`, 50, 9, { color: MUTED }); s.line(12);
  para("Before your vehicle goes live we verify your identity, and you confirm this agreement on your agreement page with your verified name. Keep this copy for your records.", 8);
  return doc.save();
}

// The written contract for a sale after the auction (migration 26): the offer the seller agreed to, which the buyer
// signs on the offer page. It carries what the states ask a dealer's written contract to say: who we are and our
// licences, the vehicle, the price and every charge, the cooling-off period, the statutory warranty and where a repair
// goes, the buyer's rights (and that a waiver of them is void), and the state's own forms that come with it.
export async function afterSaleContractPdf(offerId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const db = supabaseAdmin();
  const { data: o } = await db.from("second_chance_offers").select("*").eq("id", offerId).eq("kind", "after_auction").maybeSingle();
  if (!o) return null;
  const [{ data: lot }, { data: buyer }, { data: price }, { data: rows }] = await Promise.all([
    db.from("lots").select("id, title, year, make, model, variant, body, colour, vin, engine_no, rego_plate, rego_state, rego_expiry, registration, odometer, hours, suburb, state, seller_type, gst_status, ppsr_checked_at, ppsr_cert_no").eq("id", o.lot_id).maybeSingle(),
    db.from("profiles").select("first_name, last_name, street, suburb, state, postcode, email, company_name, abn").eq("id", o.user_id).maybeSingle(),
    db.rpc("lot_price_breakdown", { p_lot: o.lot_id, p_price: o.amount }),
    db.from("settings").select("key, value").in("key", ["business", "auction", "fees", "selling"]),
  ]);
  if (!lot) return null;
  const { legalValues } = await import("@/content/legal");
  const v = legalValues(Object.fromEntries(((rows || []) as { key: string; value: Record<string, unknown> }[]).map((r) => [r.key, r.value])));
  const b = (price || {}) as Record<string, number>;
  const rule = (o.rule || null) as AfterRule | null;
  const st = String(o.state || rule?.state || lot.state || "");
  const docs = (o.docs || []) as { name: string }[];
  const ref = `TB-OFFER-${String(o.id).slice(0, 8).toUpperCase()}`;

  const { doc, sheet } = await newSheet();
  let s = sheet;
  const fresh = () => { const page = doc.addPage([595.28, 841.89]); s = new Sheet(page, s.font, s.bold); s.text(`Contract of sale · ${ref}`, 50, 9, { color: MUTED }); s.line(24); };
  const room = (h: number) => { if (s.y - h < 56) fresh(); };
  const para = (t: string, size = 9, color = MUTED) => {
    const words = safe(t).split(/\s+/);
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (s.font.widthOfTextAtSize(next, size) > 495) { room(size + 3); s.text(cur, 50, size, { color }); s.line(size + 3); cur = w; } else cur = next;
    }
    if (cur) { room(size + 3); s.text(cur, 50, size, { color }); s.line(size + 3); }
  };
  const head = (t: string) => { room(34); s.line(6); s.text(t, 50, 12, { bold: true }); s.line(16); };
  const row = (k: string, val: string, bold = false) => { room(16); s.row(k, safe(val), { bold }); };

  s.text("Contract of sale", 50, 24, { bold: true }); s.line(20);
  s.text(`After the auction, by agreement  ·  ${ref}`, 50, 10, { color: MUTED }); s.line(10);

  head("The parties");
  para(`Seller: ${env.legalName} (ABN ${env.abn}), licensed as ${v.LICENCES}, ${env.address}, as agent for the owner of the vehicle. We don't name the owner, to protect their privacy; we're responsible to you for this sale as these terms say.`, 9, INK);
  s.line(2);
  const who = [buyer?.company_name ? `${buyer.company_name}${buyer.abn ? ` (ABN ${buyer.abn})` : ""}` : null, `${buyer?.first_name || ""} ${buyer?.last_name || ""}`.trim(),
    [buyer?.street, buyer?.suburb, buyer?.state, buyer?.postcode].filter(Boolean).join(" "), buyer?.email].filter(Boolean).join(", ");
  para(`Buyer: ${who}.`, 9, INK);

  head("The vehicle");
  const unreg = lot.registration !== "registered";
  row("Description", lot.title);
  row("Year, make, model", [lot.year, lot.make, lot.model, lot.variant].filter(Boolean).join(" "));
  if (lot.body || lot.colour) row("Body and colour", [lot.body, lot.colour].filter(Boolean).join(", "));
  row("VIN / chassis number", lot.vin || "Not recorded");
  row("Engine number", lot.engine_no || "Not recorded");
  row("Registration", unreg ? "Unregistered: sold without plates" : `${lot.rego_plate || ""} (${lot.rego_state || ""})${lot.rego_expiry ? `, expires ${day(lot.rego_expiry)}` : ""}`);
  row(lot.hours != null ? "Hours (as indicated)" : "Odometer (as indicated)", lot.hours != null ? `${Number(lot.hours).toLocaleString("en-AU")} hours` : lot.odometer != null ? `${Number(lot.odometer).toLocaleString("en-AU")} km` : "Not recorded");
  row("Collect it from", `Our depot in ${lot.suburb || ""}, ${lot.state || ""}`);
  if (lot.ppsr_checked_at) row("PPSR search", `${day(lot.ppsr_checked_at)}${lot.ppsr_cert_no ? `, certificate ${lot.ppsr_cert_no}` : ""}`);

  head("The price");
  const privateSale = lot.gst_status !== "inc";
  row(`Vehicle price${privateSale ? " (private sale, no GST)" : " (includes GST)"}`, aud(o.amount));
  row(Number(b.transport) > 0 ? `Buyer's premium (includes ${aud(b.transport)} transport to our depot)` : "Buyer's premium", aud(b.premium));
  row("GST on the buyer's premium", aud(b.gst));
  row("Administration fee (includes GST)", aud(b.admin_fee));
  row("All-in price", aud(b.total), true);
  para("There's no surcharge, deposit or other charge. Transfer fees and stamp duty for the registration are paid by you to the state, as for any vehicle you buy.");

  head("How it's sold");
  para(`After the auction, by agreement (private treaty), not by auction. The owner agreed to sell for this price in writing after the auction. ${o.consultant || "Our consultant"} made this offer for ${env.legalName} on ${when(o.created_at)} (Brisbane time), open until ${when(o.expires_at)}. The contract is made when you sign it on the offer page, by typing your name; you get this copy as signed.`, 9, INK);

  head("Cooling-off");
  if (rule && rule.cooling_days > 0 && o.cooling_off_until) {
    para(`You can change your mind until ${stateTime(o.cooling_off_until, rule.tz, rule.state)}: cancel on the offer page, free. Nothing is invoiced or taken before then. ${rule.cooling_law || ""}`, 9, INK);
  } else {
    para(coolingLine(rule, null) || "No cooling-off period applies.", 9, INK);
    if (rule && rule.cooling_days > 0) para(`It's worked out in ${STATE_NAMES[st] || st} time and starts when you sign. Nothing is invoiced or taken before it ends, and cancelling is free.`);
  }

  head("Statutory warranty");
  para(afterWarrantyLine(o), 9, INK);
  if (o.warranty) para(`For a repair under it, call us on ${env.phone} or email ${env.supportEmail}, quoting ${ref}: we arrange it, and the vehicle may be delivered for repair to any of our business premises (our depots), or wherever we agree with you.`);

  head("Your consumer rights");
  para(consumerRights("after", (lot.seller_type as SellerType | null) ?? null), 9, INK);
  para("Any term of this contract or our terms that purports to exclude, restrict or waive a right you have under your state's motor dealer laws or the Australian Consumer Law is void, unless that law allows it.");

  head("Payment, transfer and collection");
  para(`Once the sale is final (when you sign, or when your cooling-off period ends), we email your tax invoice. Pay the all-in price by PayID or bank transfer within ${v.PAY_DAYS} business days, quoting the invoice number, from an account in your name (or your lender pays us). We never change our bank details by email or text. Ownership passes to you when we receive full payment. Then our transport partner brings the vehicle to the depot, the registration is transferred into your name, and you collect it with a release code. Our Terms of Sale (tyrebiter.com.au/terms) apply to this sale as they do to a sale by auction, except where this contract or your state's law says otherwise.`);

  head("Paperwork with this contract");
  para(docs.length ? docs.map((d, i) => `${i + 1}. ${d.name}`).join("   ") : `None: in ${STATE_NAMES[st] || st || "this state"}, this contract is the paperwork.`, 9, INK);

  head("Signed");
  para(`For ${env.legalName}: ${o.consultant || ""}, ${when(o.created_at)} (Brisbane time).`, 9, INK);
  if (o.signed_name && o.accepted_at) para(`Buyer: ${o.signed_name}, signed electronically on ${when(o.accepted_at)} (Brisbane time), under terms version ${o.terms_version || ""}.`, 9, INK);
  else para("Buyer: not signed yet. Sign on the offer page to accept.", 9, INK);
  s.line(6);
  para("Keep this copy with the vehicle's papers.", 8);
  return { bytes: await doc.save(), filename: `Tyrebiter-contract-${ref}.pdf` };
}
