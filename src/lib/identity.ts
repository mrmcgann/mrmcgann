import "server-only";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/[^a-z]/g, "");

// Reads a Stripe Identity session and records the result, checking the
// document's name and date of birth match the member's profile.
export async function syncIdentity(sessionId: string) {
  const stripe = getStripe();
  if (!stripe) return null;
  const s = await stripe.identity.verificationSessions.retrieve(sessionId, { expand: ["verified_outputs"] });
  const userId = s.metadata?.user_id;
  if (!userId) return null;
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("first_name, last_name, dob").eq("id", userId).single();
  let status: "pending" | "verified" | "failed" = "pending";
  if (s.status === "verified") {
    const out = s.verified_outputs;
    const dob = out?.dob ? `${out.dob.year}-${String(out.dob.month).padStart(2, "0")}-${String(out.dob.day).padStart(2, "0")}` : null;
    const nameOk = norm(out?.last_name) === norm(p?.last_name) && norm(out?.first_name).startsWith(norm(p?.first_name).slice(0, 3));
    status = nameOk && (!dob || dob === p?.dob) ? "verified" : "failed";
  } else if (s.status === "requires_input" || s.status === "canceled") {
    status = s.last_error ? "failed" : "pending";
  }
  await db.from("profiles").update({ id_status: status, id_session_id: sessionId }).eq("id", userId);
  return status;
}
