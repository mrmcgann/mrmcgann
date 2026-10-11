// Supabase refuses passwords that have shown up in data breaches (Attack Protection → leaked passwords) with the
// code "weak_password". Say so plainly instead of showing its message. Shared by join, reset and account.
export const BREACHED = "That password has turned up in a data breach on another website, so it isn't safe here. Choose a different one.";
export const isWeakPassword = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "weak_password" || /weak|pwned|breach/i.test(e.message || ""));
