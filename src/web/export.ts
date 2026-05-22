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

const CLIPBOARD_MIME: Record<EncodeFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const clipboardSupports = (mime: string): boolean => {
  const supports = (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports;
  // When the static check exists, trust it; otherwise be optimistic and
  // let the write() attempt decide (with a PNG fallback on rejection).
  return typeof supports === "function" ? supports(mime) : true;
};

// Copy the composition in the selected format. We hand clipboard.write()
// a Promise<Blob> and call it synchronously within the click so the
// browser preserves user activation while the render runs — otherwise a
// slow first render outlives the activation window and the write is
// rejected ("lack of user activation"). `onCommitStart` fires once the
// blob is ready and the OS clipboard write begins (no progress signal —
// callers show a spinner).
//
// Browsers only let image/png onto the system clipboard reliably (Chrome
// reports image/webp/gif as unsupported), so when the selected format
// can't be written we copy a PNG still instead — the clipboard holds a
// static image regardless. Download still gives the true webp/gif file.
export const copyImageToClipboard = async (
  comp: Composition,
  onProgress?: ProgressFn,
  onCommitStart?: () => void,
): Promise<void> => {
  if (!("clipboard" in navigator) || !("write" in navigator.clipboard)) {
    throw new Error("Clipboard API unavailable in this browser");
  }
  const mime = CLIPBOARD_MIME[resolveExportFormat(comp)];

  const copyPngStill = async () => {
    const png = await canvasToPng(await composeStill(comp));
    onProgress?.(1);
    onCommitStart?.();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  };

  if (mime !== "image/png" && !clipboardSupports(mime)) {
    await copyPngStill();
    return;
  }

  const blobPromise = renderForExport(comp, onProgress).then((r) => {
    onCommitStart?.();
    return r.blob;
  });
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mime]: blobPromise })]);
  } catch (err) {
    if (mime === "image/png") throw err;
    await copyPngStill();
  }
};

// Back-compat aliases — existing call sites pass PNG semantics.
export const exportPng = exportImage;
export const copyPngToClipboard = copyImageToClipboard;
