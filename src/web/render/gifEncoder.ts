// Animated GIF encoder built on gif.js — a small, mature worker-based
// encoder. Imported lazily so users who never export a GIF don't pay
// the bundle cost.
//
// Vite resolves `?url` imports to a hashed asset URL at build time,
// which is exactly what gif.js's workerScript expects.
// @ts-expect-error no types ship with gif.js
import GIF from "gif.js";
import workerUrl from "gif.js/dist/gif.worker.js?url";

export type GifFrame = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  delayMs: number;
};

export const encodeGif = (frames: GifFrame[]): Promise<Blob> => {
  if (frames.length === 0) return Promise.reject(new Error("No GIF frames"));
  const first = frames[0]!.canvas;
  const gif = new GIF({
    workerScript: workerUrl,
    workers: 2,
    quality: 10,
    width: first.width,
    height: first.height,
    transparent: null,
  });
  for (const f of frames) {
    gif.addFrame(f.canvas, { delay: Math.max(20, f.delayMs), copy: true });
  }
  return new Promise<Blob>((resolve, reject) => {
    gif.on("finished", (blob: Blob) => resolve(blob));
    gif.on("abort", () => reject(new Error("GIF encode aborted")));
    gif.render();
  });
};
