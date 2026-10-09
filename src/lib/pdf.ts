import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const INK = rgb(0.114, 0.114, 0.122);
const MUTED = rgb(0.43, 0.43, 0.45);
const BLUE = rgb(0.184, 0.357, 1);
const aud = (n: number | null | undefined) => `$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" }) : "");
// Standard PDF fonts only cover Western characters; keep text within that set.
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
  const { data: inv } = await db.from("invoices").select("*, lots(title, vin, rego_plate, rego_state, suburb, state, gst_status)").eq("id", invoiceId).maybeSingle();
  if (!inv) return null;
  const { data: buyer } = await db.from("profiles").select("first_name, last_name, street, suburb, state, postcode, email, company_name, abn").eq("id", inv.buyer_id).single();
  const lot = inv.lots || {};
  const { doc, sheet: s } = await newSheet();

  s.text("Tax invoice", 50, 26, { bold: true }); s.line(26);
  s.text(`Invoice ${inv.ref}`, 50, 11, { bold: true }); s.text(`Issued ${day(inv.created_at)}`, 0, 10, { right: 545 }); s.line(24);

  s.text("Billed to", 50, 9, { color: MUTED }); s.text("Vehicle", 300, 9, { color: MUTED }); s.line(14);
  const left = [buyer?.company_name, `${buyer?.first_name || ""} ${buyer?.last_name || ""}`.trim(), buyer?.abn ? `ABN ${buyer.abn}` : null, buyer?.street, [buyer?.suburb, buyer?.state, buyer?.postcode].filter(Boolean).join(" "), buyer?.email].filter(Boolean);
  const right = [lot.title, `Lot ${inv.lot_id}`, lot.vin ? `VIN ${lot.vin}` : null, lot.rego_plate ? `Rego ${lot.rego_plate} (${lot.rego_state || ""})` : null, `Located at ${lot.suburb || ""}, ${lot.state || ""}`, `Sold by ${inv.sold_via === "buy_now" ? "Buy Now" : inv.sold_via}`].filter(Boolean);
  for (let i = 0; i < Math.max(left.length, right.length); i++) { if (left[i]) s.text(left[i], 50, 10); if (right[i]) s.text(right[i], 300, 10); s.line(14); }
  s.line(14); s.rule();

  const privateSale = lot.gst_status !== "inc";
  s.row(`Vehicle price (sold as agent for the seller${privateSale ? ", private sale, no GST" : ""})`, aud(inv.price));
  if (!privateSale) s.row("   includes GST on the vehicle (seller is GST-registered)", aud(inv.vehicle_gst));
  s.row("Buyer's premium", aud(inv.premium));
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
  s.row(inv.mode === "card" ? "Charged to your card" : "Deposit charged to your card", `${aud(inv.card_amount)}${paidCard ? `  (${day(inv.paid_at)})` : "  (not yet paid)"}`);
  if (inv.mode === "deposit") {
    const balancePaid = inv.status === "paid";
    s.row("Balance by bank transfer", `${aud(inv.balance_due)}${balancePaid ? `  (received ${day(inv.balance_paid_at)})` : `  (due ${day(inv.due_at)})`}`);
    if (!balancePaid) {
      s.line(4);
      s.wrap(`Pay to ${env.bankName}, BSB ${env.bankBsb}, account ${env.bankAccount}${env.payId ? `, or PayID ${env.payId}` : ""}. Reference ${inv.ref}. We never change these details by email or SMS. Call ${env.phone} to confirm before you pay.`, 50, 495);
    }
  }
  s.row("Status", inv.status === "paid" ? "PAID IN FULL" : inv.status === "deposit_paid" ? "Deposit paid, balance due" : inv.status.replace("_", " "), { bold: true });
  s.line(10); s.rule();
  s.wrap(`Tyrebiter sells this vehicle as agent for the seller, as is, where is, under our Terms of Sale (tyrebiter.com.au/terms). The vehicle price is paid to the seller. The buyer's premium and administration fee are taxable supplies made by ${env.legalName}. Where the seller is GST-registered, the vehicle price includes GST and a separate tax invoice for the vehicle can be issued on the seller's behalf on request.`, 50, 495, 8);

  return { bytes: await doc.save(), filename: `Tyrebiter-${inv.ref}.pdf` };
}

// Certificate of sale: the buyer's proof that they own the vehicle. For an unregistered vehicle it's
// the ownership record (a bill of sale from the auction house); for a registered one it goes with the
// transfer of registration.
export async function saleCertificatePdf(invoiceId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("id, ref, lot_id, buyer_id, price, sold_via, status, paid_at, lots(title, year, make, model, variant, body, colour, vin, engine_no, rego_plate, rego_state, rego_expiry, registration, odometer, hours, suburb, state)").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.status !== "paid") return null;
  const lot = (inv.lots || {}) as unknown as Record<string, string | number | null>;
  const [{ data: buyer }, { data: t }] = await Promise.all([
    db.from("profiles").select("first_name, last_name, street, suburb, state, postcode, company_name, abn").eq("id", inv.buyer_id).single(),
    db.from("ownership_transfers").select("registration, buyer_choice, transport, status, completed_at").eq("invoice_id", invoiceId).maybeSingle(),
  ]);
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
    ["Sale price", aud(Number(inv.price))], ["Sold by", inv.sold_via === "buy_now" ? "Buy Now" : inv.sold_via === "offer" ? "Accepted offer" : "Online auction"], ["Located at", `${lot.suburb || ""}, ${lot.state || ""}`],
  ];
  for (const [k, v] of rows) s.row(k, safe(v));
  s.line(10); s.rule();
  s.wrap(`${env.legalName} sold this vehicle as agent for its owner under our Terms of Sale (tyrebiter.com.au/terms), and has received payment in full. Ownership passes to the buyer named above. ${unreg ? "The vehicle is unregistered and must not be driven on a road without a permit; move it by carrier or trailer, or under a permit from the state transport authority. To register it, the new owner applies to their state transport authority with this certificate and any inspection that state requires." : "The registration is transferred to the buyer through the state transport authority before collection."} Keep this certificate with the vehicle's papers.`, 50, 495, 9);
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
