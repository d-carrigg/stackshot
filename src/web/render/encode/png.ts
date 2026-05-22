// PNG encoder: a single lossless still (first frame) with the source
// composition embedded as an iTXt chunk so the image round-trips.
import type { Frame, ProgressFn } from "../frames";
import type { Composition } from "../../state";
import { composeMetadata, injectPngText } from "../pngMetadata";

const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob png returned null"))), "image/png"),
  );

export const encodePng = async (
  frames: Frame[],
  comp: Composition,
  onProgress?: ProgressFn,
): Promise<Blob> => {
  const raw = await canvasToPng(frames[0]!.canvas);
  const blob = await injectPngText(raw, "stackshot", composeMetadata(comp));
  onProgress?.(1);
  return blob;
};
