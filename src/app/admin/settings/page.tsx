import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SettingsForm } from "./SettingsForm";
import { BusinessSettings } from "./BusinessSettings";

export default async function Settings() {
  await requireAdmin(); // checked on every page, not just the layout
  const { data } = await supabaseAdmin().from("settings").select("*");
  const get = (k: string) => data?.find((s) => s.key === k)?.value || {};
  return (
    <>
      <h1 className="d2">Fees &amp; settings.</h1>
      <p className="muted">Changes apply to new invoices straight away, and the Terms of sale, Help centre and Seller agreement update to match automatically.</p>
      <SettingsForm fees={get("fees")} auction={get("auction")} selling={get("selling")} terms={get("terms")} />
      <BusinessSettings value={get("business")} />
    </>
  );
}
