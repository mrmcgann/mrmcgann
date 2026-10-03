import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your Tyrebiter account and what we keep afterwards.",
};

// Public page the app stores link to for account deletion (Google Play's data deletion URL).
export default function DeleteAccount() {
  return (
    <div className="wrap" style={{ maxWidth: 760, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 22 }}>
      <h1 className="d2">Delete your account.</h1>
      <p className="lede" style={{ margin: 0 }}>You can delete your Tyrebiter account yourself at any time, in the app or here on the website.</p>
      <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <li><b>In the app:</b> open Account, scroll to the bottom and tap Delete my account.</li>
        <li><b>On the website:</b> <Link href="/signin?next=/account">sign in</Link>, open Account and choose Delete my account.</li>
        <li>Type DELETE to confirm. You&apos;re signed out on every device.</li>
      </ol>
      <div className="notice">
        <b>Something still in progress?</b> We can&apos;t delete an account while it has a bid on a live vehicle, a purchase that isn&apos;t yet paid for and collected, or a vehicle for sale. Finish those first, or contact us and we&apos;ll help.
      </div>
      <h2 className="d3" style={{ fontSize: 30, margin: "8px 0 0" }}>What we delete and what we keep.</h2>
      <p style={{ margin: 0 }}>We delete your name, contact details, address, saved card, watchlist, saved searches, alerts and app notification settings. We keep the records of any purchase or sale (tax invoices and payments) for as long as Australian tax law requires, then delete them.</p>
      <p style={{ margin: 0 }}>Can&apos;t sign in? Email <a href={`mailto:${env.supportEmail}?subject=Delete my account`}>{env.supportEmail}</a> from the address on your account, or call {env.phone}, and we&apos;ll delete it for you. See our <Link href="/privacy">privacy policy</Link> for more.</p>
    </div>
  );
}
