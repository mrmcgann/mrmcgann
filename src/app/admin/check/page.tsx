import { requireAdmin } from "@/lib/admin";
import { RegoCheck } from "./RegoCheck";

export const metadata = { title: "Rego & VIN check" };

// Staff: check any vehicle by plate and state, or VIN. Our own free lookup fills in what it can;
// the state's own free rego check (by hand) and the PPSR search are one click away.
export default async function CheckPage() {
  await requireAdmin(); // checked on every page, not just the layout
  return (
    <>
      <h1 className="d2">Rego &amp; VIN check.</h1>
      <p className="muted">Type the plate and state, or the VIN. We fill in what we know, then confirm the registration with the state&apos;s free check and run the PPSR before listing.</p>
      <RegoCheck />
    </>
  );
}
