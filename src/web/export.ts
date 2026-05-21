import type { Composition, ExportFormat } from "./state";
import { composeCanvas } from "./render/compose";
import { composeAnimatedBlob, composeAnimatedFrames, hasAnimatedPanel } from "./render/composeAnimated";
import { composeMetadata, injectPngText } from "./render/pngMetadata";

export type RenderedImage = {
  blob: Blob;
  mime: string;
  ext: "png" | "webp" | "gif";
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), type, quality);
  });

// "auto" → WEBP. Smaller than PNG for the same fidelity, and the same
// codec handles animated panels without a format switch.
export const resolveExportFormat = (comp: Composition): Exclude<ExportFormat, "auto"> => {
  if (comp.exportFormat === "auto") return "webp";
  return comp.exportFormat;
};

export const renderForExport = async (comp: Composition): Promise<RenderedImage> => {
  const format = resolveExportFormat(comp);
  const animated = hasAnimatedPanel(comp);

  if (format === "png") {
    // First-frame PNG. Animated input loses its motion; that's the
    // honest behaviour for a single-frame format. Embed the source
    // composition as an iTXt chunk so the image round-trips.
    const canvas = await composeCanvas(comp);
    const raw = await canvasToBlob(canvas, "image/png");
    const blob = await injectPngText(raw, "codeshot", composeMetadata(comp));
    return { blob, mime: "image/png", ext: "png" };
  }
  if (format === "webp") {
    if (animated) {
      const blob = await composeAnimatedBlob(comp);
      return { blob, mime: "image/webp", ext: "webp" };
    }
    const canvas = await composeCanvas(comp);
    return {
      blob: await canvasToBlob(canvas, "image/webp", 0.92),
      mime: "image/webp",
      ext: "webp",
    };
  }
  // gif
  const { encodeGif } = await import("./render/gifEncoder");
  if (animated) {
    const frames = await composeAnimatedFrames(comp);
    const blob = await encodeGif(
      frames.map((f) => ({ canvas: f.canvas, delayMs: f.durationMs })),
    );
    return { blob, mime: "image/gif", ext: "gif" };
  }
  const canvas = await composeCanvas(comp);
  const blob = await encodeGif([{ canvas, delayMs: 1000 }]);
  return { blob, mime: "image/gif", ext: "gif" };
};

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

export const exportImage = async (comp: Composition): Promise<void> => {
  const img = await renderForExport(comp);
  triggerDownload(img.blob, `codeimg-${Date.now()}.${img.ext}`);
};

export const copyImageToClipboard = async (comp: Composition): Promise<void> => {
  const img = await renderForExport(comp);
  if (!("clipboard" in navigator) || !("write" in navigator.clipboard)) {
    throw new Error("Clipboard API unavailable in this browser");
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [img.mime]: img.blob })]);
  } catch (err) {
    // Some browsers refuse non-PNG types on the clipboard. Fall back
    // to a first-frame PNG so users still get something usable.
    if (img.mime !== "image/png") {
      const canvas = await composeCanvas(comp);
      const png = await canvasToBlob(canvas, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return;
    }
    throw err;
  }
};

// Back-compat aliases — existing call sites pass PNG semantics.
export const exportPng = exportImage;
export const copyPngToClipboard = copyImageToClipboard;
