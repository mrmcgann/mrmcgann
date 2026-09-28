"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Business details for tax invoices, change password or email, close account.
export function AccountExtras({ company, abn, email }: { company: string; abn: string; email: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function saveBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/account/business", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: f.get("company"), abn: f.get("abn") }) });
    const data = await res.json();
    setMsg(res.ok ? { ok: true, text: "Business details saved. They'll appear on your tax invoices." } : { ok: false, text: data.error });
  }
  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pw = String(new FormData(e.currentTarget).get("pw") || "");
    if (pw.length < 10) { setMsg({ ok: false, text: "Use at least 10 characters." }); return; }
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password changed." });
  }
  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const em = String(new FormData(e.currentTarget).get("email") || "").trim();
    const { error } = await supabaseBrowser().auth.updateUser({ email: em });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Check ${em} (and ${email}) for a confirmation link.` });
  }
  async function close() {
    if (!confirm("Close your account? We'll keep sale and tax records the law requires, and delete the rest.")) return;
    const res = await fetch("/api/account/close", { method: "POST" });
    const data = await res.json();
    setMsg(res.ok ? { ok: true, text: "Request received. We'll confirm by email within 2 business days." } : { ok: false, text: data.error });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 className="d3" style={{ fontSize: 36, marginBottom: 0 }}>Account settings.</h2>
      {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}
      <form className="soft" onSubmit={saveBusiness}>
        <b>Buying for a business?</b>
        <div className="row2"><input className="input" name="company" placeholder="Company name" defaultValue={company} style={{ background: "#FFFFFF" }} /><input className="input" name="abn" placeholder="ABN" inputMode="numeric" defaultValue={abn} style={{ background: "#FFFFFF" }} /></div>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 44 }}>Save business details</button>
      </form>
      <form className="soft" onSubmit={changePassword}>
        <b>Change password</b>
        <input className="input" type="password" name="pw" autoComplete="new-password" placeholder="New password (10+ characters)" style={{ background: "#FFFFFF" }} />
        <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 44 }}>Change password</button>
      </form>
      <form className="soft" onSubmit={changeEmail}>
        <b>Change email</b>
        <input className="input" type="email" name="email" placeholder="New email" style={{ background: "#FFFFFF" }} />
        <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 44 }}>Change email</button>
      </form>
      <button className="linkbtn" style={{ alignSelf: "flex-start", color: "#B4123E", fontWeight: 700 }} onClick={close}>Close my account</button>
    </div>
  );
}
