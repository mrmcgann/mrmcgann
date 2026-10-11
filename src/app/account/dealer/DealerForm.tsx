"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DealerForm({ company, abn, gst, licence, again }: { company: string; abn: string; gst: boolean; licence: string; again: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    const res = await fetch("/api/dealer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: f.get("company"), abn: f.get("abn"), licence: f.get("licence"), gst: f.get("gst") === "on" }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Couldn't send that."); return; }
    router.refresh();
  }
  return (
    <form className="soft" onSubmit={submit} style={{ gap: 14 }} data-testid="dealer-form">
      <b style={{ fontSize: 18 }}>{again ? "Update your details" : "Apply for a dealer account"}</b>
      <label className="field"><span>Business name (as registered)</span><input className="input" name="company" defaultValue={company} required style={{ background: "#FFFFFF" }} /></label>
      <div className="row2">
        <label className="field"><span>ABN</span><input className="input" name="abn" inputMode="numeric" defaultValue={abn} required placeholder="11 digits" style={{ background: "#FFFFFF" }} /></label>
        <label className="field"><span>Dealer licence number (optional)</span><input className="input" name="licence" defaultValue={licence} placeholder="e.g. MD 012345 or LMCT 12345" style={{ background: "#FFFFFF" }} /></label>
      </div>
      <label className="checkrow"><input type="checkbox" name="gst" defaultChecked={gst} /> We&apos;re registered for GST</label>
      {err && <div className="notice bad" role="alert">{err}</div>}
      <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 48 }} disabled={busy}>{busy ? "Sending…" : again ? "Send for checking" : "Apply"}</button>
    </form>
  );
}
