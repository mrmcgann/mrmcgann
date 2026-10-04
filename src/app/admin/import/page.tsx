import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImportTool } from "./ImportTool";

export default async function ImportPage() {
  await requireAdmin(); // checked on every page, not just the layout
  const { data: sales } = await supabaseAdmin().from("sales").select("id, title").order("created_at", { ascending: false }).limit(50);
  return (
    <>
      <h1 className="d2">Bulk upload.</h1>
      <p className="muted">Turn a fleet&apos;s vehicle list (a spreadsheet saved as CSV) into draft listings. Each one still needs photos, the PPSR search, the seller agreement and the listing checks against the vehicle before it can go live.</p>
      <ImportTool sales={sales || []} />
    </>
  );
}
