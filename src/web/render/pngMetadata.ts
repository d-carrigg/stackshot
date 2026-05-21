// Inject a UTF-8 text chunk (iTXt) into a PNG blob so the exported image
// carries its source composition as image metadata. Visible in `exiftool`,
// `identify -verbose`, and most image-property dialogs.
//
// PNG spec: https://www.w3.org/TR/png/. An iTXt chunk's data is:
//   keyword "\0" compression-flag(1) compression-method(1)
//   language-tag "\0" translated-keyword "\0" UTF-8-text

import type { CodePanel, Composition } from "../state";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const makeItxtChunk = (keyword: string, text: string): Uint8Array => {
  const enc = new TextEncoder();
  const kw = enc.encode(keyword);
  const txt = enc.encode(text);
  // Per spec: keyword is Latin-1 1-79 bytes. We restrict callers to ASCII.
  const dataLen = kw.length + 1 + 1 + 1 + 0 + 1 + 0 + 1 + txt.length;
  const out = new Uint8Array(4 + 4 + dataLen + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, dataLen);
  // "iTXt"
  out[4] = 0x69; out[5] = 0x54; out[6] = 0x58; out[7] = 0x54;
  let p = 8;
  out.set(kw, p); p += kw.length;
  out[p++] = 0;       // keyword null terminator
  out[p++] = 0;       // compression flag (uncompressed)
  out[p++] = 0;       // compression method
  out[p++] = 0;       // language tag (empty) null
  out[p++] = 0;       // translated keyword (empty) null
  out.set(txt, p);    // UTF-8 text
  // CRC covers chunk type + data
  const crc = crc32(out.subarray(4, 4 + 4 + dataLen));
  dv.setUint32(4 + 4 + dataLen, crc);
  return out;
};

// Serialize the parts of a composition that are useful for a round-trip:
// code panels (text + language + title) and the layout/colours. Image
// panels are skipped — the bytes already live in the PNG.
export const composeMetadata = (comp: Composition): string => {
  const codes = comp.panels
    .filter((p): p is CodePanel => p.kind === "code")
    .map((p) => ({ title: p.title ?? "", language: p.language, code: p.code }));
  return JSON.stringify({
    app: "stackshot",
    schema: 1,
    layout: comp.layout,
    bgColor: comp.bgColor,
    arrowColor: comp.arrowColor,
    code: codes,
  });
};

export const injectPngText = async (
  blob: Blob,
  keyword: string,
  text: string,
): Promise<Blob> => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) return blob; // not a PNG — pass through
  }
  // IHDR is always the first chunk and has a fixed 13-byte data length, so
  // its total size (length+type+data+crc) is exactly 25 bytes.
  const ihdrEnd = 8 + 25;
  if (buf.length < ihdrEnd) return blob;
  const chunk = makeItxtChunk(keyword, text);
  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(buf.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return new Blob([out], { type: "image/png" });
};
