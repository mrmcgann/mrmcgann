"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["new", "sent", "contacted", "booked", "completed", "converted", "lost", "withdrawn"];

export function LeadRow({ id, status, revenue, note, report, inspection }: { id: string; status: string; revenue: number | null; note: string | null; report: string | null; inspection: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(status);
  const [fee, setFee] = useState(revenue != null ? String(revenue) : "");
  const [n, setN] = useState(note || "");
  const [r, setR] = useState(report || "");
  const [msg, setMsg] = useState("");
  async function save() {
    setMsg("");
    const res = await fetch("/api/admin/lead-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: id, status: s, revenue: fee, note: n, report: r && r !== report ? r : undefined }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved" : d.error || "Failed");
    if (res.ok) router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
      <select className="input" style={{ height: 38, fontSize: 14 }} value={s} onChange={(e) => setS(e.target.value)} aria-label="Status">{STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
      <input className="input" style={{ height: 38, fontSize: 14 }} placeholder="Fee received ($)" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Fee received" />
      {inspection && <input className="input" style={{ height: 38, fontSize: 14 }} placeholder="Report link (https://…)" value={r} onChange={(e) => setR(e.target.value)} aria-label="Inspection report link" />}
      <input className="input" style={{ height: 38, fontSize: 14 }} placeholder="Note" value={n} onChange={(e) => setN(e.target.value)} aria-label="Note" />
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}><button className="btn btn-dark" style={{ height: 36, fontSize: 13, padding: "0 14px" }} onClick={save}>Save</button>{msg && <span className="hint">{msg}</span>}</span>
    </div>
  );
}
