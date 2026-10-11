import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

// Single-use PayIDs from a payments provider (Azupay), so a bidder's deposit or an invoice balance is matched
// automatically the moment it's paid, and the payer sees "Tyrebiter" before they send it.
// Off unless AZUPAY_CLIENT_ID and AZUPAY_SECRET_KEY are set; without them people pay by plain bank transfer with their
// reference and our team records it in Admin → Deposits. Check the field names against your Azupay onboarding pack
// (UAT first) before switching it on.
const API = (process.env.AZUPAY_API_URL || "https://api.azupay.com.au").replace(/\/$/, "");
const CLIENT_ID = process.env.AZUPAY_CLIENT_ID || "";
const SECRET = process.env.AZUPAY_SECRET_KEY || "";

export const payIdEnabled = () => Boolean(CLIENT_ID && SECRET);

/** The Authorization value Azupay sends back with this request's webhook: unique per request, and only we and Azupay know it. */
export function webhookSecret(requestId: string) {
  return crypto.createHmac("sha256", env.linkSecret || SECRET || "tyrebiter").update(`azupay:${requestId}`).digest("hex");
}

export function webhookOk(requestId: string, header: string | null) {
  const want = Buffer.from(webhookSecret(requestId));
  const got = Buffer.from(String(header || "").replace(/^Bearer\s+/i, ""));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export type PayIdRequest = { payId: string; providerId: string; raw: unknown };

/** Asks the provider for a PayID that accepts exactly one payment of this amount. */
export async function createPayId(o: { requestId: string; amount: number; description: string; expiresAt?: Date; payerName?: string }): Promise<PayIdRequest> {
  if (!payIdEnabled()) throw new Error("payid_off");
  const body = {
    PaymentRequest: {
      clientId: CLIENT_ID,
      clientTransactionId: o.requestId,
      paymentAmount: Math.round(o.amount * 100) / 100,
      paymentDescription: o.description.slice(0, 140),
      multiPayment: false,
      ...(o.expiresAt ? { paymentExpiryDatetime: o.expiresAt.toISOString() } : {}),
      ...(o.payerName ? { suggestedPayerDetails: { name: o.payerName.slice(0, 140) } } : {}),
      paymentNotification: {
        paymentNotificationEndpointUrl: `${env.siteUrl}/api/payments/azupay`,
        paymentNotificationAuthorizationHeaderValue: webhookSecret(o.requestId),
      },
    },
  };
  const res = await fetch(`${API}/v1/paymentRequest`, {
    method: "POST", headers: { Authorization: SECRET, "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { PaymentRequest?: { payID?: string }; PaymentRequestStatus?: { paymentRequestId?: string } };
  if (!res.ok || !data.PaymentRequest?.payID) throw new Error(`payid_failed:${res.status}`);
  return { payId: data.PaymentRequest.payID, providerId: data.PaymentRequestStatus?.paymentRequestId || "", raw: data };
}

/** What a webhook tells us (the same shape as Azupay's GET). */
export function readWebhook(body: unknown) {
  const b = (body || {}) as { PaymentRequest?: Record<string, unknown>; PaymentRequestStatus?: Record<string, unknown> };
  const pr = b.PaymentRequest || {}, st = b.PaymentRequestStatus || {};
  const payer = (st.payerName || st.payerAccountName || (pr.suggestedPayerDetails as { name?: string } | undefined)?.name || "") as string;
  return {
    requestId: String(pr.clientTransactionId || ""),
    providerId: String(st.paymentRequestId || ""),
    status: String(st.status || ""),
    amount: Number(st.amountReceived ?? pr.paymentAmount ?? 0),
    payerName: String(payer || "").slice(0, 120),
  };
}
