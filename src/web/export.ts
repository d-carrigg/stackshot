import type { Composition } from "./state";
import { composeCanvas } from "./render/compose";
import { composeAnimatedBlob, hasAnimatedPanel } from "./render/composeAnimated";

export type RenderedImage = {
  blob: Blob;
  mime: string;
  ext: "png" | "webp";
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), type);
  });

// Render a composition for export/preview. Routes to the animated WEBP
// pipeline if any panel carries motion content; otherwise produces a
// flat PNG via the existing canvas pipeline.
export const renderForExport = async (comp: Composition): Promise<RenderedImage> => {
  if (hasAnimatedPanel(comp)) {
    const blob = await composeAnimatedBlob(comp);
    return { blob, mime: "image/webp", ext: "webp" };
  }
  const canvas = await composeCanvas(comp);
  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, mime: "image/png", ext: "png" };
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
