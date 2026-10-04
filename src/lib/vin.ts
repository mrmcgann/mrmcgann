// Our own VIN decoder (free, runs anywhere): who made the vehicle and where (from the first
// characters, the World Manufacturer Identifier), and the likely model year (10th character).
// Shared by the website, the server and the app. The server adds what we've learned from our
// own listings and open data (vin_patterns) and NHTSA's free decoder (src/lib/vinDecode.ts).

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// World Manufacturer Identifiers for makes sold in Australia. Longer codes win over shorter ones.
// From public WMI lists. A few codes vary by plant; what our team confirms on each listing (vin_patterns) always wins.
const WMI: [string, string, string?][] = [
  // Japan
  ["JTH", "Lexus"], ["JTJ", "Lexus"], ["JT", "Toyota"], ["JM", "Mazda"], ["JN1", "Nissan"], ["JN6", "Nissan"], ["JN8", "Nissan"], ["JNK", "Infiniti"], ["JN", "Nissan"],
  ["JMB", "Mitsubishi"], ["JMY", "Mitsubishi"], ["JA3", "Mitsubishi"], ["JA4", "Mitsubishi"],
  ["JHM", "Honda"], ["JHL", "Honda"], ["JH2", "Honda"], ["JH4", "Honda"], ["JHD", "Hino"],
  ["JF", "Subaru"], ["JS", "Suzuki"], ["JA", "Isuzu"], ["JYA", "Yamaha"], ["JYE", "Yamaha"], ["JKA", "Kawasaki"], ["JKB", "Kawasaki"], ["JD", "Daihatsu"],
  // Thailand, India, Indonesia, Malaysia
  ["MR0", "Toyota"], ["MR1", "Toyota"], ["MR2", "Toyota"], ["MHF", "Toyota"], ["MNA", "Ford"], ["MNB", "Ford"], ["MPB", "Ford"],
  ["MM0", "Mazda"], ["MM6", "Mazda"], ["MM7", "Mazda"], ["MM8", "Mazda"], ["MMB", "Mitsubishi"], ["MMC", "Mitsubishi"], ["MMT", "Mitsubishi"],
  ["MNT", "Nissan"], ["MPA", "Isuzu"], ["MRH", "Honda"], ["MLH", "Honda"], ["MA3", "Suzuki"], ["MBH", "Suzuki"], ["MAL", "Hyundai"], ["MA1", "Mahindra"], ["ME3", "Royal Enfield"],
  ["MAT", "Tata"], ["MHR", "Honda"],
  // Korea, China
  ["KMH", "Hyundai"], ["KMF", "Hyundai"], ["KMJ", "Hyundai"], ["KMT", "Genesis"], ["KNA", "Kia"], ["KNC", "Kia"], ["KND", "Kia"], ["KNE", "Kia"], ["KPT", "SsangYong"], ["KPA", "SsangYong"],
  ["KL1", "Holden"], ["KL3", "Holden"], ["KLA", "Holden"],
  ["LSJ", "MG"], ["LGW", "GWM"], ["LGX", "BYD"], ["LC0", "BYD"], ["LVV", "Chery"], ["LSK", "LDV"], ["LSF", "LDV"], ["LPS", "Polestar"], ["LRW", "Tesla"], ["LCE", "CFMoto"], ["LVS", "Ford"], ["LFV", "Volkswagen"],
  // Australia, New Zealand
  ["6G1", "Holden"], ["6G2", "Holden"], ["6H8", "Holden"], ["6FP", "Ford"], ["6T1", "Toyota"], ["6MM", "Mitsubishi"],
  // Europe
  ["WVW", "Volkswagen"], ["WVG", "Volkswagen"], ["WV1", "Volkswagen"], ["WV2", "Volkswagen"], ["WV3", "Volkswagen"], ["AAV", "Volkswagen"],
  ["WAU", "Audi"], ["WA1", "Audi"], ["TRU", "Audi"], ["WP0", "Porsche"], ["WP1", "Porsche"], ["WBA", "BMW"], ["WBS", "BMW"], ["WBY", "BMW"], ["WBX", "BMW"], ["WB1", "BMW"], ["WMW", "MINI"],
  ["WDB", "Mercedes-Benz"], ["WDD", "Mercedes-Benz"], ["WDC", "Mercedes-Benz"], ["WDF", "Mercedes-Benz"], ["W1K", "Mercedes-Benz"], ["W1N", "Mercedes-Benz"], ["W1V", "Mercedes-Benz"], ["WMA", "MAN"],
  ["TMB", "Skoda"], ["VSS", "Cupra"], ["YV1", "Volvo"], ["YV4", "Volvo"], ["YV2", "Volvo"], ["YV3", "Volvo"], ["YS2", "Scania"], ["YS4", "Scania"],
  ["SAL", "Land Rover"], ["SAJ", "Jaguar"], ["SCC", "Lotus"], ["SMT", "Triumph"], ["SB1", "Toyota"], ["SHH", "Honda"], ["SHS", "Honda"],
  ["VF1", "Renault"], ["VF3", "Peugeot"], ["VR3", "Peugeot"], ["VF7", "Citroen"], ["VF6", "Renault Trucks"], ["VNK", "Toyota"], ["VSK", "Nissan"], ["VBK", "KTM"],
  ["ZFA", "Fiat"], ["ZAR", "Alfa Romeo"], ["ZFF", "Ferrari"], ["ZHW", "Lamborghini"], ["ZAM", "Maserati"], ["ZCF", "Iveco"], ["ZDM", "Ducati"], ["ZAP", "Piaggio"], ["ZACC", "Jeep"], ["ZAC", "Jeep"],
  // North America, South Africa
  ["1C4", "Jeep"], ["1J4", "Jeep"], ["1J8", "Jeep"], ["1C6", "RAM"], ["3C6", "RAM"], ["1C3", "Chrysler"], ["2C3", "Chrysler"], ["5YJ", "Tesla"], ["7SA", "Tesla"], ["XP7", "Tesla"],
  ["1FA", "Ford"], ["1FT", "Ford"], ["1FM", "Ford"], ["1G1", "Chevrolet"], ["1GC", "Chevrolet"], ["1HD", "Harley-Davidson"], ["5HD", "Harley-Davidson"], ["1XK", "Kenworth"], ["1M1", "Mack"], ["1M2", "Mack"],
  ["1FU", "Freightliner"], ["1FV", "Freightliner"], ["AHT", "Toyota"],
];

const COUNTRY: [RegExp, string][] = [
  [/^J/, "Japan"], [/^K[L-R]/, "South Korea"], [/^L/, "China"], [/^M[A-E]/, "India"], [/^M[F-K]/, "Indonesia"], [/^M[L-R]/, "Thailand"], [/^PL|^PM/, "Malaysia"],
  [/^6/, "Australia"], [/^7[A-E]/, "New Zealand"], [/^S[A-M]/, "United Kingdom"], [/^V[F-R]/, "France"], [/^V[S-W]/, "Spain"], [/^W/, "Germany"], [/^YS|^YT|^YU|^YV|^YW/, "Sweden"],
  [/^Z/, "Italy"], [/^T[J-P]/, "Czech Republic"], [/^TR|^TS/, "Hungary"], [/^[145]/, "United States"], [/^2/, "Canada"], [/^3/, "Mexico"], [/^A[A-H]/, "South Africa"], [/^9[A-E]/, "Brazil"], [/^N[L-R]/, "Turkey"],
];

const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function normalizeVin(s: unknown) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}
export const isVin = (v: string) => VIN_RE.test(v);

export function vinMake(vin: string) {
  const v = vin.toUpperCase();
  let best: string | null = null, len = 0;
  for (const [code, make] of WMI) if (v.startsWith(code) && code.length > len) { best = make; len = code.length; }
  return best;
}
export function vinCountry(vin: string) {
  const v = vin.toUpperCase();
  return COUNTRY.find(([re]) => re.test(v))?.[1] || null;
}

/** Model year from the 10th character: the most recent year it can mean that isn't in the future.
 *  Most makers outside North America follow this, but not all, so treat it as a suggestion. */
export function vinYear(vin: string, now = new Date()) {
  const c = vin.toUpperCase()[9];
  const i = c ? YEAR_CODES.indexOf(c) : -1;
  if (i < 0) return null;
  const max = now.getFullYear() + 1;
  let y = 1980 + i;
  while (y + 30 <= max) y += 30;
  return y;
}

/** The free, offline part of the decode. */
export function decodeVinOffline(vin: string) {
  const v = normalizeVin(vin);
  if (!isVin(v)) return null;
  return { make: vinMake(v), country: vinCountry(v), year: vinYear(v) };
}
