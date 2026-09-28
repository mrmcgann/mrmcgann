import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HeartIcon } from "@/components/CarArt";
import { AccountMenu, MobileMenu } from "@/components/HeaderClient";
import { getSession, missingSteps } from "@/lib/auth";

export async function Header() {
  const { supabase, user, profile } = await getSession();
  let watchCount = 0;
  if (user) {
    const { count } = await supabase.from("watchlist").select("lot_id", { count: "exact", head: true }).eq("user_id", user.id);
    watchCount = count || 0;
  }
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
          <Link className="icon-btn" href="/watchlist" aria-label={`Watchlist, ${watchCount} vehicles`}>
            <HeartIcon size={19} />{watchCount > 0 && <span className="badge">{watchCount}</span>}
          </Link>
          {user ? (
            <AccountMenu first={profile?.first_name || "Account"} email={user.email || ""} todo={todo} admin={profile?.role === "admin"} />
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
