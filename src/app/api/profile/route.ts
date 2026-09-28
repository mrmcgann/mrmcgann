import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";
import { STATES } from "@/lib/grades";
import { acceptCurrentTerms } from "@/lib/terms";

export async function POST(req: Request) {
  const b = await req.json();
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);

  if (b.terms) {
    await acceptCurrentTerms(user.id);
    return json({ ok: true });
  }

  const v = {
    first_name: String(b.first_name || "").trim(), last_name: String(b.last_name || "").trim(), dob: String(b.dob || ""),
    mobile: String(b.mobile || "").replace(/\s/g, ""), street: String(b.street || "").trim(), suburb: String(b.suburb || "").trim(),
    state: String(b.state || ""), postcode: String(b.postcode || "").trim(), intent: ["buy", "sell", "both"].includes(b.intent) ? b.intent : "buy",
  };
  const err: Record<string, string> = {};
  if (!v.first_name) err.first_name = "Enter your first name.";
  if (!v.last_name) err.last_name = "Enter your last name.";
  const age = v.dob ? (Date.now() - new Date(v.dob).getTime()) / 31557600000 : 0;
  if (!v.dob) err.dob = "Enter your date of birth."; else if (age < 18) err.dob = "You must be 18 or over to join.";
  if (!/^04\d{8}$/.test(v.mobile)) err.mobile = "Enter an Australian mobile, like 0412 345 678.";
  if (!v.street) err.street = "Enter your street address.";
  if (!v.suburb) err.suburb = "Enter your suburb.";
  if (!(STATES as readonly string[]).includes(v.state)) err.state = "Choose your state.";
  if (!/^\d{4}$/.test(v.postcode)) err.postcode = "4 digits.";
  if (Object.keys(err).length) return json({ errors: err }, 400);

  const { error } = await db.from("profiles").update({ ...v, details_done: true }).eq("id", user.id);
  if (error) return fail("We couldn't save your details. Please try again.");
  return json({ ok: true });
}
