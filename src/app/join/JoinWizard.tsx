"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthSide } from "@/components/AuthSide";
import { Tick } from "@/components/CarArt";
import { maskMobile } from "@/lib/format";
import { STATES } from "@/lib/grades";
import type { Profile } from "@/lib/types";

type Me = { user: { id: string; email: string } | null; profile: Profile | null; missing: number[]; config: { stripe: boolean; testMode: boolean; sms: boolean } };
let stripePromise: Promise<Stripe | null> | null = null;
const getStripeJs = () => (stripePromise ??= loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""));

function Field({ id, label, error, ...rest }: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field"><span>{label}</span>
      <input id={id} name={id} className={`input${error ? " err" : ""}`} aria-invalid={!!error} {...rest} />
      {error && <span className="errmsg">{error}</span>}
    </label>
  );
}

const H = ({ t, sub }: { t: string; sub?: React.ReactNode }) => (
  <>
    <h1 style={{ fontSize: "clamp(34px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>{t}</h1>
    {sub && <span className="muted" style={{ fontSize: 16 }}>{sub}</span>}
  </>
);

export function JoinWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "";
  const [me, setMe] = useState<Me | null>(null);
  const [step, setStep] = useState<number>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (preferred?: number) => {
    const r: Me = await (await fetch("/api/me", { cache: "no-store" })).json();
    setMe(r);
    const asked = preferred || Number(params.get("step")) || 0;
    if (!r.user) setStep(1);
    else if (asked && asked > 1 && asked <= 5) setStep(asked);
    else if (r.missing.length) setStep(r.missing[0]);
    else setStep(99);
    return r;
  }, [params]);

  useEffect(() => { load(); }, [load]);

  function finish() {
    router.push(next || (me?.profile?.intent === "sell" ? "/sell" : "/account"));
    router.refresh();
  }
  async function advance() {
    const r = await load(-1);
    if (!r.missing.length) finish();
  }

  // Step 1: account
  async function submitAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim(), password = String(f.get("password") || ""), terms = f.get("terms") === "on";
    const err: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) err.email = "Enter a valid email.";
    if (password.length < 10) err.password = "Use at least 10 characters.";
    if (!terms) err.terms = "Tick the box to confirm you’re 18 or over and agree to the terms.";
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    const db = supabaseBrowser();
    const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/join` } });
    setBusy(false);
    if (error) { setErrors({ email: error.message.includes("registered") ? "That email already has an account. Sign in instead." : error.message }); return; }
    if (!data.session) { setPendingEmail(email); setNotice(""); return; }
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: true }) });
    router.refresh();
    await load(2);
  }

  // Step 1b: email verification code
  const [pendingEmail, setPendingEmail] = useState("");
  async function submitEmailCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("emailcode") || "").replace(/\D/g, "");
    if (token.length !== 6) { setErrors({ emailcode: "Enter all 6 digits." }); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: pendingEmail, token, type: "email" });
    setBusy(false);
    if (error) { setErrors({ emailcode: "That code doesn't match or has expired. Check your email or send a new one." }); return; }
    setErrors({});
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms: true }) });
    router.refresh();
    await load(2);
  }
  async function resendEmail() {
    await supabaseBrowser().auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: `${location.origin}/auth/callback?next=/join` } });
    setNotice("New code sent.");
  }

  // Step 2: details
  const [intent, setIntent] = useState("buy");
  async function submitDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true);
    const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, intent }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErrors(data.errors || { first_name: data.error }); return; }
    setErrors({});
    const r = await load(-1);
    if (r.missing.includes(3)) sendCode(true);
    else if (!r.missing.length) finish();
  }

  // Step 3: mobile
  const [sent, setSent] = useState(false);
  async function sendCode(silent = false) {
    const res = await fetch("/api/verify/send", { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setErrors({ code: data.error }); return; }
    setSent(true);
    if (!silent) setNotice("New code sent.");
  }
  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") || "");
    setBusy(true);
    const res = await fetch("/api/verify/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErrors({ code: data.error }); return; }
    setErrors({}); setNotice("");
    await advance();
  }

  // Step 4: card
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  async function startCard() {
    setBusy(true);
    const res = await fetch("/api/stripe/setup", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErrors({ card: data.error }); return; }
    if (data.test) { await advance(); return; }
    setClientSecret(data.clientSecret);
  }

  // Step 5: ID
  const [idState, setIdState] = useState<string | null>(null);
  useEffect(() => {
    if (step === 5 && params.get("identity") === "return") {
      fetch("/api/identity/refresh", { method: "POST" }).then((r) => r.json()).then((d) => { setIdState(d.status); if (d.status === "verified") advance(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  async function checkId() {
    const d = await (await fetch("/api/identity/refresh", { method: "POST" })).json();
    setIdState(d.status);
    if (d.status === "verified") advance();
  }
  async function startId() {
    setBusy(true);
    const res = await fetch("/api/identity/start", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErrors({ id: data.error }); return; }
    if (data.test) { await advance(); return; }
    location.href = data.url;
  }

  const p = me?.profile;
  const done = [me?.user ? 1 : 0, p?.details_done ? 2 : 0, p?.mobile_verified ? 3 : 0, p?.payment_method_id ? 4 : 0, p?.id_status === "verified" ? 5 : 0].filter(Boolean);
  let form: React.ReactNode = null;

  if (!me || step === 0) form = <p className="muted">Loading…</p>;
  else if (step === 1) {
    form = pendingEmail ? (
      <form onSubmit={submitEmailCode} noValidate>
        <H t="Check your email." sub={<>We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>{pendingEmail}</b>. You can also tap the link in the email.</>} />
        <Field id="emailcode" label="Email code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" error={errors.emailcode} style={{ fontSize: 28, fontWeight: 800, letterSpacing: ".4em", textAlign: "center", height: 68 }} />
        {notice && <span className="hint">{notice}</span>}
        <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{busy ? "Checking…" : "Verify email"}</button>
        <button type="button" className="linkbtn" style={{ alignSelf: "center" }} onClick={resendEmail}>Send a new code</button>
        <button type="button" className="linkbtn" style={{ alignSelf: "center", color: "var(--muted)" }} onClick={() => { setPendingEmail(""); setNotice(""); }}>Use a different email</button>
      </form>
    ) : (
      <form onSubmit={submitAccount} noValidate>
        <H t="Create your account." sub={<>Free to join. Already a member? <Link className="blue" href={`/signin${next ? `?next=${next}` : ""}`} style={{ fontWeight: 700 }}>Sign in ›</Link></>} />
        <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email} />
        <Field id="password" label="Password" type="password" autoComplete="new-password" error={errors.password} />
        {!errors.password && <span className="hint" style={{ marginTop: -8 }}>At least 10 characters.</span>}
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, color: "var(--ink2)" }}>
          <input type="checkbox" name="terms" style={{ width: 20, height: 20, margin: "1px 0 0", flexShrink: 0, accentColor: "#2F5BFF" }} />
          <span>I&apos;m 18 or over and agree to the <Link className="blue" href="/terms" target="_blank" style={{ fontWeight: 700 }}>Terms of sale</Link>, including that vehicles are sold as is, where is, with no warranty.</span>
        </label>
        {errors.terms && <span className="errmsg">{errors.terms}</span>}
        <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{busy ? "Creating…" : "Continue"}</button>
      </form>
    );
  } else if (step === 2) {
    form = (
      <form onSubmit={submitDetails} noValidate>
        <H t="Your details." sub="Use your legal name and date of birth. They must match your ID." />
        <div className="row2"><Field id="first_name" label="First name" autoComplete="given-name" defaultValue={p?.first_name || ""} error={errors.first_name} /><Field id="last_name" label="Last name" autoComplete="family-name" defaultValue={p?.last_name || ""} error={errors.last_name} /></div>
        <div className="row2"><Field id="dob" label="Date of birth" type="date" autoComplete="bday" defaultValue={p?.dob || ""} error={errors.dob} /><Field id="mobile" label="Mobile" type="tel" autoComplete="tel" placeholder="04xx xxx xxx" defaultValue={p?.mobile || ""} error={errors.mobile} /></div>
        <Field id="street" label="Street address" autoComplete="street-address" defaultValue={p?.street || ""} error={errors.street} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px 110px", gap: 12 }}>
          <Field id="suburb" label="Suburb" autoComplete="address-level2" defaultValue={p?.suburb || ""} error={errors.suburb} />
          <label className="field"><span>State</span><select className="input" name="state" defaultValue={p?.state || "QLD"}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <Field id="postcode" label="Postcode" inputMode="numeric" maxLength={4} defaultValue={p?.postcode || ""} error={errors.postcode} />
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <legend style={{ fontSize: 14, fontWeight: 700, padding: 0, marginBottom: 8 }}>I&apos;m here to</legend>
          <div className="chips">{[["buy", "Buy", "var(--sun)"], ["sell", "Sell", "var(--berry)"], ["both", "Both", "var(--lime)"]].map(([k, l, c]) => <button type="button" key={k} aria-pressed={intent === k} onClick={() => setIntent(k)} style={{ background: intent === k ? c : "var(--panel)" }}>{l}</button>)}</div>
        </fieldset>
        <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{busy ? "Saving…" : "Send my verification code"}</button>
      </form>
    );
  } else if (step === 3) {
    form = (
      <form onSubmit={submitCode} noValidate>
        <H t="Check your phone." sub={<>We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>{maskMobile(p?.mobile)}</b>. <button type="button" className="linkbtn" onClick={() => setStep(2)}>Change number</button></>} />
        <Field id="code" label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" error={errors.code} style={{ fontSize: 28, fontWeight: 800, letterSpacing: ".4em", textAlign: "center", height: 68 }} />
        {me.config.testMode && !me.config.sms && <div className="notice">Test mode: no SMS is sent. Use code <b>123456</b>.</div>}
        {notice && <span className="hint">{notice}</span>}
        <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>Verify mobile</button>
        <button type="button" className="linkbtn" style={{ alignSelf: "center" }} onClick={() => sendCode()}>{sent ? "Resend code" : "Send code"}</button>
      </form>
    );
  } else if (step === 4) {
    form = (
      <div style={{ display: "flex", flexDirection: "column", gap: 15, width: "min(500px,100%)" }}>
        <H t="Add a payment card." sub="Required to bid. No charge today. If you win, payment is taken automatically as soon as the auction ends." />
        <div className="soft" style={{ gap: 10 }}>
          <b style={{ fontSize: 17 }}>How paying works</b>
          <div className="check" style={{ border: 0, padding: "4px 0" }}><span className="tick"><Tick /></span><span><b>Total under $5,000</b><br /><span className="muted" style={{ fontSize: 14 }}>Charged to your card in full straight away when the auction ends.</span></span></div>
          <div className="check" style={{ border: 0, padding: "4px 0" }}><span className="tick"><Tick /></span><span><b>$5,000 or more</b><br /><span className="muted" style={{ fontSize: 14 }}>A non-refundable deposit ($500, or $1,000 over $20,000) is charged straight away. Pay the balance by bank transfer within 2 business days.</span></span></div>
        </div>
        {p?.payment_method_id && !clientSecret && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 18, borderRadius: 18, border: "2px solid var(--mint)" }}>
            <span className="tick"><Tick /></span><b style={{ flexGrow: 1 }}>{p.card_brand} ending {p.card_last4} is on file.</b>
            <button className="linkbtn" onClick={finish}>Keep it</button>
          </div>
        )}
        {clientSecret ? (
          <Elements stripe={getStripeJs()} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#2F5BFF", borderRadius: "14px", fontFamily: "system-ui" } } }}>
            <CardForm onSaved={advance} />
          </Elements>
        ) : (
          <>
            {errors.card && <div className="notice bad">{errors.card}</div>}
            <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} onClick={startCard} disabled={busy}>{busy ? "Loading…" : p?.payment_method_id ? "Replace card" : me.config.stripe ? "Add a card" : "Add a test card (test mode)"}</button>
            <span className="hint">Cards are handled by Stripe. Tyrebiter never sees or stores your card number.</span>
          </>
        )}
      </div>
    );
  } else if (step === 5) {
    form = (
      <div style={{ display: "flex", flexDirection: "column", gap: 15, width: "min(500px,100%)" }}>
        <H t="Verify your ID." sub="Required once, before your first bid or inspection. Your name and date of birth must match your document." />
        <div className="soft">
          <span>You&apos;ll take a photo of your <b>driver licence or passport</b> and a quick selfie. It takes about two minutes.</span>
          <span style={{ fontSize: 14 }}>Checking <b>{p?.first_name} {p?.last_name}</b>, born <b>{p?.dob}</b>. <button className="linkbtn" onClick={() => setStep(2)}>Wrong? Edit</button></span>
        </div>
        {(idState ?? p?.id_status) === "pending" && <div className="notice">We&apos;re still checking your ID. This usually takes a minute or two. <button className="linkbtn" onClick={checkId}>Check again</button></div>}
        {(idState === "failed" || p?.id_status === "failed") && <div className="notice bad">We couldn&apos;t verify your ID, or the name and date of birth didn&apos;t match your details. Check your details and try again.</div>}
        {errors.id && <div className="notice bad">{errors.id}</div>}
        <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} onClick={startId} disabled={busy}>{busy ? "Opening…" : me.config.stripe ? "Verify my ID" : "Verify ID (test mode)"}</button>
        <span className="hint">ID checks are handled securely by Stripe Identity. Tyrebiter keeps the result, not a copy of your document.</span>
        <button className="linkbtn" style={{ alignSelf: "center", color: "var(--muted)" }} onClick={finish}>Verify later</button>
      </div>
    );
  } else {
    form = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <H t="You're ready to bid." sub="Mobile, card and ID are all verified." />
        <button className="btn btn-blue" onClick={finish}>Continue</button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="join">
        <AuthSide heading={<>Your next car is <span className="serif" style={{ color: "var(--sun)" }}>already here.</span></>} step={step >= 1 && step <= 5 ? step : 5} done={done} />
        <div className="formwrap">{form}</div>
      </div>
    </div>
  );
}

function CardForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: `${location.origin}/join?step=4` } });
    if (error || !setupIntent) { setErr(error?.message || "We couldn't save that card."); setBusy(false); return; }
    const res = await fetch("/api/stripe/card-saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupIntentId: setupIntent.id }) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error); return; }
    onSaved();
  }
  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PaymentElement />
      {err && <div className="notice bad">{err}</div>}
      <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy || !stripe}>{busy ? "Saving…" : "Save card"}</button>
    </form>
  );
}
