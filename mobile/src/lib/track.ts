import { Platform } from "react-native";
import { SITE } from "~/lib/env";

// Screen views and searches for the Insights dashboard (same counter as the website; no personal details).
// The app counts as its own source, so app traffic is reported separately from the website.
const app = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : null;
let member = false;
export const setTrackedMember = (m: boolean) => { member = m; };

function send(body: Record<string, unknown>) {
  if (!app) return; // the web build is the website's job
  fetch(`${SITE}/api/t`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ ...body, app, m: member ? 1 : 0 }) }).catch(() => undefined);
}

export const trackView = (path: string) => send({ k: "view", p: path === "/search" ? "/auctions" : path });
export const trackSearch = (q: string, n: number | null) => send({ k: "search", p: "/auctions", q, n });
