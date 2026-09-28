import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFeesCached } from "@/lib/cache";
import { env } from "@/lib/env";
import { dateLong, money } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { InvoiceActions } from "./InvoiceActions";
import { BookCollection, ClaimBox } from "./Collection";

export const dynamic = "force-dynamic";

type Coll = { id: string; status: string; preferred_day: string; preferred_time: string; confirmed_for: string | null; collector_name: string | null; release_code: string; collected_at: string | null };
type Claim = { id: string; reason: string; status: string; resolution: string | null; created_at: string };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await getSession();
  if (!user) redirect(`/signin?next=/account/invoices/${id}`);
  const { data } = await supabase.from("invoices").select("*, lots(title, suburb, state, vin, gst_status)").eq("id", id).eq("buyer_id", user.id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice & { lots: { title: string; suburb: string; state: string; vin: string | null; gst_status: string } };
  const [{ data: coll }, { data: claims }, fees] = await Promise.all([
    supabase.from("collections").select("id, status, preferred_day, preferred_time, confirmed_for, collector_name, release_code, collected_at").eq("invoice_id", inv.id).maybeSingle(),
    supabase.from("claims").select("id, reason, status, resolution, created_at").eq("invoice_id", inv.id).order("created_at", { ascending: false }),
    getFeesCached(),
  ]);
  const c = coll as Coll | null;
  // The seller's address is released only once the collection time is confirmed.
  let address: string | null = null;
  if (c?.status === "confirmed" || c?.status === "collected") {
    const { data: pr } = await supabaseAdmin().from("lot_private").select("seller_address").eq("lot_id", inv.lot_id).maybeSingle();
    address = pr?.seller_address || null;
  }
  const paidCard = ["paid", "deposit_paid"].includes(inv.status);
  const fullyPaid = inv.status === "paid";
  const collectBy = inv.collect_by ? new Date(inv.collect_by) : null;
  const overdueDays = collectBy && !inv.collected_at ? Math.max(0, Math.ceil((Date.now() - collectBy.getTime()) / 86400000)) : 0;
  const storageSoFar = overdueDays * Number(fees.storage_per_day || 50);
  const claimOpen = (claims || []).some((x: Claim) => x.status === "open");
  const canClaim = paidCard && !claimOpen && (!inv.collected_at || (inv.claim_until && new Date(inv.claim_until).getTime() > Date.now()));
  const gstTotal = Number(inv.gst) + Math.round((Number(inv.admin_fee) / 11) * 100) / 100 + Number(inv.vehicle_gst || 0);
  const rows: [string, number][] = [
    [inv.sold_via === "buy_now" ? "Buy Now price" : inv.sold_via === "offer" ? "Accepted offer" : "Winning bid", inv.price],
    ["Buyer's premium", inv.premium], ["GST on premium", inv.gst], ["Admin fee (incl. GST)", inv.admin_fee],
    ...(Number(inv.surcharge) > 0 ? [["Card surcharge", inv.surcharge] as [string, number]] : []),
    ...(Number(inv.storage_fee) > 0 ? [["Storage", Number(inv.storage_fee)] as [string, number]] : []),
  ];
  const buyerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Link className="more no-print" style={{ fontSize: 16 }} href="/account#invoices">‹ All invoices</Link>
        <h1 className="d2" style={{ fontSize: "clamp(36px,5vw,60px)" }}>{inv.lots.title}.</h1>
        <div className="soft" style={{ background: "#FFFFFF", border: "1px solid var(--line)", padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "flex", flexDirection: "column" }}><b style={{ fontSize: 20 }}>Tax invoice {inv.ref}</b><span className="muted" style={{ fontSize: 14 }}>{env.legalName} · ABN {env.abn}</span></span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><span className="muted">{dateLong(inv.created_at)}</span><a className="blue no-print" href={`/api/invoices/${inv.id}/pdf`} style={{ fontWeight: 700 }}>Download PDF ›</a></span>
          </div>
          <span className="muted" style={{ fontSize: 14 }}>Billed to {profile?.company_name ? `${profile.company_name} (ABN ${profile.abn}) · ` : ""}{buyerName}. Lot {inv.lot_id}{inv.lots.vin ? ` · VIN ${inv.lots.vin}` : ""}.</span>
          <div className="allin" style={{ borderTop: 0, paddingTop: 8 }}>
            {rows.map(([k, v]) => <div key={k}><span className="muted">{k}</span><span>{money(v, true)}</span></div>)}
            <div className="tot"><span>Total</span><span>{money(Number(inv.total) + Number(inv.storage_fee || 0), true)}</span></div>
            <div><span className="muted">Includes GST of</span><span>{money(gstTotal, true)}</span></div>
          </div>
          <span className="hint">{inv.lots.gst_status === "inc" ? "The vehicle price includes GST (the seller is GST-registered)." : "Private sale: no GST on the vehicle price."} Sold by Tyrebiter as agent for the seller. No card surcharge.</span>
        </div>

        {["pending_charge", "charging"].includes(inv.status) && <div className="notice">We&apos;re taking payment now. This page updates within a minute.</div>}
        {inv.status === "paid" && <div className="notice ok">{inv.mode === "card" ? `${money(inv.card_amount, true)} was charged to your card.` : "Deposit and balance received."} Paid in full.</div>}
        {inv.status === "deposit_paid" && (
          <div className="soft" style={{ background: "var(--sun)" }}>
            <b>Deposit of {money(inv.card_amount, true)} paid. Balance due: {money(inv.balance_due, true)}.</b>
            <span>Pay by bank transfer by <b>{dateLong(inv.due_at)}</b>.</span>
            <span>Account name: <b>{env.bankName}</b> · BSB: <b>{env.bankBsb}</b> · Account: <b>{env.bankAccount}</b> · Reference: <b>{inv.ref}</b>{env.payId && <> · or PayID: <b>{env.payId}</b></>}</span>
            <span className="notice bad" style={{ fontSize: 14 }}><b>Scam warning:</b> we will never change these bank details by email, SMS or phone. If you get a message saying our details have changed, don&apos;t pay. Call us on {env.phone} to confirm before you transfer. Never pay the seller directly.</span>
          </div>
        )}
        {inv.status === "payment_failed" && <InvoiceActions id={inv.id} mode="pay" amount={inv.card_amount} reason={inv.failure_reason} />}
        {inv.status === "cancelled" && <div className="notice bad">This sale was cancelled{inv.cancel_fee ? ` with a ${money(inv.cancel_fee)} cancellation fee` : ""}.</div>}

        {paidCard && (
          <div className="soft">
            <b style={{ fontSize: 20 }}>Collection.</b>
            {!fullyPaid && <span>Once your balance clears, book a time here. You then have {5} business days to collect.</span>}
            {fullyPaid && !c && <><span>Collect from the seller in {inv.lots.suburb}, {inv.lots.state}{collectBy ? <> by <b>{dateLong(inv.collect_by)}</b></> : ""}. Pick a time and we&apos;ll confirm it with the seller.</span><BookCollection invoiceId={inv.id} existing={null} /></>}
            {fullyPaid && c?.status === "requested" && <BookCollection invoiceId={inv.id} existing={c} />}
            {c?.status === "confirmed" && (
              <>
                <span className="notice ok"><b>Confirmed: {c.confirmed_for}</b></span>
                <span>Address: <b>{address || "we'll text it to you"}</b></span>
                <span>Your release code. Give it to the seller only when you{c.collector_name ? ` (or ${c.collector_name})` : ""} are with the vehicle:</span>
                <div className="code-box">{c.release_code}</div>
                <ol className="steps-mini">
                  <li>Bring photo ID{c.collector_name ? ` (${c.collector_name} brings theirs)` : ""} and this invoice.</li>
                  <li>Check the vehicle against the listing before you take the keys. Photograph anything that&apos;s different.</li>
                  <li>Give the seller the code. They enter it on their phone to confirm handover.</li>
                  <li>From handover, the vehicle is your responsibility. Arrange insurance and transfer the registration in your state.</li>
                </ol>
              </>
            )}
            {c?.status === "collected" && <span className="notice ok">Collected {dateLong(c.collected_at)}. {inv.claim_until && new Date(inv.claim_until).getTime() > Date.now() ? `If something is materially different from the listing, you can claim until ${dateLong(inv.claim_until)}.` : ""}</span>}
            {overdueDays > 0 && !inv.collected_at && <span className="notice bad">The collection window ended {dateLong(inv.collect_by)}. Storage of {money(fees.storage_per_day || 50)} a day applies ({money(storageSoFar)} so far), payable before release.</span>}
          </div>
        )}

        {(claims || []).length > 0 && (
          <div className="soft">
            <b>Your claims</b>
            {(claims as Claim[]).map((x) => <span key={x.id}><span className="status-pill">{x.status}</span> lodged {dateLong(x.created_at)}{x.resolution ? `: ${x.resolution}` : ""}</span>)}
          </div>
        )}
        {canClaim && <ClaimBox invoiceId={inv.id} userId={user.id} until={inv.claim_until || null} />}
        <p className="hint">Questions about this invoice? Call {env.phone} or email {env.supportEmail}. <Link className="blue" href="/terms#t-title">Collection and claims rules ›</Link></p>
      </section>
    </div>
  );
}
