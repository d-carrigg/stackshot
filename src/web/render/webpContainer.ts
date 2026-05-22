// WEBP container byte-builders.
//
// We never *encode* pixels here — the VP8 keyframe bitstreams come from
// WebCodecs `VideoEncoder` (see render/encode/webp.ts). This module just
// wraps those bitstreams in RIFF/WEBP containers:
//   - a single VP8 keyframe   → a plain lossy WEBP still
//   - N VP8 keyframes         → an animated WEBP (VP8X + ANIM + ANMF*)
// per https://developers.google.com/speed/webp/docs/riff_container.

const ascii4 = (s: string): Uint8Array => {
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) out[i] = s.charCodeAt(i);
  return out;
};

const writeU32LE = (buf: Uint8Array, off: number, v: number): void => {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
  buf[off + 3] = (v >>> 24) & 0xff;
};

const writeU24LE = (buf: Uint8Array, off: number, v: number): void => {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
  buf[off + 2] = (v >>> 16) & 0xff;
};

const concat = (chunks: Uint8Array[]): Uint8Array => {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

// A RIFF sub-chunk: 4-byte fourcc + 4-byte LE size + payload (padded even).
const buildChunk = (fourcc: string, payload: Uint8Array): Uint8Array => {
  const padded = payload.length + (payload.length & 1);
  const out = new Uint8Array(8 + padded);
  out.set(ascii4(fourcc), 0);
  writeU32LE(out, 4, payload.length);
  out.set(payload, 8);
  return out;
};

const buildVp8x = (width: number, height: number, hasAlpha: boolean): Uint8Array => {
  const payload = new Uint8Array(10);
  // flags: animation (0x02), alpha (0x10).
  payload[0] = 0x02 | (hasAlpha ? 0x10 : 0x00);
  // canvas width-1 (24-bit LE), height-1 (24-bit LE).
  writeU24LE(payload, 4, width - 1);
  writeU24LE(payload, 7, height - 1);
  return buildChunk("VP8X", payload);
};

const buildAnim = (loopCount: number): Uint8Array => {
  const payload = new Uint8Array(6);
  // background color BGRA: leave 0 (no preferred bg).
  payload[4] = loopCount & 0xff;
  payload[5] = (loopCount >>> 8) & 0xff;
  return buildChunk("ANIM", payload);
};

const buildAnmf = (
  vp8: Uint8Array,
  width: number,
  height: number,
  durationMs: number,
): Uint8Array => {
  const sub = buildChunk("VP8 ", vp8);
  const payload = new Uint8Array(16 + sub.length);
  // x offset / y offset: 0 (frame is full canvas).
  writeU24LE(payload, 0, 0);
  writeU24LE(payload, 3, 0);
  writeU24LE(payload, 6, width - 1);
  writeU24LE(payload, 9, height - 1);
  writeU24LE(payload, 12, Math.max(0, Math.min(durationMs | 0, 0xffffff)));
  // flags byte: blending = use alpha (0), disposal = none (0).
  payload[15] = 0x00;
  payload.set(sub, 16);
  return buildChunk("ANMF", payload);
};

// Wrap body chunks in the top-level RIFF/WEBP container.
const riff = (body: Uint8Array): Blob => {
  const out = new Uint8Array(12 + body.length);
  out.set(ascii4("RIFF"), 0);
  writeU32LE(out, 4, 4 + body.length); // size counts everything after these 4 bytes
  out.set(ascii4("WEBP"), 8);
  out.set(body, 12);
  return new Blob([out], { type: "image/webp" });
};

export type WebpFrame = {
  vp8: Uint8Array; // raw VP8 keyframe bitstream
  width: number;
  height: number;
  durationMs: number;
};

// Single VP8 keyframe → a plain lossy WEBP still (simple file format, no
// VP8X/ANIM). This is a genuine still image, not a 1-frame animation.
export const buildStaticWebp = (vp8: Uint8Array): Blob => riff(buildChunk("VP8 ", vp8));

// N VP8 keyframes → one animated WEBP. Frames are opaque (the compositor
// fills a solid background), so no ALPH chunk / alpha flag.
export const buildAnimatedWebp = (frames: WebpFrame[], opts: { loop?: number } = {}): Blob => {
  if (frames.length === 0) throw new Error("No WEBP frames");
  const { width, height } = frames[0]!;
  const body: Uint8Array[] = [buildVp8x(width, height, false), buildAnim(opts.loop ?? 0)];
  for (const f of frames) body.push(buildAnmf(f.vp8, f.width, f.height, f.durationMs));
  return riff(concat(body));
};
