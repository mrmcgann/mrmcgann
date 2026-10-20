"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATES } from "@/lib/grades";
import type { Sale } from "@/lib/types";

async function post(action: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, d } : { ok: false as const, error: d.error || "Couldn't save that." };
}

export function SaleForm({ sale }: { sale?: Sale }) {
  const router = useRouter();
  const local = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
  const [f, setF] = useState({ title: sale?.title || "", slug: sale?.slug || "", intro: sale?.intro || "", sellerLabel: sale?.seller_label || "", state: sale?.state || "", published: sale?.published || false,
    mode: sale?.mode || "timed", startsAt: local(sale?.starts_at), streamUrl: sale?.stream_url || "", auctioneer: sale?.auctioneer || "",
    lotSeconds: String(sale?.lot_seconds || 60), extendSeconds: String(sale?.extend_seconds || 20), autoAdvance: sale?.auto_advance !== false });
  const [msg, setMsg] = useState("");
  const slugOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await post("sale-save", { id: sale?.id, ...f, slug: f.slug || slugOf(f.title), startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null });
    setMsg(r.ok ? "Saved." : r.error);
    if (r.ok) router.refresh();
  }
  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="grid2">
        <label className="field"><span>Title</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value, slug: sale ? f.slug : slugOf(e.target.value) })} placeholder="Ex-council fleet: utes and trucks" data-testid="sale-title-input" /></label>
        <label className="field"><span>Web address</span><input className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: slugOf(e.target.value) })} placeholder="ex-council-fleet" /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Seller, as shown (no private details)</span><input className="input" value={f.sellerLabel} onChange={(e) => setF({ ...f, sellerLabel: e.target.value })} placeholder="e.g. Local council fleet" /></label>
        <label className="field"><span>State</span><select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">Several</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="field"><span>How it&apos;s run</span>
        <div className="chipset">
          <button type="button" className={f.mode === "timed" ? "on" : ""} aria-pressed={f.mode === "timed"} onClick={() => setF({ ...f, mode: "timed" })}>Timed: each vehicle closes on its own time</button>
          <button type="button" className={f.mode === "live" ? "on" : ""} aria-pressed={f.mode === "live"} onClick={() => setF({ ...f, mode: "live" })} data-testid="sale-mode-live">Live auction: one at a time, with an auctioneer</button>
        </div>
      </div>
      {f.mode === "live" && (
        <div className="soft" style={{ gap: 12 }}>
          <div className="grid2">
            <label className="field"><span>Starts (your time)</span><input className="input" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} data-testid="sale-starts" /></label>
            <label className="field"><span>Auctioneer (name shown, optional)</span><input className="input" value={f.auctioneer} onChange={(e) => setF({ ...f, auctioneer: e.target.value })} placeholder="e.g. Sam Smith, licensed auctioneer" /></label>
          </div>
          <div className="grid2">
            <label className="field"><span>Each vehicle offered for (seconds)</span><input className="input" inputMode="numeric" value={f.lotSeconds} onChange={(e) => setF({ ...f, lotSeconds: e.target.value.replace(/\D/g, "") })} /></label>
            <label className="field"><span>A bid near the end resets it to (seconds)</span><input className="input" inputMode="numeric" value={f.extendSeconds} onChange={(e) => setF({ ...f, extendSeconds: e.target.value.replace(/\D/g, "") })} /></label>
          </div>
          <label className="field"><span>Video stream (YouTube or Vimeo link, optional)</span><input className="input" value={f.streamUrl} onChange={(e) => setF({ ...f, streamUrl: e.target.value })} placeholder="https://www.youtube.com/live/…" /></label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 600 }}><input type="checkbox" checked={f.autoAdvance} onChange={(e) => setF({ ...f, autoAdvance: e.target.checked })} /> <span>Keep it running by itself if the console is closed (starts on time and offers the next vehicle within a minute)</span></label>
          <span className="hint">Vehicles in a live sale take early bids until their turn. Add them from the vehicle editor or the bulk upload, then put them in order in the console.</span>
        </div>
      )}
      <label className="field"><span>About the sale</span><textarea className="input" value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} placeholder="Plain facts: what's in it, where the vehicles are, how they were used and serviced. No claims we can't back up." /></label>
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published (shown on the site)</label>
      <span className="pill-row" style={{ alignItems: "center" }}><button className="btn btn-dark" style={{ height: 44 }} data-testid="sale-save">Save sale</button>{msg && <span className="hint">{msg}</span>}</span>
    </form>
  );
}

export function StaggerForm({ saleId }: { saleId: number }) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [gap, setGap] = useState("3");
  const [msg, setMsg] = useState("");
  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!first) return setMsg("Choose when the first vehicle closes.");
    const r = await post("stagger", { saleId, first: new Date(first).toISOString(), gap: Number(gap) });
    setMsg(r.ok ? `Done: ${r.d.moved} vehicles now close ${gap} minutes apart.` : r.error);
    if (r.ok) router.refresh();
  }
  return (
    <form onSubmit={run} className="pill-row" style={{ alignItems: "flex-end" }}>
      <label className="field"><span>First vehicle closes</span><input className="input" type="datetime-local" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
      <label className="field" style={{ width: 140 }}><span>Minutes apart</span><input className="input" inputMode="numeric" value={gap} onChange={(e) => setGap(e.target.value.replace(/\D/g, ""))} /></label>
      <button className="btn btn-soft" style={{ height: 48 }}>Stagger closing times</button>
      {msg && <span className="hint" style={{ alignSelf: "center" }}>{msg}</span>}
      <span className="hint" style={{ width: "100%" }}>In lot-number order. Vehicles with bids keep their time.</span>
    </form>
  );
}
