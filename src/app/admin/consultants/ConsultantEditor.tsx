"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Consultant } from "@/lib/types";

type C = Consultant & { active: boolean; sort: number };

export function ConsultantEditor({ c }: { c: C | null }) {
  const router = useRouter();
  const [f, setF] = useState({ name: c?.name || "", title: c?.title || "Vehicle consultant", phone: c?.phone || "", email: c?.email || "", sort: String(c?.sort ?? 0) });
  const [active, setActive] = useState(c?.active ?? true);
  const [msg, setMsg] = useState("");
  const db = supabaseBrowser();
  const refresh = async () => { await fetch("/api/revalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined); router.refresh(); };
  async function save() {
    if (!f.name.trim()) return setMsg("Enter a name.");
    const row = { name: f.name.trim(), title: f.title.trim() || "Vehicle consultant", phone: f.phone.trim() || null, email: f.email.trim() || null, sort: Number(f.sort) || 0, active };
    const r = c ? await db.from("consultants").update(row).eq("id", c.id) : await db.from("consultants").insert(row);
    setMsg(r.error ? r.error.message : "Saved.");
    if (!r.error) { if (!c) setF({ name: "", title: "Vehicle consultant", phone: "", email: "", sort: "0" }); await refresh(); }
  }
  async function makeDefault() {
    if (!c) return;
    await db.from("consultants").update({ is_default: false }).eq("is_default", true);
    const r = await db.from("consultants").update({ is_default: true }).eq("id", c.id);
    setMsg(r.error ? r.error.message : "Now the default.");
    await refresh();
  }
  const field = (k: keyof typeof f, label: string, w = 180) => <label className="field" style={{ width: w }}><span>{label}</span><input className="input" style={{ height: 42, fontSize: 15 }} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
      {field("name", c ? "Name" : "New consultant")}{field("title", "Title")}{field("phone", "Phone", 150)}{field("email", "Email", 220)}{field("sort", "Order", 70)}
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 600, height: 42 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      <button className="btn btn-dark" style={{ height: 42, fontSize: 14, padding: "0 16px" }} onClick={save}>{c ? "Save" : "Add"}</button>
      {c && (c.is_default ? <span className="status-pill">default</span> : <button className="btn btn-soft" style={{ height: 42, fontSize: 14, padding: "0 16px" }} onClick={makeDefault}>Make default</button>)}
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}
