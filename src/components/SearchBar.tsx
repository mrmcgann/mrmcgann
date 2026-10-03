"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/vehicles";
import { describe, parseQuery, searchHref, suggest, type Facets, type Suggestion } from "@/lib/search";

// One request per visit for the counts beside suggestions (edge-cached for 30 s).
let facetsPromise: Promise<Facets | null> | null = null;
export function loadFacets() {
  if (!facetsPromise) facetsPromise = fetch("/api/lots/facets").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return facetsPromise;
}

type Recent = { label: string; href: string };
const RECENT_KEY = "tb-recent-searches";
function readRecent(): Recent[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5); } catch { return []; } }
function pushRecent(r: Recent) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent().filter((x) => x.href !== r.href)].slice(0, 5))); } catch { /* private mode */ } }

const ICON: Record<Suggestion["kind"], string> = { smart: "↵", model: "●", make: "●", category: "▦", type: "▦", state: "⌖", lot: "#", keyword: "⌕" };

/** The site search: type a make, model, kind of vehicle, place or plain English ("hilux under 30k qld"). */
export function SearchBar({ initial = "", variant = "page", autoFocus = false, onDone, placeholder }: { initial?: string; variant?: "hero" | "page" | "overlay"; autoFocus?: boolean; onDone?: () => void; placeholder?: string }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(initial); }, [initial]);
  useEffect(() => { if (open && !facets) loadFacets().then(setFacets); }, [open, facets]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);

  const items: Suggestion[] = useMemo(() => {
    if (text.trim()) return suggest(text, facets, 8);
    return [];
  }, [text, facets]);
  const parsed = useMemo(() => (text.trim() ? parseQuery(text) : null), [text]);
  const understood = parsed && Object.keys(parsed.f).some((k) => k !== "q") ? parsed.parts.join(" · ") : "";

  function go(href: string, label: string) {
    pushRecent({ label, href });
    setOpen(false);
    onDone?.();
    router.push(href);
  }
  function submit() {
    if (active >= 0 && items[active]) { const s = items[active]; go(s.href, s.kind === "lot" ? s.label : describe(s.f) || s.label); return; }
    if (!text.trim()) { go("/auctions", "All vehicles"); return; }
    const p = parseQuery(text);
    if (/^#?\d{5,7}$/.test(text.trim())) { go(`/lot/${text.trim().replace("#", "")}`, `Lot ${text.trim()}`); return; }
    go(searchHref(p.f), describe(p.f) || text.trim());
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  }

  const big = variant === "hero";
  const listId = `${id}-list`;
  const showEmpty = open && !text.trim();
  return (
    <div className={`searchbar sb-${variant}`} ref={box}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); submit(); }} className="sb-form">
        <svg width={big ? 22 : 18} height={big ? 22 : 18} viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input ref={input} type="search" value={text} enterKeyHint="search" autoComplete="off" spellCheck={false}
          placeholder={placeholder || "Try “HiLux under 30k in QLD”, “LAMS bike” or “caravan sleeps 4”"}
          aria-label="Search cars, utes, trucks, motorbikes, caravans, boats and more"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => { setOpen(true); setRecent(readRecent()); }} onKeyDown={onKey} />
        {text && <button type="button" className="sb-clear" aria-label="Clear search" onClick={() => { setText(""); setActive(-1); input.current?.focus(); }}>×</button>}
        <button className="btn btn-blue sb-go">Search</button>
      </form>
      {open && (items.length > 0 || showEmpty) && (
        <div className="sb-pop" id={listId} role="listbox" aria-label="Suggestions">
          {understood && <div className="sb-understood">We’ll search for <b>{understood}</b></div>}
          {items.map((s, i) => (
            <a key={`${s.kind}-${s.label}`} id={`${id}-o${i}`} role="option" aria-selected={i === active} href={s.href}
              className={`sb-row${i === active ? " on" : ""}${s.kind === "smart" ? " smart" : ""}`}
              onMouseEnter={() => setActive(i)} onClick={(e) => { e.preventDefault(); go(s.href, s.kind === "lot" ? s.label : describe(s.f) || s.label); }}>
              <span className="sb-ic" aria-hidden="true">{ICON[s.kind]}</span>
              <span className="sb-txt"><b>{s.label}</b>{s.sub && <span>{s.sub}</span>}</span>
              {s.count != null && <span className="sb-n">{s.count ? `${s.count.toLocaleString("en-AU")} live` : "None live"}</span>}
            </a>
          ))}
          {showEmpty && (
            <>
              {recent.length > 0 && <div className="sb-h">Recent searches</div>}
              {recent.map((r) => (
                <a key={r.href} href={r.href} role="option" aria-selected={false} className="sb-row" onClick={(e) => { e.preventDefault(); go(r.href, r.label); }}>
                  <span className="sb-ic" aria-hidden="true">↺</span><span className="sb-txt"><b>{r.label}</b></span>
                </a>
              ))}
              <div className="sb-h">Browse</div>
              <div className="sb-cats">
                {CATEGORIES.map((c) => (
                  <a key={c.key} href={`/auctions?cat=${c.key}`} className="sb-cat" onClick={(e) => { e.preventDefault(); go(`/auctions?cat=${c.key}`, c.label); }}>
                    <b>{c.short}</b><span>{facets?.cats ? `${(facets.cats[c.key] || 0).toLocaleString("en-AU")} live` : " "}</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
