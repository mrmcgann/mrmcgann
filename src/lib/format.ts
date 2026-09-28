export const money = (n: number | null | undefined, cents = false) =>
  n == null ? "–" : "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export const km = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-AU") + " km");

const pad = (n: number) => (n < 10 ? "0" : "") + n;

export function countdown(ms: number) {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${m}m ${pad(sec)}s`;
}

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }) : "–";

export const dateLong = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane" }) : "–";

export const maskMobile = (m: string | null | undefined) => {
  const d = (m || "").replace(/\D/g, "");
  return d.length >= 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : m || "";
};

export const toE164 = (au: string) => {
  const d = au.replace(/\D/g, "");
  if (d.startsWith("61")) return "+" + d;
  if (d.startsWith("0")) return "+61" + d.slice(1);
  return "+" + d;
};

export const bidIncrement = (n: number) => (n < 5000 ? 100 : n < 20000 ? 250 : 500);
