"use client";
import { useEffect, useRef, useState } from "react";
import { fmtValue, type Fmt } from "@/lib/metrics";

// Small, quiet charts for the Insights dashboard: one series each (the title names it, so no legend),
// brand blue for the data, hairline grid, a crosshair and tooltip on hover or keyboard focus, and the
// numbers always available without hovering (the end value is labelled; every value is in the table below).
const SERIES = "#2F5BFF";
const GRID = "#E3E3E8";
const MUTED = "#6E6E73";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Clean axis ticks: 0, then round steps up to just above the max. */
function ticks(max: number) {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

const short = (v: number, fmt: Fmt) => {
  const k = (x: number) => String(Math.round(x * 10) / 10);
  if (fmt === "money") return v >= 1e6 ? `$${k(v / 1e6)}M` : v >= 1e3 ? `$${k(v / 1e3)}K` : `$${Math.round(v)}`;
  if (fmt === "pct") return `${Math.round(v * 100)}%`;
  return v >= 1e6 ? `${k(v / 1e6)}M` : v >= 1e4 ? `${k(v / 1e3)}K` : v.toLocaleString("en-AU");
};
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

// Hourly keys are "YYYY-MM-DDTHH" (Brisbane time): "Sat 3 pm".
const hourLabel = (k: string) => {
  const h = Number(k.slice(11, 13));
  const d = new Date(`${k.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short" });
  return `${d} ${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
};

export function TrendChart({ title, points, fmt, kind = "column", testId, unit = "days", empty }: { title: string; points: { day: string; value: number }[]; fmt: Fmt; kind?: "column" | "line"; testId?: string;
  unit?: "days" | "hours"; empty?: string }) {
  const label = unit === "hours" ? hourLabel : dayLabel;
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 190, padL = 46, padR = 12, padT = 12, padB = 26;
  const n = points.length;
  const max = Math.max(0, ...points.map((p) => p.value));
  const t = ticks(max);
  const top = t[t.length - 1] || 1;
  const iw = w - padL - padR, ih = h - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (iw * (i + 0.5)) / n);
  const y = (v: number) => padT + ih - (v / top) * ih;
  const band = iw / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, band - 2));
  const total = points.reduce((a, p) => a + p.value, 0);
  const last = points[n - 1];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left - padL) / iw) * n);
    setHover(i >= 0 && i < n ? i : null);
  };
  const tip = hover != null ? points[hover] : null;
  return (
    <figure className="viz" ref={ref} data-testid={testId}>
      <figcaption><b>{title}</b><span className="muted">{fmt === "money" || fmt === "count" ? `${fmtValue(total, fmt)} in total` : last ? `Latest ${fmtValue(last.value, fmt)}` : ""}</span></figcaption>
      {n === 0 ? <div className="viz-empty muted">{empty || "No data yet. Numbers fill in as the clock runs (every 15 minutes)."}</div> : (
        <div style={{ position: "relative" }}>
          <svg width={w} height={h} role="img" aria-label={`${title}, ${n} ${unit}`} tabIndex={0}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => { if (e.key === "ArrowRight") setHover((v) => Math.min(n - 1, (v ?? -1) + 1)); if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? n) - 1)); }}
            onBlur={() => setHover(null)}>
            {t.map((v) => <g key={v}><line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" /><text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>{short(v, fmt)}</text></g>)}
            {kind === "column" ? points.map((p, i) => {
              const bh = Math.max(0, y(0) - y(p.value));
              const r = Math.min(4, bw / 2, bh);
              const x0 = x(i) - bw / 2, y0 = y(p.value);
              return bh > 0 ? <path key={p.day} d={`M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z`} fill={SERIES} opacity={hover == null || hover === i ? 1 : 0.55} /> : null;
            }) : (
              <>
                <path d={points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {last && <circle cx={x(n - 1)} cy={y(last.value)} r="4" fill={SERIES} stroke="#FFFFFF" strokeWidth="2" />}
              </>
            )}
            {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i && n > 0).map((i) => <text key={i} x={x(i)} y={h - 8} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} fontSize="11" fill={MUTED}>{label(points[i].day)}</text>)}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke={MUTED} strokeWidth="1" />}
            {hover != null && kind === "line" && <circle cx={x(hover)} cy={y(points[hover].value)} r="4" fill={SERIES} stroke="#FFFFFF" strokeWidth="2" />}
          </svg>
          {tip && hover != null && (
            <div className="viz-tip" style={{ left: Math.min(w - 150, Math.max(0, x(hover) - 70)), top: 4 }} role="status">
              <b>{fmtValue(tip.value, fmt)}</b><span className="muted">{label(tip.day)}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars for a breakdown (one hue, biggest first, value at the tip). */
export function BarList({ title, rows, fmt, testId, note }: { title: string; rows: { label: string; value: number; sub?: string }[]; fmt: Fmt; testId?: string; note?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <figure className="viz" data-testid={testId}>
      <figcaption><b>{title}</b>{note && <span className="muted">{note}</span>}</figcaption>
      {rows.length === 0 ? <div className="viz-empty muted">Nothing yet.</div> : (
        <div className="barlist">
          {rows.map((r) => (
            <div key={r.label} className="barrow" title={`${r.label}: ${fmtValue(r.value, fmt)}${r.sub ? ` · ${r.sub}` : ""}`} tabIndex={0}>
              <span className="bl">{r.label}</span>
              <span className="bt"><span className="bf" style={{ width: `${max ? Math.max(1.5, (r.value / max) * 100) : 0}%` }} /></span>
              <span className="bv">{fmtValue(r.value, fmt)}{r.sub ? <span className="muted"> · {r.sub}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}

/** A 30-point sparkline for a stat tile: context in grey, the latest point in blue. */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 96, h = 26, max = Math.max(...values, 0), min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (w - 6) + 3;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} fill="none" stroke="#A1A1A6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={SERIES} />
    </svg>
  );
}
