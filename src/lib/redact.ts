// What goes into the admin log from a request: field names and short values, never bank details, passwords,
// secrets, codes, card numbers or dates of birth. Pure, so it's unit-tested (tests/unit/security.test.mjs).
const SECRET = /account|bsb|password|passwd|secret|token|api_?key|private_?key|code|card|cvv|dob|birth|licen[cs]e_?number|signature/i;

export function auditDetail(body: unknown, depth = 0): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>).slice(0, 30)) {
    if (SECRET.test(k)) out[k] = "•••";
    else if (typeof v === "string") out[k] = v.length > 200 ? v.slice(0, 200) + "…" : v;
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = `[${v.length} items]`;
    else if (v && typeof v === "object" && depth < 1) out[k] = auditDetail(v, depth + 1);
    else out[k] = "{…}";
  }
  return out;
}
