import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { getSettingsCached } from "@/lib/cache";
import { inspectionAck, mechanicFee, mechanicOn } from "@/lib/inspections";
import { payBank } from "@/lib/env";

// Our mobile mechanic: your own bookings and whether you can book (GET), or ask for one (POST). The database decides
// who may book what (request_inspection) and stores what the member agreed to; this only passes it on. Nothing here
// carries the address: the mechanic gets it from us, and the member never needs it.
const COLS = "id, ref, lot_id, status, slots, note, fee, starts_at, mechanic, pay_by, paid_at, summary, done_at, refund_due, refunded_at, staff_note, created_at, report_path";

export async function GET(req: Request) {
  const lotId = Number(new URL(req.url).searchParams.get("lot"));
  const db = await supabaseServer();
  const settings = await getSettingsCached();
  const selling = (settings?.selling || {}) as { mechanic?: unknown; mechanic_fee?: unknown };
  const fee = mechanicFee(selling), on = mechanicOn(selling);
  const base = { on, fee, ack: inspectionAck(fee) };
  const user = await currentUser(db);
  if (!user) return json({ ...base, signedIn: false, inspections: [] });
  const [{ data: me }, { data: rows }] = await Promise.all([
    db.rpc("me"),
    Number.isFinite(lotId) && lotId > 0
      ? db.from("mechanic_inspections").select(COLS).eq("lot_id", lotId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      : db.from("mechanic_inspections").select(`${COLS}, lots(title, suburb, state)`).eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  return json({
    ...base,
    signedIn: true,
    verified: !!(me?.details_done && me?.mobile_verified && me?.id_status === "verified"),
    // our account, for a booking that's waiting for payment (the app shows it with the scam warning, like an invoice)
    bank: payBank(),
    // the report itself is opened through /api/inspections/[id]/report; the storage path stays on the server
    inspections: (rows || []).map(({ report_path, ...r }) => ({ ...r, has_report: !!report_path })),
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to book.", 401);
  if (!(await allow(`inspection:${user.id}`, 10, 3600))) return fail("That's a lot of bookings in an hour. Please try again later, or call us.", 429);
  const slots = (Array.isArray(b.slots) ? b.slots : []).slice(0, 5).map((s: { day?: unknown; part?: unknown }) => ({ day: String(s?.day || "").slice(0, 10), part: String(s?.part || "").slice(0, 12) }));
  const { data, error } = await db.rpc("request_inspection", {
    p_lot: Number(b.lotId), p_slots: slots, p_note: String(b.note || "").slice(0, 500) || null, p_ack: b.agree === true,
  });
  if (error) return fail(friendly(error.message));
  return json({ ok: true, ...(data as { id: string; ref: string; fee: number }) });
}
