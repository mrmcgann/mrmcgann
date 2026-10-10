import { Platform } from "react-native";
import { isNoise } from "@/lib/errorTrack";
import { APP_VERSION, SITE } from "~/lib/env";

// Screen views and searches for the Insights dashboard (same counter as the website; no personal details).
// The app counts as its own source, so app traffic is reported separately from the website.
const app = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : null;
let member = false;
export const setTrackedMember = (m: boolean) => { member = m; };

function send(body: Record<string, unknown>) {
  if (!app) return; // the web build is the website's job
  fetch(`${SITE}/api/t`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ ...body, app, m: member ? 1 : 0 }) }).catch(() => undefined);
}

let lastPath = "/";
export const trackView = (path: string) => { lastPath = path; send({ k: "view", p: path === "/search" ? "/auctions" : path }); };
export const trackSearch = (q: string, n: number | null) => send({ k: "search", p: "/auctions", q, n });

// App errors go to Admin → Site health, like the website's (each different error once per session, at most 10;
// the server removes personal details before keeping anything).
const reported = new Set<string>();
export function reportAppError(e: unknown, kind = "error") {
  try {
    if (!app) return;
    const err = e instanceof Error ? { name: e.name, message: e.message, stack: e.stack || "" } : { name: "Error", message: String(e ?? ""), stack: "" };
    if (!err.message || isNoise(err) || reported.size >= 10) return;
    const key = `${err.name}|${err.message}`.slice(0, 300);
    if (reported.has(key)) return;
    reported.add(key);
    fetch(`${SITE}/api/errors`, { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ m: err.message.slice(0, 1500), n: err.name.slice(0, 100), s: err.stack.slice(0, 4000), p: lastPath, k: kind, app, v: APP_VERSION }) }).catch(() => undefined);
  } catch { /* never let reporting cause an error */ }
}

/** Reports crashes the screens didn't catch, then lets React Native handle them as usual. */
export function watchAppErrors() {
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (!app || !eu) return;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => { reportAppError(e, fatal ? "fatal" : "error"); previous(e, fatal); });
}
