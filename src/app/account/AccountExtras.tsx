"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Business details for tax invoices, change password or email, delete account.
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
  // Deletes the account straight away when nothing is in progress (live bids, unpaid
  // or uncollected purchases, vehicles for sale); otherwise says what to finish first.
  async function close() {
    const check = await (await fetch("/api/account/delete", { cache: "no-store" })).json().catch(() => ({ blockers: [] }));
    if (check.blockers?.length) { setMsg({ ok: false, text: `We can't delete your account yet. ${check.blockers.join(" ")} Call us if you need help.` }); return; }
    const typed = prompt("Delete your account? This can't be undone. We keep records of purchases and sales only as long as tax law requires, and delete everything else.\n\nType DELETE to confirm.");
    if (typed !== "DELETE") return;
    const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
    const data = await res.json();
    if (!res.ok) { setMsg({ ok: false, text: data.blockers?.length ? `We can't delete your account yet. ${data.blockers.join(" ")}` : data.error }); return; }
    await supabaseBrowser().auth.signOut().catch(() => undefined);
    location.href = "/?deleted=1";
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
      <button className="linkbtn" style={{ alignSelf: "flex-start", color: "#B4123E", fontWeight: 700 }} onClick={close}>Delete my account</button>
    </div>
  );
}
