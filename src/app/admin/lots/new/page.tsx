import { requireAdmin } from "@/lib/admin";
import { LotEditor } from "@/components/LotEditor";
export default async function NewLot() {
  await requireAdmin(); // checked on every page, not just the layout
  return <LotEditor lot={null} priv={null} photos={[]} flaws={[]} />;
}
