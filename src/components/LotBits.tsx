"use client";
import { rememberViewed } from "@/components/ForYou";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Counts one view per visitor per day (fire and forget).
export function ViewBeacon({ lotId }: { lotId: number }) {
  useEffect(() => { fetch(`/api/lots/${lotId}/view`, { method: "POST", keepalive: true }).catch(() => {}); rememberViewed(lotId); }, [lotId]);
  return null;
}

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); }
    } catch {}
  }
  return <button className="linkbtn" onClick={share} style={{ fontWeight: 700 }}>{done ? "Link copied ✓" : "Share ›"}</button>;
}

type Q = { question: string; answer: string | null; status: string };

// Questions go to Tyrebiter (never straight to the seller). Answers that help
// everyone are published on the listing.
export function QuestionBox({ lotId, signedIn, mine, open }: { lotId: number; signedIn: boolean; mine: Q[]; open: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn) { router.push(`/signin?next=/lot/${lotId}%23questions`); return; }
    setBusy(true);
    const res = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, question: text }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || "Couldn't send. Try again." }); return; }
    setMsg({ ok: true, text: "Sent. We'll check with the seller and reply by email, usually within 1 business day." });
    setText("");
    router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {mine.length > 0 && (
        <div className="soft" style={{ padding: 18 }}>
          <b>Your questions</b>
          {mine.map((q, i) => <div key={i} className="qa" style={{ borderBottom: 0, padding: "6px 0" }}><span>{q.question}</span><span className="muted">{q.answer ? q.answer : q.status === "open" ? "Waiting for an answer" : "Answered by email"}</span></div>)}
        </div>
      )}
      {open ? (
        <form onSubmit={ask} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field"><span>Ask a question about this vehicle</span>
            <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="e.g. Has the timing belt been done? Is there a spare key?" style={{ minHeight: 90 }} />
            <span className="hint">For your safety, don&apos;t include phone numbers or emails. We never ask you to pay a seller directly.</span>
          </label>
          {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}
          <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 48 }} disabled={busy || text.trim().length < 8}>{busy ? "Sending…" : signedIn ? "Send question" : "Sign in to ask"}</button>
        </form>
      ) : <span className="muted">Questions are closed for this vehicle.</span>}
    </div>
  );
}
