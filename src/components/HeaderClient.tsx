"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function AccountMenu({ first, email, todo, admin }: { first: string; email: string; todo: number; admin: boolean }) {
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
          <Link href="/watchlist">Watchlist</Link>
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
          <Link href="/auctions?cat=cars">Cars</Link>
          <Link href="/auctions?cat=utes">Utes</Link>
          <Link href="/auctions?cat=trucks">Trucks</Link>
          <Link href="/auctions?sort=ending">Ending soon</Link>
          <Link href="/sell">Sell your vehicle</Link>
          <Link href="/watchlist">Watchlist</Link>
          <Link href="/help">Help</Link>
        </div>
      )}
    </>
  );
}
