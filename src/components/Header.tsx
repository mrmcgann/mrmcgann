import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MobileMenu } from "@/components/HeaderClient";
import { HeaderUser } from "@/components/HeaderUser";

// Static header (cached with the page); the signed-in parts render in the browser.
export function Header() {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Logo />
        <nav className="nav-links" aria-label="Main">
          <Link href="/auctions?cat=cars">Cars</Link>
          <Link href="/auctions?cat=utes">Utes</Link>
          <Link href="/auctions?cat=trucks">Trucks</Link>
          <Link href="/auctions?sort=ending">Ending soon</Link>
          <Link href="/sell">Sell</Link>
          <Link href="/help">Help</Link>
        </nav>
        <div className="nav-right">
          <Link className="icon-btn" href="/auctions" aria-label="Search vehicles">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          </Link>
          <HeaderUser />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
