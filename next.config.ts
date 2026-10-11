import type { NextConfig } from "next";

// Security headers on every response (pages, API routes and files).
// The Content Security Policy lists every place the browser may load from: this site, Supabase (data, live prices,
// photos and videos), and Stripe (ID checks; card payments for invoices raised before cards were switched off).
// Anything else (an injected script, a hidden frame, a form posting to another site) is refused by the browser.
const supabase = (() => { try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin; } catch { return ""; } })();
const supabaseWs = supabase.replace(/^http/, "ws");
const https = (process.env.NEXT_PUBLIC_SITE_URL || "").startsWith("https://");
const dev = process.env.NODE_ENV !== "production";
// running on a computer (not the live HTTPS site): the local server answers on both localhost and 127.0.0.1
const local = !https ? " http://localhost:* http://127.0.0.1:*" : "";

const csp = [
  "default-src 'self'",
  // Next.js puts small inline scripts in every page; 'unsafe-eval' only while developing
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} https://*.stripe.com`,
  `media-src 'self' blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self'${local} ${supabase} ${supabaseWs} https://api.stripe.com https://m.stripe.network https://challenges.cloudflare.com`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  ...(https ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // once a browser has seen the site over HTTPS it never uses plain HTTP again (two years, all subdomains)
  ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // signed-in pages and API answers are never stored by shared caches unless a route says so itself
      { source: "/(account|admin|watchlist|sell/dashboard|security)/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
