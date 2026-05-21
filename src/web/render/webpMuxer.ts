// Animated WEBP muxer in pure JavaScript.
//
// Strategy: render each composition frame to a canvas, call
// canvas.toBlob("image/webp") to get a *static* WEBP blob (the browser
// already ships a WEBP encoder for that), parse the RIFF container,
// extract the actual image chunk (VP8 / VP8L / VP8X+ALPH+VP8), then mux
// all frames into a single animated WEBP using the VP8X/ANIM/ANMF spec
// — https://developers.google.com/speed/webp/docs/riff_container.
//
// Pure muxer (no encoding) so we pay no bundle cost for a WASM encoder.
// Supports loop=0 (forever) and arbitrary per-frame durations.

type StaticParts = {
  width: number;
  height: number;
  hasAlpha: boolean;
  // The image-data chunks in their original RIFF order. May include
  // ALPH + VP8, or just VP8L, or just VP8.
  chunks: Uint8Array[];
};

const ascii4 = (s: string): Uint8Array => {
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) out[i] = s.charCodeAt(i);
  return out;
};
const eq4 = (buf: Uint8Array, off: number, s: string): boolean =>
  buf[off] === s.charCodeAt(0) &&
  buf[off + 1] === s.charCodeAt(1) &&
  buf[off + 2] === s.charCodeAt(2) &&
  buf[off + 3] === s.charCodeAt(3);

const readU32LE = (buf: Uint8Array, off: number): number =>
  buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24);

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

// Parse a static WEBP blob into width/height/alpha-flag + the
// image-data sub-chunks needed for inclusion in an ANMF chunk.
const parseStaticWebp = async (blob: Blob): Promise<StaticParts> => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < 12 || !eq4(buf, 0, "RIFF") || !eq4(buf, 8, "WEBP")) {
    throw new Error("Not a WEBP blob");
  }
  let off = 12;
  const chunks: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let hasAlpha = false;
  while (off + 8 <= buf.length) {
    const fourcc = String.fromCharCode(buf[off]!, buf[off + 1]!, buf[off + 2]!, buf[off + 3]!);
    const size = readU32LE(buf, off + 4);
    const payloadStart = off + 8;
    const payloadEnd = payloadStart + size;
    const chunkEnd = payloadEnd + (size & 1); // pad to even

    if (fourcc === "VP8X") {
      // Skip — we synthesise our own VP8X for the animated container.
    } else if (fourcc === "VP8L") {
      // Lossless: width/height encoded in the first 5 bytes of the
      // bitstream. Signature byte 0x2F, then 14-bit width-1, 14-bit
      // height-1, alpha flag.
      const sig = buf[payloadStart]!;
      if (sig !== 0x2f) throw new Error("Unexpected VP8L signature");
      const b0 = buf[payloadStart + 1]!;
      const b1 = buf[payloadStart + 2]!;
      const b2 = buf[payloadStart + 3]!;
      const b3 = buf[payloadStart + 4]!;
      width = ((b0 | ((b1 & 0x3f) << 8)) + 1) | 0;
      height = (((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1) | 0;
      hasAlpha = ((b3 >> 4) & 1) === 1;
      chunks.push(buf.subarray(off, chunkEnd));
    } else if (fourcc === "VP8 ") {
      // Lossy: frame header at payloadStart+3..+10 contains width/height.
      const b0 = buf[payloadStart + 6]!;
      const b1 = buf[payloadStart + 7]!;
      const b2 = buf[payloadStart + 8]!;
      const b3 = buf[payloadStart + 9]!;
      // 2 bytes width with 14 LSB, top 2 bits are scale.
      width = (b0 | (b1 << 8)) & 0x3fff;
      height = (b2 | (b3 << 8)) & 0x3fff;
      chunks.push(buf.subarray(off, chunkEnd));
    } else if (fourcc === "ALPH") {
      hasAlpha = true;
      chunks.push(buf.subarray(off, chunkEnd));
    } else {
      // Unknown ancillary chunks (EXIF, ICCP, XMP) — drop, we don't
      // need them per-frame.
    }
    off = chunkEnd;
  }
  if (width === 0 || height === 0) throw new Error("WEBP missing dimensions");
  return { width, height, hasAlpha, chunks };
};

const canvasToWebp = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob image/webp returned null"))),
      "image/webp",
      quality,
    );
  });

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

const buildAnmf = (parts: StaticParts, durationMs: number): Uint8Array => {
  const sub = concat(parts.chunks);
  const payload = new Uint8Array(16 + sub.length);
  // x offset / y offset: 0 (frame is full canvas).
  writeU24LE(payload, 0, 0);
  writeU24LE(payload, 3, 0);
  writeU24LE(payload, 6, parts.width - 1);
  writeU24LE(payload, 9, parts.height - 1);
  writeU24LE(payload, 12, Math.max(0, Math.min(durationMs | 0, 0xffffff)));
  // flags byte: blending = use alpha (0), disposal = none (0).
  payload[15] = 0x00;
  payload.set(sub, 16);
  return buildChunk("ANMF", payload);
};

export type AnimatedWebpFrame = {
  canvas: HTMLCanvasElement;
  durationMs: number;
};

// Encode a sequence of canvas frames into a single animated WEBP blob.
export const encodeAnimatedWebp = async (
  frames: AnimatedWebpFrame[],
  opts: { quality?: number; loop?: number } = {},
): Promise<Blob> => {
  if (frames.length === 0) throw new Error("No frames");
  const quality = opts.quality ?? 0.92;
  const loop = opts.loop ?? 0;

  // Encode each frame to a static WEBP via the browser, then parse.
  const parsed: StaticParts[] = [];
  for (const f of frames) {
    const blob = await canvasToWebp(f.canvas, quality);
    parsed.push(await parseStaticWebp(blob));
  }
  const width = parsed[0]!.width;
  const height = parsed[0]!.height;
  const hasAlpha = parsed.some((p) => p.hasAlpha);

  const body: Uint8Array[] = [];
  body.push(buildVp8x(width, height, hasAlpha));
  body.push(buildAnim(loop));
  for (let i = 0; i < frames.length; i++) {
    body.push(buildAnmf(parsed[i]!, frames[i]!.durationMs));
  }
  const bodyBuf = concat(body);

  // RIFF wrapper: "RIFF" + size + "WEBP" + body.
  const out = new Uint8Array(12 + bodyBuf.length);
  out.set(ascii4("RIFF"), 0);
  writeU32LE(out, 4, 4 + bodyBuf.length); // size starts after the 4 size bytes themselves
  out.set(ascii4("WEBP"), 8);
  out.set(bodyBuf, 12);
  return new Blob([out], { type: "image/webp" });
};
