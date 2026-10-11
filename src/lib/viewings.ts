// Seeing a vehicle before you bid: a free video walkaround (a Tyrebiter consultant or the seller video-calls you),
// or an in-person viewing strictly by appointment (only when the seller allows it). The buyer offers up to three
// times; staff confirm one. Rules are enforced in the database (request_viewing / admin_viewing); this file has the
// shared words and the choice of times. Pure: used by the website, the server and the phone app.

export type ViewingKind = "video" | "in_person";
export type DayPart = "morning" | "afternoon" | "evening";
export type Slot = { day: string; part: DayPart };
export type Viewing = { id: string; ref: string; lot_id: number; kind: ViewingKind; slots: Slot[]; note: string | null; status: string;
  starts_at: string | null; host: "consultant" | "seller" | null; staff_note: string | null; created_at: string };

export const PARTS: [DayPart, string, string][] = [["morning", "Morning", "8am to 12pm"], ["afternoon", "Afternoon", "12pm to 4pm"], ["evening", "Evening", "4pm to 7pm"]];
export const MAX_SLOTS = 3;
export const KIND_LABEL: Record<ViewingKind, string> = { video: "Video walkaround", in_person: "In-person viewing" };
export const STATUS_LABEL: Record<string, string> = { requested: "Asked for", confirmed: "Booked", done: "Done", no_show: "Missed", cancelled: "Cancelled", declined: "Couldn't be booked" };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Today's date in Brisbane (the business runs on Brisbane time; no daylight saving). */
export const brisbaneToday = (now = Date.now()) => ymd(new Date(now + 10 * 3600_000));

/** The days a buyer can offer: from tomorrow, at most 14 days out, never after bidding closes. */
export function viewingDays(endsAt: string | null, open: boolean, now = Date.now()): string[] {
  const today = brisbaneToday(now);
  const last = endsAt && open ? ymd(new Date(new Date(endsAt).getTime() + 10 * 3600_000)) : null;
  const out: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = ymd(new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400_000));
    if (last && d > last) break;
    out.push(d);
  }
  return out;
}

export function dayLabel(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export const partLabel = (p: string) => PARTS.find((x) => x[0] === p)?.[1] || p;
export const slotLabel = (s: Slot) => `${dayLabel(s.day)}, ${partLabel(s.part).toLowerCase()}`;
export function whenLabel(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Checks a request before it's sent (the database checks again). */
export function cleanSlots(raw: unknown, days: string[]): { slots: Slot[]; error: string | null } {
  const list = Array.isArray(raw) ? raw : [];
  const slots: Slot[] = [];
  for (const s of list) {
    const day = String((s as Slot)?.day || ""), part = String((s as Slot)?.part || "") as DayPart;
    if (!days.includes(day) || !PARTS.some((p) => p[0] === part)) continue;
    if (!slots.some((x) => x.day === day && x.part === part)) slots.push({ day, part });
  }
  if (!slots.length) return { slots, error: "Pick at least one time that suits you." };
  if (slots.length > MAX_SLOTS) return { slots: slots.slice(0, MAX_SLOTS), error: `Pick up to ${MAX_SLOTS} times.` };
  return { slots, error: null };
}

/** Plain words for the database's refusals. */
export function viewingError(m: string): string | null {
  if (m.includes("viewing_needs_mobile")) return "Verify your mobile first, so we can call you about the time.";
  if (m.includes("viewing_needs_id")) return "In-person viewings are for verified buyers. Finish setting up your account (your details, mobile and ID) first.";
  if (m.includes("viewing_in_person_off")) return "The seller hasn't agreed to in-person viewings for this vehicle. Book a free video walkaround or a mechanical inspection instead.";
  if (m.includes("viewing_closed")) return "This vehicle isn't for sale any more.";
  if (m.includes("viewing_own_vehicle")) return "That's your own vehicle.";
  if (m.includes("viewing_times_range")) return "Pick days from tomorrow, before bidding closes and within the next two weeks.";
  if (m.includes("viewing_times")) return "Pick up to three times that suit you.";
  if (m.includes("viewing_already")) return "You've already asked for one on this vehicle. We'll be in touch to confirm the time.";
  if (m.includes("viewing_too_many")) return "You have a lot of viewings waiting. Cancel one you don't need, or call us.";
  if (m.includes("viewing_not_found")) return "We couldn't find that booking.";
  return null;
}
