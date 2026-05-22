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

// Content-addressed render cache: render once, then reuse for repeated
// preview/copy/download until something output-affecting changes. The key
// is the composition minus selectedId (selection doesn't change the image)
// plus the resolved format. Keyed by content rather than a manual dirty
// flag so it can never serve a stale render or be invalidated by a missed
// mutation hook.
let renderCache: { sig: string; result: RenderedImage } | null = null;

const renderSignature = (comp: Composition): string =>
  `${resolveExportFormat(comp)}|${JSON.stringify({ ...comp, selectedId: null })}`;

// A render done before web fonts finished loading would use fallback
// metrics; drop that cached render once fonts are ready.
if (typeof document !== "undefined" && document.fonts?.ready) {
  document.fonts.ready.then(() => {
    renderCache = null;
  });
}

// One pipeline: compose frames (1 for static, N for animated) → encode in
// the chosen format. No static-vs-animated fork. Cached by content.
export const renderForExport = async (
  comp: Composition,
  onProgress?: ProgressFn,
): Promise<RenderedImage> => {
  const sig = renderSignature(comp);
  if (renderCache && renderCache.sig === sig) {
    onProgress?.(1);
    return renderCache.result;
  }
  const format = resolveExportFormat(comp);
  const share = COMPOSE_SHARE[format];
  const frames = await renderFrames(comp, (f) => onProgress?.(f * share));
  const result = await encodeFrames(frames, format, { comp }, (f) => onProgress?.(share + f * (1 - share)));
  renderCache = { sig, result };
  return result;
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

export const exportImage = async (comp: Composition, onProgress?: ProgressFn): Promise<void> => {
  const img = await renderForExport(comp, onProgress);
  triggerDownload(img.blob, `stackshot-${Date.now()}.${img.ext}`);
};

export const copyImageToClipboard = async (comp: Composition, onProgress?: ProgressFn): Promise<void> => {
  const img = await renderForExport(comp, onProgress);
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
