import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Reporting a security problem", description: "Found a security hole in Tyrebiter? Tell us privately and we'll fix it.", alternates: { canonical: "/security-policy" } };

const email = process.env.SECURITY_EMAIL || env.supportEmail;

const SECTIONS: [string, string[]][] = [
  ["How to tell us", [
    `Email <a class="blue" href="mailto:${email}">${email}</a> with "Security" in the subject. Say what you found, the page or address involved, and the steps to see it. A screenshot or short video helps.`,
    "We'll reply within two business days, keep you told while we fix it, and let you know when it's done.",
  ]],
  ["Please", [
    "Only use your own account, or test accounts you made. Don't look at, change or keep anyone else's details, bids, invoices or documents. If you come across someone's personal information, stop there and tell us.",
    "Don't bid on, buy or sell a vehicle to test something, don't send messages to members or sellers, and don't slow the site down (no load tests, spam or automated scanning that floods it).",
    "Give us a fair chance to fix it before telling anyone else.",
  ]],
  ["What we'll do", [
    "If you follow this page in good faith, we won't take legal action against you or ask anyone else to, and we'll thank you publicly if you'd like.",
    "We don't pay rewards for reports at the moment.",
  ]],
  ["Not a security problem", [
    "Problems with a vehicle, a sale or a payment go to our help team through the Help page. If someone has asked you to pay for a vehicle outside Tyrebiter, or our bank details look different from usual, don't pay: call us on the number on our website first.",
  ]],
];

export default function SecurityPolicy() {
  return (
    <div className="wrap" style={{ maxWidth: 820, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 28 }}>
      <h1 className="d2">Found a security problem?</h1>
      <p className="lede" style={{ margin: 0 }}>Thank you for looking out for our members. Tell us privately and we&apos;ll fix it fast.</p>
      {SECTIONS.map(([title, paras]) => (
        <section key={title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h2>
          {paras.map((p, i) => <p key={i} style={{ fontSize: 17, lineHeight: 1.65, color: "var(--ink2)" }} dangerouslySetInnerHTML={{ __html: p }} />)}
        </section>
      ))}
    </div>
  );
}
