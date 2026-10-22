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

// ---------------------------------------------------------------------------------------------------------------
// Photos the seller sends with the sell form go onto their listing (we're never at the vehicle). The form redraws
// them in the browser, but the server doesn't rely on that: before a photo is copied to the public listing, everything
// but the picture is removed here. JPEG: the APP1 to APP15 segments (EXIF with GPS, XMP, IPTC and the rest) and comments
// go, except ICC colour profiles and Adobe colour information; JFIF stays. PNG: text, EXIF and time chunks go. WebP:
// EXIF and XMP go.
// Anything else (HEIC, unknown) is refused (null) rather than published with its metadata.

export type ImageKind = "jpeg" | "png" | "webp";
export const IMAGE_TYPES: Record<ImageKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** What kind of image the bytes are (by their first bytes, never the file name). */
export function imageKind(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && fourcc(b, 1).slice(0, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WEBP") return "webp";
  return null;
}

const asciiAt = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// Walks the segments; inside a scan, copies the picture data up to the next marker (stuffed FF00 bytes and restart
// markers are part of it). Stops at the end of the first image, so pictures a phone appends after it (depth and HDR
// maps, with metadata of their own) are left out.
function stripJpeg(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let at = 2, inScan = false;
  while (at < b.length) {
    if (inScan) {
      const start = at;
      while (at + 1 < b.length && !(b[at] === 0xff && b[at + 1] !== 0x00 && b[at + 1] !== 0xff && !(b[at + 1] >= 0xd0 && b[at + 1] <= 0xd7))) at++;
      if (at + 1 >= b.length) return null;
      parts.push(b.subarray(start, at));
      inScan = false;
      continue;
    }
    if (b[at] !== 0xff || at + 1 >= b.length) return null; // not where a segment should start: refuse rather than guess
    const marker = b[at + 1];
    if (marker === 0xff) { at++; continue; } // fill byte
    if (marker === 0xd9) { parts.push(b.subarray(at, at + 2)); return concat(parts); }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(b.subarray(at, at + 2)); at += 2; continue; }
    if (at + 4 > b.length) return null;
    const len = (b[at + 2] << 8) + b[at + 3];
    if (len < 2 || at + 2 + len > b.length) return null;
    const body = at + 4;
    const keep = marker === 0xe0 ? asciiAt(b, body, "JFIF") || asciiAt(b, body, "JFXX")
      : marker === 0xe2 ? asciiAt(b, body, "ICC_PROFILE")
      : marker === 0xee ? asciiAt(b, body, "Adobe")
      : !(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe;
    if (keep) parts.push(b.subarray(at, at + 2 + len));
    at += 2 + len;
    if (marker === 0xda) inScan = true;
  }
  return null;
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs", "hIST", "acTL", "fcTL", "fdAT", "cICP", "mDCv", "cLLi"]);
function stripPng(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let at = 8, sawEnd = false;
  while (at + 12 <= b.length) {
    const len = u32(b, at), type = fourcc(b, at + 4), end = at + 12 + len;
    if (end > b.length) return null;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(at, end));
    at = end;
    if (type === "IEND") { sawEnd = true; break; }
  }
  return sawEnd ? concat(parts) : null;
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  const le32 = (at: number) => b[at] + (b[at + 1] << 8) + (b[at + 2] << 16) + ((b[at + 3] << 24) >>> 0);
  const parts: Uint8Array[] = [];
  let at = 12, size = 4;
  while (at + 8 <= b.length) {
    const type = fourcc(b, at), len = le32(at + 4), end = at + 8 + len + (len % 2);
    if (at + 8 + len > b.length) return null;
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = b.slice(at, Math.min(end, b.length));
      if (type === "VP8X") chunk[8] &= ~(0x08 | 0x04); // the header no longer says there's EXIF or XMP
      parts.push(chunk); size += chunk.length;
    }
    at = end;
  }
  if (!parts.length) return null;
  const out = new Uint8Array(12 + size - 4);
  out.set(b.subarray(0, 12), 0);
  const total = out.length - 8;
  out[4] = total & 255; out[5] = (total >>> 8) & 255; out[6] = (total >>> 16) & 255; out[7] = (total >>> 24) & 255;
  let o = 12;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** The photo with only the picture kept, and its type; null when it isn't a JPEG, PNG or WebP we can read. */
export function stripImageMetadata(b: Uint8Array): { bytes: Uint8Array; kind: ImageKind } | null {
  const kind = imageKind(b);
  if (!kind) return null;
  const bytes = kind === "jpeg" ? stripJpeg(b) : kind === "png" ? stripPng(b) : stripWebp(b);
  return bytes ? { bytes, kind } : null;
}
