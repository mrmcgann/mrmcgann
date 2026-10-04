"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LotCard } from "@/components/LotCard";
import { useViewer } from "@/components/Viewer";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cleanFilters, searchHref, toQueryString } from "@/lib/search";
import type { Fees, Lot } from "@/lib/types";

// Kept in this browser only: the last vehicles you looked at.
const KEY = "tb-recent";
export function rememberViewed(id: number) {
  try {
    const now = JSON.parse(localStorage.getItem(KEY) || "[]") as number[];
    localStorage.setItem(KEY, JSON.stringify([id, ...now.filter((x) => x !== id)].slice(0, 12)));
  } catch {}
}
function recent(): number[] {
  try { return (JSON.parse(localStorage.getItem(KEY) || "[]") as unknown[]).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0); } catch { return []; }
}

function Row({ title, lots, fees, more }: { title: string; lots: Lot[]; fees: Fees | null; more?: [string, string] }) {
  if (!lots.length) return null;
  return (
    <section className="wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h2 className="d3">{title}</h2>
        {more && <Link className="more" href={more[0]}>{more[1]} ›</Link>}
      </div>
      <div className="grid">{lots.slice(0, 4).map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path || undefined} fees={fees || undefined} />)}</div>
    </section>
  );
}

// Home page: recently viewed (this browser), and new matches for your first saved search (signed in).
export function ForYou() {
  const v = useViewer();
  const [viewed, setViewed] = useState<{ lots: Lot[]; fees: Fees | null }>({ lots: [], fees: null });
  const [saved, setSaved] = useState<{ label: string; href: string; lots: Lot[]; fees: Fees | null } | null>(null);
  useEffect(() => {
    const ids = recent();
    if (!ids.length) return;
    fetch(`/api/lots/cards?ids=${ids.join(",")}`).then((r) => r.json()).then((d) => setViewed({ lots: (d.lots || []).filter((l: Lot) => l.status === "live"), fees: d.fees })).catch(() => {});
  }, []);
  useEffect(() => {
    if (!v.user) { setSaved(null); return; }
    let live = true;
    supabaseBrowser().from("saved_searches").select("label, query").order("created_at", { ascending: false }).limit(1).then(async ({ data }: { data: { label: string; query: Record<string, unknown> }[] | null }) => {
      const s = data?.[0];
      if (!s) return;
      const f = cleanFilters(s.query || {});
      const d = await fetch(`/api/lots/search?${toQueryString(f, { facets: "0" })}`).then((r) => r.json()).catch(() => null);
      if (live && d?.lots?.length) setSaved({ label: s.label, href: searchHref(f), lots: d.lots, fees: d.fees || null });
    });
    return () => { live = false; };
  }, [v.user]);
  return (
    <>
      {saved && <Row title={`For you: ${saved.label}.`} lots={saved.lots} fees={saved.fees} more={[saved.href, "See all matches"]} />}
      <Row title="Recently viewed." lots={viewed.lots} fees={viewed.fees} />
    </>
  );
}
