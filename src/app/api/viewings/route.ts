import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { allow } from "@/lib/ratelimit";

// Viewings for one vehicle: your own bookings and whether you can book (GET), or ask for one (POST).
// The database decides who may book what (request_viewing); this only passes it on.
export async function GET(req: Request) {
  const lotId = Number(new URL(req.url).searchParams.get("lot"));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return json({ signedIn: false, viewings: [] });
  const [{ data: me }, { data: rows }] = await Promise.all([
    db.rpc("me"),
    Number.isFinite(lotId) && lotId > 0
      ? db.from("viewings").select("id, ref, lot_id, kind, slots, note, status, starts_at, host, staff_note, created_at").eq("lot_id", lotId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
      : db.from("viewings").select("id, ref, lot_id, kind, slots, note, status, starts_at, host, staff_note, created_at, lots(title)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  return json({
    signedIn: true,
    mobileVerified: !!me?.mobile_verified,
    verified: !!(me?.details_done && me?.mobile_verified && me?.id_status === "verified"),
    viewings: rows || [],
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to book.", 401);
  if (!(await allow(`viewing:${user.id}`, 10, 3600))) return fail("That's a lot of bookings in an hour. Please try again later, or call us.", 429);
  const kind = b.kind === "in_person" ? "in_person" : "video";
  const slots = (Array.isArray(b.slots) ? b.slots : []).slice(0, 5).map((s: { day?: unknown; part?: unknown }) => ({ day: String(s?.day || "").slice(0, 10), part: String(s?.part || "").slice(0, 12) }));
  const { data, error } = await db.rpc("request_viewing", { p_lot: Number(b.lotId), p_kind: kind, p_slots: slots, p_note: String(b.note || "").slice(0, 500) || null });
  if (error) return fail(friendly(error.message));
  return json({ ok: true, ...(data as { id: string; ref: string }) });
}
