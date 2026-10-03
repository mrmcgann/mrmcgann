import * as SecureStore from "expo-secure-store";

// Where the sign-in session is kept on the phone: the iOS Keychain / Android Keystore.
// Secure storage items should stay under ~2 KB, so long values are split into chunks.
const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key);
    const n = Number(await SecureStore.getItemAsync(`${k}.n`));
    if (!n) return SecureStore.getItemAsync(k);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(`${k}.${i}`);
      if (p == null) return null;
      parts.push(p);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safe(key);
    await secureStorage.removeItem(key);
    const n = Math.ceil(value.length / CHUNK) || 1;
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${k}.n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    const k = safe(key);
    const n = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
    await SecureStore.deleteItemAsync(k);
  },
};

// Small per-device preferences (recent searches). Not secret.
export async function getPref<T>(key: string, fallback: T): Promise<T> {
  try { const v = await SecureStore.getItemAsync(safe(`pref.${key}`)); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export async function setPref(key: string, value: unknown) {
  try { await SecureStore.setItemAsync(safe(`pref.${key}`), JSON.stringify(value)); } catch { /* full or unavailable: not important */ }
}
