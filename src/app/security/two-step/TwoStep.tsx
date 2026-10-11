"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthSide } from "@/components/AuthSide";
import { supabaseBrowser } from "@/lib/supabase/client";
import { safePath } from "@/lib/safePath";

type Mode = { k: "loading" } | { k: "enrol"; factorId: string; qr: string; secret: string } | { k: "verify"; factorId: string } | { k: "error"; text: string };

// Two-step sign-in with an authenticator app (Supabase MFA, TOTP). Admins must pass it every time they sign in
// before anything in Admin works; the database checks it too, so a stolen password alone isn't enough.
export function TwoStep() {
  const router = useRouter();
  const next = safePath(useSearchParams().get("next"), "/admin");
  const [mode, setMode] = useState<Mode>({ k: "loading" });
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const start = useCallback(async () => {
    const auth = supabaseBrowser().auth;
    const { data: level } = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (level?.currentLevel === "aal2") { router.replace(next); return; }
    const { data, error } = await auth.mfa.listFactors();
    if (error) { setMode({ k: "error", text: "Sign in again, then come back to this page." }); return; }
    const ready = (data?.totp as { id: string; status: string }[] | undefined)?.find((f) => f.status === "verified");
    if (ready) { setMode({ k: "verify", factorId: ready.id }); return; }
    // a half-finished set-up from before is cleared so the new code matches
    for (const f of (data?.all || []) as { id: string; status: string }[]) if (f.status !== "verified") await auth.mfa.unenroll({ factorId: f.id });
    const { data: e, error: enrolErr } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `Tyrebiter ${new Date().toISOString().slice(0, 10)}`, issuer: "Tyrebiter" });
    if (enrolErr || !e) { setMode({ k: "error", text: "Two-step sign-in couldn't be set up. Try again in a minute." }); return; }
    // Supabase gives "data:image/svg+xml;utf-8,<svg…>"; characters like # in raw SVG would cut the picture short
    const raw = e.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, "");
    const qr = raw.startsWith("<") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}` : e.totp.qr_code;
    setMode({ k: "enrol", factorId: e.id, qr, secret: e.totp.secret });
  }, [next, router]);
  useEffect(() => { void start(); }, [start]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (mode.k !== "enrol" && mode.k !== "verify") return;
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) { setErr("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true); setErr("");
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: mode.factorId, code: clean });
    setBusy(false);
    if (error) { setErr("That code didn't match. Codes change every 30 seconds: use the one showing now."); setCode(""); return; }
    router.replace(next);
    router.refresh();
  }

  const codeBox = (
    <>
      <label className="field"><span>6-digit code</span>
        <input className={`input${err ? " err" : ""}`} id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" autoFocus
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-invalid={!!err} data-testid="totp-code"
          style={{ fontSize: 28, fontWeight: 800, letterSpacing: ".4em", textAlign: "center", height: 68 }} />
        {err && <span className="errmsg" role="alert">{err}</span>}
      </label>
      <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy} data-testid="totp-go">{busy ? "Checking…" : "Continue"}</button>
    </>
  );

  return (
    <div className="wrap"><div className="join">
      <AuthSide heading={<>One more <span className="serif" style={{ color: "var(--sun)" }}>lock.</span></>}
        perks={["A code from your phone as well as your password", "A new code every 30 seconds", "Works without signal or data", "Needed every time you sign in to Admin"]}
        note="Lost your phone? Whoever looks after the Supabase account can remove your two-step (Authentication → Users), then you set it up again." />
      <div className="formwrap">
        <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="two-step">
          <h1 style={{ fontSize: "clamp(34px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>Two-step sign-in.</h1>
          {mode.k === "loading" && <span className="muted">Checking your account…</span>}
          {mode.k === "error" && <div className="notice bad">{mode.text}</div>}
          {mode.k === "verify" && (
            <>
              <span className="muted" style={{ fontSize: 16 }}>Open your authenticator app and enter the code for Tyrebiter. Admin needs it every time you sign in.</span>
              {codeBox}
            </>
          )}
          {mode.k === "enrol" && (
            <>
              <span className="muted" style={{ fontSize: 16 }}>Admin accounts can see members&apos; details and move money, so they need a code from your phone as well as your password. It takes a minute, once.</span>
              <ol className="ts-steps">
                <li><b>Get an authenticator app</b><span>Google Authenticator, Microsoft Authenticator or 1Password all work.</span></li>
                <li><b>Scan this code</b><span>In the app, add an account and point your camera at it.</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mode.qr} alt="QR code to add Tyrebiter to your authenticator app" width={184} height={184} className="ts-qr" data-testid="totp-qr" />
                  <span className="ts-key">Can&apos;t scan? Type this key: <code data-testid="totp-secret">{mode.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                    <button type="button" className="copybtn" onClick={() => { navigator.clipboard?.writeText(mode.secret).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied" : "Copy"}</button></span>
                </li>
                <li><b>Enter the code it shows</b><span>Then you&apos;re in. Next time it&apos;s just the code.</span></li>
              </ol>
              {codeBox}
            </>
          )}
        </form>
      </div>
    </div></div>
  );
}
