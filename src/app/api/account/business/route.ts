import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const company = String(b.company || "").trim().slice(0, 120) || null;
  const abn = String(b.abn || "").replace(/\s/g, "") || null;
  if (abn && !/^\d{11}$/.test(abn)) return fail("An ABN has 11 digits.");
  const { error } = await db.from("profiles").update({ company_name: company, abn }).eq("id", user.id);
  return error ? fail("Couldn't save.") : json({ ok: true });
}
