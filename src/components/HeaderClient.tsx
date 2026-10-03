"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SearchBar } from "@/components/SearchBar";
import { CATEGORIES } from "@/lib/vehicles";

export function AccountMenu({ first, email, todo, admin, seller = false }: { first: string; email: string; todo: number; admin: boolean; seller?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }
  const initials = first.slice(0, 1).toUpperCase();
  return (
    <div className="acct" ref={ref}>
      <button className="pill pill-soft" onClick={() => setOpen(!open)} aria-expanded={open} style={{ paddingLeft: 6 }}>
        <span className="avatar">{initials}</span><span className="hide-sm">{first}</span>
      </button>
      {open && (
        <div className="acct-menu" onClick={() => setOpen(false)}>
          <div className="who">Signed in as {email}</div>
          <Link href="/account">Account &amp; verification{todo > 0 && <span className="tag" style={{ background: "var(--sun)", height: 24, marginLeft: 6 }}>{todo} to do</span>}</Link>
          <Link href="/watchlist">Watchlist &amp; my bids</Link>
          <Link href="/account/notifications">Notifications</Link>
          {seller && <Link href="/sell/dashboard">My vehicles for sale</Link>}
          <Link href="/account#invoices">Invoices</Link>
          <Link href="/sell">Sell a vehicle</Link>
          {admin && <Link href="/admin">Admin</Link>}
          <button onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
      </button>
      {open && (
        <div className="sheet wrap" style={{ position: "absolute", left: 0, right: 0, top: 60, background: "#FFFFFF", borderBottom: "1px solid var(--line)" }} onClick={() => setOpen(false)}>
          {CATEGORIES.map((c) => <Link key={c.key} href={`/auctions?cat=${c.key}`}>{c.label}</Link>)}
          <Link href="/auctions?ending=today">Ending today</Link>
          <Link href="/sell">Sell your vehicle</Link>
          <Link href="/watchlist">Watchlist</Link>
          <Link href="/help">Help</Link>
        </div>
      )}
    </>
  );
}

// Search from any page: opens a panel under the header with the full search bar.
export function SearchButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Search vehicles" aria-expanded={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
      </button>
      {open && (
        <div className="search-panel" role="dialog" aria-label="Search">
          <div className="wrap" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}><SearchBar variant="overlay" autoFocus onDone={() => setOpen(false)} /></div>
            <button className="pill pill-soft" style={{ height: 52, marginTop: 0 }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
