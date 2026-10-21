"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PICKUP_WINDOWS, type PickupWindow, type TransportStatus } from "@/lib/transport";
import type { Depot } from "@/lib/types";

export type JobRow = {
  id: string; status: TransportStatus; depot_id: string | null; pickup_on: string | null; pickup_window: PickupWindow | null;
  condition_ok: boolean | null; buyer_decision: string | null; sale_cancelled_at: string | null;
};

const brisbaneDay = (plus = 0) => new Date(Date.now() + 10 * 3600_000 + plus * 86400_000).toISOString().slice(0, 10);

// The steps staff take on a pickup, each one posted to the database's admin_transport() through the admin route.
export function TransportActions({ job, depots }: { job: JobRow; depots: Depot[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<"" | "book" | "picked" | "cancel" | "returned" | "note">("");
  const [day, setDay] = useState(job.pickup_on || brisbaneDay(1));
  const [win, setWin] = useState<PickupWindow>(job.pickup_window || "day");
  const [carrier, setCarrier] = useState("");
  const [odo, setOdo] = useState(""), [keys, setKeys] = useState(""), [same, setSame] = useState(true), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function post(action: string, body: Record<string, unknown>, done?: string) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, ...body }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || "Couldn't save that." }); return; }
    setMsg({ ok: true, text: data.note || done || "Saved." });
    setOpen(""); setNote("");
    router.refresh();
  }
  const step = (what: string, data: Record<string, unknown> = {}, done?: string) => post("transport", { do: what, data }, done);
  const waiting = job.status === "to_book" || job.status === "booked";
  const small = { height: 38, fontSize: 13, padding: "0 14px" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="pill-row" style={{ alignItems: "center" }}>
        {waiting && <button className="btn btn-soft" style={small} disabled={busy} onClick={() => post("transport-send", {})} data-testid="pickup-send">Send to the transport partner</button>}
        {waiting && <button className="btn btn-blue" style={small} disabled={busy} onClick={() => setOpen(open === "book" ? "" : "book")} data-testid="pickup-book">{job.status === "booked" ? "Change the pickup day" : "Book the pickup"}</button>}
        {waiting && <button className="btn btn-dark" style={small} disabled={busy} onClick={() => setOpen(open === "picked" ? "" : "picked")} data-testid="pickup-picked">Picked up</button>}
        {job.status === "picked_up" && !job.sale_cancelled_at && <button className="btn btn-blue" style={small} disabled={busy} onClick={() => step("at_depot", {}, "At the depot. The buyer has been told.")} data-testid="pickup-at-depot">At the depot</button>}
        {(job.status === "picked_up" || job.status === "at_depot") && job.sale_cancelled_at && <button className="btn btn-soft" style={small} disabled={busy} onClick={() => setOpen("returned")}>Returned to the seller</button>}
        {waiting && <button className="btn btn-soft" style={{ ...small, color: "#B4123E" }} disabled={busy} onClick={() => setOpen(open === "cancel" ? "" : "cancel")}>Cancel the pickup</button>}
        {["to_book", "booked", "picked_up"].includes(job.status) && (
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>Depot
            <select className="input" style={{ height: 38, fontSize: 13, width: "auto" }} value={job.depot_id || ""} disabled={busy} onChange={(e) => e.target.value && step("depot", { depot_id: e.target.value }, "Depot changed.")} data-testid="pickup-depot">
              <option value="">Choose…</option>
              {depots.filter((d) => d.active !== false || d.id === job.depot_id).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.suburb}, {d.state})</option>)}
            </select>
          </label>
        )}
        <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setOpen(open === "note" ? "" : "note")}>Note</button>
      </span>

      {open === "book" && (
        <div className="pill-row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ maxWidth: 180 }}><span>Day</span><input className="input" type="date" min={brisbaneDay(0)} value={day} onChange={(e) => setDay(e.target.value)} data-testid="pickup-day" /></label>
          <label className="field" style={{ maxWidth: 220 }}><span>Time</span><select className="input" value={win} onChange={(e) => setWin(e.target.value as PickupWindow)}>{PICKUP_WINDOWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field" style={{ maxWidth: 200 }}><span>Carrier reference</span><input className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Optional" /></label>
          <button className="btn btn-blue" style={{ height: 48 }} disabled={busy || !day} onClick={() => step("book", { day, window: win, carrier_ref: carrier }, "Booked. The seller has the time and the booking reference.")} data-testid="pickup-book-save">Save and tell the seller</button>
        </div>
      )}
      {open === "picked" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="pill-row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ maxWidth: 180 }}><span>Odometer at pickup</span><input className="input" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/\D/g, ""))} /></label>
            <label className="field" style={{ maxWidth: 120 }}><span>Keys</span><input className="input" inputMode="numeric" value={keys} onChange={(e) => setKeys(e.target.value.replace(/\D/g, ""))} /></label>
          </div>
          <label className="checkrow"><input type="radio" checked={same} onChange={() => setSame(true)} /> The driver found it as listed</label>
          <label className="checkrow"><input type="radio" checked={!same} onChange={() => setSame(false)} data-testid="pickup-changed" /> Something isn&apos;t in the listing (the buyer can go ahead or cancel for a full refund)</label>
          {!same && <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's different, in plain words. The buyer reads this: don't mention the seller or where it was." data-testid="pickup-note" />}
          <button className="btn btn-dark" style={{ height: 46, alignSelf: "flex-start" }} disabled={busy || (!same && note.trim().length < 5)} onClick={() => step("picked_up", { odometer: odo, keys, ok: same, note: same ? "" : note }, same ? "Picked up. The buyer has been told it's on its way." : "Picked up. The buyer has been told what changed.")} data-testid="pickup-picked-save">Save</button>
        </div>
      )}
      {(open === "cancel" || open === "returned" || open === "note") && (
        <div className="pill-row" style={{ alignItems: "center" }}>
          <input className="input" style={{ height: 42, maxWidth: 420 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={open === "cancel" ? "Why (for our records; the seller is told it's off)" : open === "returned" ? "When and how it went back (optional)" : "A note for our team"} />
          <button className="btn btn-dark" style={{ height: 42 }} disabled={busy || (open === "cancel" && note.trim().length < 3)} onClick={() => step(open === "cancel" ? "cancel" : open === "returned" ? "returned" : "note", { note })}>Save</button>
        </div>
      )}
      {msg && <span className={msg.ok ? "hint" : "errmsg"} role="status">{msg.text}</span>}
    </div>
  );
}
