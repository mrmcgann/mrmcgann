"use client";
import { useEffect, useRef } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div id="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="box" role="dialog" aria-modal="true" aria-labelledby="mtitle" ref={box}>
        <h2 id="mtitle" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
