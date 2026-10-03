import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";
import { APP_VERSION, PROJECT_ID } from "./env";
import { getPref, setPref } from "./storage";

// Push alerts: outbid, ending soon, wins, payments, collection and selling updates.
// Permission is asked in context (when someone first watches, bids or saves a search,
// or from Alerts in the account tab), never on first launch.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

let channelsReady = false;
async function androidChannels() {
  if (Platform.OS !== "android" || channelsReady) return;
  channelsReady = true;
  await Notifications.setNotificationChannelAsync("bids", {
    name: "Bids and auctions ending", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200], lightColor: "#2F5BFF",
  });
  await Notifications.setNotificationChannelAsync("updates", { name: "Wins, payments and updates", importance: Notifications.AndroidImportance.DEFAULT });
}

async function currentToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators can't receive push
  await androidChannels();
  try {
    const t = await Notifications.getExpoPushTokenAsync(PROJECT_ID ? { projectId: PROJECT_ID } : undefined);
    return t.data;
  } catch {
    return null;
  }
}

/** Registers this phone for alerts if the member has already allowed notifications. Never prompts. */
export async function syncPushToken() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return false;
  const token = await currentToken();
  if (!token) return false;
  await api("/api/push", { body: { token, platform: Platform.OS === "ios" ? "ios" : "android", version: APP_VERSION } }).catch(() => undefined);
  await setPref("pushToken", token);
  return true;
}

export type PushState = "granted" | "denied" | "undetermined";
export async function pushPermission(): Promise<PushState> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
}

/** Asks for permission (once, in context) and registers. Returns whether alerts are on. */
export async function askForPush(): Promise<boolean> {
  await androidChannels();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.status === "denied" && !cur.canAskAgain) return false;
  if (cur.status !== "granted") {
    const asked = await getPref<boolean>("pushAsked", false);
    if (asked && cur.status === "denied") return false;
    await setPref("pushAsked", true);
    const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    if (r.status !== "granted") return false;
  }
  return syncPushToken();
}

/** On sign-out: stop alerts to this phone. */
export async function forgetPushToken() {
  const token = await getPref<string | null>("pushToken", null);
  if (token) await api("/api/push", { method: "DELETE", body: { token } }).catch(() => undefined);
  await setPref("pushToken", null);
  await Notifications.setBadgeCountAsync(0).catch(() => undefined);
}

export async function setBadge(n: number) {
  await Notifications.setBadgeCountAsync(Math.max(0, n)).catch(() => undefined);
}

/** Calls back with the website link inside a tapped alert (e.g. "/lot/10432"). */
export function onAlertTapped(cb: (link: string) => void) {
  const last = Notifications.getLastNotificationResponse();
  const linkOf = (r: Notifications.NotificationResponse | null) => (r?.notification.request.content.data as { link?: string } | undefined)?.link;
  const first = linkOf(last);
  if (first) setTimeout(() => cb(first), 0);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => { const l = linkOf(r); if (l) cb(l); });
  return () => sub.remove();
}
