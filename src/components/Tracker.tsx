"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useViewer } from "@/components/Viewer";

// Counts page views and searches for the Insights dashboard (first-party, no cookies). The source of a
// visit (Google, Facebook, an email...) is worked out from where the visit started, and sent with each
// view so the whole visit is credited to it. Browsers asking not to be tracked aren't counted.
type Entry = { r: string | null; u: { s: string | null; m: string | null; c: string | null }; l: string };

const store = (s: "local" | "session") => { try { return s === "local" ? window.localStorage : window.sessionStorage; } catch { return null; } };
const read = (s: "local" | "session", k: string): Entry | null => { try { return JSON.parse(store(s)?.getItem(k) || "null"); } catch { return null; } };
const write = (s: "local" | "session", k: string, v: unknown) => { try { store(s)?.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

function optedOut() {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === "1";
}

function entry(): Entry {
  const now = read("session", "tb_entry");
  if (now) return now;
  const q = new URLSearchParams(window.location.search);
  const e: Entry = { r: document.referrer || null, u: { s: q.get("utm_source"), m: q.get("utm_medium"), c: q.get("utm_campaign") }, l: window.location.pathname };
  write("session", "tb_entry", e);
  if (!read("local", "tb_ft")) write("local", "tb_ft", e);
  return e;
}

function send(body: Record<string, unknown>) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/t", new Blob([data], { type: "text/plain" }))) return;
  } catch { /* fall through */ }
  fetch("/api/t", { method: "POST", body: data, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

let member = false;
// Pages reached through a private link (unsubscribe, handover, seller agreement, password reset) aren't counted at all.
const skip = (path: string) => path.startsWith("/admin") || /^\/(u|handover|sell\/agreement|reset|auth)(\/|$)/.test(path);

/** Record a search or click. Searches send a description of the filters (make, model, price, place; never typed
 *  words, which could contain anything) and how many vehicles matched. */
export function track(k: "search" | "click", data: { q?: string; n?: number | null }) {
  if (typeof window === "undefined" || optedOut() || skip(window.location.pathname)) return;
  const e = entry();
  send({ k, p: window.location.pathname, r: e.r, u: e.u, m: member ? 1 : 0, ...data });
}

export function Tracker() {
  const path = usePathname();
  const { user } = useViewer();
  member = !!user;

  useEffect(() => {
    if (!path || optedOut() || skip(path)) return;
    const e = entry();
    send({ k: "view", p: path, r: e.r, u: e.u, m: member ? 1 : 0 });
  }, [path]);

  // A new member: tell the server where they first came from (once per member and browser).
  useEffect(() => {
    if (!user || optedOut()) return;
    const flag = `tb_id_${user.id}`;
    try { if (store("local")?.getItem(flag)) return; } catch { return; }
    const ft = read("local", "tb_ft") || entry();
    send({ k: "identify", r: ft.r, u: ft.u, l: ft.l });
    try { store("local")?.setItem(flag, "1"); } catch { /* ignore */ }
  }, [user]);

  return null;
}
