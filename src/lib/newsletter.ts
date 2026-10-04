import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { priceBreakdown } from "@/lib/fees";
import { money } from "@/lib/format";
import { env } from "@/lib/env";
import { DEFAULT_FEES, type Fees, type Lot } from "@/lib/types";
import { kickOutbox } from "@/lib/notify";

// The weekly email: new vehicles and ones ending soon, to members who ticked "News and featured
// vehicles" (and nobody else). The sender adds our name, ABN and address, and a one-click
// unsubscribe link and header to every copy (Spam Act 2003). Prices show the all-in amount
// next to the current bid, as on the site.

type Settings = { enabled?: boolean; weekday?: number; hour?: number; last_tag?: string | null };

const brisbane = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Australia/Brisbane" }));

/** The Monday of this week in Brisbane, e.g. "2026-10-05". One newsletter per week. */
export function weekTag(d = new Date()) {
  const b = brisbane(d);
  const m = new Date(b.getFullYear(), b.getMonth(), b.getDate() - ((b.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

const ends = (s: string | null) => s ? new Date(s).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", hour: "numeric", minute: "2-digit" }) : "";

export function newsletterBody(fresh: Lot[], ending: Lot[], fees: Fees) {
  const line = (l: Lot) => {
    const price = Math.max(l.current_bid || 0, l.start_price || 0);
    return `${l.title} · ${l.suburb ? `${l.suburb}, ` : ""}${l.state || ""} · ${l.bid_count ? "current bid" : "bids from"} ${money(price)} (${money(priceBreakdown(price, fees).total, true)} all-in) · ends ${ends(l.ends_at)}\n${env.siteUrl}/lot/${l.id}`;
  };
  const parts: string[] = [];
  if (fresh.length) parts.push(`New this week\n\n${fresh.map(line).join("\n\n")}`);
  if (ending.length) parts.push(`Ending soon\n\n${ending.map(line).join("\n\n")}`);
  parts.push("All-in prices include the buyer's premium, GST on the premium and the admin fee at the current bid. Every vehicle is checked against its listing before it goes live, and every listing shows what we checked.");
  return parts.join("\n\n");
}

/** Queues this week's newsletter if it's due (or now, with force). Safe to call every minute. */
export async function sendNewsletter({ force = false, now = new Date() }: { force?: boolean; now?: Date } = {}): Promise<{ queued: number; reason?: string }> {
  const db = supabaseAdmin();
  const [{ data: row }, { data: feeRow }] = await Promise.all([
    db.from("settings").select("value").eq("key", "newsletter").maybeSingle(),
    db.from("settings").select("value").eq("key", "fees").maybeSingle(),
  ]);
  const s = (row?.value || {}) as Settings;
  const tag = weekTag(now);
  if (!force) {
    if (!s.enabled) return { queued: 0, reason: "The weekly newsletter is switched off." };
    const b = brisbane(now);
    if (b.getDay() !== (s.weekday ?? 4) || b.getHours() !== (s.hour ?? 17)) return { queued: 0, reason: "Not due yet." };
    if (s.last_tag === tag) return { queued: 0, reason: "Already sent this week." };
  }
  const week = new Date(now.getTime() - 7 * 86400000).toISOString();
  const [{ data: fresh }, { data: ending }] = await Promise.all([
    db.from("lots").select("*").eq("status", "live").gte("published_at", week).order("published_at", { ascending: false }).limit(8),
    db.from("lots").select("*").eq("status", "live").gte("ends_at", now.toISOString()).order("ends_at").limit(6),
  ]);
  const freshIds = new Set((fresh || []).map((l) => l.id));
  const endingOnly = (ending || []).filter((l) => !freshIds.has(l.id));
  if (!fresh?.length && !endingOnly.length) return { queued: 0, reason: "There are no live vehicles to send." };
  const fees = { ...DEFAULT_FEES, ...((feeRow?.value || {}) as Partial<Fees>) };
  const n = fresh?.length || 0;
  const title = n ? `This week at Tyrebiter: ${n} new vehicle${n === 1 ? "" : "s"}` : "Ending soon at Tyrebiter";
  // A manual send gets its own tag so it never collides with (or blocks) the weekly one.
  const sendTag = force ? `${tag}-${now.getTime()}` : tag;
  const { data: queued, error } = await db.rpc("queue_newsletter", {
    p_title: title, p_body: newsletterBody((fresh || []) as Lot[], endingOnly as Lot[], fees), p_link: "/auctions?sort=newest", p_tag: `newsletter:${sendTag}`,
  });
  if (error) return { queued: 0, reason: "Couldn't queue the newsletter." };
  if (!force) await db.from("settings").update({ value: { ...s, last_tag: tag } }).eq("key", "newsletter");
  kickOutbox();
  return { queued: Number(queued || 0) };
}
