// The recorded place is blanked in walkaround videos (MP4 and MOV), nothing else changes.
// node --experimental-strip-types tests/unit/media.test.mjs
import { findMoov, blankLocation } from '../../src/lib/mediaPrivacy.ts';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

const enc = (s) => [...s].map((c) => c.charCodeAt(0) & 255);
const box = (type, ...parts) => {
  const body = parts.flat(2);
  const size = 8 + body.length;
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...enc(type), ...body];
};
const text = (b) => String.fromCharCode(...b);

// A phone video: QuickTime place in the movie's user data, Apple's place in its metadata, 3GPP place in a track,
// and sample tables that happen to contain place-like text (they must not change).
const xyz = box('©xyz', [0, 18, 0x15, 0xc7], enc('+27.4698+153.0251/'));
const mak = box('©mak', [0, 5, 0x15, 0xc7], enc('Apple'));
const udta = box('udta', xyz, mak);
const hdlr = box('hdlr', [0, 0, 0, 0], [0, 0, 0, 0], enc('mdta'), new Array(12).fill(0), [0]);
const keys = box('keys', [0, 0, 0, 0], [0, 0, 0, 1], box('mdta', enc('com.apple.quicktime.location.ISO6709')));
const ilst = box('ilst', box('\0\0\0\u0001', box('data', [0, 0, 0, 1], [0, 0, 0, 0], enc('+27.4698+153.0251+012.000/'))));
const meta = box('meta', hdlr, keys, ilst);
const loci = box('loci', [0, 0, 0, 0], [0x15, 0xc7], enc('Home'), [0], [0], [0, 153, 0, 0], [0, 27, 0, 0], [0, 0, 0, 0], enc('earth'), [0], [0]);
const stbl = box('stbl', box('stsd', enc('x+12.5+123.5/x')));
const trak = box('trak', box('tkhd', new Array(84).fill(1)), box('mdia', box('minf', stbl)), box('udta', loci));
const mvhd = box('mvhd', new Array(100).fill(7));
const moov = box('moov', mvhd, trak, udta, meta);
const ftyp = box('ftyp', enc('qt  '), [0, 0, 2, 0], enc('qt  '));
const mdat = box('mdat', enc('+27.4698+153.0251/'), new Array(1000).fill(0x2b));
const file = Uint8Array.from([...ftyp, ...mdat, ...moov]);
const reader = (b) => async (start, length) => b.slice(start, start + length);

const found = await findMoov(reader(file), file.length);
ok('finds the movie box from the box headers alone', found?.start === ftyp.length + mdat.length && found.size === moov.length, JSON.stringify(found));
const m = file.slice(found.start, found.start + found.size);
const before = Uint8Array.from(m);
const n = blankLocation(m);
ok('blanks every recorded place (QuickTime, Apple and 3GPP)', n === 3, String(n));
ok('the length never changes', m.length === before.length);
ok('no coordinates left', !text(m).includes('27.4698') && !text(m).includes('153.0251'), text(m));
ok('places become zeros in the same format', text(m).includes('+00.0000+000.0000/') && text(m).includes('+00.0000+000.0000+000.000/'));
const lociAt = text(m).indexOf('loci') + 4;
ok('3GPP place zeroed after its version', m.slice(lociAt + 4, lociAt + 4 + 20).every((x) => x === 0));
ok('the phone make is left alone', text(m).includes('Apple'));
ok('sample tables are never touched', text(m).includes('x+12.5+123.5/x'));
const mv = text(m).indexOf('mvhd') + 4;
ok('the movie header is unchanged', m.slice(mv, mv + 100).every((x) => x === 7));
ok('running it again changes nothing', blankLocation(m) === 0);

// The MP4 kind of metadata box (with a version before its children)
const metaMp4 = box('meta', [0, 0, 0, 0], hdlr, keys, ilst);
const moov2 = Uint8Array.from(box('moov', mvhd, metaMp4));
ok('MP4-style metadata too', blankLocation(moov2) === 1 && !text(moov2).includes('153.0251'), text(moov2));

// No place recorded: nothing changes; not an MP4 or MOV: left alone
const plain = Uint8Array.from(box('moov', mvhd, box('udta', mak)));
const copy = Uint8Array.from(plain);
ok('no place: nothing to blank', blankLocation(plain) === 0 && plain.every((x, i) => x === copy[i]));
const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
ok('not MP4 or MOV: no movie box', (await findMoov(reader(webm), webm.length)) === null);
ok('a truncated file: no movie box', (await findMoov(reader(file.slice(0, found.start + 10)), found.start + 10)) === null);

// A movie box at the start (fast start) and a 64-bit box size
const big = (type, ...parts) => { const body = parts.flat(2); const size = 16 + body.length; return [0, 0, 0, 1, ...enc(type), 0, 0, 0, 0, (size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...body]; };
const fast = Uint8Array.from([...ftyp, ...moov, ...big('mdat', new Array(50).fill(0))]);
const f2 = await findMoov(reader(fast), fast.length);
ok('fast-start files (movie box first)', f2?.start === ftyp.length && f2.size === moov.length, JSON.stringify(f2));
const after = Uint8Array.from([...ftyp, ...big('mdat', new Array(50).fill(0)), ...moov]);
const f3 = await findMoov(reader(after), after.length);
ok('64-bit box sizes are followed', f3?.start === ftyp.length + 66 && f3.size === moov.length, JSON.stringify(f3));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
