import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Push notifications to the iOS and Android apps, through Expo's push service
// (which talks to Apple and Google for us). Up to 100 messages per request and
// about 600 a second per project, so we send 100 at a time at ~5 requests a second.
// Set EXPO_ACCESS_TOKEN if "enhanced push security" is turned on in Expo.
// PUSH_DISABLED=true skips sending (local testing): rows are marked sent.

export interface PushRow { id: number; to_addr: string; kind: string; title: string; body: string; link: string | null }
type Ticket = { status: "ok"; id: string } | { status: "error"; message: string; details?: { error?: string } };
type Message = { to: string; title: string; body: string; data: Record<string, string>; sound: "default"; priority: "high" | "default"; channelId: string };

const ENDPOINT = "https://exp.host/--/api/v2/push/send";
const URGENT = new Set(["outbid", "won", "account", "seller", "ending"]);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function message(r: PushRow, token: string): Message {
  return {
    to: token,
    title: clip(r.title, 90),
    body: clip(r.body || "", 220),
    data: { link: r.link || "", kind: r.kind },
    sound: "default",
    priority: URGENT.has(r.kind) ? "high" : "default",
    // Android notification channels created by the app: bids (outbid, ending soon), updates (everything else)
    channelId: r.kind === "outbid" || r.kind === "ending" ? "bids" : "updates",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends a batch of push rows. Returns the outbox ids that are done and those to retry. */
export async function sendPushRows(rows: PushRow[]): Promise<{ ok: number[]; bad: { id: number; err: string }[] }> {
  const ok: number[] = [], bad: { id: number; err: string }[] = [];
  if (!rows.length) return { ok, bad };
  if (process.env.PUSH_DISABLED === "true") return { ok: rows.map((r) => r.id), bad };
  const db = supabaseAdmin();
  const users = Array.from(new Set(rows.map((r) => r.to_addr)));
  const { data: targets, error } = await db.rpc("push_targets", { p_users: users });
  if (error) return { ok, bad: rows.map((r) => ({ id: r.id, err: `targets: ${error.message}` })) };
  const tokens = new Map<string, string[]>();
  for (const t of (targets || []) as { user_id: string; token: string }[]) tokens.set(t.user_id, [...(tokens.get(t.user_id) || []), t.token]);

  // one message per device; remember which outbox row each came from
  const msgs: { row: number; m: Message }[] = [];
  for (const r of rows) {
    const list = tokens.get(r.to_addr) || [];
    if (!list.length) { ok.push(r.id); continue; } // app removed since it was queued: nothing to send
    for (const t of list.slice(0, 10)) msgs.push({ row: r.id, m: message(r, t) });
  }
  const delivered = new Set<number>(), failed = new Map<number, string>(), dead: string[] = [];
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    if (i) await sleep(200);
    let tickets: Ticket[] | null = null, err = "";
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate",
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk.map((c) => c.m)),
      });
      const j = (await res.json().catch(() => null)) as { data?: Ticket[]; errors?: { message: string }[] } | null;
      if (res.ok && Array.isArray(j?.data)) tickets = j!.data!;
      else err = `${res.status} ${j?.errors?.[0]?.message || ""}`.trim();
    } catch (e) {
      err = String(e).slice(0, 200);
    }
    chunk.forEach((c, k) => {
      const t = tickets?.[k];
      if (!t) { failed.set(c.row, err || "no ticket"); return; }
      if (t.status === "ok") { delivered.add(c.row); return; }
      if (t.details?.error === "DeviceNotRegistered") { dead.push(c.m.to); delivered.add(c.row); return; } // nothing to retry
      failed.set(c.row, `${t.details?.error || ""} ${t.message}`.trim().slice(0, 200));
    });
  }
  if (dead.length) await db.rpc("disable_push_tokens", { p_tokens: dead });
  const rowIds = new Set(msgs.map((m) => m.row));
  for (const id of rowIds) {
    if (delivered.has(id)) ok.push(id);
    else bad.push({ id, err: failed.get(id) || "not sent" });
  }
  return { ok, bad };
}
