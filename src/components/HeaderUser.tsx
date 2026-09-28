"use client";
import Link from "next/link";
import { HeartIcon } from "@/components/CarArt";
import { AccountMenu } from "@/components/HeaderClient";
import { useViewer } from "@/components/Viewer";

export function HeaderUser() {
  const { ready, user, profile, missing } = useViewer();
  const watchCount = Number(profile?.watch_count || 0);
  const unread = Number(profile?.unread || 0);
  return (
    <>
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
        <AccountMenu first={profile?.first_name || "Account"} email={user.email || ""} todo={missing.length} admin={profile?.role === "admin"} seller={!!profile?.is_seller} />
      ) : (
        <span style={{ display: "flex", gap: 8, visibility: ready ? "visible" : "hidden" }}>
          <Link className="pill hide-sm" href="/signin" style={{ background: "transparent" }}>Sign in</Link>
          <Link className="pill pill-dark" href="/join">Join free</Link>
        </span>
      )}
    </>
  );
}

// "Join free" for visitors, "Go to your watchlist" for members (for cached pages).
export function JoinOrWatchlist() {
  const { user } = useViewer();
  return <Link className="btn btn-blue" href={user ? "/watchlist" : "/join"}>{user ? "Go to your watchlist" : "Join free"}</Link>;
}
