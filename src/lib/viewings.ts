// Viewing a truck before you bid: in person, by appointment, where it's kept. The buyer offers up to three times;
// we agree one with the owner and only then give the buyer the address. Before asking, the buyer agrees that we're
// making the introduction (viewingAck): that record is what protects our fee now that buyers and owners meet.
// Rules are enforced in the database (request_viewing / admin_viewing, migration 36); this file has the shared
// words and the choice of times. Pure: used by the website, the server and the phone app.

export type DayPart = "morning" | "afternoon" | "evening";
export type Slot = { day: string; part: DayPart };
export type Viewing = { id: string; ref: string; lot_id: number; kind: "in_person"; slots: Slot[]; note: string | null; status: string;
  starts_at: string | null; staff_note: string | null; created_at: string };

export const PARTS: [DayPart, string, string][] = [["morning", "Morning", "8am to 12pm"], ["afternoon", "Afternoon", "12pm to 4pm"], ["evening", "Evening", "4pm to 7pm"]];
export const MAX_SLOTS = 3;
export const STATUS_LABEL: Record<string, string> = { requested: "Asked for", confirmed: "Booked", done: "Done", no_show: "Missed", cancelled: "Cancelled", declined: "Couldn't be booked" };

/** What a member agrees to when they ask to view. The database records these exact words on the booking
 *  (viewing_ack_text(), which the database test holds to this line): change both together, with Terms section 5. */
export const viewingAck = (days: number) =>
  `I'm asking Super Trucker to introduce me to this vehicle and its owner. If I buy it from the owner other than through Super Trucker, while it's listed or within ${days} days after, I'll pay Super Trucker the buyer's premium on the price I pay. I won't make the owner an offer or ask them to deal direct. The address is for this viewing only and I won't share it. Super Trucker gives the owner my name so they know who's coming. Super Trucker won't be there: I follow the owner's site rules and take care around the vehicle. Looking it over and hearing it run only, no road test.`;

/** The short version beside the button. */
export const VIEWING_HOW = [
  "Pick up to three times that suit you. We agree one with the owner and text you the address.",
  "Bring photo ID. You're welcome to bring a mechanic.",
  "Look it over and hear it run. No road test.",
];
export const VIEWING_OFF = "The owner can't host viewings for this one. The listing has the photos, the walkaround video and our report, and you can ask us anything.";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Today's date in Brisbane (the business runs on Brisbane time; no daylight saving). */
export const brisbaneToday = (now = Date.now()) => ymd(new Date(now + 10 * 3600_000));

/** The days a buyer can offer: from tomorrow, at most 14 days out, and no later than the day before the auction. */
export function viewingDays(auctionAt: string | null, now = Date.now()): string[] {
  const today = brisbaneToday(now);
  const auctionDay = auctionAt ? ymd(new Date(new Date(auctionAt).getTime() + 10 * 3600_000)) : null;
  const out: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = ymd(new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400_000));
    if (auctionDay && d >= auctionDay) break;
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

/** Plain words for the database's refusals (null when it isn't one of them). */
export function viewingError(m: string): string | null {
  if (m.includes("viewing_not_offered")) return "Viewings are in person, by appointment. We don't offer video calls with an owner.";
  if (m.includes("viewing_needs_id")) return "Viewings are for verified members, because the owner is told who's coming. Finish setting up your account (your details, mobile and ID) first.";
  if (m.includes("viewing_ack")) return "Tick the box to agree to how viewings work first.";
  if (m.includes("viewing_in_person_off")) return VIEWING_OFF;
  if (m.includes("viewing_closed")) return "This one isn't open for viewing any more.";
  if (m.includes("viewing_own_vehicle")) return "That's your own vehicle.";
  if (m.includes("viewing_times_range")) return "Pick days from tomorrow, before the auction day and within the next two weeks.";
  if (m.includes("viewing_times")) return "Pick up to three times that suit you.";
  if (m.includes("viewing_already")) return "You've already asked to view this one. We'll be in touch to confirm the time.";
  if (m.includes("viewing_too_many")) return "You have a lot of viewings waiting. Cancel one you don't need, or call us.";
  if (m.includes("viewing_not_found")) return "We couldn't find that booking.";
  if (m.includes("viewing_no_address")) return "There's no address on file for this vehicle. Add it to the listing first.";
  if (m.includes("viewing_time")) return "Choose a time in the future.";
  if (m.includes("viewing_not_open")) return "That booking is already closed.";
  if (m.includes("viewing_not_confirmed")) return "Only a booked viewing can be marked done or missed.";
  if (/\bviewing_[a-z_]+/.test(m)) return "We couldn't book that viewing. Call us and we'll sort it out.";
  return null;
}
