export const GRADES: [string, string, string][] = [
  ["A", "Excellent", "Very little visible wear for its age. No noticeable marks or damage."],
  ["B", "Good", "Light wear for its age. Minor marks, chips or scuffs."],
  ["C", "Fair", "Noticeable wear. Some cosmetic damage such as dents, scratches or faded paint."],
  ["D", "Rough", "Heavy wear or significant cosmetic damage. Likely to need repairs to look presentable."],
  ["E", "Poor", "Major visible damage, or parts missing. May need repair before it can be used."],
];
export const gradeInfo = (g: string | null) => GRADES.find((x) => x[0] === g) || GRADES[2];
export const BACKDROPS = ["sun", "tangerine", "lime", "sky", "grape", "berry", "mint", "lilac", "coral", "blueberry"] as const;
export const STATES = ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "NT", "ACT"] as const;
