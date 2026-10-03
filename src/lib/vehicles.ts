// Everything Tyrebiter can list, modelled on the motoring side of Grays
// (Motor Vehicles/Motor Cycles, Commercial Vehicles, Classic and Sports Cars,
// Transport, Trucks and Trailers, Caravans/Motorhomes, Boats, and
// Mining, Construction & Agriculture) and on Trade Me Motors' verticals.
// Shared by the browser (search bar, filters) and the server (search API).
// Plain TypeScript with relative imports only, so tests can run it directly.

export type CategoryKey = "cars" | "utes" | "vans" | "trucks" | "trailers" | "buses" | "motorbikes" | "caravans" | "boats" | "machinery";
export type VehicleType = "car" | "ute" | "truck" | "van" | "bus" | "bike" | "caravan" | "boat" | "trailer" | "tractor";
export type Usage = "km" | "hours" | "none";

export interface Category {
  key: CategoryKey;
  label: string;        // "Caravans & motorhomes"
  short: string;        // "Caravans"
  one: string;          // "caravan" (for sentences)
  silhouette: VehicleType;
  backdrop: string;
  usage: Usage;         // what the meter measures
  kinds: [string, string][]; // [key, label]
  extras: ("lic" | "gvm" | "cc" | "lams" | "berths" | "length" | "hours" | "drive")[];
}

export const CATEGORIES: Category[] = [
  { key: "cars", label: "Cars", short: "Cars", one: "car", silhouette: "car", backdrop: "tangerine", usage: "km", extras: ["drive"],
    kinds: [["sedan", "Sedan"], ["hatch", "Hatchback"], ["wagon", "Wagon"], ["suv", "SUV"], ["coupe", "Coupe"], ["convertible", "Convertible"], ["people-mover", "People mover"], ["classic", "Classic & collectable"]] },
  { key: "utes", label: "Utes & 4x4", short: "Utes & 4x4", one: "ute", silhouette: "ute", backdrop: "sky", usage: "km", extras: ["drive"],
    kinds: [["dual-cab", "Dual cab ute"], ["single-cab", "Single cab ute"], ["extra-cab", "Extra cab ute"], ["cab-chassis", "Cab chassis"], ["4wd-wagon", "4WD wagon"]] },
  { key: "vans", label: "Vans", short: "Vans", one: "van", silhouette: "van", backdrop: "lilac", usage: "km", extras: ["drive"],
    kinds: [["van", "Van"], ["crew-van", "Crew van"], ["refrigerated-van", "Refrigerated van"], ["high-roof", "High-roof van"]] },
  { key: "trucks", label: "Trucks", short: "Trucks", one: "truck", silhouette: "truck", backdrop: "lime", usage: "km", extras: ["lic", "gvm", "drive"],
    kinds: [["light", "Light truck"], ["tipper", "Tipper"], ["tray", "Tray / tabletop"], ["pantech", "Pantech"], ["refrigerated", "Refrigerated"], ["tilt-tray", "Tilt tray"], ["crane", "Crane truck"], ["tanker", "Tanker"], ["rigid", "Rigid truck"], ["prime-mover", "Prime mover"]] },
  { key: "trailers", label: "Trailers", short: "Trailers", one: "trailer", silhouette: "trailer", backdrop: "coral", usage: "none", extras: ["gvm", "length"],
    kinds: [["box", "Box trailer"], ["car", "Car trailer"], ["plant", "Plant trailer"], ["tipping", "Tipping trailer"], ["flat-top", "Flat top"], ["semi", "Semi-trailer"], ["horse", "Horse float"], ["boat", "Boat trailer"]] },
  { key: "buses", label: "Buses & coaches", short: "Buses", one: "bus", silhouette: "bus", backdrop: "sun", usage: "km", extras: ["lic"],
    kinds: [["minibus", "Minibus"], ["bus", "Bus"], ["coach", "Coach"]] },
  { key: "motorbikes", label: "Motorbikes", short: "Motorbikes", one: "motorbike", silhouette: "bike", backdrop: "berry", usage: "km", extras: ["cc", "lams"],
    kinds: [["road", "Road"], ["sport", "Sport"], ["cruiser", "Cruiser"], ["adventure", "Adventure"], ["dirt", "Dirt & off-road"], ["scooter", "Scooter"], ["atv", "Quad / ATV"], ["utv", "Side-by-side"]] },
  { key: "caravans", label: "Caravans & motorhomes", short: "Caravans", one: "caravan", silhouette: "caravan", backdrop: "mint", usage: "none", extras: ["berths", "length"],
    kinds: [["caravan", "Caravan"], ["pop-top", "Pop-top"], ["camper", "Camper trailer"], ["motorhome", "Motorhome"], ["campervan", "Campervan"], ["fifth-wheeler", "Fifth wheeler"]] },
  { key: "boats", label: "Boats & jet skis", short: "Boats", one: "boat", silhouette: "boat", backdrop: "blueberry", usage: "hours", extras: ["length", "hours"],
    kinds: [["runabout", "Runabout"], ["tinny", "Tinny"], ["fishing", "Fishing boat"], ["cabin", "Cabin cruiser"], ["jet-ski", "Jet ski"], ["yacht", "Yacht"], ["pontoon", "Pontoon"]] },
  { key: "machinery", label: "Machinery & farm", short: "Machinery", one: "machine", silhouette: "tractor", backdrop: "grape", usage: "hours", extras: ["hours"],
    kinds: [["tractor", "Tractor"], ["excavator", "Excavator"], ["skid-steer", "Skid steer"], ["loader", "Loader"], ["backhoe", "Backhoe"], ["forklift", "Forklift"], ["telehandler", "Telehandler"], ["mower", "Ride-on mower"]] },
];

export const CAT: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const VEHICLE_TYPES: VehicleType[] = ["car", "ute", "truck", "van", "bus", "bike", "caravan", "boat", "trailer", "tractor"];

export function kindLabel(cat: string | null | undefined, kind: string | null | undefined) {
  if (!kind) return null;
  const c = cat ? CAT[cat] : null;
  const hit = (c ? c.kinds : CATEGORIES.flatMap((x) => x.kinds)).find((k) => k[0] === kind);
  return hit ? hit[1] : kind;
}

// Makes and their popular models in Australia, by category. Order = popularity,
// which also decides ties when a model name belongs to more than one make.
export const MAKES: Record<string, Partial<Record<CategoryKey, string[]>>> = {
  Toyota: { cars: ["Corolla", "Camry", "Yaris", "RAV4", "Kluger", "C-HR", "86", "Prius", "Aurion", "Echo", "Supra", "Tarago", "Yaris Cross", "Corolla Cross"], utes: ["HiLux", "LandCruiser", "LandCruiser 70", "LandCruiser Prado", "Fortuner", "FJ Cruiser"], vans: ["HiAce"], buses: ["Coaster"], machinery: ["Forklift"] },
  Ford: { cars: ["Falcon", "Territory", "Focus", "Fiesta", "Mustang", "Escape", "Kuga", "Puma", "Mondeo", "Endura"], utes: ["Ranger", "Everest", "Falcon Ute", "F-150"], vans: ["Transit", "Transit Custom"] },
  Mazda: { cars: ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "CX-8", "CX-9", "CX-60", "MX-5"], utes: ["BT-50"] },
  Hyundai: { cars: ["i30", "i20", "Accent", "Elantra", "Tucson", "Santa Fe", "Kona", "Venue", "Ioniq 5", "Getz", "Sonata", "Palisade"], vans: ["iLoad", "Staria"] },
  Mitsubishi: { cars: ["Lancer", "Outlander", "ASX", "Eclipse Cross", "Mirage"], utes: ["Triton", "Pajero", "Pajero Sport", "Challenger"], vans: ["Express"] },
  Holden: { cars: ["Commodore", "Cruze", "Barina", "Astra", "Captiva", "Trax", "Calais", "Statesman", "Caprice", "Equinox", "Acadia"], utes: ["Colorado", "Rodeo", "Commodore Ute", "Trailblazer"] },
  Nissan: { cars: ["X-Trail", "Qashqai", "Pulsar", "Micra", "Leaf", "Juke", "Murano", "370Z", "Skyline", "Maxima", "Tiida", "Dualis"], utes: ["Navara", "Patrol", "Pathfinder"], vans: ["Urvan", "NV200"] },
  Kia: { cars: ["Cerato", "Rio", "Picanto", "Sportage", "Sorento", "Seltos", "Stinger", "Carnival", "Stonic", "EV6", "Niro"] },
  Volkswagen: { cars: ["Golf", "Polo", "Passat", "Tiguan", "T-Roc", "Touareg", "Jetta", "Arteon"], utes: ["Amarok"], vans: ["Transporter", "Crafter", "Caddy", "Multivan"] },
  Isuzu: { utes: ["D-Max", "MU-X"], trucks: ["NPR", "NLR", "NNR", "NQR", "NPS", "FRR", "FSR", "FVR", "FVZ", "FYH", "Giga"] },
  Subaru: { cars: ["Forester", "Outback", "XV", "Impreza", "WRX", "Liberty", "BRZ", "Crosstrek"] },
  Honda: { cars: ["Civic", "CR-V", "Jazz", "Accord", "HR-V", "Odyssey", "City", "CR-Z"], motorbikes: ["CBR500R", "CB650R", "CRF250L", "CRF300L", "CRF450R", "CRF110F", "Africa Twin", "NC750X", "PCX150", "CT125", "XR150L", "Rebel 500", "Gold Wing", "TRX420"] },
  Suzuki: { cars: ["Swift", "Vitara", "Jimny", "Grand Vitara", "Baleno", "S-Cross", "Ignis", "Alto"], motorbikes: ["V-Strom 650", "DR650", "GSX-R750", "GSX-S750", "RM-Z250", "DR-Z400", "Hayabusa", "Boulevard", "Burgman", "LT-Z400"] },
  "Mercedes-Benz": { cars: ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "ML", "CLA", "B-Class"], utes: ["X-Class"], vans: ["Sprinter", "Vito", "Valente"], trucks: ["Actros", "Atego", "Arocs"], buses: ["Sprinter Bus"] },
  BMW: { cars: ["1 Series", "2 Series", "3 Series", "5 Series", "X1", "X3", "X5", "X6", "M3", "Z4", "i3"], motorbikes: ["R 1250 GS", "F 850 GS", "S 1000 RR", "G 310 R", "R nineT", "F 900 R"] },
  Audi: { cars: ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q5", "Q7", "TT", "RS3", "S3"] },
  Tesla: { cars: ["Model 3", "Model Y", "Model S", "Model X"] },
  BYD: { cars: ["Atto 3", "Seal", "Dolphin", "Sealion 6"], utes: ["Shark 6"] },
  MG: { cars: ["MG3", "ZS", "HS", "MG4"] },
  GWM: { cars: ["Haval H6", "Haval Jolion", "Tank 300"], utes: ["Cannon", "Ute"] },
  LDV: { utes: ["T60", "T60 Max"], vans: ["Deliver 9", "G10", "Deliver 7"] },
  Jeep: { cars: ["Compass", "Renegade", "Cherokee"], utes: ["Wrangler", "Grand Cherokee", "Gladiator"] },
  "Land Rover": { cars: ["Range Rover", "Range Rover Sport", "Range Rover Evoque", "Discovery Sport", "Freelander"], utes: ["Defender", "Discovery"] },
  Lexus: { cars: ["IS", "RX", "NX", "ES", "GS", "UX"], utes: ["LX"] },
  Volvo: { cars: ["XC40", "XC60", "XC90", "S60", "V60"], trucks: ["FH", "FM", "FMX", "FE"], buses: ["B12R"] },
  Porsche: { cars: ["911", "Cayenne", "Macan", "Boxster", "Cayman", "Panamera"] },
  Peugeot: { cars: ["208", "308", "2008", "3008", "5008"], vans: ["Partner", "Expert", "Boxer"] },
  Renault: { cars: ["Clio", "Megane", "Koleos", "Captur"], vans: ["Trafic", "Master", "Kangoo"] },
  Skoda: { cars: ["Octavia", "Superb", "Kodiaq", "Karoq", "Fabia"] },
  Mini: { cars: ["Cooper", "Countryman", "Clubman"] },
  Fiat: { cars: ["500", "Punto"], vans: ["Ducato", "Doblo"] },
  "Alfa Romeo": { cars: ["Giulia", "Giulietta", "Stelvio", "MiTo"] },
  Chrysler: { cars: ["300"] },
  SsangYong: { cars: ["Rexton", "Korando", "Tivoli"], utes: ["Musso"] },
  Chevrolet: { cars: ["Camaro", "Corvette"], utes: ["Silverado"] },
  RAM: { utes: ["1500", "2500"] },
  Daihatsu: { cars: ["Sirion", "Terios", "Charade"] },
  Hino: { trucks: ["300 Series", "500 Series", "700 Series", "Dutro", "Ranger"] },
  "Mitsubishi Fuso": { trucks: ["Canter", "Fighter", "Shogun"], buses: ["Rosa"] },
  UD: { trucks: ["Quon", "Condor", "Croner"] },
  Kenworth: { trucks: ["T401", "T403", "T409", "T410", "T610", "T659", "T909", "K200", "C509"] },
  Mack: { trucks: ["Granite", "Trident", "Super-Liner", "Anthem", "Metro-Liner"] },
  Scania: { trucks: ["R 620", "R 560", "R 500", "G 410", "P 320"], buses: ["K-Series"] },
  Iveco: { trucks: ["Daily", "Eurocargo", "Stralis", "X-Way", "S-Way", "Acco", "Powerstar"], buses: ["Daily Bus"] },
  MAN: { trucks: ["TGS", "TGX", "TGM"] },
  "Western Star": { trucks: ["4800", "4900", "5800", "6900"] },
  Freightliner: { trucks: ["Cascadia", "Argosy", "Coronado", "Century Class"] },
  DAF: { trucks: ["CF", "XF", "LF"] },
  International: { trucks: ["ProStar", "9200"] },
  Yamaha: { motorbikes: ["MT-07", "MT-09", "MT-03", "YZF-R3", "YZF-R1", "WR250F", "YZ250F", "YZ450F", "TT-R125", "TT-R230", "XT250", "Ténéré 700", "Tracer 9", "XV250", "NMAX", "Grizzly 700", "YXZ1000R"], boats: ["WaveRunner VX", "WaveRunner FX", "WaveRunner EX"] },
  Kawasaki: { motorbikes: ["Ninja 400", "Ninja 650", "Z650", "Z900", "KLX300", "KLX230", "KX250", "KX450", "Versys 650", "Vulcan S", "Brute Force 750"], boats: ["Ultra 310", "STX 160"] },
  KTM: { motorbikes: ["390 Duke", "790 Duke", "690 SMC R", "890 Adventure", "1290 Super Adventure", "300 EXC", "250 SX-F", "450 SX-F"] },
  "Harley-Davidson": { motorbikes: ["Street Glide", "Road Glide", "Fat Boy", "Sportster", "Road King", "Softail", "Street Bob", "Iron 883"] },
  Ducati: { motorbikes: ["Monster", "Panigale V4", "Scrambler", "Multistrada", "Diavel"] },
  Triumph: { motorbikes: ["Bonneville", "Street Triple", "Tiger 900", "Speed Twin", "Trident 660"] },
  "Royal Enfield": { motorbikes: ["Classic 350", "Himalayan", "Interceptor 650", "Meteor 350"] },
  Husqvarna: { motorbikes: ["TE 300", "FE 350", "Svartpilen 401", "Vitpilen 401"] },
  Aprilia: { motorbikes: ["RS 660", "Tuono"] },
  Indian: { motorbikes: ["Scout", "Chief", "FTR"] },
  Vespa: { motorbikes: ["Primavera", "GTS 300", "Sprint"] },
  Piaggio: { motorbikes: ["Medley", "Liberty"] },
  Polaris: { motorbikes: ["Sportsman 570", "RZR", "Ranger"] },
  "Can-Am": { motorbikes: ["Outlander", "Maverick", "Defender", "Spyder"] },
  CFMoto: { motorbikes: ["CForce 600", "ZForce", "450NK", "700CL-X"] },
  Jayco: { caravans: ["Swan", "Starcraft", "Journey", "Silverline", "Expanda", "Conquest", "Penguin", "Crosstrak"] },
  Avan: { caravans: ["Aliner", "Cruiseliner", "Applause"] },
  Windsor: { caravans: ["Rapid", "Genesis", "Royale"] },
  Coromal: { caravans: ["Element", "Excel", "Princeton"] },
  Crusader: { caravans: ["Explorer"] },
  Lotus: { caravans: ["Trooper", "Off Grid", "Freelander"] },
  "New Age": { caravans: ["Manta Ray", "Big Red", "Road Owl"] },
  Bushtracker: { caravans: ["19ft", "21ft"] },
  "Zone RV": { caravans: ["Z-17", "Z-21"] },
  MDC: { caravans: ["XT17", "Forbes"] },
  Supreme: { caravans: ["Spirit", "Getaway"] },
  Sunliner: { caravans: ["Pinnacle", "Switch"] },
  Winnebago: { caravans: ["Esperance", "Cottesloe"] },
  Ezytrail: { caravans: ["Stirling", "Parkes"] },
  Quintrex: { boats: ["Hornet", "Renegade", "Top Ender", "Freedom Sport", "Busta"] },
  Stacer: { boats: ["Assault", "Seasprite", "Proline", "Easy Rider"] },
  "Haines Hunter": { boats: ["535 Classic", "650R"] },
  "Bar Crusher": { boats: ["535C", "615HT", "670HT"] },
  Savage: { boats: ["Bay Cruiser", "Jabiru"] },
  "Sea-Doo": { boats: ["Spark", "GTI", "GTX", "RXT"] },
  Riviera: { boats: ["3600", "4000"] },
  Whittley: { boats: ["CR 2180", "Sea Legend"] },
  "Cruise Craft": { boats: ["Explorer 625", "Outsider"] },
  Bayliner: { boats: ["VR5", "Element"] },
  Kubota: { machinery: ["M7040", "L4508", "B2601", "KX040", "U17", "SVL75", "ZD1211"] },
  "John Deere": { machinery: ["5075E", "6120M", "3038E", "X540", "35G", "50G", "310SL"] },
  Caterpillar: { machinery: ["303.5", "305E2", "308", "320D", "262D", "420F", "950H", "D6"] },
  Komatsu: { machinery: ["PC55", "PC138", "PC200", "WA200"] },
  Hitachi: { machinery: ["ZX55", "ZX135", "ZX200"] },
  Bobcat: { machinery: ["S650", "S570", "E35", "T770"] },
  Yanmar: { machinery: ["ViO17", "ViO55", "SV08"] },
  Takeuchi: { machinery: ["TB216", "TB290"] },
  Kobelco: { machinery: ["SK55", "SK135"] },
  "New Holland": { machinery: ["T5", "T4", "Boomer"] },
  "Massey Ferguson": { machinery: ["4708", "5713"] },
  Case: { machinery: ["580", "Farmall"] },
  JCB: { machinery: ["3CX", "8018", "535-95", "1CX"] },
  Mahindra: { machinery: ["4025", "6075"] },
  Hyster: { machinery: ["H2.5"] },
  Manitou: { machinery: ["MT1840"] },
  "Brian James": { trailers: ["A4 Transporter", "Cyclone", "Race Transporter"] },
  "Ifor Williams": { trailers: ["GD105", "HB506"] },
  Maxitrans: { trailers: ["Freighter", "Lusty"] },
  Vawdrey: { trailers: ["B-Double", "Drop Deck"] },
  Krueger: { trailers: ["Flat Top", "Drop Deck"] },
  Barker: { trailers: ["Box", "Plant"] },
  Austrailers: { trailers: ["Car Carrier", "Plant"] },
};

export const MAKE_ALIASES: Record<string, string> = {
  vw: "Volkswagen", volkswagon: "Volkswagen", merc: "Mercedes-Benz", mercedes: "Mercedes-Benz", benz: "Mercedes-Benz", "mercedes benz": "Mercedes-Benz",
  chev: "Chevrolet", chevy: "Chevrolet", landrover: "Land Rover", harley: "Harley-Davidson", "harley davidson": "Harley-Davidson", hd: "Harley-Davidson",
  fuso: "Mitsubishi Fuso", cat: "Caterpillar", deere: "John Deere", jd: "John Deere", seadoo: "Sea-Doo", "sea doo": "Sea-Doo",
  "great wall": "GWM", haval: "GWM", enfield: "Royal Enfield", "can am": "Can-Am", canam: "Can-Am", "massey": "Massey Ferguson", "mf": "Massey Ferguson",
  "ud trucks": "UD", "nissan ud": "UD", "western star": "Western Star", "range rover": "Land Rover",
};

export const STATE_NAMES: Record<string, string> = { QLD: "Queensland", NSW: "New South Wales", VIC: "Victoria", WA: "Western Australia", SA: "South Australia", TAS: "Tasmania", NT: "Northern Territory", ACT: "Australian Capital Territory" };
export const STATE_WORDS: Record<string, string> = {
  qld: "QLD", queensland: "QLD", brisbane: "QLD", "gold coast": "QLD", "sunshine coast": "QLD",
  nsw: "NSW", "new south wales": "NSW", sydney: "NSW",
  vic: "VIC", victoria: "VIC", melbourne: "VIC",
  wa: "WA", "western australia": "WA", perth: "WA",
  sa: "SA", "south australia": "SA", adelaide: "SA",
  tas: "TAS", tasmania: "TAS", hobart: "TAS",
  nt: "NT", "northern territory": "NT", darwin: "NT",
  act: "ACT", canberra: "ACT",
};

export const FUELS: [string, string][] = [["petrol", "Petrol"], ["diesel", "Diesel"], ["hybrid", "Hybrid"], ["electric", "Electric"], ["lpg", "LPG"]];
export const TRANS: [string, string][] = [["auto", "Automatic"], ["manual", "Manual"]];
export const DRIVES: [string, string][] = [["2WD", "2WD"], ["4WD", "4WD"], ["AWD", "AWD"]];
export const LICENCES: [string, string][] = [["C", "Car licence"], ["LR", "Light rigid (LR)"], ["MR", "Medium rigid (MR)"], ["HR", "Heavy rigid (HR)"], ["HC", "Heavy combination (HC)"], ["MC", "Multi combination (MC)"]];

/** Every make that sells in a category (or all makes), in popularity order. */
export function makesFor(cat?: string | null) {
  return Object.keys(MAKES).filter((m) => !cat || cat === "cheap" || MAKES[m][cat as CategoryKey]);
}
/** Models for a make, optionally limited to one category. */
export function modelsFor(make?: string | null, cat?: string | null) {
  if (!make) return [];
  const key = Object.keys(MAKES).find((m) => m.toLowerCase() === make.toLowerCase());
  if (!key) return [];
  const byCat = MAKES[key];
  if (cat && cat !== "cheap" && byCat[cat as CategoryKey]) return byCat[cat as CategoryKey]!;
  return Object.values(byCat).flat();
}
/** Which category a make + model most likely belongs to. */
export function categoryOf(make: string, model?: string | null): CategoryKey | null {
  const byCat = MAKES[make]; if (!byCat) return null;
  const cats = Object.keys(byCat) as CategoryKey[];
  if (model) { const hit = cats.find((c) => byCat[c]!.some((m) => m.toLowerCase() === model.toLowerCase())); if (hit) return hit; }
  return cats.length === 1 ? cats[0] : null;
}
export function canonicalMake(s: string | null | undefined) {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  return Object.keys(MAKES).find((m) => m.toLowerCase() === t) || MAKE_ALIASES[t] || null;
}

/** One-line summary under a listing's title, suited to the kind of vehicle. */
export function specLine(l: { category?: string | null; odometer?: number | null; hours?: number | null; transmission?: string | null; fuel?: string | null; engine_cc?: number | null; lams?: boolean | null; berths?: number | null; length_m?: number | null; kind?: string | null; gvm_kg?: number | null; year?: number | null }) {
  const n = (v: number) => v.toLocaleString("en-AU");
  const parts: (string | number | null | false | undefined)[] = [];
  switch (l.category) {
    case "motorbikes": parts.push(l.odometer != null && `${n(l.odometer)} km`, l.engine_cc && `${n(l.engine_cc)} cc`, l.lams && "LAMS"); break;
    case "caravans": parts.push(kindLabel(l.category, l.kind), l.berths && `Sleeps ${l.berths}`, l.length_m && `${l.length_m} m`); break;
    case "boats": parts.push(kindLabel(l.category, l.kind), l.length_m && `${l.length_m} m`, l.hours != null && `${n(l.hours)} hrs`); break;
    case "machinery": parts.push(kindLabel(l.category, l.kind), l.hours != null && `${n(l.hours)} hrs`, l.fuel); break;
    case "trailers": parts.push(kindLabel(l.category, l.kind), l.gvm_kg && `ATM ${n(l.gvm_kg)} kg`, l.length_m && `${l.length_m} m`); break;
    default: parts.push(l.odometer != null && `${n(l.odometer)} km`, l.transmission, l.fuel);
  }
  return parts.filter(Boolean).join(" · ");
}
