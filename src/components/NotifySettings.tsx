"use client";
import { useState } from "react";

const ROWS: [string, string][] = [["outbid", "You've been outbid"], ["ending", "Watched vehicle ending in 1 hour"], ["won", "You've won, or payment is due"], ["searches", "New match for a saved search"], ["marketing", "News and featured vehicles"]];

export function NotifySettings({ initial }: { initial: Record<string, { sms: boolean; email: boolean }> }) {
  const [n, setN] = useState(initial);
  const [saved, setSaved] = useState(false);
  async function flip(k: string, ch: "sms" | "email") {
    const next = { ...n, [k]: { ...n[k], [ch]: !n[k]?.[ch] } };
    setN(next);
    await fetch("/api/notify-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notify: next }) });
    setSaved(true);
  }
  return (
    <div>
      <h2 className="d3" style={{ fontSize: 36, marginBottom: 8 }}>Notifications.</h2>
      {ROWS.map(([k, label]) => (
        <div className="check" key={k} style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <b>{label}</b>
          <span style={{ display: "flex", gap: 18 }}>
            {(["sms", "email"] as const).map((ch) => (
              <button key={ch} className="switch" role="switch" aria-checked={!!n[k]?.[ch]} onClick={() => flip(k, ch)} aria-label={`${ch} for ${label}`}><span className="track"><span className="knob" /></span>{ch === "sms" ? "SMS" : "Email"}</button>
            ))}
          </span>
        </div>
      ))}
      <p className="hint" style={{ marginTop: 12 }}>{saved ? "Saved. " : ""}Payment and account messages always go out by SMS and email. We send alerts as fast as we can, but delivery isn&apos;t guaranteed, so keep an eye on auctions you care about.</p>
    </div>
  );
}
