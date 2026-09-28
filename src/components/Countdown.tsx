"use client";
import { useEffect, useState } from "react";
import { countdown } from "@/lib/format";

export function Countdown({ endsAt, className, style }: { endsAt: string | null; className?: string; style?: React.CSSProperties }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return <span className={className} style={style}>–</span>;
  const ms = new Date(endsAt).getTime() - (now ?? new Date(endsAt).getTime() - 1);
  return <span className={className} style={style} suppressHydrationWarning>{now === null ? "…" : countdown(ms)}</span>;
}
