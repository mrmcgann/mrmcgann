// The damage map: each flaw on a condition report can be pinned to a part of the vehicle (lot_flaws.zone, checked
// by the database). Cars, utes, 4x4s, vans and trucks get a top-down drawing; everything else lists the parts
// as words. Pure: website, server and app share the names and the drawing's shapes.

export const ZONES = [
  ["front", "Front bumper"], ["bonnet", "Bonnet"], ["windscreen", "Windscreen"], ["roof", "Roof"], ["boot", "Boot, tub or tray"], ["rear", "Rear bumper"],
  ["left_front", "Left front (passenger side)"], ["left_rear", "Left rear (passenger side)"], ["right_front", "Right front (driver's side)"],
  ["right_rear", "Right rear (driver's side)"], ["wheels", "Wheels and tyres"], ["interior", "Interior"], ["underbody", "Underbody"], ["engine", "Engine bay"],
] as const;
export type Zone = (typeof ZONES)[number][0];
export const ZONE_LABEL: Record<string, string> = Object.fromEntries(ZONES);
export const isZone = (z: unknown): z is Zone => typeof z === "string" && z in ZONE_LABEL;

/** Categories drawn as a car seen from above (the others list the parts in words). */
export const MAP_CATEGORIES = ["cars", "utes", "vans", "trucks"];
export const hasDiagram = (category: string | null | undefined) => MAP_CATEGORIES.includes(String(category || "cars"));

/** Body panels on a 200 × 400 top-down drawing (front at the top, so the car's left is on the left). Parts with no panel are listed under it. */
export const PANELS: { zone: Zone; d: string; cx: number; cy: number }[] = [
  { zone: "front", d: "M46 18 Q100 2 154 18 L158 40 L42 40 Z", cx: 100, cy: 26 },
  { zone: "bonnet", d: "M44 44 L156 44 L152 116 L48 116 Z", cx: 100, cy: 80 },
  { zone: "windscreen", d: "M50 120 L150 120 L142 150 L58 150 Z", cx: 100, cy: 135 },
  { zone: "roof", d: "M58 154 L142 154 L142 262 L58 262 Z", cx: 100, cy: 208 },
  { zone: "boot", d: "M50 300 L150 300 L154 356 L46 356 Z", cx: 100, cy: 328 },
  { zone: "rear", d: "M42 360 L158 360 L154 382 Q100 398 46 382 Z", cx: 100, cy: 372 },
  { zone: "right_front", d: "M150 44 L182 60 L184 196 L146 196 L146 154 L152 116 Z", cx: 166, cy: 130 },
  { zone: "right_rear", d: "M146 200 L184 200 L182 340 L154 356 L150 300 L142 266 L146 262 Z", cx: 166, cy: 270 },
  { zone: "left_front", d: "M50 44 L18 60 L16 196 L54 196 L54 154 L48 116 Z", cx: 34, cy: 130 },
  { zone: "left_rear", d: "M54 200 L16 200 L18 340 L46 356 L50 300 L58 266 L54 262 Z", cx: 34, cy: 270 },
];
export const OFF_DIAGRAM: Zone[] = ["wheels", "interior", "underbody", "engine"];

/** Flaws grouped by part, numbered in the order they appear on the listing (1, 2, 3…). */
export function flawPins(flaws: { zone?: string | null }[]): Map<Zone, number[]> {
  const m = new Map<Zone, number[]>();
  flaws.forEach((f, i) => { if (isZone(f.zone)) m.set(f.zone, [...(m.get(f.zone) || []), i + 1]); });
  return m;
}
