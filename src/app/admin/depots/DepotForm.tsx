"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATES } from "@/lib/grades";

export type DepotRow = {
  id: string; name: string; suburb: string; state: string; postcode: string; hours: string | null; active: boolean; partner_id: string | null;
  address?: string | null; phone?: string | null; email?: string | null; contact_name?: string | null; notes?: string | null; listings: number;
};

// One depot's details (or a new one). Saved through the server (Admin → depot-save), which records who changed it.
export function DepotForm({ depot, partners }: { depot: DepotRow | null; partners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: depot?.name || "", suburb: depot?.suburb || "", state: depot?.state || "QLD", postcode: depot?.postcode || "", hours: depot?.hours || "",
    address: depot?.address || "", phone: depot?.phone || "", email: depot?.email || "", contactName: depot?.contact_name || "", notes: depot?.notes || "",
    partnerId: depot?.partner_id || "", active: depot?.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/depot-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: depot?.id, ...f }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: data.error || "Couldn't save the depot." }); return; }
    setMsg({ ok: true, text: depot ? "Saved. Listings at this depot show the change." : "Depot added." });
    if (!depot) { setOpen(false); setF({ ...f, name: "", suburb: "", postcode: "", hours: "", address: "", phone: "", email: "", contactName: "", notes: "" }); }
    router.refresh();
  }

  if (!open) {
    return depot ? (
      <div className="admin-card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }} data-testid="depot-row">
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 18 }}>{depot.name}{!depot.active && <span className="tag" style={{ marginLeft: 8, background: "var(--panel)" }}>Switched off</span>}</b>
          <span className="muted" style={{ fontSize: 14 }}>{depot.address || `${depot.suburb} ${depot.state} ${depot.postcode}`}{depot.hours ? ` · ${depot.hours}` : ""}</span>
          <span className="muted" style={{ fontSize: 14 }}>{[depot.contact_name, depot.phone, depot.email].filter(Boolean).join(" · ") || "No contact for handovers yet"} · {depot.listings} listing{depot.listings === 1 ? "" : "s"}</span>
        </span>
        <button className="btn btn-soft" style={{ height: 40 }} onClick={() => setOpen(true)}>Edit</button>
        {msg && <span className={msg.ok ? "hint" : "errmsg"}>{msg.text}</span>}
      </div>
    ) : (
      <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 46 }} onClick={() => setOpen(true)} data-testid="depot-add">Add a depot</button>
    );
  }
  const inp = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field"><span>{label}</span><input className="input" value={String(f[k])} onChange={set(k)} {...props} /></label>
  );
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="depot-form">
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{depot ? depot.name : "New depot"}</h2>
      <div className="grid2">{inp("name", "Name (shown on listings)", { placeholder: "Brisbane depot" })}
        <label className="field"><span>Transport partner</span><select className="input" value={f.partnerId} onChange={set("partnerId")}><option value="">Not linked</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="hint">Pickup bookings are emailed to the partner&apos;s lead email.</span></label></div>
      {inp("address", "Street address (private until a collection is confirmed)", { placeholder: "12 Example Rd, Eagle Farm QLD 4009" })}
      <div className="grid3">{inp("suburb", "Suburb (shown on listings)")}
        <label className="field"><span>State</span><select className="input" value={f.state} onChange={set("state")}>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        {inp("postcode", "Postcode", { inputMode: "numeric", maxLength: 4 })}</div>
      {inp("hours", "Collection hours (shown on listings)", { placeholder: "Monday to Friday, 8am to 4pm" })}
      <div className="grid3">{inp("contactName", "Contact name")}{inp("phone", "Phone (gets the handover link by SMS)")}{inp("email", "Email (gets the handover link)")}</div>
      <label className="field"><span>Notes for our team</span><textarea className="input" value={f.notes} onChange={set("notes")} placeholder="Gate code, after-hours drop-off, who to ask for" /></label>
      <label className="checkrow"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Taking vehicles (switch off to stop new listings choosing it)</label>
      <span className="pill-row"><button className="btn btn-dark" style={{ height: 46 }} disabled={busy} onClick={save} data-testid="depot-save">{busy ? "Saving…" : "Save"}</button><button className="btn btn-soft" style={{ height: 46 }} onClick={() => setOpen(false)}>Cancel</button></span>
      {msg && <span className={msg.ok ? "hint" : "errmsg"} role="status">{msg.text}</span>}
    </div>
  );
}
