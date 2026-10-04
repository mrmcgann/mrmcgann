import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeesCached } from "@/lib/cache";
import { priceBreakdown } from "@/lib/fees";
import { money } from "@/lib/format";
import { consumerRights } from "@/lib/listing";
import type { Lot } from "@/lib/types";
import { OfferAnswer } from "./OfferAnswer";

export const dynamic = "force-dynamic";

// The next highest bidder's offer page (the winner didn't pay). No obligation: accept or decline.
export default async function SecondChance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getSession();
  if (!user) redirect(`/signin?next=/offers/${id}`);
  const { data: o } = await supabase.from("second_chance_offers").select("id, lot_id, amount, status, expires_at").eq("id", id).maybeSingle();
  if (!o) notFound();
  const { data: lot } = await supabase.from("lots").select("id, title, suburb, state, seller_type, gst_status").eq("id", o.lot_id).maybeSingle();
  const fees = await getFeesCached();
  const b = priceBreakdown(Number(o.amount), fees);
  const expired = o.status === "pending" && new Date(o.expires_at) <= new Date();
  const open = o.status === "pending" && !expired;
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
      {open && <p className="muted" style={{ margin: 0 }}>Open until {new Date(o.expires_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} (Brisbane time). If you accept, it&apos;s binding and payment is taken the same way as a win.</p>}
      {open && <OfferAnswer id={o.id} />}
      {!open && <div className="notice">{o.status === "accepted" ? "You accepted this offer. Your invoice and next steps are in your account." : o.status === "declined" ? "You declined this offer." : "This offer has expired."} <Link className="blue" href="/account">Your account ›</Link></div>}
      <p className="hint" style={{ margin: 0 }}>{consumerRights("outright", (lot as Pick<Lot, "seller_type"> | null)?.seller_type)}</p>
    </div>
  );
}
