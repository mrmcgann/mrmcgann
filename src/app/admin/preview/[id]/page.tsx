import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFeesCached } from "@/lib/cache";
import { LotView } from "@/components/LotView";
import type { Lot, LotFlaw, LotPhoto } from "@/lib/types";

export const dynamic = "force-dynamic";

// How a listing will look, including drafts (admins only: this sits under /admin).
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();
  const lotId = Number(id);
  const [{ data: lot }, { data: photos }, { data: flaws }, fees] = await Promise.all([
    db.from("lots").select("*").eq("id", lotId).maybeSingle(),
    db.from("lot_photos").select("*").eq("lot_id", lotId).order("sort"),
    db.from("lot_flaws").select("*").eq("lot_id", lotId).order("sort"),
    getFeesCached(),
  ]);
  if (!lot) notFound();
  return <LotView preview bundle={{ lot: lot as Lot, photos: (photos || []) as LotPhoto[], flaws: (flaws || []) as LotFlaw[], questions: [], watchers: 0 }} fees={fees} similar={[]} history={[]} />;
}
