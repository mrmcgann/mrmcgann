import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MobileMenu, SearchButton } from "@/components/HeaderClient";
import { HeaderUser } from "@/components/HeaderUser";
import { CATEGORY_GROUPS, groupCats } from "@/lib/vehicles";

// Static header (cached with the page); the signed-in parts render in the browser.
export function Header() {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Logo />
        <nav className="nav-links" aria-label="Main">
          {/* Each group is a menu of its own categories: a search filters on one category at a time, so the group's
              own link goes to everything. Opened by hover and by keyboard focus, with no JavaScript, which keeps
              this header static and cached. Under 1100px it is hidden and MobileMenu lists the same categories. */}
          {CATEGORY_GROUPS.map((g) => (
            <div className="nav-group" key={g.key}>
              <Link href="/auctions" className="nav-group-top">{g.label}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 9 7 7 7-7" /></svg></Link>
              <div className="nav-menu">
                {groupCats(g).map((c) => <Link key={c.key} href={`/auctions?cat=${c.key}`}>{c.label}</Link>)}
              </div>
            </div>
          ))}
          <Link href="/calendar">Calendar</Link>
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
