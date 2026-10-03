import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { STATES } from "@/lib/grades";
import { maskMobile } from "@/lib/format";
import { api, ApiError, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { usePayments } from "~/lib/pay";
import { supabase } from "~/lib/supabase";
import { STEP_NAMES, useSession } from "~/lib/session";
import type { Me } from "~/lib/types";
import { Button, Check, Field, LinkText, Loading, Notice, Screen, Segmented, Select, Soft, T } from "~/ui/kit";
import { Icon } from "~/ui/art";
import { C, F } from "~/ui/theme";

const toIso = (d: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim()); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
const fromIso = (d: string | null | undefined) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const dobMask = (t: string) => { const d = t.replace(/\D/g, "").slice(0, 8); return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

/** Join and verify: account, details, mobile, card, ID (the website's JoinWizard). */
export default function Join() {
  const params = useLocalSearchParams<{ step?: string; next?: string; seller?: string }>();
  const next = params.next || "";
  const { refresh } = useSession();
  const { saveCard } = usePayments();
  const [me, setMe] = useState<Me | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (preferred?: number) => {
    const r = (await refresh()) || ({ user: null, profile: null, missing: [1, 2, 3, 4, 5], watched: [], config: { stripe: false, testMode: false, sms: false } } as Me);
    if (params.seller) r.missing = r.missing.filter((n) => n !== 4);
    setMe(r);
    const asked = preferred ?? (Number(params.step) || 0);
    if (!r.user) setStep(1);
    else if (asked > 1 && asked <= 5) setStep(asked);
    else if (r.missing.length) setStep(r.missing[0]);
    else setStep(99);
    return r;
  }, [refresh, params.step, params.seller]);
  useEffect(() => { void load(); }, [load]);

  // Back to where they started (the lot they wanted to bid on, the account page…).
  function finish() {
    if (router.canGoBack()) router.back();
    else if (next) router.replace(next as never);
    else router.replace(me?.profile?.intent === "sell" ? "/sell" : "/account");
  }
  async function advance() {
    const r = await load(-1);
    if (!r.missing.length) finish();
  }

  // Step 1: account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  async function submitAccount() {
    const err: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) err.email = "Enter a valid email.";
    if (password.length < 10) err.password = "Use at least 10 characters.";
    if (!terms) err.terms = "Tick the box to confirm you're 18 or over and agree to the terms.";
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${SITE}/auth/callback?next=/join` } });
    setBusy(false);
    if (error) { setErrors({ email: error.message.includes("registered") ? "That email already has an account. Sign in instead." : error.message }); return; }
    if (!data.session) { setPendingEmail(email.trim()); return; }
    await api("/api/profile", { body: { terms: true } }).catch(() => undefined);
    await load(2);
  }
  async function submitEmailCode() {
    const token = emailCode.replace(/\D/g, "");
    if (token.length !== 6) { setErrors({ emailcode: "Enter all 6 digits." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: pendingEmail, token, type: "email" });
    setBusy(false);
    if (error) { setErrors({ emailcode: "That code doesn't match or has expired. Check your email or send a new one." }); return; }
    setErrors({});
    await api("/api/profile", { body: { terms: true } }).catch(() => undefined);
    await load(2);
  }

  // Step 2: details
  const p = me?.profile;
  const [d, setD] = useState({ first_name: "", last_name: "", dob: "", mobile: "", street: "", suburb: "", state: "QLD", postcode: "" });
  const [intent, setIntent] = useState<"buy" | "sell" | "both">("buy");
  useEffect(() => {
    if (p) setD({ first_name: p.first_name || "", last_name: p.last_name || "", dob: fromIso(p.dob), mobile: p.mobile || "", street: p.street || "", suburb: p.suburb || "", state: p.state || "QLD", postcode: p.postcode || "" });
    if (p?.intent === "sell" || p?.intent === "both") setIntent(p.intent);
  }, [p]);
  const setField = (k: keyof typeof d) => (t: string) => setD((x) => ({ ...x, [k]: t }));
  async function submitDetails() {
    setBusy(true);
    try {
      await api("/api/profile", { body: { ...d, dob: toIso(d.dob), mobile: d.mobile.replace(/\s/g, ""), intent } });
      setErrors({});
      const r = await load(-1);
      if (r.missing.includes(3)) { setStep(3); void sendCode(true); } else if (!r.missing.length) finish();
    } catch (e) {
      const errs = e instanceof ApiError ? (e.data.errors as Record<string, string> | undefined) : undefined;
      setErrors(errs || { first_name: errText(e) });
      if (errs?.dob && !toIso(d.dob)) setErrors({ ...errs, dob: "Enter your date of birth as DD/MM/YYYY." });
    }
    setBusy(false);
  }

  // Step 3: mobile
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  async function sendCode(silent = false) {
    try { await api("/api/verify/send", { method: "POST" }); setSent(true); if (!silent) setNotice("New code sent."); }
    catch (e) { setErrors({ code: errText(e) }); }
  }
  async function submitCode() {
    setBusy(true);
    try { await api("/api/verify/check", { body: { code } }); setErrors({}); setNotice(""); await advance(); }
    catch (e) { setErrors({ code: errText(e) }); }
    setBusy(false);
  }

  // Step 4: card (Stripe's payment sheet)
  async function startCard() {
    setBusy(true); setErrors({});
    try {
      const r = await api<{ test?: boolean; clientSecret?: string }>("/api/stripe/setup", { method: "POST" });
      if (r.test) { await advance(); setBusy(false); return; }
      const res = await saveCard(r.clientSecret!);
      if ("error" in res) setErrors({ card: res.error });
      else if ("ok" in res) {
        await api("/api/stripe/card-saved", { body: { setupIntentId: r.clientSecret!.split("_secret_")[0] } });
        await advance();
      }
    } catch (e) { setErrors({ card: errText(e) }); }
    setBusy(false);
  }

  // Step 5: ID (Stripe Identity in the in-app browser)
  const [idState, setIdState] = useState<string | null>(null);
  async function checkId() {
    try { const r = await api<{ status: string }>("/api/identity/refresh", { method: "POST" }); setIdState(r.status); if (r.status === "verified") await advance(); }
    catch (e) { setErrors({ id: errText(e) }); }
  }
  async function startId() {
    setBusy(true); setErrors({});
    try {
      const r = await api<{ test?: boolean; url?: string }>("/api/identity/start", { body: { returnTo: "/join?step=5&identity=return" } });
      if (r.test) { await advance(); setBusy(false); return; }
      await WebBrowser.openBrowserAsync(r.url!, { dismissButtonStyle: "done" });
      await checkId();
    } catch (e) { setErrors({ id: errText(e) }); }
    setBusy(false);
  }

  const done = [me?.user ? 1 : 0, p?.details_done ? 2 : 0, p?.mobile_verified ? 3 : 0, p?.payment_method_id ? 4 : 0, p?.id_status === "verified" ? 5 : 0].filter(Boolean);
  const progress = (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`Step ${Math.min(step, 5)} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <View key={n} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: done.includes(n) ? C.mint : n === step ? C.blue : C.panel2 }} />)}
    </View>
  );

  if (!me || step === 0) return <Loading />;
  let body: React.ReactNode;
  if (step === 1 && pendingEmail) {
    body = (
      <>
        <T v="d3">Check your email.</T>
        <T v="muted">We sent a 6-digit code to <Text style={{ fontFamily: F.bold, color: C.ink }}>{pendingEmail}</Text>.</T>
        <Field label="Email code" value={emailCode} onChangeText={(t) => setEmailCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" error={errors.emailcode} inputStyle={{ fontSize: 28, letterSpacing: 8, textAlign: "center", height: 66 }} />
        {notice ? <T v="small">{notice}</T> : null}
        <Button title="Verify email" busy={busy} onPress={submitEmailCode} />
        <LinkText title="Send a new code" style={{ alignSelf: "center" }} onPress={async () => { await supabase.auth.resend({ type: "signup", email: pendingEmail }); setNotice("New code sent."); }} />
        <LinkText title="Use a different email" color={C.muted} style={{ alignSelf: "center" }} onPress={() => { setPendingEmail(""); setNotice(""); }} />
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        <T v="d3">Create your account.</T>
        <T v="muted">Free to join. Already a member? <Text style={{ color: C.blue, fontFamily: F.bold }} onPress={() => router.replace(`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`)}>Sign in ›</Text></T>
        <Field testID="join-email" label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" error={errors.email} />
        <Field testID="join-password" label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" error={errors.password} hint="At least 10 characters." />
        <Check testID="join-terms" checked={terms} onChange={setTerms}>
          <Text style={{ fontFamily: F.medium, fontSize: 15, lineHeight: 21, color: C.ink2 }}>I'm 18 or over and agree to the <Text style={{ color: C.blue, fontFamily: F.bold }} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms`)}>Terms of sale</Text>, including that vehicles are sold as is, where is, with no warranty.</Text>
        </Check>
        {errors.terms ? <T v="small" style={{ color: C.badInk }}>{errors.terms}</T> : null}
        <Button testID="join-continue" title="Continue" busy={busy} onPress={submitAccount} />
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        <T v="d3">Your details.</T>
        <T v="muted">Use your legal name and date of birth. They must match your ID.</T>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field testID="d-first" label="First name" value={d.first_name} onChangeText={setField("first_name")} autoComplete="given-name" error={errors.first_name} style={{ flex: 1 }} />
          <Field testID="d-last" label="Last name" value={d.last_name} onChangeText={setField("last_name")} autoComplete="family-name" error={errors.last_name} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Field testID="d-dob" label="Date of birth" value={d.dob} onChangeText={(t) => setField("dob")(dobMask(t))} keyboardType="number-pad" placeholder="DD/MM/YYYY" error={errors.dob} style={{ flex: 1 }} />
          <Field testID="d-mobile" label="Mobile" value={d.mobile} onChangeText={setField("mobile")} keyboardType="phone-pad" autoComplete="tel" placeholder="04xx xxx xxx" error={errors.mobile} style={{ flex: 1 }} />
        </View>
        <Field testID="d-street" label="Street address" value={d.street} onChangeText={setField("street")} autoComplete="street-address" error={errors.street} />
        <Field testID="d-suburb" label="Suburb" value={d.suburb} onChangeText={setField("suburb")} error={errors.suburb} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Select label="State" value={d.state} options={STATES.map((s) => [s, s] as [string, string])} placeholder="State" onChange={(v) => setField("state")(v || "QLD")} />
          <Field testID="d-postcode" label="Postcode" value={d.postcode} onChangeText={(t) => setField("postcode")(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" error={errors.postcode} style={{ flex: 1 }} />
        </View>
        <T v="label">I'm here to</T>
        <Segmented options={[["buy", "Buy"], ["sell", "Sell"], ["both", "Both"]]} value={intent} onChange={setIntent} />
        <Button testID="details-continue" title="Send my verification code" busy={busy} onPress={submitDetails} />
      </>
    );
  } else if (step === 3) {
    body = (
      <>
        <T v="d3">Check your phone.</T>
        <T v="muted">We sent a 6-digit code to <Text style={{ fontFamily: F.bold, color: C.ink }}>{maskMobile(p?.mobile)}</Text>. <Text style={{ color: C.blue, fontFamily: F.bold }} onPress={() => setStep(2)}>Change number</Text></T>
        <Field testID="sms-code" label="Verification code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" error={errors.code} inputStyle={{ fontSize: 28, letterSpacing: 8, textAlign: "center", height: 66 }} />
        {me.config.testMode && !me.config.sms ? <Notice>Test mode: no SMS is sent. Use code 123456.</Notice> : null}
        {notice ? <T v="small">{notice}</T> : null}
        <Button testID="sms-verify" title="Verify mobile" busy={busy} onPress={submitCode} />
        <LinkText title={sent ? "Resend code" : "Send code"} style={{ alignSelf: "center" }} onPress={() => sendCode()} />
      </>
    );
  } else if (step === 4) {
    body = (
      <>
        <T v="d3">Add a payment card.</T>
        <T v="muted">Required to bid. No charge today. If you win, payment is taken automatically as soon as the auction ends.</T>
        <Soft>
          <T v="strong">How paying works</T>
          <T v="body"><Text style={{ fontFamily: F.bold }}>Total under $5,000: </Text>charged to your card in full straight away when the auction ends.</T>
          <T v="body"><Text style={{ fontFamily: F.bold }}>$5,000 or more: </Text>a non-refundable deposit ($500, or $1,000 over $20,000) is charged straight away. Pay the balance by bank transfer within 2 business days.</T>
        </Soft>
        {p?.payment_method_id ? <Notice kind="ok">{`${p.card_brand} ending ${p.card_last4} is on file.`}</Notice> : null}
        {errors.card ? <Notice kind="bad">{errors.card}</Notice> : null}
        <Button testID="add-card" title={p?.payment_method_id ? "Replace card" : me.config.stripe ? "Add a card" : "Add a test card (test mode)"} busy={busy} onPress={startCard} />
        {p?.payment_method_id ? <Button kind="soft" title="Keep this card" onPress={() => advance()} /> : null}
        <T v="small">Cards are handled by Stripe. Tyrebiter never sees or stores your card number.</T>
      </>
    );
  } else if (step === 5) {
    const st = idState ?? p?.id_status;
    body = (
      <>
        <T v="d3">Verify your ID.</T>
        <T v="muted">Required once, before your first bid. Your name and date of birth must match your document.</T>
        <Soft>
          <T v="body">You'll take a photo of your driver licence or passport and a quick selfie. It takes about two minutes.</T>
          <T v="small">Checking {p?.first_name} {p?.last_name}, born {fromIso(p?.dob)}. <Text style={{ color: C.blue, fontFamily: F.bold }} onPress={() => setStep(2)}>Wrong? Edit</Text></T>
        </Soft>
        {st === "pending" ? <Notice>We're still checking your ID. This usually takes a minute or two.</Notice> : null}
        {st === "failed" ? <Notice kind="bad">We couldn't verify your ID, or the name and date of birth didn't match your details. Check your details and try again.</Notice> : null}
        {errors.id ? <Notice kind="bad">{errors.id}</Notice> : null}
        <Button testID="verify-id" title={me.config.stripe ? "Verify my ID" : "Verify ID (test mode)"} busy={busy} onPress={startId} />
        {st === "pending" ? <Button kind="soft" title="Check again" onPress={checkId} /> : null}
        <T v="small">ID checks are handled securely by Stripe Identity. Tyrebiter keeps the result, not a copy of your document.</T>
        <LinkText title="Verify later" color={C.muted} style={{ alignSelf: "center" }} onPress={finish} />
      </>
    );
  } else {
    body = (
      <>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" }}><Icon name="check" size={30} strokeWidth={3} /></View>
        <T v="d3">You're ready to bid.</T>
        <T v="muted">Mobile, card and ID are all verified.</T>
        <Button testID="join-done" title="Continue" onPress={finish} />
      </>
    );
  }
  return (
    <Screen keyboard testID={`join-step-${step}`}>
      {step <= 5 ? progress : null}
      {step > 1 && step <= 5 ? <T v="eyebrow">Step {step} of 5 · {STEP_NAMES[step]}</T> : null}
      {body}
      {step > 1 && step <= 5 ? <Pressable onPress={finish} accessibilityRole="button"><Text style={{ fontFamily: F.semibold, color: C.muted, textAlign: "center" }}>I'll finish this later</Text></Pressable> : null}
    </Screen>
  );
}
