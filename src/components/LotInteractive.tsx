"use client";
import { useEffect, useState } from "react";
import type { Fees, Lot } from "@/lib/types";
import { useViewer } from "@/components/Viewer";
import { BidPanel } from "@/components/BidPanel";
import { InspectionBox, DeliveryBox, ReportButton } from "@/components/LotExtras";
import { QuestionBox } from "@/components/LotBits";

type MyState = {
  my_max: number | null; is_leader: boolean | null; is_seller: boolean | null; watched: boolean; invoice_id: string | null;
  last_offer: { amount: number; status: string } | null; inspection: { day: string; time: string; status: string } | null;
  questions: { question: string; answer: string | null; status: string }[];
};
type Hist = { amount: number; created_at: string; bidder_tag: string; is_auto: boolean }[];

// One request per page view for signed-in members, shared by every box on the page.
const cache = new Map<number, Promise<MyState | null>>();
function useLotMe(lotId: number, userId: string | null) {
  const [state, setState] = useState<MyState | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!userId) { setState(null); setLoaded(false); return; }
    if (!cache.has(lotId)) cache.set(lotId, fetch(`/api/lots/${lotId}/me`, { cache: "no-store" }).then((r) => r.json()).then((j) => j.state).catch(() => null));
    let live = true;
    cache.get(lotId)!.then((s) => { if (live) { setState(s); setLoaded(true); } });
    return () => { live = false; cache.delete(lotId); };
  }, [lotId, userId]);
  return { state, loaded };
}

export function LotInteractive({ lot, fees, history, phone }: { lot: Lot; fees: Fees; history: Hist; phone: string }) {
  const v = useViewer();
  const userId = v.user?.id || null;
  const { state: me, loaded } = useLotMe(lot.id, userId);
  const missing = userId ? v.missing : [1, 2, 3, 4, 5];
  const cardLabel = v.profile?.card_brand ? `${v.profile.card_brand} ending ${v.profile.card_last4}` : null;
  const requested = me?.inspection ? `${me.inspection.day}, ${me.inspection.time.toLowerCase()}` : null;
  return (
    <>
      <BidPanel key={`${userId || "anon"}-${loaded ? "me" : "wait"}`} lot={lot} fees={fees} userId={userId} missing={missing} cardLabel={cardLabel}
        termsCurrent={v.profile?.terms_current !== false} myMax={me?.my_max ?? null} watched={me?.watched ?? v.watched.has(lot.id)}
        invoiceId={me?.invoice_id ?? null} lastOffer={me?.last_offer ?? null} isSeller={!!me?.is_seller} history={history} />
      {lot.status === "live" && <InspectionBox key={`insp-${loaded}`} lotId={lot.id} suburb={lot.suburb || ""} state={lot.state || ""} signedIn={!!userId} verified={!!userId && missing.length === 0} endsAt={lot.ends_at} requested={requested} />}
      {["live", "sold"].includes(lot.status) && <DeliveryBox key={`deliv-${userId}`} lotId={lot.id} email={v.user?.email || null} />}
      <div className="soft"><b style={{ fontSize: 17 }}>Collection.</b><span className="muted">From the seller&apos;s location within 5 business days of paying in full. Book a time from your invoice. The seller only hands over the keys to someone with your release code.</span></div>
      <div className="soft" style={{ gap: 6 }}>
        <b style={{ fontSize: 17 }}>Buying safely.</b>
        <span className="muted" style={{ fontSize: 14 }}>Pay Tyrebiter only, never the seller. We never change our bank details by email or SMS. Call {phone} if anything looks odd.</span>
        <ReportButton lotId={lot.id} signedIn={!!userId} />
      </div>
    </>
  );
}

export function LotQuestions({ lotId, open }: { lotId: number; open: boolean }) {
  const v = useViewer();
  const { state: me } = useLotMe(lotId, v.user?.id || null);
  return <QuestionBox lotId={lotId} signedIn={!!v.user} mine={me?.questions || []} open={open} />;
}
