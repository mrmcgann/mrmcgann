import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { fail } from "@/lib/api";
import { inspectionInvoicePdf } from "@/lib/pdf";

// The tax invoice for a mechanic inspection, once it's paid: for the member who booked it, or staff (row-level
// security decides who can read the booking).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("We couldn't find that booking.", 404);
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent("/account")}`, req.url));
  const { data: row } = await db.from("mechanic_inspections").select("id, paid_at").eq("id", id).maybeSingle();
  if (!row || !row.paid_at) return fail("There's no tax invoice until it's paid.", 404);
  const pdf = await inspectionInvoicePdf(id);
  if (!pdf) return fail("We couldn't make that invoice.", 404);
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" },
  });
}
