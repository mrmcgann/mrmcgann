"use client";
import { useEffect } from "react";
import { isNoise } from "@/lib/errorTrack";

// Sends JavaScript errors from people's browsers to Admin → Site health (no personal details: the server cleans
// every report). At most 5 a page, each different error once, and nothing from browser extensions or dropped
// connections.
const sent = new Set<string>();

export function sendErrorReport(e: { name?: string; message?: string; stack?: string; kind: string }) {
  try {
    if (!e.message || isNoise(e) || sent.size >= 5) return;
    const key = `${e.name}|${e.message}`.slice(0, 300);
    if (sent.has(key)) return;
    sent.add(key);
    const body = JSON.stringify({ m: e.message.slice(0, 1500), n: (e.name || "Error").slice(0, 100), s: (e.stack || "").slice(0, 4000),
      p: window.location.pathname, k: e.kind, r: (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || undefined });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/errors", new Blob([body], { type: "text/plain" }))) return;
    fetch("/api/errors", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  } catch { /* reporting must never cause an error itself */ }
}

const fields = (x: unknown) => x instanceof Error ? { name: x.name, message: x.message, stack: x.stack } : { name: "Error", message: typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })() };

export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      if (!ev.message && !ev.error) return; // a resource (image, script) failed to load: not a code error
      const f = ev.error ? fields(ev.error) : { name: "Error", message: ev.message, stack: ev.filename ? `at ${ev.filename}:${ev.lineno}:${ev.colno}` : "" };
      sendErrorReport({ ...f, kind: "error" });
    };
    const onRejection = (ev: PromiseRejectionEvent) => sendErrorReport({ ...fields(ev.reason), kind: "promise" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
