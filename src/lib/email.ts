import "server-only";
import { env, has } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[]; // base64
}

export interface SendResult { ok: boolean; status: number; error?: string; test?: boolean }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Branded, simple HTML that renders well in every mail app.
export function mailHtml(title: string, body: string, link?: string, linkLabel = "Open Tyrebiter", footer?: string) {
  // Links to our own site in the text become clickable (the text is escaped first).
  const site = env.siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linkify = (t: string) => t.replace(new RegExp(`(${site}/[^\\s<]*)`, "g"), '<a href="$1" style="color:#2F5BFF">$1</a>');
  const paras = esc(body).split(/\n{1,2}/).map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#1D1D1F">${linkify(p)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#F5F5F7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 28px">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;margin-bottom:22px">Tyrebiter<span style="color:#2F5BFF">.</span></div>
<h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;color:#1D1D1F;letter-spacing:-0.02em">${esc(title)}</h1>
${paras}
${link ? `<p style="margin:22px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#2F5BFF;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${esc(linkLabel)}</a></p>` : ""}
</td></tr></table>
<p style="max-width:560px;font-size:12px;line-height:1.5;color:#6E6E73;margin:18px auto 0">${esc(env.legalName)} · ABN ${esc(env.abn)} · ${esc(env.address)}<br>
We will never ask you to pay a seller directly or change our bank details by email. Call ${esc(env.phone)} if in doubt.${footer ? `<br>${footer}` : ""}</p>
</td></tr></table></body></html>`;
}

export async function sendEmail(m: Mail): Promise<SendResult> {
  if (!has.email) {
    console.log(`[email:test] to ${m.to}: ${m.subject}${m.attachments?.length ? ` (+${m.attachments.length} attachment)` : ""}`);
    return { ok: true, status: 200, test: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers, attachments: m.attachments }),
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : (await res.text()).slice(0, 300) };
}

// Up to 100 emails in one request (Resend batch). No attachments.
export async function sendEmailBatch(list: Mail[]): Promise<SendResult> {
  if (!list.length) return { ok: true, status: 200 };
  if (!has.email) {
    list.forEach((m) => console.log(`[email:test] to ${m.to}: ${m.subject}`));
    return { ok: true, status: 200, test: true };
  }
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(list.map((m) => ({ from: env.emailFrom, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers }))),
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : (await res.text()).slice(0, 300) };
}
