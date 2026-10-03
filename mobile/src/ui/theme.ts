// The website's look (src/app/globals.css): bright white, flavour-colour backdrops,
// Plus Jakarta Sans for everything and Fraunces italic for the odd flourish.
export const C = {
  bg: "#FFFFFF", panel: "#F5F5F7", panel2: "#EDEDF0", line: "#E3E3E8",
  ink: "#1D1D1F", ink2: "#424245", muted: "#6E6E73",
  blue: "#2F5BFF", blueInk: "#1D3FCC", urgent: "#C2410C",
  tangerine: "#FF7A2F", sun: "#FFC93C", lime: "#B8E62E", sky: "#33C4F2",
  grape: "#7A42E0", berry: "#FF4F79", mint: "#3DDC97", lilac: "#A98BF5", coral: "#FF9E80", blueberry: "#3558F0",
  badBg: "#FFE3EA", badInk: "#B4123E",
};

export const BACKDROP: Record<string, string> = {
  sun: C.sun, tangerine: C.tangerine, lime: C.lime, sky: C.sky, grape: C.grape, berry: C.berry,
  mint: C.mint, lilac: C.lilac, coral: C.coral, blueberry: C.blueberry,
};
export const backdrop = (k: string | null | undefined) => BACKDROP[k || ""] || C.sun;
export const darkBackdrop = (k: string | null | undefined) => k === "grape" || k === "blueberry";

export const F = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
  serif: "Fraunces_600SemiBold_Italic",
};

export const R = { card: 28, soft: 24, field: 14, pill: 999 };
export const PAD = 20;
