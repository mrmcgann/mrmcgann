"use client";
import { useMemo, useState } from "react";

// Search the help centre as you type: every word must appear in the question or the answer.
export function HelpSearch({ items }: { items: { section: string; id: string; q: string; a: string }[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const hits = useMemo(() => (words.length ? items.filter((it) => { const t = `${it.q} ${it.a}`.toLowerCase(); return words.every((w) => t.includes(w)); }).slice(0, 12) : []), [items, words.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ width: "min(780px,100%)", display: "flex", flexDirection: "column", gap: 14 }}>
      <input className="input" type="search" placeholder="Search help, e.g. collect, warranty, deposit" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the help centre" data-testid="help-search" style={{ height: 60, fontSize: 18, borderRadius: 30, padding: "0 24px" }} />
      {words.length > 0 && (
        <div className="faq" data-testid="help-results" style={{ width: "100%" }}>
          {hits.length === 0 ? <p className="muted" style={{ textAlign: "center" }}>No answers match. Try other words, or call us.</p> : hits.map((h) => (
            <details key={h.id + h.q} open={hits.length <= 3}>
              <summary>{h.q}</summary>
              <p>{["INCREMENTS", "GRADES"].includes(h.a) ? <a className="blue" href={`#${h.id}`}>See the table in {h.section} ›</a> : h.a}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
