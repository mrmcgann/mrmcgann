import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImportTool } from "./ImportTool";

export default async function ImportPage() {
  await requireAdmin(); // checked on every page, not just the layout
  const [{ data: sales }, { data: depots }] = await Promise.all([
    supabaseAdmin().from("sales").select("id, title").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin().from("depots").select("id, name, suburb, state").eq("active", true).order("state").order("suburb"),
  ]);
  return (
    <>
      <h1 className="d2">Bulk upload.</h1>
      <p className="muted">Turn a fleet&apos;s vehicle list (a spreadsheet saved as CSV) into draft listings. Each one still needs photos, the PPSR search, the seller agreement, the transport amount and the listing checks against the vehicle before it can go live. The suburb, state and postcode in the file are kept privately as where we pick it up; listings show the depot.</p>
      <ImportTool sales={sales || []} depots={depots || []} />
    </>
  );
}
