import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AccountNav } from "@/app/account/AccountNav";
import { PayBox } from "@/components/deposit/PayBox";
import { formatAbn } from "@/lib/abn";
import { money } from "@/lib/format";
import { payBank } from "@/lib/env";
import { DealerForm } from "./DealerForm";

export const metadata: Metadata = { title: "Dealer account", robots: { index: false } };
export const dynamic = "force-dynamic";

// Dealers and other businesses buying several vehicles: a checked business name and ABN on every tax invoice,
// and one transfer for several invoices (with the member's own payment reference).
export default async function Dealer() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/signin?next=/account/dealer");
  const p = profile as typeof profile & { dealer_status?: string; company_name?: string | null; abn?: string | null; gst_registered?: boolean; dealer_licence?: string | null; dealer_note?: string | null; deposit_ref?: string | null; bpay_crn?: string | null };
  const status = p.dealer_status || "none";
  const { data: unpaid } = status === "approved"
    ? await supabase.from("invoices").select("id, ref, balance_due, due_at, lots(title)").eq("buyer_id", user.id).eq("status", "deposit_paid").eq("pay_method", "bank").order("due_at")
    : { data: [] };
  const list = (unpaid || []) as unknown as { id: string; ref: string; balance_due: number; due_at: string; lots: { title: string } | null }[];
  const total = list.reduce((t, i) => t + Number(i.balance_due || 0), 0);
  return (
    <div className="wrap"><div className="acctgrid">
      <AccountNav current="dealer" profile={p} />
      <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0, maxWidth: 860 }}>
        <h1 className="d2">Dealer account.</h1>
        <p className="lede" style={{ margin: 0 }}>For dealers, fleets and businesses buying several vehicles. Bidding works the same; we check your business once, then put your business name and ABN on every tax invoice and let you pay for several vehicles with one transfer.</p>
        {status === "approved" && <div className="notice ok" data-testid="dealer-approved">Approved: {p.company_name}, ABN {formatAbn(p.abn)}{p.gst_registered ? ", registered for GST" : ""}{p.dealer_licence ? `, licence ${p.dealer_licence}` : ""}.</div>}
        {status === "pending" && <div className="notice" data-testid="dealer-pending">Thanks. We&apos;re checking {p.company_name} (ABN {formatAbn(p.abn)}) and will be in touch within one business day.</div>}
        {status === "declined" && <div className="notice bad">We couldn&apos;t approve your application{p.dealer_note ? `: ${p.dealer_note}` : "."} Update the details below or call us.</div>}

        {status === "approved" && list.length > 0 && (
          <div className="soft" style={{ gap: 12 }} data-testid="pay-together">
            <b style={{ fontSize: 18 }}>Pay {list.length === 1 ? "your invoice" : list.length === 2 ? "both invoices with one transfer" : `all ${list.length} invoices with one transfer`}.</b>
            <div className="rows">{list.map((i) => <div key={i.id}><span className="muted"><Link className="blue" href={`/account/invoices/${i.id}`}>{i.ref}</Link> · {i.lots?.title}</span><b>{money(i.balance_due, true)}</b></div>)}</div>
            {list.length > 1 && p.deposit_ref ? (
              <PayBox amount={total} reference={p.deposit_ref} bank={payBank()} payIdOn={false} crn={p.bpay_crn}
                note={<span>Use your own reference ({p.deposit_ref}) so we can match one payment to {list.length === 2 ? "both" : `all ${list.length}`} invoices. Pay from an account in your business&apos;s name.</span>} />
            ) : <span className="muted">Pay each one from its invoice page.</span>}
          </div>
        )}
        {status !== "pending" && <DealerForm company={p.company_name || ""} abn={p.abn || ""} gst={!!p.gst_registered} licence={p.dealer_licence || ""} again={status !== "none"} />}
        <p className="hint">Buying for a business but don&apos;t need dealer features? Add your business name and ABN in <Link className="blue" href="/account">your account</Link> and they&apos;ll appear on your tax invoices.</p>
      </div>
    </div></div>
  );
}
