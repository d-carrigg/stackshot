import type { Composition } from "./state";
import { renderFrames, composeStill, type ProgressFn } from "./render/frames";
import { encodeFrames, type EncodeFormat, type EncodeResult } from "./render/encode";

export type RenderedImage = EncodeResult;

// "auto" → WEBP. Smaller than PNG for the same fidelity, and the same
// codec handles animated panels without a format switch.
export const resolveExportFormat = (comp: Composition): EncodeFormat =>
  comp.exportFormat === "auto" ? "webp" : comp.exportFormat;

// Share of total progress spent composing frames (the rest is encoding).
// WEBP/PNG encode is fast (native), so compose dominates; GIF's gif.js
// encode dominates, so compose is a small slice.
const COMPOSE_SHARE: Record<EncodeFormat, number> = { webp: 0.85, png: 0.95, gif: 0.3 };

// One pipeline: compose frames (1 for static, N for animated) → encode in
// the chosen format. No static-vs-animated fork.
export const renderForExport = async (
  comp: Composition,
  onProgress?: ProgressFn,
): Promise<RenderedImage> => {
  const format = resolveExportFormat(comp);
  const share = COMPOSE_SHARE[format];
  const frames = await renderFrames(comp, (f) => onProgress?.(f * share));
  return encodeFrames(frames, format, { comp }, (f) => onProgress?.(share + f * (1 - share)));
};

const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob png returned null"))), "image/png"),
  );

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Download an already-rendered blob (lets the preview reuse its render
// instead of encoding a second time).
export const saveBlob = (blob: Blob, ext: string): void =>
  triggerDownload(blob, `stackshot-${Date.now()}.${ext}`);

export const exportImage = async (comp: Composition): Promise<void> => {
  const img = await renderForExport(comp);
  triggerDownload(img.blob, `stackshot-${Date.now()}.${img.ext}`);
};

export const copyImageToClipboard = async (comp: Composition): Promise<void> => {
  const img = await renderForExport(comp);
  if (!("clipboard" in navigator) || !("write" in navigator.clipboard)) {
    throw new Error("Clipboard API unavailable in this browser");
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [img.mime]: img.blob })]);
  } catch (err) {
    // Some browsers refuse non-PNG types on the clipboard. Fall back to a
    // first-frame PNG so users still get something usable.
    if (img.mime !== "image/png") {
      const png = await canvasToPng(await composeStill(comp));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return;
    }
    throw err;
  }
};

// Back-compat aliases — existing call sites pass PNG semantics.
export const exportPng = exportImage;
export const copyPngToClipboard = copyImageToClipboard;
