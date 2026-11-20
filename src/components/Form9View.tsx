import type { Appointment } from "@/lib/appointment";

// The seller's appointment of Super Trucker (Queensland's Form 9), part by part, in the form's order: the agreement
// page previews it, the seller dashboard and the staff page show what was signed. Plain text only (no HTML from data).
export function Form9View({ a }: { a: Appointment }) {
  return (
    <div className="f9-view" data-testid="form9-view">
      <p className="f9-title"><b>{a.title}</b><span className="hint">{a.act}</span></p>
      <p className="f9-warn" role="note">{a.warning}</p>
      {a.parts.map((p) => (
        <div className="f9-part" key={p.id}>
          <h3>{p.title}</h3>
          {p.note && <span className="f9-note">{p.note}</span>}
          {p.items.map((it, n) => {
            if (it.t === "head") return <b className="f9-head" key={n}>{it.text}</b>;
            if (it.t === "text") return <span key={n} className={it.strong ? "f9-strong" : undefined}>{it.text}</span>;
            if (it.t === "rows") return (
              <dl className="f9-rows" key={n}>{it.rows.map(([k, v]) => <div key={k} className="f9-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            );
            return (
              <div className="f9-ticks" key={n}>
                {it.ticks.map(([label, on]) => (
                  <span className="f9-tick" key={label}><span className={`f9-box${on ? " on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span><span>{label}<span className="sr-only">{on ? " (ticked)" : " (not ticked)"}</span></span></span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
