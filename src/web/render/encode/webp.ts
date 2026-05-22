// WEBP encoder built on WebCodecs `VideoEncoder`.
//
// A lossy WEBP frame IS a VP8 keyframe, and VideoEncoder(codec "vp8")
// emits exactly those — natively, off the main thread, pipelined. We
// force every frame to a keyframe and hand the raw VP8 bitstreams to the
// RIFF/WEBP container builders. This replaces N serial, main-thread
// `canvas.toBlob("image/webp")` calls (the old freeze).
import type { Frame, ProgressFn } from "../frames";
import { buildStaticWebp, buildAnimatedWebp, type WebpFrame } from "../webpContainer";

// Per-frame bit budget = width*height*BPP. VP8 is efficient and our
// panels are mostly flat, so this is generous; tune for visual parity
// with the previous `quality: 0.9` output.
const BPP = 2.0;
const FPS = 25;
const FALLBACK_DURATION_MS = Math.round(1000 / FPS);

const configFor = (width: number, height: number): VideoEncoderConfig => ({
  codec: "vp8",
  width,
  height,
  framerate: FPS,
  bitrate: Math.max(1_000_000, Math.round(width * height * BPP * FPS)),
  latencyMode: "quality",
});

export const encodeWebp = async (frames: Frame[], onProgress?: ProgressFn): Promise<Blob> => {
  if (frames.length === 0) throw new Error("No frames to encode");
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser does not support WebCodecs VideoEncoder.");
  }
  const width = frames[0]!.canvas.width;
  const height = frames[0]!.canvas.height;
  const config = configFor(width, height);
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) {
    throw new Error("This browser cannot encode VP8/WEBP via WebCodecs.");
  }

  const chunks: { ts: number; data: Uint8Array }[] = [];
  const errors: Error[] = [];
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ ts: chunk.timestamp, data });
      onProgress?.(chunks.length / frames.length);
    },
    error: (e) => errors.push(e),
  });
  encoder.configure(config);

  let tsUs = 0;
  for (const f of frames) {
    const durUs = Math.max(1, Math.round((f.durationMs || FALLBACK_DURATION_MS) * 1000));
    const vf = new VideoFrame(f.canvas, { timestamp: tsUs, duration: durUs });
    encoder.encode(vf, { keyFrame: true });
    vf.close();
    tsUs += durUs;
  }
  await encoder.flush();
  encoder.close();
  if (errors.length) throw errors[0];

  // Output order isn't guaranteed; sort by the timestamps we assigned.
  chunks.sort((a, b) => a.ts - b.ts);
  if (chunks.length !== frames.length) {
    throw new Error(`WEBP encode produced ${chunks.length} chunks for ${frames.length} frames`);
  }

  if (chunks.length === 1) return buildStaticWebp(chunks[0]!.data);

  const webpFrames: WebpFrame[] = chunks.map((c, i) => ({
    vp8: c.data,
    width,
    height,
    durationMs: frames[i]!.durationMs || FALLBACK_DURATION_MS,
  }));
  return buildAnimatedWebp(webpFrames);
};
