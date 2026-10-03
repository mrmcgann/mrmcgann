import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MobileMenu, SearchButton } from "@/components/HeaderClient";
import { HeaderUser } from "@/components/HeaderUser";

// Static header (cached with the page); the signed-in parts render in the browser.
export function Header() {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Logo />
        <nav className="nav-links" aria-label="Main">
          <Link href="/auctions?cat=cars">Cars</Link>
          <Link href="/auctions?cat=utes">Utes &amp; 4x4</Link>
          <Link href="/auctions?cat=trucks">Trucks</Link>
          <Link href="/auctions?cat=motorbikes">Motorbikes</Link>
          <Link href="/auctions">More</Link>
          <Link href="/finance">Finance</Link>
          <Link href="/insurance">Insurance</Link>
          <Link href="/sell">Sell</Link>
        </nav>
        <div className="nav-right">
          <SearchButton />
          <HeaderUser />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
