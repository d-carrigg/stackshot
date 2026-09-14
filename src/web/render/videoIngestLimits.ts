export const VIDEO_MAX_DURATION_S = 12;
export const VIDEO_MAX_EDGE = 960;
export const VIDEO_FPS = 12;
export const VIDEO_MAX_FRAMES = 144;
export const VIDEO_EXTS = /\.(mp4|webm|mov|m4v)$/i;

export const isVideoFile = (file: { type: string; name: string }): boolean => {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/") || t === "application/mp4" || t === "application/quicktime") {
    return true;
  }
  return VIDEO_EXTS.test(file.name);
};

// MP4/MOV have `ftyp` at byte 4; WebM/MKV start with the EBML header.
export const looksLikeVideoBytes = (u8: Uint8Array): boolean => {
  if (u8.length >= 8) {
    const tag = String.fromCharCode(u8[4]!, u8[5]!, u8[6]!, u8[7]!);
    if (tag === "ftyp") return true;
  }
  return u8.length >= 4 && u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3;
};

export const sniffVideoFile = async (file: File): Promise<boolean> => {
  if (isVideoFile(file)) return true;
  if (file.type.startsWith("image/") || file.type.startsWith("text/")) return false;
  try {
    const buf = await file.slice(0, 16).arrayBuffer();
    return looksLikeVideoBytes(new Uint8Array(buf));
  } catch {
    return false;
  }
};

export const sampleTimes = (durationSec: number): number[] => {
  const dur = Math.min(Math.max(0, durationSec), VIDEO_MAX_DURATION_S);
  if (dur <= 0) return [0];
  const n = Math.min(VIDEO_MAX_FRAMES, Math.max(1, Math.round(dur * VIDEO_FPS)));
  if (n === 1) return [0];
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    times.push((i / n) * dur);
  }
  return times;
};

export const scaledSize = (width: number, height: number): { w: number; h: number } => {
  const w0 = Math.max(1, width);
  const h0 = Math.max(1, height);
  const edge = Math.max(w0, h0);
  const scale = edge > VIDEO_MAX_EDGE ? VIDEO_MAX_EDGE / edge : 1;
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { w: even(w0), h: even(h0) };
};
