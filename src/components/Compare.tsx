"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Compare up to four vehicles side by side. The picks live in this browser only (nothing is sent anywhere until
// the compare page is opened); a tray at the bottom of the screen shows how many are picked.
const KEY = "tb-compare";
export const COMPARE_MAX = 4;
type Pick = { id: number; title: string };

function read(): Pick[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((p) => Number.isInteger(p?.id)).slice(0, COMPARE_MAX) : [];
  } catch { return []; }
}
function write(list: Pick[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, COMPARE_MAX))); } catch { /* private mode: it just won't be remembered */ }
  window.dispatchEvent(new Event("tb-compare"));
}
function usePicks() {
  const [list, setList] = useState<Pick[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    window.addEventListener("tb-compare", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("tb-compare", sync); window.removeEventListener("storage", sync); };
  }, []);
  return list;
}

export function CompareToggle({ id, title, small }: { id: number; title: string; small?: boolean }) {
  const list = usePicks();
  const [msg, setMsg] = useState("");
  const on = list.some((p) => p.id === id);
  function flip() {
    setMsg("");
    if (on) return write(list.filter((p) => p.id !== id));
    if (list.length >= COMPARE_MAX) { setMsg(`Compare up to ${COMPARE_MAX}. Remove one first.`); return; }
    write([...list, { id, title }]);
  }
  return (
    <span className={small ? "cmp cmp-sm" : "cmp"}>
      <label className="cmp-l"><input type="checkbox" checked={on} onChange={flip} aria-label={`Compare ${title}`} data-testid={`compare-${id}`} />Compare</label>
      {msg && <span className="errmsg" style={{ fontSize: 13 }} role="status">{msg}</span>}
    </span>
  );
}

export function CompareTray() {
  const list = usePicks();
  const path = usePathname() || "";
  if (!list.length || path.startsWith("/compare") || path.startsWith("/admin")) return null;
  return (
    <div className="cmp-tray" role="region" aria-label="Vehicles to compare" data-testid="compare-tray">
      <span><b>{list.length}</b> to compare{list.length === 1 ? ": pick one more" : ""}</span>
      <button className="linkbtn" style={{ color: "#FFFFFF", opacity: 0.8, fontSize: 14 }} onClick={() => write([])}>Clear</button>
      {list.length >= 2 && <Link className="btn btn-blue" style={{ height: 40, fontSize: 15, padding: "0 18px" }} href={`/compare?ids=${list.map((p) => p.id).join(",")}`}>Compare</Link>}
    </div>
  );
}

/** On the compare page: remove one (and keep the browser's list in step). */
export function CompareRemove({ id, ids }: { id: number; ids: number[] }) {
  return (
    <Link className="linkbtn" style={{ fontSize: 14 }} href={ids.length > 1 ? `/compare?ids=${ids.filter((x) => x !== id).join(",")}` : "/auctions"}
      onClick={() => write(read().filter((p) => p.id !== id))}>Remove</Link>
  );
}
