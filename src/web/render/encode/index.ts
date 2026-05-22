// The single per-format encode dispatch. Frame generation is unified
// (render/frames.ts); only this terminal step branches, because PNG
// (lossless raster), WEBP (VP8) and GIF (palette+LZW) are genuinely
// different codecs with no shared browser API.
import type { Frame, ProgressFn } from "../frames";
import type { Composition } from "../../state";
import { encodeWebp } from "./webp";
import { encodeGifFrames } from "./gif";
import { encodePng } from "./png";

export type EncodeFormat = "png" | "webp" | "gif";

export type EncodeResult = {
  blob: Blob;
  mime: string;
  ext: EncodeFormat;
};

export type EncodeOpts = {
  comp: Composition; // used by the PNG encoder for metadata; ignored elsewhere
};

export const encodeFrames = async (
  frames: Frame[],
  format: EncodeFormat,
  opts: EncodeOpts,
  onProgress?: ProgressFn,
): Promise<EncodeResult> => {
  switch (format) {
    case "png":
      return { blob: await encodePng(frames, opts.comp, onProgress), mime: "image/png", ext: "png" };
    case "webp":
      return { blob: await encodeWebp(frames, onProgress), mime: "image/webp", ext: "webp" };
    case "gif":
      return { blob: await encodeGifFrames(frames, onProgress), mime: "image/gif", ext: "gif" };
  }
};
