import { supabaseAdmin } from "@/lib/supabase/admin";
import { chargeInvoice } from "@/lib/charges";
import { notify } from "@/lib/notify";
import { searchLots } from "@/lib/data";
import { env } from "@/lib/env";
import { money, dateLong } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs every minute: closes auctions, takes payment, sends alerts.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const qs = new URL(req.url).searchParams.get("secret");
  if (!env.cronSecret || (auth !== `Bearer ${env.cronSecret}` && qs !== env.cronSecret)) {
    return new Response("Unauthorised", { status: 401 });
  }
  const db = supabaseAdmin();
  const summary: Record<string, number> = {};

  // 1. Close auctions whose time is up
  const { data: closed } = await db.rpc("close_due_lots");
  summary.closed = Number(closed || 0);

  // 2. Charge new invoices straight away
  const { data: pending } = await db.from("invoices").select("id").eq("status", "pending_charge").limit(50);
  for (const inv of pending || []) await chargeInvoice(inv.id);
  summary.charged = pending?.length || 0;

  // 3. Tell people about referrals and offer periods
  const { data: changed } = await db.from("lots").select("id, title, status, leader_id, current_bid, decision_by, notified_status")
    .in("status", ["referred", "offers", "passed"]).limit(100);
  for (const l of changed || []) {
    if (l.notified_status === l.status) continue;
    if (l.status === "referred" && l.leader_id) {
      await notify(l.leader_id, "account", `Your bid on the ${l.title} is with the seller`,
        `Bidding ended below the reserve. Your bid of ${money(l.current_bid)} has gone to the seller, who has until ${dateLong(l.decision_by)} to accept. Your bid stays binding until then.`, `/lot/${l.id}`);
    }
    if (l.status === "offers") {
      const { data: watchers } = await db.from("watchlist").select("user_id").eq("lot_id", l.id);
      for (const w of watchers || []) {
        await notify(w.user_id, "ending", `Make an offer on the ${l.title}`, `The auction closed below the reserve. You can make an offer until ${dateLong(l.decision_by)}.`, `/lot/${l.id}`);
      }
    }
    await db.from("lots").update({ notified_status: l.status }).eq("id", l.id);
  }

  // 4. One-hour reminders for watched lots
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: due } = await db.from("watchlist").select("user_id, lot_id, lots!inner(title, status, ends_at)")
    .eq("remind", true).is("reminded_at", null).eq("lots.status", "live").lte("lots.ends_at", soon).gt("lots.ends_at", new Date().toISOString()).limit(200);
  for (const w of (due || []) as unknown as { user_id: string; lot_id: number; lots: { title: string } }[]) {
    await notify(w.user_id, "ending", `Ending within the hour: ${w.lots.title}`, "A vehicle on your watchlist ends within the hour.", `/lot/${w.lot_id}`);
    await db.from("watchlist").update({ reminded_at: new Date().toISOString() }).eq("user_id", w.user_id).eq("lot_id", w.lot_id);
  }
  summary.reminders = due?.length || 0;

  // 5. Saved-search matches (checked every 15 minutes)
  if (new Date().getMinutes() % 15 === 0) {
    const { data: searches } = await db.from("saved_searches").select("*").limit(500);
    for (const s of searches || []) {
      const since = s.last_notified_at || s.created_at;
      const lots = (await searchLots(db, s.query)).filter((l) => (l.starts_at || l.created_at) > since);
      if (lots.length) {
        await notify(s.user_id, "searches", `${lots.length} new match${lots.length > 1 ? "es" : ""} for “${s.label}”`, lots.map((l) => `${l.title} · ${money(l.current_bid)}`).join("\n"), "/watchlist#searches");
      }
      await db.from("saved_searches").update({ last_notified_at: new Date().toISOString() }).eq("id", s.id);
    }
  }

  return Response.json({ ok: true, ...summary });
}
