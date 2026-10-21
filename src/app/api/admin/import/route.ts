import { adminApi, audit } from "@/lib/admin";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import { rowsToLots } from "@/lib/importLots";

// Bulk upload (staff): a fleet's vehicle list becomes draft listings, optionally in one sale.
// Rows with problems are skipped and reported. Nothing goes live from here.
export async function POST(req: Request) {
  const { s: sess, error: denied } = await adminApi();
  if (denied) return denied;
  const { profile } = sess;
  await audit(sess.user?.id, "bulk upload", null, {}, "ok");
  const b = await req.json().catch(() => ({}));
  const text = String(b.csv || "");
  if (!text.trim()) return fail("Paste or choose a CSV file first.");
  if (text.length > 2_000_000) return fail("That file is too big. Split it into files of up to 500 vehicles.");
  const rows = rowsToLots(parseCsv(text));
  if (!rows.length) return fail("No vehicles found. The first row must be the column names.");
  const good = rows.filter((r) => !r.problems.length);
  if (!good.length) return fail("Every row has a problem. Fix them and try again.");
  const db = supabaseAdmin();
  const saleId = Number(b.saleId) || null;
  const sellerName = String(b.sellerName || "").trim().slice(0, 120) || null;
  const depotId = /^[0-9a-f-]{36}$/.test(String(b.depotId || "")) ? String(b.depotId) : null;
  const ids: number[] = [];
  for (let i = 0; i < good.length; i += 100) {
    const chunk = good.slice(i, i + 100);
    const { data, error } = await db.from("lots").insert(chunk.map((r) => ({ ...r.lot, sale_id: saleId, depot_id: depotId, seller_type: b.business === false ? "private" : "business" }))).select("id");
    if (error) return fail(`Couldn't add the vehicles (${error.message}). ${ids.length} were added before the problem.`);
    const added = (data || []).map((x) => x.id as number);
    ids.push(...added);
    // where the vehicle is now is where we pick it up (private); the listing shows the depot
    const pickupOf = (l: Record<string, unknown>) => [l.suburb, l.state, l.postcode].filter(Boolean).join(" ") || null;
    await db.from("lot_private").insert(added.map((id, k) => ({ lot_id: id, reserve_price: chunk[k].reserve, seller_name: sellerName, seller_address: pickupOf(chunk[k].lot) })));
  }
  revalidateTag("lots");
  return json({ ok: true, added: ids.length, skipped: rows.length - good.length, first: ids[0] || null });
}
