import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { chargeInvoice } from "@/lib/charges";
import { notify } from "@/lib/notify";
import { sendSms } from "@/lib/sms";
import { getStripe, cents } from "@/lib/stripe";
import { money } from "@/lib/format";

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") return fail("Admins only.", 403);
  const b = await req.json();
  const db = supabaseAdmin();

  switch (action) {
    // Seller accepts the referred bid, or a specific offer
    case "accept": {
      const { data: invId, error } = await supabase.rpc("admin_accept", { p_lot: Number(b.lotId), p_offer: b.offerId || null });
      if (error) return fail(error.message);
      await chargeInvoice(invId as string);
      if (b.offerId) {
        const { data: others } = await db.from("offers").select("user_id").eq("lot_id", b.lotId).eq("status", "declined");
        for (const o of others || []) await notify(o.user_id, "account", "Your offer wasn't accepted", "The seller accepted another offer.", `/lot/${b.lotId}`);
      }
      return json({ ok: true });
    }
    case "decline-referral": {
      const { data: lot } = await db.from("lots").select("leader_id, title").eq("id", b.lotId).single();
      const { error } = await supabase.rpc("admin_decline_referral", { p_lot: Number(b.lotId) });
      if (error) return fail(error.message);
      if (lot?.leader_id) await notify(lot.leader_id, "account", `The seller declined your bid on the ${lot.title}`, "You can make a higher offer while the offer period is open.", `/lot/${b.lotId}`);
      return json({ ok: true });
    }
    case "decline-offer": {
      const { data: o } = await db.from("offers").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", b.offerId).select("user_id, lot_id").single();
      if (o) await notify(o.user_id, "account", "Your offer was declined", "You can offer more while the offer period is open.", `/lot/${o.lot_id}`);
      return json({ ok: true });
    }
    // Invoices
    case "retry-charge": {
      await db.from("invoices").update({ status: "pending_charge" }).eq("id", b.invoiceId).eq("status", "payment_failed");
      await chargeInvoice(b.invoiceId);
      return json({ ok: true });
    }
    case "balance-received": {
      await db.from("invoices").update({ status: "paid", balance_paid_at: new Date().toISOString() }).eq("id", b.invoiceId);
      const { data: inv } = await db.from("invoices").select("buyer_id, lot_id, ref").eq("id", b.invoiceId).single();
      if (inv) await notify(inv.buyer_id, "account", `Payment received for ${inv.ref}`, "Your balance has cleared. We'll send the seller's address and book your collection.", `/account/invoices/${b.invoiceId}`);
      return json({ ok: true });
    }
    case "collected":
      await db.from("invoices").update({ collected_at: new Date().toISOString() }).eq("id", b.invoiceId);
      return json({ ok: true });
    case "cancel-invoice": {
      const { data: inv } = await db.from("invoices").select("*").eq("id", b.invoiceId).single();
      if (!inv) return fail("Not found");
      const { data: fees } = await db.from("settings").select("value").eq("key", "fees").single();
      const fee = inv.status === "deposit_paid" ? 0 : inv.total > (fees?.value?.cancel_above ?? 1000) ? (fees?.value?.cancel_fee ?? 250) : 0;
      let feeNote = fee ? ` A ${money(fee)} cancellation fee applies.` : inv.status === "deposit_paid" ? " Your deposit has been kept." : "";
      const stripe = getStripe();
      if (fee && stripe) {
        const { data: buyer } = await db.from("profiles").select("stripe_customer_id, payment_method_id").eq("id", inv.buyer_id).single();
        try {
          if (buyer?.stripe_customer_id && buyer.payment_method_id) {
            await stripe.paymentIntents.create({ amount: cents(fee), currency: "aud", customer: buyer.stripe_customer_id, payment_method: buyer.payment_method_id, off_session: true, confirm: true, description: `${inv.ref} cancellation fee` });
            feeNote += " It has been charged to your card.";
          }
        } catch { feeNote += " We'll contact you to collect it."; }
      }
      await db.from("invoices").update({ status: "cancelled", cancel_fee: fee || null }).eq("id", b.invoiceId);
      await db.from("lots").update({ status: "passed" }).eq("id", inv.lot_id);
      await notify(inv.buyer_id, "account", `Sale cancelled: ${inv.ref}`, `We've cancelled this sale because payment wasn't received.${feeNote}`, `/account/invoices/${b.invoiceId}`);
      return json({ ok: true });
    }
    // Inspections
    case "confirm-inspection": {
      if (!String(b.when || "").trim()) return fail("Enter the confirmed day and time.");
      const { data: insp } = await db.from("inspections").update({ status: "confirmed", confirmed_for: b.when }).eq("id", b.inspectionId).select("user_id, lot_id").single();
      if (!insp) return fail("Not found");
      const { data: priv } = await db.from("lot_private").select("seller_address, seller_phone").eq("lot_id", insp.lot_id).single();
      const { data: lot } = await db.from("lots").select("title").eq("id", insp.lot_id).single();
      const { data: buyer } = await db.from("profiles").select("mobile").eq("id", insp.user_id).single();
      const text = `Tyrebiter: your inspection of the ${lot?.title} is confirmed for ${b.when} at ${priv?.seller_address}. Please be on time and respectful of the seller's property.`;
      if (buyer?.mobile) await sendSms(buyer.mobile, text);
      await notify(insp.user_id, "account", `Inspection confirmed: ${lot?.title}`, text, `/lot/${insp.lot_id}`);
      return json({ ok: true });
    }
    case "cancel-inspection":
      await db.from("inspections").update({ status: "cancelled", admin_note: b.note || null }).eq("id", b.inspectionId);
      return json({ ok: true });
    // Members
    case "member": {
      const patch: Record<string, unknown> = {};
      if (typeof b.suspended === "boolean") patch.suspended = b.suspended;
      if (b.role === "admin" || b.role === "buyer") patch.role = b.role;
      if (b.idStatus) patch.id_status = b.idStatus;
      await db.from("profiles").update(patch).eq("id", b.userId);
      return json({ ok: true });
    }
    case "report":
      await db.from("reports").update({ status: "reviewed" }).eq("id", b.reportId);
      return json({ ok: true });
    case "appraisal": {
      if (b.status) await db.from("appraisals").update({ status: b.status }).eq("id", b.appraisalId);
      if (b.createLot) {
        const { data: ap } = await db.from("appraisals").select("*").eq("id", b.appraisalId).single();
        const { data: lot } = await db.from("lots").insert({ status: "draft", title: `Vehicle ${ap.rego} (${ap.state})`, state: ap.state, postcode: ap.postcode, category: ap.kind === "truck" ? "trucks" : "cars", vehicle_type: ap.kind === "truck" ? "truck" : "car" }).select("id").single();
        await db.from("lot_private").insert({ lot_id: lot!.id, seller_name: ap.name, seller_phone: ap.mobile, seller_email: ap.email });
        await db.from("appraisals").update({ lot_id: lot!.id, status: "booked" }).eq("id", b.appraisalId);
        return json({ ok: true, lotId: lot!.id });
      }
      return json({ ok: true });
    }
    case "settings": {
      await db.from("settings").update({ value: b.value }).eq("key", b.key);
      return json({ ok: true });
    }
  }
  return fail("Unknown action", 404);
}
