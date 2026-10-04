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

// A private note on a watched vehicle (only you see it).
export function WatchNote({ lotId, initial }: { lotId: number; initial: string }) {
  const [open, setOpen] = useState(!!initial);
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  async function save() {
    if (text === saved) return;
    setState("saving");
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    const { error } = await supabaseBrowser().from("watchlist").update({ note: text.trim().slice(0, 500) || null }).eq("lot_id", lotId);
    if (error) return setState("error");
    setSaved(text); setState("saved");
  }
  if (!open) return <button className="linkbtn" style={{ alignSelf: "flex-start", fontSize: 14 }} onClick={() => setOpen(true)} data-testid={`note-add-${lotId}`}>Add a private note</button>;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 420 }}>
      <textarea className="input" style={{ minHeight: 56, fontSize: 14 }} maxLength={500} value={text} onChange={(e) => { setText(e.target.value); setState(""); }} onBlur={save} placeholder="Only you can see this, e.g. ask about the tow bar" aria-label="Private note" data-testid={`note-${lotId}`} />
      <span className="hint">{state === "saving" ? "Saving…" : state === "saved" ? "Saved. Only you can see this." : state === "error" ? "Couldn't save the note." : "Only you can see this."}</span>
    </span>
  );
}
