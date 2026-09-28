"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { money } from "@/lib/format";

export function InvoiceActions({ id, mode, amount, reason, collector }: { id: string; mode: "pay" | "collector"; amount?: number; reason?: string | null; collector?: string | null }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [mob, setMob] = useState("");
  const [saved, setSaved] = useState(collector || "");

  if (mode === "collector") {
    if (saved) return <span style={{ fontWeight: 600 }}>Nominated collector: {saved}. They&apos;ll need their own photo ID.</span>;
    return (
      <form style={{ display: "flex", flexDirection: "column", gap: 10 }} onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch(`/api/invoices/${id}/collector`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mobile: mob }) });
        if (res.ok) setSaved(name); else setErr((await res.json()).error);
      }}>
        <b>Someone else collecting? Nominate them.</b>
        <div className="row2"><input className="input" placeholder="Their full name" value={name} onChange={(e) => setName(e.target.value)} style={{ background: "#FFFFFF" }} /><input className="input" placeholder="Their mobile" value={mob} onChange={(e) => setMob(e.target.value)} style={{ background: "#FFFFFF" }} /></div>
        {err && <span className="errmsg">{err}</span>}
        <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 46, fontSize: 15 }}>Save collector</button>
      </form>
    );
  }

  async function start() {
    const res = await fetch(`/api/invoices/${id}/pay`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); return; }
    if (data.test) { router.refresh(); return; }
    setSecret(data.clientSecret);
  }
  return (
    <div className="soft" style={{ background: "#FFE3EA" }}>
      <b>We couldn&apos;t charge your card{reason ? ` (${reason})` : ""}.</b>
      <span>Pay {money(amount, true)} within 1 business day, or the sale may be cancelled with a $250 cancellation fee.</span>
      {secret ? (
        <Elements stripe={loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "")} options={{ clientSecret: secret }}>
          <PayForm onDone={() => router.refresh()} />
        </Elements>
      ) : <button className="btn btn-blue" onClick={start} style={{ alignSelf: "flex-start" }}>Pay now</button>}
      {err && <span className="errmsg">{err}</span>}
    </div>
  );
}

function PayForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      setBusy(true);
      const { error } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: location.href } });
      setBusy(false);
      if (error) setErr(error.message || "Payment failed."); else setTimeout(onDone, 1500);
    }}>
      <PaymentElement />
      {err && <span className="errmsg">{err}</span>}
      <button className="btn btn-blue" disabled={busy}>{busy ? "Paying…" : "Pay"}</button>
    </form>
  );
}
