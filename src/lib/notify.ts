import "server-only";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { drainOutbox } from "@/lib/outbox";

export type NotifyKind = "outbid" | "ending" | "won" | "searches" | "marketing" | "account" | "seller" | "insights";

// Queues an alert (in-app + SMS/email per the member's settings) in the database,
// then sends it straight after the response. If sending fails or the function
// stops, the every-minute sender picks it up, so nothing is lost.
export async function notify(userId: string, kind: NotifyKind, title: string, body: string, link?: string,
  opts: { dedupe?: string; invoiceId?: string } = {}) {
  await supabaseAdmin().rpc("queue_notice", {
    p_user: userId, p_kind: kind, p_title: title, p_body: body, p_link: link || null,
    p_dedupe: opts.dedupe || null, p_meta: opts.invoiceId ? { invoice_id: opts.invoiceId } : {}, p_expires: null,
  });
  kickOutbox();
}

export async function notifySeller(lotId: number, title: string, body: string, link: string, tag: string) {
  await supabaseAdmin().rpc("queue_seller_notice", { p_lot: lotId, p_title: title, p_body: body, p_link: link, p_tag: tag });
  kickOutbox();
}

// Send whatever is queued, after the response has gone (at most once every
// 1.5 s per server instance, so a bidding frenzy doesn't flood the providers).
export function kickOutbox() {
  try {
    after(() => drainOutbox({ max: 200, deadlineMs: 20_000, throttle: true }).then(() => undefined).catch(() => undefined));
  } catch {
    void drainOutbox({ max: 200, deadlineMs: 20_000, throttle: true }).catch(() => undefined);
  }
}
