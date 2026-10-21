// Where a photo or video was taken. Phones record the place (GPS) in photos and most videos, so a listing photo or
// walkaround video filmed at the seller's home could give the address away. Photos are redrawn in the browser before
// upload, which keeps only the picture (photoPrep.ts). Videos keep their picture and sound: only the recorded place
// is blanked, byte for byte, so nothing else in the file moves. MP4 and MOV (QuickTime) files keep it in the 'moov'
// box: a QuickTime '©xyz' entry or Apple's 'com.apple.quicktime.location.ISO6709' (text like "+27.4698+153.0251/"),
// or a 3GPP 'loci' box. Pure: the server runs it when a video is published (videoPublish.ts); unit-tested.

export type Reader = (start: number, length: number) => Promise<Uint8Array>;
type Box = { type: string; start: number; size: number; header: number };

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u64 = (b: Uint8Array, at: number) => u32(b, at) * 2 ** 32 + u32(b, at + 4);
const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** The box (size and four-letter type) starting at `at`, inside [at, end); null when it doesn't fit. */
function boxAt(b: Uint8Array, at: number, end: number): Box | null {
  if (at + 8 > end) return null;
  let size = u32(b, at), header = 8;
  const type = fourcc(b, at + 4);
  if (size === 1) { if (at + 16 > end) return null; size = u64(b, at + 8); header = 16; }
  else if (size === 0) size = end - at;
  if (size < header || at + size > end) return null;
  return { type, start: at, size, header };
}

/** Finds the 'moov' box in an MP4 or MOV file of `size` bytes, reading only the top-level box headers. */
export async function findMoov(read: Reader, size: number): Promise<{ start: number; size: number } | null> {
  let at = 0;
  for (let i = 0; i < 64 && at + 8 <= size; i++) {
    const h = await read(at, Math.min(16, size - at));
    if (h.length < 8) return null;
    let len = u32(h, 0), header = 8;
    const type = fourcc(h, 4);
    if (i === 0 && !["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"].includes(type)) return null; // not MP4/MOV
    if (len === 1) { if (h.length < 16) return null; len = u64(h, 8); header = 16; }
    else if (len === 0) len = size - at;
    if (len < header) return null;
    if (type === "moov") return at + len <= size ? { start: at, size: len } : null;
    at += len;
  }
  return null;
}

// ISO 6709 places: latitude, longitude, optional altitude and reference, ending in "/" ("+27.4698+153.0251+012.000/").
const ISO6709 = /[+-]\d{1,3}(?:\.\d+)?[+-]\d{1,3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[A-Za-z0-9_:.]*)?\//g;

/** Writes 0 over every digit of each place written as text in [start, end). */
function blankText(b: Uint8Array, start: number, end: number): number {
  let text = "";
  for (let i = start; i < end; i++) text += String.fromCharCode(b[i]);
  let n = 0;
  for (const m of text.matchAll(ISO6709)) {
    if (!/[1-9]/.test(m[0])) continue; // already blank
    for (let k = 0; k < m[0].length; k++) {
      const at = start + (m.index || 0) + k;
      if (b[at] >= 0x30 && b[at] <= 0x39) b[at] = 0x30;
    }
    n++;
  }
  return n;
}

const CONTAINERS = new Set(["moov", "trak", "udta", "meta", "mdia", "minf", "ilst"]);

/** Blanks the recorded place in a 'moov' box (changed in place, same length). Returns how many places it blanked. */
export function blankLocation(moov: Uint8Array): number {
  let n = 0;
  const visit = (start: number, end: number, depth: number, inMeta: boolean) => {
    let at = start;
    while (at + 8 <= end) {
      const box = boxAt(moov, at, end);
      if (!box) break;
      const bodyStart = box.start + box.header, boxEnd = box.start + box.size;
      if (box.type === "loci") {
        // 3GPP location: keep the box and its version, zero the rest (language, name, role, longitude, latitude...)
        let changed = false;
        for (let i = bodyStart + 4; i < boxEnd; i++) if (moov[i] !== 0) { moov[i] = 0; changed = true; }
        if (changed) n++;
      } else if (box.type === "©xyz" || (inMeta && box.type !== "hdlr")) {
        n += blankText(moov, bodyStart, boxEnd);
      }
      if (CONTAINERS.has(box.type) && depth < 6) {
        // an MP4 'meta' box starts with a 4-byte version; a QuickTime one goes straight to its children ('hdlr' first)
        const skip = box.type === "meta" && bodyStart + 8 <= boxEnd && fourcc(moov, bodyStart + 4) !== "hdlr" && u32(moov, bodyStart) === 0 ? 4 : 0;
        visit(bodyStart + skip, boxEnd, depth + 1, inMeta || box.type === "meta" || box.type === "udta");
      }
      at = boxEnd;
    }
  };
  const top = boxAt(moov, 0, moov.length);
  if (!top || top.type !== "moov") return 0;
  visit(top.header, top.size, 0, false);
  return n;
}
