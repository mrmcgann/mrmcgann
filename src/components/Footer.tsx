import Link from "next/link";
import { env } from "@/lib/env";

const APPS: [string, string][] = [];
if (process.env.NEXT_PUBLIC_APP_STORE_URL) APPS.push(["iPhone", process.env.NEXT_PUBLIC_APP_STORE_URL]);
if (process.env.NEXT_PUBLIC_PLAY_STORE_URL) APPS.push(["Android", process.env.NEXT_PUBLIC_PLAY_STORE_URL]);

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="fcols">
          <div><b>Buy</b><Link href="/auctions">Live auctions</Link><Link href="/auctions?sort=ending">Ending soon</Link><Link href="/watchlist">Watchlist</Link><Link href="/help#h-bid">How bidding works</Link><Link href="/finance">Car finance</Link><Link href="/insurance">Car insurance</Link></div>
          <div><b>Sell</b><Link href="/sell">Free appraisal</Link><Link href="/sell#how-sell">How selling works</Link><Link href="/sell#fees">Seller fees</Link><Link href="/seller-agreement">Seller agreement</Link><Link href="/sell/dashboard">Seller dashboard</Link></div>
          <div><b>Help</b><Link href="/help">Help centre</Link><Link href="/help#h-pay">Paying</Link><Link href="/help#h-collect">Collecting</Link><Link href="/help#h-scams">Staying safe</Link><Link href="/contact">Contact us</Link></div>
          <div><b>Tyrebiter</b><Link href="/terms">Terms of sale</Link><Link href="/terms#t-asis">As is, where is</Link><Link href="/terms#t-claims">Claims</Link><Link href="/privacy">Privacy policy</Link><Link href="/terms#t-complaints">Complaints</Link></div>
        </div>
        <div className="fbot">
          <span>Copyright © {new Date().getFullYear()} {env.legalName}. ABN {env.abn}. Motor dealer licence {process.env.NEXT_PUBLIC_DEALER_LICENCE || "[LICENCE NO.]"}. Times shown in your local time zone.</span>
          <span>
            {APPS.length ? <>Get the app: {APPS.map(([label, href], i) => <span key={label}>{i ? " · " : ""}<a href={href} rel="noopener">{label}</a></span>)}. </> : null}
            {env.phone} · {env.supportEmail}
          </span>
        </div>
      </div>
    </footer>
  );
}
