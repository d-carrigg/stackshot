// PNG encoder: a single lossless still (first frame) with the source
// composition embedded as an iTXt chunk so the image round-trips.
import type { Frame } from "../frames";
import type { Composition } from "../../state";
import { composeMetadata, injectPngText } from "../pngMetadata";

const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob png returned null"))), "image/png"),
  );

export const encodePng = async (frames: Frame[], comp: Composition): Promise<Blob> => {
  const raw = await canvasToPng(frames[0]!.canvas);
  return injectPngText(raw, "stackshot", composeMetadata(comp));
};
