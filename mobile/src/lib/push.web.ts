// The web build (testing and previews) has no push notifications.
export type PushState = "granted" | "denied" | "undetermined";
export async function syncPushToken() { return false; }
export async function pushPermission(): Promise<PushState> { return "undetermined"; }
export async function askForPush() { return false; }
export async function forgetPushToken() { /* nothing to forget */ }
export async function setBadge(_n: number) { /* no badge on web */ }
export function onAlertTapped(_cb: (link: string) => void) { return () => undefined; }
