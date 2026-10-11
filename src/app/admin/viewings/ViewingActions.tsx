"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Confirm a viewing time (and who hosts), or decline with a reason the buyer will see.
export function ViewingConfirm({ id, kind, defaultHost }: { id: string; kind: "video" | "in_person"; defaultHost: "consultant" | "seller" }) {
  const router = useRouter();
  const [when, setWhen] = useState("");
  const [host, setHost] = useState(defaultHost);
  const [note, setNote] = useState("");
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
      <label className="field"><span>Time (Brisbane)</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ height: 40 }} /></label>
      <label className="field"><span>{kind === "video" ? "Who calls" : "Who meets them"}</span>
        <select className="input" value={host} onChange={(e) => setHost(e.target.value as "consultant" | "seller")} style={{ height: 40 }}>
          <option value="consultant">Our consultant</option><option value="seller">The seller</option>
        </select></label>
      <label className="field" style={{ flex: "1 1 200px" }}><span>Note to the buyer (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} style={{ height: 40 }} placeholder={kind === "video" ? "e.g. Sam will call from 07 3000 0000" : "e.g. Park on the street"} /></label>
      <span className="pill-row">
        <button className="btn btn-blue" style={{ height: 40, fontSize: 14 }} disabled={busy || !when} onClick={() => send({ do: "confirm", startsAt: new Date(`${when}:00+10:00`).toISOString(), host, note })}>Confirm</button>
        <button className="btn btn-soft" style={{ height: 40, fontSize: 14, color: "#B4123E" }} disabled={busy} onClick={() => { const why = prompt("Why can't it be booked? The buyer sees this."); if (why) void send({ do: "decline", note: why }); }}>Can&apos;t book</button>
      </span>
      {msg && <span className="errmsg" style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
