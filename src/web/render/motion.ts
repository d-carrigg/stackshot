// Motion-content helpers: detect whether an image file is animated and
// extract individual frames using the browser's native ImageDecoder
// (Chrome 94+/Edge/Opera; Safari 16.4+; Firefox: not yet but on the
// roadmap). Falls back gracefully when the API is missing.

export type Frame = {
  bitmap: ImageBitmap;
  durationMs: number;
};

type ImageDecoderCtor = new (init: { data: ArrayBuffer | Blob; type: string }) => {
  completed: Promise<void>;
  tracks: { selectedTrack: { frameCount: number; animated: boolean } | null } & {
    ready: Promise<void>;
  };
  decode: (opts?: { frameIndex: number }) => Promise<{ image: VideoFrame }>;
  close?: () => void;
};

const hasImageDecoder = (): boolean =>
  typeof (globalThis as any).ImageDecoder === "function";

// Fast check: does this blob have more than one frame? Used at import
// time to set ImagePanel.animated without forcing a full decode.
export const probeAnimation = async (file: Blob): Promise<boolean> => {
  if (!hasImageDecoder()) return false;
  if (!/^image\/(gif|webp|apng|avif)$/i.test(file.type) && file.type !== "image/png") {
    return false;
  }
  try {
    const Ctor = (globalThis as any).ImageDecoder as ImageDecoderCtor;
    const decoder = new Ctor({ data: file, type: file.type });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const animated = !!track && (track.animated === true || track.frameCount > 1);
    decoder.close?.();
    return animated;
  } catch {
    return false;
  }
};

// Decode every frame. Returns ImageBitmaps that can be drawn on a 2D
// canvas, plus the duration of each frame in milliseconds.
export const decodeFrames = async (file: Blob): Promise<Frame[]> => {
  if (!hasImageDecoder()) {
    // Single-frame fallback: rasterise as one bitmap and return it.
    const bitmap = await createImageBitmap(file);
    return [{ bitmap, durationMs: 0 }];
  }
  const Ctor = (globalThis as any).ImageDecoder as ImageDecoderCtor;
  const decoder = new Ctor({ data: file, type: file.type });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  const frameCount = track?.frameCount ?? 1;
  const frames: Frame[] = [];
  for (let i = 0; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    // VideoFrame.duration is in microseconds.
    const durationMs = ((image as any).duration ?? 0) / 1000 || 100;
    const bitmap = await createImageBitmap(image as unknown as CanvasImageSource);
    (image as any).close?.();
    frames.push({ bitmap, durationMs });
  }
  decoder.close?.();
  return frames;
};

export const hasAnimatedPanel = (panels: { animated?: boolean }[]): boolean =>
  panels.some((p) => p.animated === true);
