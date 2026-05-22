// GIF encoder: wraps the worker-based gif.js encoder (lazily imported so
// users who never export a GIF don't pay its bundle cost). Handles a
// single still (1 frame) and animation (N frames) identically.
import type { Frame } from "../frames";

export const encodeGifFrames = async (frames: Frame[]): Promise<Blob> => {
  const { encodeGif } = await import("../gifEncoder");
  return encodeGif(frames.map((f) => ({ canvas: f.canvas, delayMs: f.durationMs || 1000 })));
};
