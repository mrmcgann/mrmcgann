"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

// One transfer that paid several invoices: tick the ones it covered and mark them paid together.
export function BatchPaid({ invoices }: { invoices: { id: string; ref: string; title: string; balance: number }[] }) {
  const router = useRouter();
  const [on, setOn] = useState<string[]>(invoices.map((i) => i.id));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const total = invoices.filter((i) => on.includes(i.id)).reduce((t, i) => t + i.balance, 0);
  async function go() {
    if (!confirm(`Mark ${on.length} invoice${on.length === 1 ? "" : "s"} paid (${money(total, true)} received)?`)) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/invoices-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceIds: on }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? data.message || "Done." : data.error || "Failed");
    if (res.ok) router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {invoices.map((i) => <label key={i.id} className="checkrow"><input type="checkbox" checked={on.includes(i.id)} onChange={(e) => setOn(e.target.checked ? [...on, i.id] : on.filter((x) => x !== i.id))} /> {i.ref} · {i.title} · <b>{money(i.balance, true)}</b></label>)}
      <span className="pill-row" style={{ alignItems: "center" }}>
        <button className="btn btn-blue" style={{ height: 38, fontSize: 13 }} disabled={busy || !on.length} onClick={go} data-testid="batch-paid">Received {money(total, true)}: mark paid</button>
        {msg && <span className="hint">{msg}</span>}
      </span>
    </div>
  );
}
