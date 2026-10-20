// BPAY: our biller code (NEXT_PUBLIC_BPAY_BILLER) plus each member's own Customer Reference Number (CRN), the
// same number for every invoice and deposit, so a payment always finds its member. The CRN is digits with a
// MOD10V01 (Luhn) check digit, made in the database (new_bpay_crn). Pure: website, server, app and tests.

/** The MOD10V01 check digit for a run of digits. */
export function bpayCheckDigit(digits: string): number {
  if (!/^\d{1,19}$/.test(digits)) throw new Error("bad_crn");
  let sum = 0;
  for (let i = 1; i <= digits.length; i++) {
    let d = Number(digits[digits.length - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** A CRN as typed (spaces and dashes allowed) is valid when its last digit checks out. */
export function isCrn(raw: string | null | undefined): boolean {
  const s = cleanCrn(raw);
  return /^\d{2,20}$/.test(s) && Number(s[s.length - 1]) === bpayCheckDigit(s.slice(0, -1));
}
export const cleanCrn = (raw: string | null | undefined) => String(raw || "").replace(/[\s-]/g, "");

/** "100000014" → "1000 0001 4": easier to read off a screen into a banking app. */
export const formatCrn = (crn: string) => cleanCrn(crn).replace(/(\d{4})(?=\d)/g, "$1 ");

/** A biller code is 4 to 6 digits. */
export const isBillerCode = (raw: string | null | undefined) => /^\d{4,6}$/.test(String(raw || "").trim());
