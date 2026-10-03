import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, sendEmailBatch, mailHtml, type Mail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { sendPushRows } from "@/lib/push";
import { invoicePdf } from "@/lib/pdf";
import { sign } from "@/lib/links";
import { env } from "@/lib/env";

interface Row {
  id: number; user_id: string | null; channel: "sms" | "email" | "push"; to_addr: string; kind: string;
  title: string; body: string; link: string | null; meta: Record<string, string> | null;
}

// Messages people can opt out of (Spam Act): these carry a manage/unsubscribe link.
const OPTIONAL = new Set(["ending", "searches", "marketing", "outbid"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function pacer(perSecond: number) {
  let next = Date.now();
  return async () => { const wait = next - Date.now(); next = Math.max(next, Date.now()) + 1000 / perSecond; if (wait > 0) await sleep(wait); };
}

function smsText(r: Row) {
  const url = r.link ? env.siteUrl + r.link : env.siteUrl;
  let t = `Tyrebiter: ${r.title}. ${url}`;
  if (OPTIONAL.has(r.kind) && r.user_id) t += ` Opt out: ${env.siteUrl}/u/${sign(`u:${r.user_id}`)}`;
  return t;
}

function mail(r: Row): Mail {
  const url = r.link ? env.siteUrl + r.link : env.siteUrl;
  const optional = OPTIONAL.has(r.kind) && r.user_id;
  const token = optional ? sign(`u:${r.user_id}`) : null;
  const manage = token ? `${env.siteUrl}/u/${token}` : null;
  const text = `${r.body}\n\n${url}\n\n${env.legalName} · ABN ${env.abn}${manage ? `\nManage alerts or unsubscribe: ${manage}` : ""}`;
  return {
    to: r.to_addr,
    subject: r.title,
    text,
    html: mailHtml(r.title, r.body, url, r.kind === "won" ? "View invoice and collection" : "Open Tyrebiter",
      manage ? `<a href="${manage}" style="color:#6E6E73">Manage alerts or unsubscribe</a>` : undefined),
    headers: token ? { "List-Unsubscribe": `<${env.siteUrl}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}

let lastDrain = 0;

// Sends queued messages. Safe to run from several places at once: each message
// is claimed by one sender only. Resend: up to 100 emails per request, ~8 requests/s.
// Twilio: ~8 SMS/s per sender. Expo push: 100 per request. Payment and outbid alerts go first.
export async function drainOutbox({ max = 5000, deadlineMs = 50_000, throttle = false }: { max?: number; deadlineMs?: number; throttle?: boolean } = {}) {
  if (throttle) {
    if (Date.now() - lastDrain < 1500) return { sent: 0, failed: 0 };
    lastDrain = Date.now();
  }
  const db = supabaseAdmin();
  const until = Date.now() + deadlineMs;
  const emailPace = pacer(8), smsPace = pacer(8);
  let sent = 0, failed = 0;
  while (until - Date.now() > 15_000 && sent + failed < max) {
    // size each batch to the time left (roughly 8 SMS or 800 emails a second)
    const room = Math.max(20, Math.min(300, Math.floor((until - Date.now() - 10_000) / 1000) * 8));
    const { data, error } = await db.rpc("claim_outbox", { p_limit: Math.min(room, max - sent - failed), p_ids: null });
    if (error || !data?.length) break;
    const rows = data as Row[];
    const ok: number[] = [];
    const bad: { id: number; err: string }[] = [];

    const withPdf = rows.filter((r) => r.channel === "email" && r.meta?.invoice_id);
    const plain = rows.filter((r) => r.channel === "email" && !r.meta?.invoice_id);
    const texts = rows.filter((r) => r.channel === "sms");
    const pushes = rows.filter((r) => r.channel === "push");

    const safe = async <T,>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { return { ok: false, status: 0, error: String(e).slice(0, 200) } as unknown as T; } };
    const emailJob = (async () => {
      for (let i = 0; i < plain.length; i += 100) {
        const chunk = plain.slice(i, i + 100);
        await emailPace();
        const res = await safe(() => sendEmailBatch(chunk.map(mail)));
        if (res.ok) ok.push(...chunk.map((r) => r.id)); else bad.push(...chunk.map((r) => ({ id: r.id, err: `${res.status} ${res.error || ""}` })));
      }
      for (const r of withPdf) {
        await emailPace();
        const pdf = await invoicePdf(r.meta!.invoice_id).catch(() => null);
        const m = mail(r);
        if (pdf) m.attachments = [{ filename: pdf.filename, content: Buffer.from(pdf.bytes).toString("base64") }];
        const res = await safe(() => sendEmail(m));
        if (res.ok) ok.push(r.id); else bad.push({ id: r.id, err: `${res.status} ${res.error || ""}` });
      }
    })();

    const smsJob = (async () => {
      const lanes = 4;
      let k = 0;
      await Promise.all(Array.from({ length: lanes }, async () => {
        while (k < texts.length) {
          const r = texts[k++];
          await smsPace();
          const res = await sendSms(r.to_addr, smsText(r)).catch((e) => ({ ok: false, status: 0, error: String(e) }));
          if (res.ok) ok.push(r.id); else bad.push({ id: r.id, err: `${res.status} ${res.error || ""}` });
        }
      }));
    })();

    const pushJob = (async () => {
      const res = await sendPushRows(pushes).catch((e) => ({ ok: [] as number[], bad: pushes.map((r) => ({ id: r.id, err: String(e).slice(0, 200) })) }));
      ok.push(...res.ok); bad.push(...res.bad);
    })();

    try {
      await Promise.all([emailJob, smsJob, pushJob]);
    } finally {
      // anything claimed but neither sent nor failed goes back as a failure to retry
      const seen = new Set([...ok, ...bad.map((b) => b.id)]);
      for (const r of rows) if (!seen.has(r.id)) bad.push({ id: r.id, err: "not attempted" });
      await db.rpc("finish_outbox", { p_sent: ok, p_failed: bad });
    }
    sent += ok.length;
    failed += bad.length;
    if (rows.length < 50) break;
  }
  return { sent, failed };
}
