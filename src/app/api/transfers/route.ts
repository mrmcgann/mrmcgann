import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { kickOutbox } from "@/lib/notify";
import { env } from "@/lib/env";
import { PROOF_MAX, PROOF_TYPES } from "@/lib/transfer";

const ERRORS: Record<string, string> = {
  not_found: "That purchase wasn't found.", already_done: "The transfer is already done.", not_paid: "This can be done once the invoice is paid in full.",
  bad_files: "One of the files didn't upload properly. Please add it again.", choose: "Choose whether to transfer the registration.",
  proof_needed: "Upload the transfer confirmation, or enter the receipt number.", transport_needed: "Choose how the vehicle will be moved.",
};

// The buyer's part of the transfer of ownership (see transfer_submit in the database).
export async function POST(req: Request) {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const b = await req.json().catch(() => ({}));
  const paths: string[] = Array.isArray(b.paths) ? b.paths.filter((p: unknown) => typeof p === "string").slice(0, 5) : [];
  // Each file must really be there, and be a photo or PDF under 10 MB.
  const store = supabaseAdmin().storage.from("transfer-docs");
  for (const p of paths) {
    const { data: info } = await store.info(p);
    const meta = info as unknown as { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } } | null;
    const size = Number(meta?.size ?? meta?.metadata?.size ?? 0), mime = String(meta?.contentType ?? meta?.metadata?.mimetype ?? "");
    if (!meta || !size || size > PROOF_MAX || !PROOF_TYPES[mime]) return fail(ERRORS.bad_files);
  }
  const { data: status, error } = await db.rpc("transfer_submit", {
    p_invoice: String(b.invoiceId), p_choice: b.choice || null, p_transport: b.transport || null, p_reference: String(b.reference || "").slice(0, 60), p_proof: paths,
  });
  if (error) return fail(ERRORS[Object.keys(ERRORS).find((k) => error.message.includes(k)) || ""] || "Couldn't save that. Please try again.");
  if (status === "submitted") {
    const { data: inv } = await supabaseAdmin().from("invoices").select("ref, lots(title)").eq("id", String(b.invoiceId)).maybeSingle();
    const title = (inv?.lots as unknown as { title?: string } | null)?.title || "";
    await supabaseAdmin().from("outbox").insert({ channel: "email", to_addr: env.supportEmail, kind: "lead", title: `Transfer to check ${inv?.ref || ""}: ${title}`,
      body: b.choice === "unregistered" ? "The buyer wants to take it unregistered: arrange with the seller to cancel the registration and keep the plates, then mark the transfer done." : "The buyer has uploaded their transfer confirmation.",
      link: "/admin/transfers", dedupe_key: `transfer-check:${b.invoiceId}:${Date.now()}`, priority: 3 });
    kickOutbox();
  }
  return json({ ok: true, status });
}
