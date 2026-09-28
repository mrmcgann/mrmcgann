import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LotEditor } from "@/components/LotEditor";

export default async function EditLot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();
  const [{ data: lot }, { data: priv }, { data: photos }, { data: flaws }] = await Promise.all([
    db.from("lots").select("*").eq("id", Number(id)).single(),
    db.from("lot_private").select("*").eq("lot_id", Number(id)).maybeSingle(),
    db.from("lot_photos").select("*").eq("lot_id", Number(id)).order("sort"),
    db.from("lot_flaws").select("*").eq("lot_id", Number(id)).order("sort"),
  ]);
  if (!lot) notFound();
  return <LotEditor lot={lot} priv={priv} photos={photos || []} flaws={flaws || []} />;
}
