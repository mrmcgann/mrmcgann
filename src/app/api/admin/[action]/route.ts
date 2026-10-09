import { publishVideo } from "@/lib/videoPublish";
import type { RegoVehicle } from "@/lib/rego";
import { revalidateTag } from "next/cache";
import { CAT } from "@/lib/vehicles";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { chargeInvoice, findSucceededPayment, markInvoicePaid } from "@/lib/charges";
import { notify, notifySeller, kickOutbox } from "@/lib/notify";
import { sendSms } from "@/lib/sms";
import { sendEmail, mailHtml } from "@/lib/email";
import { getStripe, cents } from "@/lib/stripe";
import { money } from "@/lib/format";
import { env } from "@/lib/env";
const catOf = (k: string) => (CAT[k] ? k : k === "truck" ? "trucks" : "cars");
// Business days the same way the database counts them (Brisbane time, weekends and public holidays skipped).
async function addBusinessDays(from: Date, n: number) {
  const { data } = await supabaseAdmin().rpc("business_days_from", { p_from: from.toISOString(), p_days: n });
  return data ? new Date(data as string) : new Date(from.getTime() + n * 86400000);
}
const whenText = (d: Date) => d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") return fail("Admins only.", 403);
  const b = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const done = (extra: Record<string, unknown> = {}) => { kickOutbox(); return json({ ok: true, ...extra }); };

  switch (action) {
    // ---- Referrals and offers (on the seller's instruction) ----
    case "accept": {
      const { data: invId, error } = await supabase.rpc("admin_accept", { p_lot: Number(b.lotId), p_offer: b.offerId || null });
      if (error) return fail(friendly(error.message));
      await chargeInvoice(invId as string);
      if (b.offerId) {
        const { data: others } = await db.from("offers").select("user_id").eq("lot_id", b.lotId).eq("status", "declined");
        for (const o of others || []) await notify(o.user_id, "account", "Your offer wasn't accepted", "The seller accepted another offer.", `/lot/${b.lotId}`, { dedupe: `offer-lost:${b.lotId}:${o.user_id}` });
      }
      revalidateTag(`lot-${Number(b.lotId)}`);
      return done();
    }
    case "decline-referral": {
      const { data: lot } = await db.from("lots").select("leader_id, title").eq("id", b.lotId).single();
      const { error } = await supabase.rpc("admin_decline_referral", { p_lot: Number(b.lotId) });
      if (error) return fail(friendly(error.message));
      await db.from("seller_decisions").insert({ lot_id: Number(b.lotId), action: "decline_referral", via: "admin" });
      if (lot?.leader_id) await notify(lot.leader_id, "account", `The seller declined your bid on the ${lot.title}`, "You can make a higher offer while the offer period is open.", `/lot/${b.lotId}`);
      revalidateTag(`lot-${Number(b.lotId)}`);
      return done();
    }
    case "decline-offer": {
      const { data: o } = await db.from("offers").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", b.offerId).eq("status", "pending").select("user_id, lot_id, amount").single();
      if (o) {
        await db.from("seller_decisions").insert({ lot_id: o.lot_id, action: "decline_offer", offer_id: b.offerId, amount: o.amount, via: "admin" });
        await notify(o.user_id, "account", "Your offer was declined", "You can offer more while the offer period is open.", `/lot/${o.lot_id}`);
      }
      return done();
    }

    // ---- Invoices ----
    case "retry-charge": {
      // Never charge again if an earlier attempt (or a pay-now) actually went through.
      const paid = await findSucceededPayment(b.invoiceId);
      if (paid) { await markInvoicePaid(b.invoiceId, paid); return done({ note: "That invoice was already paid; marked as paid." }); }
      await db.from("invoices").update({ status: "pending_charge" }).eq("id", b.invoiceId).eq("status", "payment_failed");
      await chargeInvoice(b.invoiceId);
      return done();
    }
    case "balance-received": {
      const { data: inv } = await db.from("invoices").update({ status: "paid", balance_paid_at: new Date().toISOString() }).eq("id", b.invoiceId).eq("status", "deposit_paid").select("buyer_id, lot_id, ref").single();
      if (!inv) return fail("That invoice isn't waiting on a balance.");
      await db.from("invoices").update({ receipt_sent_at: new Date().toISOString() }).eq("id", b.invoiceId);
      await notify(inv.buyer_id, "account", `Receipt: ${inv.ref} paid in full`, "Your balance has cleared and your receipt is attached. Next, we'll take you through transferring ownership into your name (the steps are on your invoice), then you book a collection time. The seller only hands over the vehicle with your release code.", `/account/invoices/${b.invoiceId}`, { dedupe: `receipt:${b.invoiceId}`, invoiceId: b.invoiceId });
      return done();
    }
    case "cancel-invoice": {
      // The buyer didn't pay (Terms of sale, section 11). Keep the deposit or charge the cancellation fee, never both.
      const { data: inv } = await db.from("invoices").select("*, lots(title, fees, seller_id)").eq("id", b.invoiceId).single();
      if (!inv) return fail("Not found");
      if (!["payment_failed", "deposit_paid"].includes(inv.status)) return fail("Only unpaid sales can be cancelled for non-payment (payment failed, or balance not received). For anything else, use Cancel and refund.");
      // A declined card gets 1 business day from the decline (section 8); an overdue balance 1 business day after the overdue reminder (section 11).
      const from = inv.status === "deposit_paid" ? inv.due_at : inv.failed_at;
      if (from) {
        const until = await addBusinessDays(new Date(from), 1);
        if (Date.now() < until.getTime()) return fail(`The buyer has until ${whenText(until)} to pay (Terms of sale, sections 8 and 11). Cancel after that.`);
      }
      // claim the cancellation so a double click (or a payment landing now) can't run it twice
      const { data: claimed } = await db.from("invoices").update({ status: "cancelled" }).eq("id", b.invoiceId).eq("status", inv.status).select("id");
      if (!claimed?.length) return fail("This invoice changed while you were looking at it. Reload the page.");
      const { data: feeRow } = await db.from("settings").select("value").eq("key", "fees").single();
      const f = { ...((feeRow?.value || {}) as Record<string, number>), ...((inv.lots?.fees || {}) as Record<string, number>) };
      const fee = inv.status === "deposit_paid" ? 0 : Number(inv.total) > Number(f.cancel_above ?? 1000) ? Number(f.cancel_fee ?? 250) : 0;
      let feeNote = fee ? ` A ${money(fee)} cancellation fee applies.` : inv.status === "deposit_paid" ? " Your deposit has been kept." : "";
      let charged = 0;
      const stripe = getStripe();
      if (fee && stripe) {
        const { data: buyer } = await db.from("profiles").select("stripe_customer_id, payment_method_id").eq("id", inv.buyer_id).single();
        try {
          if (buyer?.stripe_customer_id && buyer.payment_method_id) {
            await stripe.paymentIntents.create({ amount: cents(fee), currency: "aud", customer: buyer.stripe_customer_id, payment_method: buyer.payment_method_id, off_session: true, confirm: true, description: `${inv.ref} cancellation fee`, metadata: { invoice_id: inv.id, kind: "cancel_fee" } }, { idempotencyKey: `cancel-fee-${inv.id}` });
            feeNote += " It has been charged to your card."; charged = fee;
          }
        } catch { feeNote += " We'll contact you to collect it."; }
      } else if (fee && env.testMode) { feeNote += " It has been charged to your card."; charged = fee; }
      await db.from("invoices").update({ status: "cancelled", cancel_fee: fee || null, cancel_reason: "buyer_default" }).eq("id", b.invoiceId);
      await db.from("seller_payouts").update({ status: "cancelled", hold_reason: "Sale cancelled" }).eq("invoice_id", b.invoiceId).neq("status", "paid");
      await db.from("lots").update({ status: "passed" }).eq("id", inv.lot_id);
      // Seller agreement, section 9: the seller gets half of a kept deposit or a charged cancellation fee.
      const kept = inv.status === "deposit_paid" ? Number(inv.card_amount) : charged;
      const half = Math.round(kept * 50) / 100;
      if (half > 0) {
        await db.from("seller_payouts").insert({ lot_id: inv.lot_id, invoice_id: inv.id, seller_id: inv.lots?.seller_id || null, kind: "forfeit", sale_price: kept,
          other_deductions: kept - half, deductions_note: "Tyrebiter's half of the amount the buyer forfeited", net_amount: half, status: "ready" });
      }
      await notify(inv.buyer_id, "account", `Sale cancelled: ${inv.ref}`, `We've cancelled this sale because payment wasn't received.${feeNote}`, `/account/invoices/${b.invoiceId}`);
      await notifySeller(inv.lot_id, "The buyer didn't pay, so the sale is cancelled",
        `We'll call you about offering it to the next bidder or relisting at no extra cost.${half > 0 ? ` We'll also pay you ${money(half, true)}, half of what the buyer forfeited.` : ""}`, "/sell/dashboard", `cancelled:${inv.id}`);
      revalidateTag(`lot-${inv.lot_id}`);
      return done();
    }
    case "refund-cancel": {
      // Cancel a sale that isn't the buyer's fault (an upheld claim, a title problem, damage before handover, our mistake,
      // or events outside anyone's control) and refund everything the buyer paid (Terms of sale, sections 8, 9, 12 and 17).
      const reason = String(b.reason || "").trim().slice(0, 300);
      if (reason.length < 5) return fail("Say why the sale is being cancelled. The buyer and the seller see it.");
      const { data: inv } = await db.from("invoices").select("*, lots(title)").eq("id", b.invoiceId).single();
      if (!inv) return fail("Not found");
      if (!["paid", "deposit_paid", "payment_failed", "pending_charge"].includes(inv.status)) return fail("This sale is already cancelled, or a card charge is running right now. Reload in a minute.");
      const { data: claimed } = await db.from("invoices").update({ status: "cancelled" }).eq("id", b.invoiceId).eq("status", inv.status).select("id");
      if (!claimed?.length) return fail("This invoice changed while you were looking at it. Reload the page.");
      const cardPaid = ["paid", "deposit_paid"].includes(inv.status) && inv.paid_at ? Number(inv.card_amount) : 0;
      const bankPaid = inv.status === "paid" && inv.mode === "deposit" ? Number(inv.balance_due) : 0;
      const notes: string[] = [];
      let cardDone = false;
      const stripe = getStripe();
      if (cardPaid > 0 && stripe && inv.stripe_payment_intent) {
        try {
          await stripe.refunds.create({ payment_intent: inv.stripe_payment_intent, amount: cents(cardPaid), metadata: { invoice_id: inv.id, reason } }, { idempotencyKey: `refund-${inv.id}` });
          cardDone = true;
        } catch { notes.push(`Card refund of ${money(cardPaid, true)} failed: refund it in Stripe.`); }
      } else if (cardPaid > 0 && env.testMode) cardDone = true;
      else if (cardPaid > 0) notes.push(`Refund ${money(cardPaid, true)} to the buyer's card in Stripe.`);
      if (bankPaid > 0) notes.push(`Pay ${money(bankPaid, true)} back to the account the buyer paid the balance from.`);
      await db.from("invoices").update({ cancel_reason: `not_buyer_fault: ${reason}`, refunded_amount: cardPaid + bankPaid || null,
        refunded_at: cardPaid + bankPaid ? new Date().toISOString() : null, refund_note: notes.join(" ") || null }).eq("id", inv.id);
      const { data: pay } = await db.from("seller_payouts").select("id, status").eq("invoice_id", inv.id).maybeSingle();
      if (pay?.status === "paid") notes.push("The seller was already paid: recover it under the seller agreement (sections 11 and 13).");
      else if (pay) await db.from("seller_payouts").update({ status: "cancelled", hold_reason: `Sale cancelled: ${reason}` }).eq("id", pay.id);
      await db.from("collections").update({ status: "cancelled" }).eq("invoice_id", inv.id).in("status", ["requested", "confirmed"]);
      const { data: tr } = await db.from("ownership_transfers").select("status").eq("invoice_id", inv.id).maybeSingle();
      if (tr?.status === "complete") notes.push("Ownership was already transferred: arrange for the registration to go back to the seller.");
      await db.from("lots").update({ status: "passed" }).eq("id", inv.lot_id);
      const refundText = cardPaid + bankPaid === 0 ? "Nothing was charged, so there's nothing to refund."
        : `We're refunding everything you paid${cardPaid ? `: ${money(cardPaid, true)} to your card${cardDone ? " (it usually shows within 5 to 10 business days)" : ""}` : ""}${bankPaid ? `${cardPaid ? ", and" : ":"} ${money(bankPaid, true)} to the account you paid the balance from` : ""}.`;
      await notify(inv.buyer_id, "account", `Sale cancelled and refunded: ${inv.ref}`, `We've cancelled your purchase of the ${inv.lots?.title}. Reason: ${reason}. ${refundText} Call us if you have any questions.`, `/account/invoices/${inv.id}`, { dedupe: `refund-cancel:${inv.id}` });
      await notifySeller(inv.lot_id, "The sale has been cancelled", `We've cancelled the sale of your ${inv.lots?.title} and refunded the buyer. Reason: ${reason}. Your consultant will call you about what happens next.`, "/sell/dashboard", `refund-cancel:${inv.id}`);
      revalidateTag(`lot-${inv.lot_id}`);
      return done({ note: notes.join(" ") || "Cancelled and refunded." });
    }

    // ---- Collections ----
    case "confirm-collection": {
      const when = String(b.when || "").trim();
      if (!when) return fail("Enter the confirmed day and time.");
      const { data: c } = await db.from("collections").update({ status: "confirmed", confirmed_for: when }).eq("id", b.collectionId).in("status", ["requested", "confirmed"]).select("*").single();
      if (!c) return fail("Not found");
      const [{ data: priv }, { data: lot }, { data: buyer }] = await Promise.all([
        db.from("lot_private").select("seller_address, seller_name").eq("lot_id", c.lot_id).single(),
        db.from("lots").select("title").eq("id", c.lot_id).single(),
        db.from("profiles").select("first_name, last_name").eq("id", c.buyer_id).single(),
      ]);
      const who = c.collector_name || `${buyer?.first_name || ""} ${buyer?.last_name || ""}`.trim();
      await notify(c.buyer_id, "account", `Collection confirmed: ${when}`,
        `Collect the ${lot?.title} on ${when} from ${priv?.seller_address}. Your release code is ${c.release_code}. Give it to the seller only when you're with the vehicle and happy with it. ${c.collector_name ? `${c.collector_name} will need photo ID. ` : "Bring photo ID. "}`,
        `/account/invoices/${c.invoice_id}`, { dedupe: `coll-confirm:${c.id}:${when}` });
      if (c.collector_mobile) await sendSms(c.collector_mobile, `Tyrebiter: collect the ${lot?.title} on ${when} from ${priv?.seller_address}. Bring photo ID. Release code: ${c.release_code}. Only give it to the seller at handover.`);
      await notifySeller(c.lot_id, `Collection booked: ${when}`,
        `${who} will collect the ${lot?.title} on ${when}. Check their photo ID, and only hand over the keys when they give you the 6-digit release code, which you enter here: ${env.siteUrl}/handover/${c.seller_token}. Never accept money from them directly.`,
        `/handover/${c.seller_token}`, `coll-seller:${c.id}:${when}`);
      return done();
    }
    case "cancel-collection":
      await db.from("collections").update({ status: "cancelled" }).eq("id", b.collectionId);
      return done();
    case "collected": {
      // Manual handover (e.g. the seller confirmed by phone). Starts the claim window.
      const { data: claimUntil } = await db.rpc("business_days_from", { p_from: new Date().toISOString(), p_days: Number(b.claimDays) || 2 });
      await db.from("invoices").update({ collected_at: new Date().toISOString(), claim_until: claimUntil }).eq("id", b.invoiceId);
      await db.from("collections").update({ status: "collected", collected_at: new Date().toISOString(), handover: { by: "admin", note: b.note || null } }).eq("invoice_id", b.invoiceId);
      return done();
    }

    // ---- Claims ----
    case "claim": {
      if (!["upheld", "rejected"].includes(b.status)) return fail("Choose upheld or rejected.");
      const { data: cl } = await db.from("claims").update({ status: b.status, resolution: String(b.resolution || "").slice(0, 2000) || null, decided_at: new Date().toISOString() }).eq("id", b.claimId).eq("status", "open").select("*").single();
      if (!cl) return fail("That claim isn't open.");
      if (b.status === "upheld") await db.from("seller_payouts").update({ status: "on_hold", hold_reason: "Claim upheld: refund buyer and recover from seller" }).eq("lot_id", cl.lot_id);
      await notify(cl.buyer_id, "account", `Your claim was ${b.status}`, b.status === "upheld" ? `We've upheld your claim. ${b.resolution || "We'll contact you to arrange your refund or an agreed price adjustment."}` : `We've reviewed your claim against the listing as it was at the time of sale and haven't upheld it. ${b.resolution || ""} If you disagree, reply to this email or call us.`, `/account/invoices/${cl.invoice_id}`);
      return done();
    }

    // ---- Seller onboarding and payouts ----
    case "ownership-checked":
      await db.from("lot_private").update({ ownership_checked_at: b.undo ? null : new Date().toISOString(), ownership_note: b.note || null }).eq("lot_id", b.lotId);
      return done();
    case "bank-confirmed":
      await db.from("seller_bank").update({ confirmed_at: new Date().toISOString() }).eq("seller_id", b.sellerId);
      return done();
    case "send-seller-link": {
      const { data: pr } = await db.from("lot_private").select("seller_invite, seller_phone, seller_email, seller_name").eq("lot_id", b.lotId).single();
      const { data: lot } = await db.from("lots").select("title").eq("id", b.lotId).single();
      if (!pr?.seller_invite) return fail("No invite for this vehicle.");
      const link = `${env.siteUrl}/sell/agreement/${pr.seller_invite}`;
      const text = `Hi ${pr.seller_name || "there"}, it's Tyrebiter. To list your ${lot?.title}, please verify your ID, answer a few questions and sign your seller agreement here: ${link}`;
      if (pr.seller_phone) await sendSms(pr.seller_phone, text);
      if (pr.seller_email) await sendEmail({ to: pr.seller_email, subject: `Your Tyrebiter seller agreement: ${lot?.title}`, text: `${text}\n\nIt takes about ten minutes.`, html: mailHtml("Let's get your vehicle listed.", `To list your ${lot?.title}, please verify your ID, answer a few questions about the vehicle, add your bank details and sign your seller agreement. It takes about ten minutes.`, link, "Start my seller agreement") });
      return json({ ok: true, link });
    }
    case "payout-adjust": {
      const { data: p } = await db.from("seller_payouts").select("*").eq("id", b.payoutId).single();
      if (!p || p.status === "paid") return fail("Can't change a paid payout.");
      const other = Math.max(0, Number(b.otherDeductions) || 0);
      await db.from("seller_payouts").update({ other_deductions: other, deductions_note: String(b.note || "").slice(0, 200) || null,
        net_amount: Number(p.sale_price) - Number(p.seller_fee) - Number(p.fee_gst) - Number(p.lender_payout) - other }).eq("id", b.payoutId);
      return done();
    }
    case "payout-hold":
      await db.from("seller_payouts").update(b.release ? { status: "pending", hold_reason: null } : { status: "on_hold", hold_reason: String(b.reason || "Held by Tyrebiter") }).eq("id", b.payoutId).neq("status", "paid");
      return done();
    case "payout-paid": {
      const { data: p } = await db.from("seller_payouts").select("*").eq("id", b.payoutId).single();
      if (!p) return fail("Not found");
      if (p.status !== "ready") return fail("Only payouts marked ready can be paid (collected, claim window closed, no claim).");
      if (p.seller_id) {
        const { data: bank } = await db.from("seller_bank").select("confirmed_at").eq("seller_id", p.seller_id).maybeSingle();
        if (!bank?.confirmed_at) return fail("Confirm the seller's bank details by phone first.");
      }
      if (!String(b.ref || "").trim()) return fail("Enter the payment reference.");
      await db.from("seller_payouts").update({ status: "paid", paid_at: new Date().toISOString(), payment_ref: String(b.ref).slice(0, 80) }).eq("id", b.payoutId);
      await db.from("invoices").update({ seller_paid_at: new Date().toISOString(), seller_payout_note: String(b.ref).slice(0, 80) }).eq("id", p.invoice_id);
      await notifySeller(p.lot_id, `We've paid you ${money(p.net_amount, true)}`, `Your settlement statement is in your seller dashboard. Payment reference ${b.ref}. It usually lands within 1 business day.`, "/sell/dashboard", `paid:${p.id}`);
      return done();
    }

    // ---- Questions, contact, reports ----
    case "answer-question": {
      const answer = String(b.answer || "").trim();
      if (!answer) return fail("Write an answer.");
      const { data: q } = await db.from("lot_questions").update({ answer: answer.slice(0, 2000), public: !!b.public, status: "answered", answered_at: new Date().toISOString() }).eq("id", b.questionId).select("user_id, lot_id, question").single();
      if (!q) return fail("Not found");
      if (q.user_id) await notify(q.user_id, "account", "We've answered your question", `You asked: “${q.question}”\n\nOur answer: ${answer}`, `/lot/${q.lot_id}#questions`, { dedupe: `answer:${b.questionId}` });
      revalidateTag(`lot-${q.lot_id}`);
      return done();
    }
    case "hide-question":
      await db.from("lot_questions").update({ status: "hidden", public: false }).eq("id", b.questionId);
      return done();
    case "contact-done":
      await db.from("contact_messages").update({ status: "done" }).eq("id", b.id);
      return done();

    // ---- Listing videos (every video is approved here before it's public) ----
    case "approve-video": {
      const r = await publishVideo(String(b.videoId), profile.id);
      if (!r.ok) return fail(r.error);
      const { data: lot } = await db.from("lots").select("title").eq("id", r.lotId).single();
      await notifySeller(r.lotId, "Your video is live", `Your video is now on the ${lot?.title} listing.`, `/lot/${r.lotId}`, `video-ok:${b.videoId}`);
      return done();
    }
    case "reject-video": {
      const note = String(b.note || "").trim().slice(0, 300);
      if (!note) return fail("Say why, so the seller can fix it.");
      const { data: v } = await db.from("lot_videos").update({ status: "rejected", review_note: note, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq("id", b.videoId).eq("status", "pending").select("lot_id, upload_path").maybeSingle();
      if (!v) return fail("That video isn't waiting for approval.");
      await db.storage.from("video-uploads").remove([v.upload_path]);
      await notifySeller(v.lot_id, "Your video wasn't approved", `We couldn't add your video: ${note} You can upload a new one from your seller dashboard.`, "/sell/dashboard", `video-no:${b.videoId}`);
      return done();
    }
    case "remove-video": {
      const { data: v } = await db.from("lot_videos").update({ status: "removed" }).eq("id", b.videoId).select("lot_id, upload_path, public_path").maybeSingle();
      if (v) {
        await db.storage.from("video-uploads").remove([v.upload_path]);
        if (v.public_path) await db.storage.from("lot-videos").remove([v.public_path]);
        revalidateTag(`lot-${v.lot_id}`);
      }
      return done();
    }

    // ---- Partner leads (finance, insurance, mobile inspections) ----
    case "lead-update": {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (["new", "sent", "contacted", "booked", "completed", "converted", "lost", "withdrawn"].includes(b.status)) patch.status = b.status;
      if (b.revenue !== undefined && b.revenue !== "") { const r = Number(String(b.revenue).replace(/[$,]/g, "")); if (!Number.isFinite(r) || r < 0) return fail("Enter the fee as a number."); patch.revenue = r; }
      if (typeof b.note === "string") patch.admin_note = b.note.slice(0, 500);
      if (typeof b.report === "string" && b.report) { if (!/^https:\/\//.test(b.report)) return fail("The report link must start with https://"); patch.report_url = b.report; }
      const { data: lead } = await db.from("partner_leads").update(patch).eq("id", b.leadId).select("kind, user_id, email, lot_id, report_url, status, ref").maybeSingle();
      if (!lead) return fail("Not found", 404);
      if (lead.kind === "inspection" && b.report && lead.user_id) {
        await notify(lead.user_id, "account", "Your inspection report is ready", `The mobile inspection report for lot ${lead.lot_id} is ready: ${lead.report_url}`, `/lot/${lead.lot_id}`, { dedupe: `insp-report:${b.leadId}` });
      }
      return done();
    }

    // ---- Members ----
    case "member": {
      const patch: Record<string, unknown> = {};
      if (typeof b.suspended === "boolean") patch.suspended = b.suspended;
      if (b.role === "admin" || b.role === "buyer") patch.role = b.role;
      if (b.idStatus) patch.id_status = b.idStatus;
      await db.from("profiles").update(patch).eq("id", b.userId);
      return done();
    }
    case "report":
      await db.from("reports").update({ status: "reviewed" }).eq("id", b.reportId);
      return done();
    case "appraisal": {
      if (b.status) await db.from("appraisals").update({ status: b.status }).eq("id", b.appraisalId);
      if (b.createLot) {
        const { data: ap } = await db.from("appraisals").select("*").eq("id", b.appraisalId).single();
        const v = (ap.vehicle || {}) as RegoVehicle;
        const cat = catOf(v.category || ap.kind);
        const name = [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");
        const km = Number(String(ap.odometer || "").replace(/[^0-9]/g, "")) || null;
        const { data: lot } = await db.from("lots").insert({
          status: "draft", title: name || `Vehicle ${ap.rego || ""} (${ap.state})`.replace("  ", " "), short_title: [v.year, v.make, v.model].filter(Boolean).join(" ") || null,
          registration: ap.registration || (ap.rego ? "registered" : "unregistered"), rego_plate: ap.rego, rego_state: ap.rego ? ap.state : null, rego_expiry: v.regoExpiry || null,
          vin: ap.vin || v.vin || null, engine_no: v.engineNo || null, year: v.year || null, make: v.make || null, model: v.model || null, variant: v.variant || null,
          body: v.body || null, colour: v.colour || null, fuel: v.fuel || null, transmission: v.transmission || null, drive: v.drive || null, engine: v.engine || null,
          ...(CAT[cat].usage === "hours" ? { hours: km } : CAT[cat].usage === "km" ? { odometer: km } : {}),
          state: ap.state, postcode: ap.postcode, category: cat, kind: v.kind || null, vehicle_type: CAT[cat].silhouette,
        }).select("id").single();
        await db.from("lot_private").insert({ lot_id: lot!.id, seller_name: ap.name, seller_phone: ap.mobile, seller_email: ap.email, seller_notes: ap.description || null });
        await db.from("appraisals").update({ lot_id: lot!.id, status: "booked" }).eq("id", b.appraisalId);
        return json({ ok: true, lotId: lot!.id });
      }
      return done();
    }
    // ---- Transfer of ownership ----
    case "transfer-review": {
      const { error } = await supabase.rpc("admin_transfer_review", { p_id: String(b.id), p_ok: b.ok === true, p_note: String(b.note || "") });
      if (error) return fail(error.message.includes("note_needed") ? "Say what the buyer needs to do." : "Couldn't save that.");
      return done();
    }
    case "transfer-seller-done": {
      const { error } = await supabase.rpc("transfer_seller_done", { p_lot: Number(b.lotId), p_reference: String(b.reference || "") });
      if (error) return fail("Couldn't save that.");
      return done();
    }
    case "quote":
      await db.from("quote_requests").update({ status: "quoted", quote_note: b.note || null }).eq("id", b.quoteId);
      return done();
    // ---- Listing accuracy, relisting, the next bidder ----
    case "remove-bidder": {
      const { data, error } = await supabase.rpc("admin_remove_bidder", { p_lot: Number(b.lotId), p_user: String(b.userId), p_reason: String(b.reason || "") });
      if (error) return fail(friendly(error.message));
      revalidateTag(`lot-${Number(b.lotId)}`);
      return done({ result: data });
    }
    case "relist": {
      const { data, error } = await supabase.rpc("admin_relist", { p_lot: Number(b.lotId) });
      if (error) return fail(friendly(error.message));
      return done({ id: data });
    }
    case "next-bidder": {
      const { data, error } = await supabase.rpc("admin_offer_next_bidder", { p_lot: Number(b.lotId), p_hours: Number(b.hours) || 24, p_seller_ok: b.sellerOk === true || b.sellerOk === "yes" });
      if (error) return fail(friendly(error.message));
      return done({ offer: data });
    }
    case "audit": {
      const checks = (b.checks && typeof b.checks === "object" ? b.checks : {}) as Record<string, boolean>;
      const okAll = Object.values(checks).every(Boolean);
      const { error } = await db.from("listing_audits").insert({ lot_id: Number(b.lotId), checks, ok: okAll, note: String(b.note || "").slice(0, 1000) || null, audited_by: profile.id });
      if (error) return fail("Couldn't save the audit.");
      return done({ ok: okAll });
    }
    // ---- Fleet sales ----
    case "sale-save": {
      const slug = String(b.slug || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      const title = String(b.title || "").trim().slice(0, 120);
      if (slug.length < 3 || title.length < 3) return fail("Add a title and a web address (at least 3 letters).");
      const row = { slug, title, intro: String(b.intro || "").trim().slice(0, 2000) || null, seller_label: String(b.sellerLabel || "").trim().slice(0, 120) || null,
        state: ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"].includes(b.state) ? b.state : null, published: b.published === true, updated_at: new Date().toISOString() };
      const q = b.id ? db.from("sales").update(row).eq("id", Number(b.id)).select("id").single() : db.from("sales").insert(row).select("id").single();
      const { data, error } = await q;
      if (error) return fail(error.message.includes("duplicate") ? "That web address is already used by another sale." : "Couldn't save the sale.");
      revalidateTag("lots"); revalidateTag("sales");
      return done({ id: data?.id });
    }
    case "stagger": {
      const first = new Date(String(b.first || ""));
      if (Number.isNaN(first.getTime())) return fail("Choose when the first vehicle closes.");
      const { data, error } = await supabase.rpc("admin_stagger_sale", { p_sale: Number(b.saleId), p_first: first.toISOString(), p_gap_minutes: Number(b.gap) });
      if (error) return fail(friendly(error.message));
      revalidateTag("lots");
      return done({ moved: data });
    }
    case "tracking": {
      const url = String(b.url || "").trim();
      if (url && !/^https:\/\/\S+$/.test(url)) return fail("Paste the carrier's tracking link (starting https://).");
      const { error } = await db.from("collections").update({ tracking_url: url || null }).eq("id", b.collectionId);
      if (error) return fail("Couldn't save the tracking link.");
      return done();
    }
    case "newsletter-send": {
      const { sendNewsletter } = await import("@/lib/newsletter");
      const r = await sendNewsletter({ force: true });
      if (!r.queued && r.reason) return fail(r.reason);
      return done({ queued: r.queued });
    }
    case "settings": {
      if (!["fees", "auction", "selling", "terms", "finance", "newsletter", "business"].includes(b.key)) return fail("Unknown setting.");
      if (b.key === "fees" && Number(b.value?.surcharge_rate) > 0) return fail("Card surcharges on Visa, Mastercard and eftpos are banned from 1 October 2026. Keep it at 0.");
      if (b.key === "fees" && (Number(b.value?.late_interest_rate) < 0 || Number(b.value?.late_interest_rate) > 20)) return fail("Keep interest on overdue balances between 0 and 20% a year. A higher rate risks being an unfair term.");
      await db.from("settings").upsert({ key: b.key, value: b.value });
      revalidateTag("settings");
      return done();
    }
  }
  return fail("Unknown action", 404);
}
