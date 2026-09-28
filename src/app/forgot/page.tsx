"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthSide } from "@/components/AuthSide";

export default function Forgot() {
  const [sent, setSent] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") || "").trim();
    await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset` });
    setSent(email);
  }
  return (
    <div className="wrap"><div className="join">
      <AuthSide heading={<>Happens to <span className="serif" style={{ color: "var(--sun)" }}>everyone.</span></>} />
      <div className="formwrap">
        <form onSubmit={submit}>
          <h1 style={{ fontSize: "clamp(34px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>Reset your password.</h1>
          {sent ? <p style={{ fontSize: 17 }}>If an account exists for {sent}, we&apos;ve emailed a link to reset your password.</p> : (
            <>
              <span className="muted">Enter your email and we&apos;ll send you a reset link.</span>
              <label className="field"><span>Email</span><input className="input" name="email" type="email" autoComplete="email" required /></label>
              <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }}>Send reset link</button>
            </>
          )}
        </form>
      </div>
    </div></div>
  );
}
