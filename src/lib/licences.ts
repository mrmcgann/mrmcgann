// The licence line every page shows (the footer) and the live room repeats beside the auctioneer's name: the business's
// licence in each state it holds one (settings: business.licences), or the dealer licence from the environment.
export function licenceLine(business: Record<string, unknown> | null | undefined, fallback?: string | null): string {
  const lic = Object.entries(((business || {}).licences || {}) as Record<string, string>).filter(([, v]) => v);
  return lic.length ? `Licences: ${lic.map(([st, v]) => `${st} ${v}`).join(" · ")}.` : `Motor dealer licence ${fallback || "[LICENCE NO.]"}.`;
}
