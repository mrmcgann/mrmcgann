"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SIG_W, signatureInk, type Signature } from "@/lib/sellForm";

// Sign with a finger, a pen or the mouse. The strokes are kept as numbers (not as a picture) in a box 600 units wide
// and as tall as the pad's shape, scaled the same both ways, so the server can check them and draw the signature back
// exactly as it was drawn, at any size.
export function SignaturePad({ onChange, invalid, testId = "signature-pad" }: { onChange: (s: Signature | null) => void; invalid?: boolean; testId?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<number[][]>([]);
  const drawing = useRef<number[] | null>(null);
  const boxH = useRef(200);
  const [empty, setEmpty] = useState(true);

  const paint = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const k = c.width / SIG_W;
    boxH.current = Math.round((r.height / r.width) * SIG_W) || 200;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1D1D1F"; ctx.lineWidth = 2.6 * dpr;
    for (const st of [...strokes.current, ...(drawing.current ? [drawing.current] : [])]) {
      ctx.beginPath();
      for (let i = 0; i < st.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, st[i] * k, st[i + 1] * k);
      if (st.length === 2) ctx.lineTo(st[0] * k + 0.1, st[1] * k);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    paint();
    const ro = new ResizeObserver(() => paint());
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [paint]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = SIG_W / r.width;
    return [Math.round((e.clientX - r.left) * k * 10) / 10, Math.round((e.clientY - r.top) * k * 10) / 10];
  };
  const emit = () => {
    const h = Math.max(100, Math.min(1000, boxH.current));
    const sig: Signature = { w: SIG_W, h, strokes: strokes.current.map((s) => s.map((n, i) => (i % 2 ? Math.min(h, Math.max(0, n)) : Math.min(SIG_W, Math.max(0, n))))) };
    const ok = signatureInk(sig) >= Math.min(SIG_W, h) * 0.6;
    setEmpty(strokes.current.length === 0);
    onChange(ok ? sig : null);
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = point(e);
    paint();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const [x, y] = point(e);
    const st = drawing.current;
    if (Math.hypot(x - st[st.length - 2], y - st[st.length - 1]) < 1.5) return;
    st.push(x, y);
    paint();
  }
  function up() {
    if (!drawing.current) return;
    if (strokes.current.length < 80) strokes.current.push(drawing.current);
    drawing.current = null;
    paint();
    emit();
  }
  function clear() { strokes.current = []; drawing.current = null; paint(); emit(); }

  return (
    <div className={`sigpad${invalid ? " bad" : ""}`}>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={(e) => { if (e.buttons === 0) up(); }}
        role="img" aria-label="Signature box: draw your signature here with your finger, a pen or the mouse" data-testid={testId} />
      <span className="sigline" aria-hidden="true" />
      {empty && <span className="sighint" aria-hidden="true">Sign here</span>}
      <button type="button" className="linkbtn sigclear" onClick={clear} disabled={empty}>Clear</button>
    </div>
  );
}
