import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HeartIcon } from "@/components/CarArt";
import { AccountMenu, MobileMenu } from "@/components/HeaderClient";
import { getSession, missingSteps } from "@/lib/auth";

export async function Header() {
  const { user, profile } = await getSession();
  const watchCount = Number(profile?.watch_count || 0);
  const unread = Number(profile?.unread || 0);
  const todo = user ? missingSteps(profile).length : 0;
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
          {user && (
            <Link className="icon-btn bell" href="/account/notifications" aria-label={`Notifications, ${unread} unread`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
              {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          )}
          <Link className="icon-btn" href="/watchlist" aria-label={`Watchlist, ${watchCount} vehicles`}>
            <HeartIcon size={19} />{watchCount > 0 && <span className="badge">{watchCount}</span>}
          </Link>
          {user ? (
            <AccountMenu first={profile?.first_name || "Account"} email={user.email || ""} todo={todo} admin={profile?.role === "admin"} seller={!!profile?.is_seller} />
          ) : (
            <>
              <Link className="pill hide-sm" href="/signin" style={{ background: "transparent" }}>Sign in</Link>
              <Link className="pill pill-dark" href="/join">Join free</Link>
            </>
          )}
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
