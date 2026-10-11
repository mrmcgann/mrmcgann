// Australian Business Numbers: 11 digits with a check built in (the ATO's weighted sum), so typos are caught
// before anyone looks at it. Pure: used by the website, the server and the tests.
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export const cleanAbn = (v: unknown) => String(v ?? "").replace(/[\s-]/g, "");

export function isAbn(v: unknown): boolean {
  const d = cleanAbn(v);
  if (!/^\d{11}$/.test(d) || d[0] === "0") return false;
  const sum = d.split("").reduce((t, c, i) => t + (Number(c) - (i === 0 ? 1 : 0)) * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** 51 824 753 556 */
export const formatAbn = (v: unknown) => cleanAbn(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4");
