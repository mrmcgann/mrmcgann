import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeesCached } from "@/lib/cache";
import { priceBreakdown, lotFees } from "@/lib/fees";
import { money } from "@/lib/format";
import { consumerRights } from "@/lib/listing";
import type { Lot } from "@/lib/types";
import { OfferAnswer } from "./OfferAnswer";
import { AfterAnswer } from "./AfterAnswer";
import { winPayLine } from "@/lib/deposits";
import { afterWarrantyLine, coolingLine, stateTime, type AfterOffer, type AfterRule } from "@/lib/afterAuction";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

// An offer to buy a vehicle that didn't sell under the hammer: after the auction, at a price its seller agreed in
// writing (migration 26), or (from before live-only) to the next highest bidder after the winner didn't pay. No obligation.
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile } = await getSession();
  if (!user) redirect(`/signin?next=/offers/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: o } = await supabase.from("second_chance_offers").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const { data: lot } = await supabase.from("lots").select("id, title, suburb, state, seller_type, gst_status, fees").eq("id", o.lot_id).maybeSingle();
  const fees = await getFeesCached();
  const b = priceBreakdown(Number(o.amount), lotFees(fees, lot));
  const expired = o.status === "pending" && new Date(o.expires_at) <= new Date();
  const open = o.status === "pending" && !expired;
  const sellerType = (lot as Pick<Lot, "seller_type"> | null)?.seller_type;
  const where = lot?.suburb && lot?.state ? ` (collect from our depot in ${lot.suburb}, ${lot.state})` : "";

  if (o.kind === "after_auction") {
    const a = o as AfterOffer;
    const rule = (a.rule || null) as AfterRule | null;
    const docs = (a.docs || []) as { name: string }[];
    const cooling = a.status === "cooling_off";
    const head = open ? "It can be yours." : cooling ? "Agreed." : a.status === "accepted" ? "It's yours." : a.status === "cancelled" && a.cancel_reason === "cooling_off" ? "Cancelled." : "This offer has closed.";
    const name = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
    return (
      <div className="wrap" style={{ maxWidth: 760, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 22 }}>
        <span className="eyebrow" style={{ color: "var(--grape)" }}>After the auction</span>
        <h1 className="d2" style={{ fontSize: "clamp(36px,6vw,64px)" }} data-testid="after-head">{head}</h1>
        <p className="lede" style={{ margin: 0 }}>
          The seller has agreed to sell you the <Link className="blue" href={`/lot/${o.lot_id}`}>{lot?.title}</Link>{where} for this price. It&apos;s a sale by agreement after the auction, not at auction, so it comes with what your state&apos;s law gives a buyer from a dealer, set out below. There&apos;s no obligation.
        </p>
        <div className="allin">
          <div><span className="muted">Agreed price</span><span>{money(b.price)}</span></div>
          <div><span className="muted">Buyer&apos;s premium, GST and admin fee</span><span>{money(b.subtotal - b.price, true)}</span></div>
          <div className="tot"><span>All-in</span><span data-testid="offer-total">{money(b.total, true)}</span></div>
        </div>
        <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="after-terms">
          <span><b>Cooling-off. </b><span data-testid="after-cooling">{coolingLine(rule, cooling ? a.cooling_off_until : null) || "No cooling-off period applies."}</span></span>
          <span><b>Statutory warranty. </b><span data-testid="after-warranty">{afterWarrantyLine(a)}</span></span>
          <span><b>Your rights. </b>{consumerRights("after", sellerType)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="after-docs">
          <b style={{ fontSize: 17 }}>Read before you sign</b>
          <a className="blue" href={`/api/offers/${o.id}/contract`} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }} data-testid="after-contract">The contract of sale (PDF)</a>
          {docs.map((d, i) => <a key={i} className="blue" href={`/api/offers/${o.id}/doc?i=${i}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>{d.name}</a>)}
          {docs.length === 0 && <span className="hint" style={{ margin: 0 }}>In {rule?.state || lot?.state || "this state"}, the contract is all the paperwork there is.</span>}
        </div>
        {open && <p className="muted" style={{ margin: 0 }}>Open until {fmt(o.expires_at)} (Brisbane time). If you sign, it&apos;s binding{rule && rule.cooling_days > 0 ? ", after your cooling-off period," : ""} and it&apos;s paid for like a win: {winPayLine(b)?.replace(/^If you win, /, "") ?? "pay by PayID or bank transfer."}</p>}
        {(open || cooling) && <AfterAnswer id={o.id} open={open} name={name} until={cooling && a.cooling_off_until && rule ? stateTime(a.cooling_off_until, rule.tz, rule.state) : null} />}
        {a.status === "accepted" && <div className="notice">You signed this offer, and the sale is final. {a.invoice_id ? <Link className="blue" href={`/account/invoices/${a.invoice_id}`}>Your invoice and next steps ›</Link> : <Link className="blue" href="/account">Your account ›</Link>}</div>}
        {!open && !cooling && a.status !== "accepted" && (
          <div className="notice" data-testid="after-closed">{a.status === "declined" ? "You declined this offer." : a.status === "withdrawn" ? "This offer was withdrawn, so nothing is payable." : a.status === "cancelled" ? (a.cancel_reason === "cooling_off" ? "You cancelled in your cooling-off period. Nothing is payable." : "This sale didn't go ahead, so nothing is payable.") : "This offer has expired."} <Link className="blue" href="/account">Your account ›</Link></div>
        )}
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 720, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 22 }}>
      <span className="eyebrow" style={{ color: "var(--urgent)" }}>Offer to the next bidder</span>
      <h1 className="d2" style={{ fontSize: "clamp(36px,6vw,64px)" }}>{open ? "It can still be yours." : o.status === "accepted" ? "It's yours." : "This offer has closed."}</h1>
      <p className="lede" style={{ margin: 0 }}>
        The winning bidder didn&apos;t pay for the <Link className="blue" href={`/lot/${o.lot_id}`}>{lot?.title}</Link>{lot?.suburb && lot?.state ? ` (${lot.suburb}, ${lot.state})` : ""}. You were the next highest bidder, so you can buy it for your highest bid. There&apos;s no obligation.
      </p>
      <div className="allin">
        <div><span className="muted">Your highest bid</span><span>{money(b.price)}</span></div>
        <div><span className="muted">Buyer&apos;s premium, GST and admin fee</span><span>{money(b.subtotal - b.price, true)}</span></div>
        <div className="tot"><span>All-in</span><span data-testid="offer-total">{money(b.total, true)}</span></div>
      </div>
      {open && <p className="muted" style={{ margin: 0 }}>Open until {fmt(o.expires_at)} (Brisbane time). If you accept, it&apos;s binding and it&apos;s paid for the same way as a win: {winPayLine(b)?.replace(/^If you win, /, "") ?? "payment is taken straight away."}</p>}
      {open && <OfferAnswer id={o.id} mode={b.payMode} />}
      {!open && <div className="notice">{o.status === "accepted" ? "You accepted this offer. Your invoice and next steps are in your account." : o.status === "declined" ? "You declined this offer." : "This offer has expired."} <Link className="blue" href="/account">Your account ›</Link></div>}
      <p className="hint" style={{ margin: 0 }}>{consumerRights("outright", sellerType)}</p>
    </div>
  );
}
