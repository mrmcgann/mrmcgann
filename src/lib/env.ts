// Central place for configuration. Anything missing switches that feature off,
// or into test mode when TYREBITER_TEST_MODE=true.
export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  testMode: process.env.NEXT_PUBLIC_TEST_MODE === "true",
  stripeSecret: process.env.STRIPE_SECRET_KEY || "",
  stripePublishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioVerifySid: process.env.TWILIO_VERIFY_SERVICE_SID || "",
  twilioFrom: process.env.TWILIO_FROM_NUMBER || "",
  resendKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "Tyrebiter <hello@tyrebiter.com.au>",
  cronSecret: process.env.CRON_SECRET || "",
  linkSecret: process.env.LINK_SECRET || process.env.CRON_SECRET || "",
  abn: process.env.NEXT_PUBLIC_ABN || "[ABN]",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "Tyrebiter Pty Ltd",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "[Business address]",
  payId: process.env.NEXT_PUBLIC_PAYID || "",
  /** BPAY biller code (4 to 6 digits). Empty: BPAY isn't offered. */
  bpayBiller: /^\d{4,6}$/.test(process.env.NEXT_PUBLIC_BPAY_BILLER || "") ? process.env.NEXT_PUBLIC_BPAY_BILLER! : "",
  twilioMessagingService: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
  bankBsb: process.env.NEXT_PUBLIC_BANK_BSB || "[BSB]",
  bankAccount: process.env.NEXT_PUBLIC_BANK_ACCOUNT || "[ACCOUNT]",
  bankName: process.env.NEXT_PUBLIC_BANK_NAME || "Tyrebiter Pty Ltd",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "[1300 XXX XXX]",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "help@tyrebiter.com.au",
};

/** Our account details for PayID, bank transfer and BPAY (PayBox on the web, PayRows in the app). */
export const payBank = () => ({ name: env.bankName, bsb: env.bankBsb, account: env.bankAccount, payId: env.payId || null, bpayBiller: env.bpayBiller || null });

export const has = {
  stripe: Boolean(env.stripeSecret),
  twilioVerify: Boolean(env.twilioSid && env.twilioToken && env.twilioVerifySid),
  twilioSms: Boolean(env.twilioSid && env.twilioToken && (env.twilioFrom || env.twilioMessagingService)),
  email: Boolean(env.resendKey),
};

export const TEST_SMS_CODE = "123456";
