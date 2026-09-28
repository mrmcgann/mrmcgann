import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { dateLong, money } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) redirect(`/signin?next=/account/invoices/${id}`);
  const { data } = await supabase.from("invoices").select("*, lots(title, suburb, state)").eq("id", id).eq("buyer_id", user.id).single();
  if (!data) notFound();
  const inv = data as Invoice & { lots: { title: string; suburb: string; state: string } };
  const rows: [string, number][] = [[inv.sold_via === "buy_now" ? "Buy Now price" : inv.sold_via === "offer" ? "Accepted offer" : "Winning bid", inv.price], ["Buyer's premium", inv.premium], ["GST on premium", inv.gst], ["Admin fee", inv.admin_fee], ["Card surcharge", inv.surcharge]];
  const paidCard = ["paid", "deposit_paid"].includes(inv.status);
  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <Link className="more" style={{ fontSize: 16 }} href="/account#invoices">‹ All invoices</Link>
        <h1 className="d2" style={{ fontSize: "clamp(36px,5vw,60px)" }}>{inv.lots.title}.</h1>
        <div className="soft" style={{ background: "#FFFFFF", border: "1px solid var(--line)", padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><b style={{ fontSize: 18 }}>Invoice {inv.ref}</b><span className="muted">{dateLong(inv.created_at)}</span></div>
          <div className="allin" style={{ borderTop: 0, paddingTop: 8 }}>
            {rows.map(([k, v]) => <div key={k}><span className="muted">{k}</span><span>{money(v, true)}</span></div>)}
            <div className="tot"><span>Total</span><span>{money(inv.total, true)}</span></div>
          </div>
        </div>
        {inv.status === "pending_charge" && <div className="notice">We&apos;re taking payment now. This page updates within a minute.</div>}
        {inv.status === "paid" && <div className="notice ok">{money(inv.card_amount, true)} was charged to your card. Paid in full.</div>}
        {inv.status === "deposit_paid" && (
          <div className="soft" style={{ background: "var(--sun)" }}>
            <b>Deposit of {money(inv.card_amount, true)} paid. Balance due: {money(inv.balance_due, true)}.</b>
            <span>Pay by bank transfer by <b>{dateLong(inv.due_at)}</b>.</span>
            <span>Account name: <b>{env.bankName}</b> · BSB: <b>{env.bankBsb}</b> · Account: <b>{env.bankAccount}</b> · Reference: <b>{inv.ref}</b></span>
            {inv.balance_paid_at && <span className="notice ok">Balance received. Thank you.</span>}
          </div>
        )}
        {inv.status === "payment_failed" && <InvoiceActions id={inv.id} mode="pay" amount={inv.card_amount} reason={inv.failure_reason} />}
        {inv.status === "cancelled" && <div className="notice bad">This sale was cancelled{inv.cancel_fee ? ` with a ${money(inv.cancel_fee)} cancellation fee` : ""}.</div>}
        {paidCard && (
          <div className="soft">
            <b style={{ fontSize: 18 }}>Collect your vehicle.</b>
            <span>From the seller in {inv.lots.suburb}, {inv.lots.state}, within 5 business days{inv.mode === "deposit" ? " of your balance clearing" : ""}. We&apos;ll text you the address and book a time with the seller.</span>
            <span className="muted" style={{ fontSize: 14 }}>Bring photo ID and invoice {inv.ref}. Uncollected vehicles may attract storage or be treated as abandoned.</span>
            <InvoiceActions id={inv.id} mode="collector" collector={inv.collector_name} />
          </div>
        )}
        <p className="hint">Questions about this invoice? Call {env.phone} or email {env.supportEmail}.</p>
      </section>
    </div>
  );
}
