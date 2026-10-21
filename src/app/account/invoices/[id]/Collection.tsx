"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function BookCollection({ invoiceId, existing, hours }: { invoiceId: string; existing: { preferred_day: string; preferred_time: string; collector_name: string | null } | null; hours?: string | null }) {
  const router = useRouter();
  const [who, setWho] = useState<"me" | "someone" | "carrier">(existing?.collector_name ? "someone" : "me");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const days: string[] = [];
  for (let i = 1; days.length < 7 && i < 14; i++) {
    const d = new Date(Date.now() + i * 86400000);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" }));
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    const res = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      invoiceId, day: f.get("day"), time: f.get("time"),
      collectorName: who === "me" ? "" : f.get("name"), collectorMobile: who === "me" ? "" : f.get("mobile"), carrierRef: who === "carrier" ? f.get("ref") : "",
    }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error); return; }
    router.refresh();
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {existing && <span className="notice">Requested: {existing.preferred_day}, {existing.preferred_time.toLowerCase()}. We&apos;re confirming it with the depot. You can change it below until then.</span>}
      <div className="row2">
        <label className="field"><span>Day</span><select className="input" name="day" defaultValue={existing?.preferred_day} style={{ background: "#FFFFFF" }}>{days.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="field"><span>Time</span><select className="input" name="time" defaultValue={existing?.preferred_time} style={{ background: "#FFFFFF" }}><option>Morning (8 am – 12 pm)</option><option>Afternoon (12 – 4 pm)</option></select></label>
      </div>
      <div className="pill-row">
        {([["me", "I'll collect it"], ["someone", "Someone else will"], ["carrier", "A transport company will"]] as const).map(([k, l]) => (
          <button type="button" key={k} className={`pill ${who === k ? "pill-dark" : "pill-soft"}`} onClick={() => setWho(k)}>{l}</button>
        ))}
      </div>
      {who !== "me" && (
        <div className="row2">
          <input className="input" name="name" placeholder={who === "carrier" ? "Driver or company name" : "Their full name (as on their licence)"} defaultValue={existing?.collector_name || ""} style={{ background: "#FFFFFF" }} />
          <input className="input" name="mobile" placeholder="Their mobile (we text them the code)" style={{ background: "#FFFFFF" }} />
        </div>
      )}
      {who === "carrier" && <input className="input" name="ref" placeholder="Carrier booking reference" style={{ background: "#FFFFFF" }} />}
      <span className="hint">{hours ? `The depot is open ${hours}. ` : ""}Whoever collects must show photo ID matching the name here, and give the depot team your release code. The vehicle is only handed over with the code.</span>
      {err && <span className="errmsg">{err}</span>}
      <button className="btn btn-dark" disabled={busy} style={{ alignSelf: "flex-start", height: 48 }}>{busy ? "Sending…" : existing ? "Update request" : "Request this time"}</button>
    </form>
  );
}

// When our driver noted a change at pickup: go ahead, or cancel for a full refund.
export function ChangeDecision({ invoiceId, note }: { invoiceId: string; note: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function answer(proceed: boolean) {
    if (!proceed && !confirm("Cancel the purchase? We refund everything you paid.")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/transport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, proceed }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Couldn't save that."); return; }
    router.refresh();
  }
  return (
    <div className="notice bad" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="change-decision">
      <b>When our driver picked it up, they noted something the listing doesn&apos;t show.</b>
      {note && <span>{note}</span>}
      <span>You can go ahead with the purchase, or cancel it and we refund everything you paid. Please choose within 2 business days.</span>
      <span className="pill-row">
        <button className="btn btn-dark" style={{ height: 46 }} disabled={busy} onClick={() => answer(true)} data-testid="change-proceed">Go ahead</button>
        <button className="btn btn-soft" style={{ height: 46, background: "#FFFFFF" }} disabled={busy} onClick={() => answer(false)} data-testid="change-cancel">Cancel for a full refund</button>
      </span>
      {err && <span className="errmsg">{err}</span>}
    </div>
  );
}

const REASONS: [string, string][] = [
  ["identity", "Wrong make, model, year or VIN"], ["transmission_fuel", "Wrong transmission or fuel type"],
  ["write_off_stolen", "Undisclosed write-off or stolen status"], ["finance", "Undisclosed finance owing"],
  ["odometer", "Odometer materially different"], ["missing_feature", "A listed key feature is missing"],
  ["undisclosed_damage", "Major damage not shown in the listing"], ["other", "Something else"],
];

export function ClaimBox({ invoiceId, userId, until }: { invoiceId: string; userId: string; until: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    const db = supabaseBrowser();
    const photos: string[] = [];
    for (const file of files.slice(0, 12)) {
      const path = `${userId}/${invoiceId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await db.storage.from("claim-photos").upload(path, file);
      if (!error) photos.push(path);
    }
    const res = await fetch("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, reason: f.get("reason"), details: f.get("details"), photos }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error); return; }
    setOpen(false);
    router.refresh();
  }
  if (!open) return <button className="linkbtn" style={{ alignSelf: "flex-start", fontWeight: 700 }} onClick={() => setOpen(true)}>Something materially different from the listing? Make a claim ›</button>;
  return (
    <form onSubmit={submit} className="soft" style={{ background: "#FFFFFF", border: "1px solid var(--line)" }}>
      <b>Make a claim.</b>
      <span className="muted" style={{ fontSize: 14 }}>Claims cover material differences from the listing, not general wear or faults a walkaround couldn&apos;t reveal. {until ? `Lodge by ${new Date(until).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}. ` : ""}Don&apos;t modify, register or use the vehicle while we review it.</span>
      <label className="field"><span>What&apos;s different?</span><select className="input" name="reason">{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field"><span>Details</span><textarea className="input" name="details" required minLength={20} placeholder="What the listing said, and what you found." /></label>
      <label className="field"><span>Photos (up to 12)</span><input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label>
      {err && <span className="errmsg">{err}</span>}
      <div className="pill-row"><button className="btn btn-blue" disabled={busy}>{busy ? "Sending…" : "Lodge claim"}</button><button type="button" className="btn btn-soft" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}
