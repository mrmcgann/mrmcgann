import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DepotForm, type DepotRow } from "./DepotForm";

// Depots: our transport partner's yards. Every listing names the depot the buyer collects from (the listing shows its
// suburb, never the seller's); paid vehicles are taken there, and the depot hands them over for the release code.
export default async function Depots() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const [{ data: depots }, { data: priv }, { data: partners }, { data: lots }] = await Promise.all([
    db.from("depots").select("*").order("state").order("suburb"),
    db.from("depot_private").select("*"),
    db.from("partners").select("id, name").eq("kind", "transport").order("name"),
    db.from("lots").select("depot_id").in("status", ["draft", "scheduled", "live", "referred", "offers"]).not("depot_id", "is", null).limit(5000),
  ]);
  const p = new Map((priv || []).map((x) => [x.depot_id, x]));
  const count = new Map<string, number>();
  for (const l of lots || []) count.set(l.depot_id as string, (count.get(l.depot_id as string) || 0) + 1);
  const rows: DepotRow[] = (depots || []).map((d) => ({ ...d, ...(p.get(d.id) || {}), id: d.id, listings: count.get(d.id) || 0 }));
  return (
    <>
      <h1 className="d2">Depots.</h1>
      <p className="muted">Where our transport partner takes paid vehicles, and where buyers collect them. Listings show the depot&apos;s name, suburb and hours; buyers get the street address only once their collection time is confirmed. The handover link goes to the depot&apos;s email and phone. A depot with listings can be switched off but not deleted.</p>
      {rows.map((d) => <DepotForm key={d.id} depot={d} partners={partners || []} />)}
      <DepotForm depot={null} partners={partners || []} />
    </>
  );
}
