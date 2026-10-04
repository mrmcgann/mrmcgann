"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function NewsletterSettings({ value }: { value: { enabled?: boolean; weekday?: number; hour?: number } }) {
  const router = useRouter();
  const [v, setV] = useState({ enabled: !!value.enabled, weekday: value.weekday ?? 4, hour: value.hour ?? 17 });
  const [msg, setMsg] = useState("");
  async function save() {
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "newsletter", value: { ...value, ...v } }) });
    setMsg(res.ok ? "Saved." : "Couldn't save.");
    if (res.ok) router.refresh();
  }
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /> Send it every week</label>
      <div className="grid2">
        <label className="field"><span>Day</span><select className="input" value={v.weekday} onChange={(e) => setV({ ...v, weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
        <label className="field"><span>Hour (Brisbane time)</span><select className="input" value={v.hour} onChange={(e) => setV({ ...v, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`}</option>)}</select></label>
      </div>
      <span className="pill-row" style={{ alignItems: "center" }}><button className="btn btn-dark" style={{ height: 44 }} onClick={save}>Save</button>{msg && <span className="hint">{msg}</span>}</span>
    </div>
  );
}
