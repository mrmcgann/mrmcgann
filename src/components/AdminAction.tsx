"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// A button that posts to /api/admin/<action>. Optional text input and confirm step.
export function AdminAction({ action, payload, label, confirmText, input, tone = "dark" }: {
  action: string; payload: Record<string, unknown>; label: string; confirmText?: string;
  input?: { name: string; placeholder: string }; tone?: "dark" | "blue" | "soft" | "bad";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const cls = tone === "blue" ? "btn-blue" : tone === "soft" ? "btn-soft" : tone === "bad" ? "btn-soft" : "btn-dark";
  async function run() {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, ...(input ? { [input.name]: val } : {}) }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Failed"); return; }
    setOpen(false);
    router.refresh();
  }
  if ((confirmText || input) && !open) {
    return <button className={`btn ${cls}`} style={{ height: 38, fontSize: 13, padding: "0 14px", color: tone === "bad" ? "#B4123E" : undefined }} onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {confirmText && open && <span style={{ fontSize: 13, fontWeight: 600 }}>{confirmText}</span>}
      {input && <input className="input" style={{ height: 38, fontSize: 14, width: 220 }} placeholder={input.placeholder} value={val} onChange={(e) => setVal(e.target.value)} />}
      <button className={`btn ${cls}`} disabled={busy} style={{ height: 38, fontSize: 13, padding: "0 14px", color: tone === "bad" ? "#B4123E" : undefined }} onClick={run}>{busy ? "…" : open ? "Confirm" : label}</button>
      {open && <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setOpen(false)}>Cancel</button>}
      {msg && <span className="errmsg" style={{ fontSize: 13 }}>{msg}</span>}
    </span>
  );
}
