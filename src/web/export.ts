import type { Composition } from "./state";
import { composeCanvas } from "./render/compose";

const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), type);
  });

export const exportPng = async (comp: Composition): Promise<void> => {
  const canvas = await composeCanvas(comp);
  const blob = await canvasToBlob(canvas, "image/png");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `codeimg-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const copyPngToClipboard = async (comp: Composition): Promise<void> => {
  const canvas = await composeCanvas(comp);
  const blob = await canvasToBlob(canvas, "image/png");
  if (!("clipboard" in navigator) || !("write" in navigator.clipboard)) {
    throw new Error("Clipboard API unavailable in this browser");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
};
