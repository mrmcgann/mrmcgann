// Book an inspection, two ways (Terms section 5): inspect it yourself (a viewing by appointment, ./viewings.ts), or
// send our mobile mechanic. The mechanic is a service Super Trucker sells: a member asks with up to three days, staff
// agree a time with the owner and the mechanic, the member pays by bank transfer, the mechanic looks it over where it's
// kept, and the report goes to the member who booked it. Anything the mechanic finds goes on the listing for every
// bidder before the booking can be closed (we sell as the owner's agent). The rules are in the database
// (request_inspection, admin_inspection, cancel_inspection, inspection_sweep: migration 38); this file has the shared
// words and checks. Pure: used by the website, the server and the phone app.

import { brisbaneToday, type Slot } from "./viewings.ts";

export type MechanicPart = "morning" | "afternoon";
export type Inspection = {
  id: string; ref: string; lot_id: number; status: string; slots: Slot[]; note: string | null; fee: number;
  starts_at: string | null; mechanic: string | null; pay_by: string | null; paid_at: string | null;
  report_path: string | null; summary: string | null; done_at: string | null; refund_due: number | null; refunded_at: string | null;
  staff_note: string | null; created_at: string;
};

/** Mechanics work in daylight: mornings and afternoons only. */
export const MECHANIC_PARTS: [MechanicPart, string, string][] = [["morning", "Morning", "7am to 12pm"], ["afternoon", "Afternoon", "12pm to 4pm"]];
export const MECHANIC_MAX_SLOTS = 3;
export const MECHANIC_FEE_DEFAULT = 495;

/** The fee (including GST) and whether we offer it, from the public 'selling' settings. */
export const mechanicFee = (selling?: { mechanic_fee?: unknown } | null) => {
  const n = Number(selling?.mechanic_fee);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : MECHANIC_FEE_DEFAULT;
};
export const mechanicOn = (selling?: { mechanic?: unknown } | null) => selling?.mechanic !== false;
/** "495" or "1,250": whole dollars, the way the database writes them (to_char 'FM999,999,990'). */
export const feeText = (fee: number) => Math.round(fee).toLocaleString("en-AU");
/** The GST in a GST-inclusive amount (one eleventh), to the cent. */
export const gstIn = (amount: number) => Math.round((amount / 11) * 100) / 100;

/** What a member agrees to when they book the mechanic. The database stores these exact words on the booking
 *  (inspection_ack_text(), which the database test holds to this line): change both together, with Terms section 5. */
export const inspectionAck = (fee: number) =>
  `I'm asking Super Trucker's mobile mechanic to inspect this vehicle where it's kept, for $${feeText(fee)} including GST. Super Trucker agrees a time with the owner, then I pay by bank transfer before the mechanic goes: if it isn't paid in time, the booking lapses. It's a look over and a run of the engine, with no road test and nothing taken apart, so it can't find every fault. The report is the mechanic's opinion on the day, and it comes to me. Super Trucker sells the vehicle as the owner's agent: the owner is told what the mechanic finds, and any fault is added to the listing for every bidder. I can cancel for a full refund until 24 hours before the booked time.`;

/** The two ways, side by side on the listing (web and app). */
export const INSPECT_YOURSELF = {
  title: "Inspect it yourself",
  price: "Free",
  lines: [
    "Book a time on the listing. We agree it with the owner and send you the address.",
    "Bring photo ID, and your own mechanic if you like.",
    "Look it over and hear it run. No road test.",
  ],
};
export const mechanicOption = (fee: number) => ({
  title: "Send our mobile mechanic",
  price: `$${feeText(fee)} incl. GST`,
  lines: [
    "A heavy-vehicle mechanic inspects it where it's kept. You don't need to be there.",
    "A written report with photos, usually by the end of the next business day.",
    "Paid by bank transfer once the time is booked. Cancel up to 24 hours before for a full refund.",
  ],
});
/** What the mechanic does and doesn't do (the booking form, Help and the Terms say the same). */
export const MECHANIC_CHECKS = [
  "Engine started cold where the owner allows it, then run: smoke, noises, leaks, warning lights, gauges and air build-up",
  "Underneath where it's safe to look: chassis, suspension, steering, driveline, brakes, air lines and oil leaks",
  "Cab, body, tyres, lights and the fitted equipment (tailgate loader, hoist, crane, PTO) worked where it can be",
  "Photos of anything worth a closer look, and the mechanic's view of what it needs",
];
export const MECHANIC_LIMITS = "No road test, nothing taken apart, and no certificate: the mechanic's opinion on the day, which can't find every fault.";

export const INSPECTION_STATUS: Record<string, string> = {
  requested: "Asked for", booked: "Booked: payment due", paid: "Booked and paid", done: "Report ready",
  cancelled: "Cancelled", declined: "Couldn't be booked",
};
export const isOpen = (i: { status: string }) => ["requested", "booked", "paid"].includes(i.status);

/** The days a member can offer the mechanic: from tomorrow, at most 21 days out, and before the auction day. */
export function inspectionDays(auctionAt: string | null, now = Date.now()): string[] {
  const today = brisbaneToday(now);
  const auctionDay = auctionAt ? new Date(new Date(auctionAt).getTime() + 10 * 3600_000).toISOString().slice(0, 10) : null;
  const out: string[] = [];
  for (let i = 1; i <= 21; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400_000).toISOString().slice(0, 10);
    if (auctionDay && d >= auctionDay) break;
    out.push(d);
  }
  return out;
}

/** Checks a request before it's sent (the database checks again). */
export function cleanMechanicSlots(raw: unknown, days: string[]): { slots: Slot[]; error: string | null } {
  const list = Array.isArray(raw) ? raw : [];
  const slots: Slot[] = [];
  for (const s of list) {
    const day = String((s as Slot)?.day || ""), part = String((s as Slot)?.part || "") as MechanicPart;
    if (!days.includes(day) || !MECHANIC_PARTS.some((p) => p[0] === part)) continue;
    if (!slots.some((x) => x.day === day && x.part === part)) slots.push({ day, part });
  }
  if (!slots.length) return { slots, error: "Pick at least one day that suits you." };
  if (slots.length > MECHANIC_MAX_SLOTS) return { slots: slots.slice(0, MECHANIC_MAX_SLOTS), error: `Pick up to ${MECHANIC_MAX_SLOTS} days.` };
  return { slots, error: null };
}

/** Whether the member can still cancel it online, and what comes back. */
export function cancelTerms(i: { status: string; starts_at: string | null; fee: number }, now = Date.now()):
  { can: boolean; refund: number; why: string } {
  if (!isOpen(i)) return { can: false, refund: 0, why: "" };
  if (i.status !== "paid") return { can: true, refund: 0, why: "Nothing's been paid, so there's nothing to refund." };
  const start = i.starts_at ? Date.parse(i.starts_at) : 0;
  if (start - now > 24 * 3600_000) return { can: true, refund: Number(i.fee), why: `You get the $${feeText(Number(i.fee))} back in full.` };
  return { can: false, refund: 0, why: "It's less than 24 hours away, so call us if something's come up." };
}

/** Plain words for the database's refusals (null when it isn't one of them). */
export function inspectionError(m: string): string | null {
  if (m.includes("inspection_not_offered")) return "Our mobile mechanic isn't taking bookings right now. You can still inspect it yourself: book a viewing.";
  if (m.includes("inspection_needs_id")) return "Booking our mechanic is for verified members. Finish setting up your account (your details, mobile and ID) first.";
  if (m.includes("inspection_ack")) return "Tick the box to agree to how the inspection works first.";
  if (m.includes("inspection_closed")) return "This one isn't open for inspection any more.";
  if (m.includes("inspection_own_vehicle")) return "That's your own vehicle.";
  if (m.includes("inspection_too_close")) return "The auction is too close to fit an inspection in. Call us and we'll see what we can do.";
  if (m.includes("inspection_times_range")) return "Pick days from tomorrow, before the auction day and within the next three weeks.";
  if (m.includes("inspection_times")) return "Pick up to three mornings or afternoons that suit you.";
  if (m.includes("inspection_already")) return "You've already booked our mechanic for this one. We'll be in touch with the time.";
  if (m.includes("inspection_too_many")) return "You have a lot of inspections waiting. Cancel one you don't need, or call us.";
  if (m.includes("inspection_not_found")) return "We couldn't find that booking.";
  if (m.includes("inspection_too_late")) return "It's less than 24 hours until the mechanic goes, so it can't be cancelled online. Call us.";
  if (m.includes("inspection_not_open")) return "That booking is already closed.";
  if (m.includes("inspection_after_auction")) return "Book it at least two hours before the auction starts.";
  if (m.includes("inspection_time")) return "Book it at least 12 hours from now, so there's time to pay.";
  if (m.includes("inspection_mechanic")) return "Say which mechanic is going.";
  if (m.includes("inspection_no_address")) return "There's no address on file for this vehicle. Add it to the listing first.";
  if (m.includes("inspection_not_booked")) return "Only a booked inspection can be marked paid.";
  if (m.includes("inspection_not_paid")) return "It isn't paid yet, so it can't be closed.";
  if (m.includes("inspection_report")) return "Upload the mechanic's report for this booking first.";
  if (m.includes("inspection_summary")) return "Write what the mechanic found in a line or two (at least 20 characters).";
  if (m.includes("inspection_faults_listed")) return "Add what the mechanic found to the listing's damage and wear first, then tick the box.";
  if (m.includes("inspection_paid_cancel")) return "It's paid, so cancel it instead: the member gets a full refund.";
  if (m.includes("inspection_no_refund")) return "There's no refund to record on that booking.";
  if (m.includes("inspection_action")) return "That isn't a step a booking can take.";
  if (/\binspection_[a-z_]+/.test(m)) return "We couldn't book that inspection. Call us and we'll sort it out.";
  return null;
}
