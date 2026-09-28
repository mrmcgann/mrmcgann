import Link from "next/link";
import { env } from "@/lib/env";

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="fcols">
          <div><b>Buy</b><Link href="/auctions">Live auctions</Link><Link href="/auctions?sort=ending">Ending soon</Link><Link href="/watchlist">Watchlist</Link><Link href="/help#h-bid">How bidding works</Link></div>
          <div><b>Sell</b><Link href="/sell">Free appraisal</Link><Link href="/sell#how-sell">How selling works</Link><Link href="/sell#fees">Seller fees</Link><Link href="/sell#fleet">Trucks &amp; fleets</Link></div>
          <div><b>Help</b><Link href="/help">Help centre</Link><Link href="/help#h-pay">Paying</Link><Link href="/help#h-collect">Collecting</Link><Link href="/join">Join free</Link></div>
          <div><b>Tyrebiter</b><Link href="/terms">Terms of sale</Link><Link href="/terms#t-asis">As is, where is</Link><Link href="/privacy">Privacy policy</Link><Link href="/terms#t-complaints">Complaints</Link></div>
        </div>
        <div className="fbot">
          <span>Copyright © {new Date().getFullYear()} {env.bankName}. ABN [ABN]. Motor dealer licence [LICENCE NO.]</span>
          <span>{env.phone} · {env.supportEmail}</span>
        </div>
      </div>
    </footer>
  );
}
