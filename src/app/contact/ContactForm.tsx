"use client";
import { useState } from "react";

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setErr("");
    const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error); return; }
    setDone(true);
  }
  if (done) return <div className="notice ok">Thanks. We&apos;ll be in touch within 1 business day.</div>;
  return (
    <form className="formcard" onSubmit={submit}>
      <div className="row2"><label className="field"><span>Name</span><input className="input" name="name" required /></label><label className="field"><span>Email</span><input className="input" name="email" type="email" required /></label></div>
      <label className="field"><span>Topic</span><select className="input" name="topic"><option>Buying</option><option>Selling</option><option>Payments</option><option>Collection</option><option>A claim or complaint</option><option>Something else</option></select></label>
      <label className="field"><span>Message</span><textarea className="input" name="message" required minLength={10} /></label>
      {err && <div className="notice bad">{err}</div>}
      <button className="btn btn-blue" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
    </form>
  );
}
