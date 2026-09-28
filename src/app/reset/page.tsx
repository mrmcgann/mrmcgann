"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthSide } from "@/components/AuthSide";

export default function Reset() {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pw = String(new FormData(e.currentTarget).get("password") || "");
    if (pw.length < 10) { setErr("Use at least 10 characters."); return; }
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    if (error) { setErr("That reset link has expired. Request a new one."); return; }
    router.push("/account");
    router.refresh();
  }
  return (
    <div className="wrap"><div className="join">
      <AuthSide heading={<>Fresh <span className="serif" style={{ color: "var(--sun)" }}>start.</span></>} />
      <div className="formwrap">
        <form onSubmit={submit}>
          <h1 style={{ fontSize: "clamp(34px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>Choose a new password.</h1>
          <label className="field"><span>New password</span><input className="input" name="password" type="password" autoComplete="new-password" /></label>
          {err && <div className="notice bad">{err}</div>}
          <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }}>Save password</button>
        </form>
      </div>
    </div></div>
  );
}
