"use client";
import { useState } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// When the briefing email goes to admins (Brisbane time).
export function BriefingSettings({ value }: { value: { daily?: boolean; weekly?: boolean; hour?: number; weekday?: number } }) {
  const [v, setV] = useState({ daily: !!value.daily, weekly: value.weekly !== false, hour: value.hour ?? 7, weekday: value.weekday ?? 1 });
  const [msg, setMsg] = useState("");
  async function save() {
    setMsg("");
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "insights", value: { ...value, ...v } }) });
    setMsg(res.ok ? "Saved." : "Couldn't save.");
  }
  async function sendNow() {
    setMsg("Sending…");
    const res = await fetch("/api/admin/briefing-send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "weekly" }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Sent to ${d.queued} admin${d.queued === 1 ? "" : "s"}. Check your email.` : d.error || "Couldn't send.");
  }
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="briefing-settings">
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>The briefing email</h2>
      <p className="muted" style={{ margin: 0 }}>What changed, what needs you and what&apos;s working, emailed to every admin. With an Anthropic API key set, the weekly one opens with a short summary written by Claude (only business totals and search filters are sent, never anyone&apos;s details).</p>
      <label className="check" style={{ border: 0, padding: 0 }}><input type="checkbox" checked={v.weekly} onChange={(e) => setV({ ...v, weekly: e.target.checked })} /> Weekly, on <select className="input" style={{ width: 150, height: 38, marginLeft: 6 }} value={v.weekday} onChange={(e) => setV({ ...v, weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      <label className="check" style={{ border: 0, padding: 0 }}><input type="checkbox" checked={v.daily} onChange={(e) => setV({ ...v, daily: e.target.checked })} /> Every morning as well</label>
      <label className="field" style={{ maxWidth: 220 }}><span>At (Brisbane time)</span><select className="input" value={v.hour} onChange={(e) => setV({ ...v, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`}</option>)}</select></label>
      <div className="pill-row"><button className="btn btn-dark" onClick={save}>Save</button><button className="btn btn-soft" onClick={sendNow} data-testid="briefing-send">Send me this week&apos;s now</button></div>
      {msg && <span className="hint" role="status">{msg}</span>}
    </div>
  );
}
