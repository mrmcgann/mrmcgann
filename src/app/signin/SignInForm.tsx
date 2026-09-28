"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthSide } from "@/components/AuthSide";

export function SignInForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/watchlist";
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (error) { setErr(error.message.includes("confirm") ? "Confirm your email first, using the link we sent you." : "That email and password don't match. Try again or reset your password."); return; }
    router.push(next);
    router.refresh();
  }
  return (
    <div className="wrap"><div className="join">
      <AuthSide heading={<>Welcome <span className="serif" style={{ color: "var(--sun)" }}>back.</span></>} />
      <div className="formwrap">
        <form onSubmit={submit} noValidate>
          <h1 style={{ fontSize: "clamp(34px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>Sign in.</h1>
          <span className="muted" style={{ fontSize: 16 }}>New here? <Link className="blue" href={`/join?next=${encodeURIComponent(next)}`} style={{ fontWeight: 700 }}>Create an account ›</Link></span>
          <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" /></label>
          <label className="field"><span>Password</span><input className="input" name="password" type="password" autoComplete="current-password" /></label>
          <Link className="linkbtn" href="/forgot" style={{ alignSelf: "flex-start", marginTop: -6 }}>Forgot password?</Link>
          {err && <div className="notice bad">{err}</div>}
          <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div></div>
  );
}
