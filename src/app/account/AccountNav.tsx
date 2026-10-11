import Link from "next/link";
import type { Profile } from "@/lib/types";

// The account side menu (shared by the account pages).
export function AccountNav({ current, profile }: { current: "account" | "deposit" | "notifications" | "dealer" | "viewings"; profile: Profile }) {
  const on = (k: string) => (current === k ? "on" : undefined);
  return (
    <nav className="side-nav" aria-label="Account">
      <span className="h">Buying</span><Link href="/watchlist">Watchlist</Link><Link href="/watchlist?f=winning">My bids</Link>
      {(profile.pay_mode === "deposit" || (profile.deposit?.balance ?? 0) > 0 || current === "deposit") && <Link href="/account/deposit" className={on("deposit")}>Bidding deposit</Link>}
      <span className="h">Account</span><Link href="/account" className={on("account")}>Account &amp; verification</Link><Link href="/account#invoices">Invoices</Link><Link href="/account/viewings" className={on("viewings")}>Viewings</Link><Link href="/account/dealer" className={on("dealer")}>Dealer account</Link>
      <Link href="/account/notifications" className={on("notifications")}>Notifications{profile.unread ? <span>{profile.unread}</span> : null}</Link><Link href="/terms">Terms of sale</Link>
      {profile.is_seller && <><span className="h">Selling</span><Link href="/sell/dashboard">My vehicles for sale</Link></>}
      {profile.role === "admin" && <><span className="h">Tyrebiter</span><Link href="/admin">Admin</Link></>}
    </nav>
  );
}
