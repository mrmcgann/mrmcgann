import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getFeesCached, getPartnersCached, getSettingsCached } from "@/lib/cache";
import { LotView } from "@/components/LotView";
import type { Consultant, FinanceSettings, Lot, LotFlaw, LotPhoto, LotVideo } from "@/lib/types";

export const dynamic = "force-dynamic";

// How a listing will look, including drafts (admins only: this sits under /admin).
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { id } = await params;
  const db = supabaseAdmin();
  const lotId = Number(id);
  const [{ data: lot }, { data: photos }, { data: flaws }, { data: videos }, { data: consultants }, fees, partners, settings] = await Promise.all([
    db.from("lots").select("*").eq("id", lotId).maybeSingle(),
    db.from("lot_photos").select("*").eq("lot_id", lotId).order("sort"),
    db.from("lot_flaws").select("*").eq("lot_id", lotId).order("sort"),
    db.rpc("lot_videos_public", { p_lot: lotId }),
    db.from("consultants").select("id, name, title, phone, email, photo_path, is_default").eq("active", true),
    getFeesCached(), getPartnersCached(), getSettingsCached(),
  ]);
  if (!lot) notFound();
  const cs = (consultants || []) as Consultant[];
  const consultant = cs.find((c) => c.id === lot.consultant_id) || cs.find((c) => c.is_default) || null;
  return <LotView preview bundle={{ lot: lot as Lot, photos: (photos || []) as LotPhoto[], flaws: (flaws || []) as LotFlaw[], questions: [], watchers: 0, videos: (videos || []) as LotVideo[], consultant }}
    fees={fees} similar={[]} history={[]} partners={partners} finance={(settings.finance || {}) as FinanceSettings} />;
}
