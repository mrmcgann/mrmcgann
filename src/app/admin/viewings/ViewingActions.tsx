"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { localToIso, stateTz } from "@/lib/viewings";

// Confirm a viewing time once the owner has agreed it, or say it can't be booked (the member sees the reason).
// Confirming sends the member the address and the owner the member's name (admin_viewing).
export function ViewingConfirm({ id, state }: { id: string; state: string }) {
  // the owner agrees a time on their own clock, so it's entered and sent in the truck's state
  const zone = stateTz(state).replace("Australia/", "");
  const router = useRouter();
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(body: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/viewing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Failed"); return; }
    router.refresh();
  }
  return (
    <div className="vw-admin" data-testid={`viewing-actions-${id}`}>
      <label className="field"><span>Time agreed with the owner ({zone} time)</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ height: 40 }} /></label>
      <label className="field" style={{ flex: "1 1 200px" }}><span>Note to the member (optional)</span><input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} style={{ height: 40 }} placeholder="e.g. Ask for Dave at the office" /></label>
      <span className="pill-row">
        <button className="btn btn-blue" style={{ height: 40, fontSize: 14 }} disabled={busy || !when} onClick={() => { const at = localToIso(when, state); if (!at) { setMsg("Enter the date and time."); return; } void send({ do: "confirm", startsAt: at, note }); }}>Confirm and send the address</button>
        <button className="btn btn-soft" style={{ height: 40, fontSize: 14, color: "#B4123E" }} disabled={busy} onClick={() => setDeclining(!declining)}>Can&apos;t book</button>
      </span>
      {declining && (
        <span className="pill-row" style={{ width: "100%" }}>
          <input className="input" value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} placeholder="Why (the member sees this)" style={{ height: 40, flex: "1 1 240px" }} />
          <button className="btn btn-dark" style={{ height: 40, fontSize: 14 }} disabled={busy || !why.trim()} onClick={() => send({ do: "decline", note: why })}>Send</button>
        </span>
      )}
      {msg && <span className="errmsg" style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
