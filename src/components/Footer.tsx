import Link from "next/link";
import { env } from "@/lib/env";
import { getSettingsCached } from "@/lib/cache";

const APPS: [string, string][] = [];
if (process.env.NEXT_PUBLIC_APP_STORE_URL) APPS.push(["iPhone", process.env.NEXT_PUBLIC_APP_STORE_URL]);
if (process.env.NEXT_PUBLIC_PLAY_STORE_URL) APPS.push(["Android", process.env.NEXT_PUBLIC_PLAY_STORE_URL]);

// Licence numbers come from Admin → Fees & settings (NSW requires the dealer licence number in every ad).
export async function Footer() {
  const settings = await getSettingsCached().catch(() => ({} as Record<string, Record<string, unknown>>));
  const lic = Object.entries(((settings.business || {}).licences || {}) as Record<string, string>).filter(([, v]) => v);
  const licences = lic.length ? `Licences: ${lic.map(([st, v]) => `${st} ${v}`).join(" · ")}.` : `Motor dealer licence ${process.env.NEXT_PUBLIC_DEALER_LICENCE || "[LICENCE NO.]"}.`;
  return (
    <footer>
      <div className="wrap">
        <div className="fcols">
          <div><b>Buy</b><Link href="/auctions">Live auctions</Link><Link href="/auctions?sort=ending">Ending soon</Link><Link href="/watchlist">Watchlist</Link><Link href="/help#h-bid">How bidding works</Link><Link href="/finance">Car finance</Link><Link href="/insurance">Car insurance</Link><Link href="/warranty">Warranty &amp; roadside</Link><Link href="/sales">Fleet sales</Link></div>
          <div><b>Sell</b><Link href="/sell">Sell your vehicle</Link><Link href="/sell#how-sell">How selling works</Link><Link href="/sell#fees">Seller fees</Link><Link href="/seller-agreement">Seller agreement</Link><Link href="/sell/dashboard">Seller dashboard</Link></div>
          <div><b>Help</b><Link href="/help">Help centre</Link><Link href="/help#h-pay">Paying</Link><Link href="/help#h-collect">Collecting</Link><Link href="/help#h-scams">Staying safe</Link><Link href="/contact">Contact us</Link></div>
          <div><b>Tyrebiter</b><Link href="/terms">Terms of sale</Link><Link href="/listing-promise">How we check listings</Link><Link href="/terms#t-asis">Your consumer rights</Link><Link href="/terms#t-claims">Claims</Link><Link href="/website-terms">Website terms</Link><Link href="/privacy">Privacy policy</Link><Link href="/terms#t-complaints">Complaints</Link></div>
        </div>
        <div className="fbot">
          <span data-testid="footer-licences">Copyright © {new Date().getFullYear()} {env.legalName}. ABN {env.abn}. {licences} Times shown in your local time zone.</span>
          <span>
            {APPS.length ? <>Get the app: {APPS.map(([label, href], i) => <span key={label}>{i ? " · " : ""}<a href={href} rel="noopener">{label}</a></span>)}. </> : null}
            {env.phone} · {env.supportEmail}
          </span>
        </div>
      </div>
    </footer>
  );
}
