// Web build (used for automated testing and previews): the browser's localStorage.
const ls = () => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };

export const secureStorage = {
  async getItem(key: string) { try { return ls()?.getItem(key) ?? null; } catch { return null; } },
  async setItem(key: string, value: string) { try { ls()?.setItem(key, value); } catch { /* private mode */ } },
  async removeItem(key: string) { try { ls()?.removeItem(key); } catch { /* private mode */ } },
};

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  try { const v = ls()?.getItem(`pref.${key}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export async function setPref(key: string, value: unknown) {
  try { ls()?.setItem(`pref.${key}`, JSON.stringify(value)); } catch { /* private mode */ }
}
