import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Consultant } from "@/lib/types";
import { ConsultantEditor } from "./ConsultantEditor";

// The named consultant buyers can call or email from each listing.
export default async function Consultants() {
  await requireAdmin(); // checked on every page, not just the layout
  const { data } = await supabaseAdmin().from("consultants").select("*").order("sort").order("name");
  const list = (data || []) as (Consultant & { active: boolean; sort: number })[];
  return (
    <>
      <h1 className="d2">Consultants.</h1>
      <p className="muted">Every listing shows a consultant with their phone and email. Choose one per vehicle in the vehicle editor; listings without one show the default.</p>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map((c) => <ConsultantEditor key={c.id} c={c} />)}
        <ConsultantEditor c={null} />
      </div>
    </>
  );
}
