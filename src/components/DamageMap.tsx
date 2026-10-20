import { PANELS, OFF_DIAGRAM, ZONE_LABEL, flawPins, hasDiagram, type Zone } from "@/lib/damage";

// Where each flaw is: a top-down drawing with numbered pins (cars, utes, vans, trucks), or the parts in words.
// The numbers match the numbered flaws under it. Shown only when at least one flaw has been pinned to a part.
export function DamageMap({ flaws, category }: { flaws: { zone?: string | null; title: string }[]; category: string }) {
  const pins = flawPins(flaws);
  if (!pins.size) return null;
  const drawn = hasDiagram(category);
  const listed = [...pins.entries()].filter(([z]) => !drawn || OFF_DIAGRAM.includes(z));
  return (
    <div className="dmap" data-testid="damage-map">
      {drawn && (
        <svg viewBox="0 -20 200 420" role="img" aria-label={`Damage map: ${[...pins.entries()].map(([z, n]) => `${ZONE_LABEL[z]} (${n.join(", ")})`).join("; ")}`}>
          <path className="dmap-body" d="M44 14 Q100 -4 156 14 L186 58 L188 344 L156 390 Q100 404 44 390 L12 344 L14 58 Z" />
          {PANELS.map((p) => <path key={p.zone} d={p.d} className={pins.has(p.zone) ? "dmap-hit" : "dmap-panel"} />)}
          <path className="dmap-glass" d="M58 266 L142 266 L148 296 L52 296 Z" />
          <text x="100" y="-8" className="dmap-cap" textAnchor="middle">Front</text>
          {PANELS.filter((p) => pins.has(p.zone)).map((p) => (
            <g key={p.zone}>
              <circle cx={p.cx} cy={p.cy} r={pins.get(p.zone)!.length > 1 ? 15 : 11} className="dmap-pin" />
              <text x={p.cx} y={p.cy} className="dmap-n" textAnchor="middle" dominantBaseline="central">{pins.get(p.zone)!.join(",")}</text>
            </g>
          ))}
        </svg>
      )}
      <div className="dmap-key">
        <span className="hint" style={{ margin: 0 }}>{drawn ? "Seen from above, front at the top. Numbers match the list below." : "Where each one is (numbers match the list below):"}</span>
        {listed.map(([z, n]) => <span key={z} className="dmap-row"><i>{n.join(", ")}</i>{ZONE_LABEL[z as Zone]}</span>)}
        {drawn && <span className="hint" style={{ margin: 0 }}>Left is the passenger side, right the driver&apos;s side.</span>}
      </div>
    </div>
  );
}
