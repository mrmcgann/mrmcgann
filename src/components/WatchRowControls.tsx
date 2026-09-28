"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemindSwitch({ lotId, initial }: { lotId: number; initial: boolean }) {
  const [on, setOn] = useState(initial);
  async function flip() {
    setOn(!on);
    await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, remind: !on }) });
  }
  return <button className="switch" role="switch" aria-checked={on} onClick={flip}><span className="track"><span className="knob" /></span>1 hr reminder</button>;
}

export function RemoveWatch({ lotId, title }: { lotId: number; title: string }) {
  const router = useRouter();
  return (
    <button className="linkbtn" style={{ color: "var(--muted)", fontWeight: 600 }} aria-label={`Remove ${title} from watchlist`}
      onClick={async () => { await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, on: false }) }); router.refresh(); }}>Remove</button>
  );
}

export function DeleteSearch({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <button className="linkbtn" style={{ color: "var(--ink)" }} aria-label={`Delete saved search ${label}`}
      onClick={async () => { await fetch("/api/saved-searches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); router.refresh(); }}>Delete</button>
  );
}
