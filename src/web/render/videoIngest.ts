// Decode an uploaded video and re-encode it as an animated WebP so the
// rest of the app can treat it like any other image panel.
import type { Frame } from "./frames";
import { encodeWebp } from "./encode/webp";
import {
  sampleTimes,
  scaledSize,
  VIDEO_FPS,
  VIDEO_MAX_DURATION_S,
} from "./videoIngestLimits";

export {
  isVideoFile,
  looksLikeVideoBytes,
  sniffVideoFile,
  sampleTimes,
  scaledSize,
  VIDEO_EXTS,
  VIDEO_FPS,
  VIDEO_MAX_DURATION_S,
  VIDEO_MAX_EDGE,
  VIDEO_MAX_FRAMES,
} from "./videoIngestLimits";

export type VideoIngestResult = {
  blob: Blob;
  width: number;
  height: number;
  truncated: boolean;
};

const seekTo = (video: HTMLVideoElement, t: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 0.04) {
      resolve();
      return;
    }
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video seek failed"));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video seek timed out"));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = t;
  });

const loadVideo = (file: File): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
    };
    const onMeta = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error("This browser couldn't decode that video. Try mp4 or webm."));
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);
    video.src = url;
  });

export const videoFileToAnimatedWebp = async (
  file: File,
  onProgress?: (frac: number) => void,
): Promise<VideoIngestResult> => {
  const video = await loadVideo(file);
  const srcUrl = video.src;
  try {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0 && video.videoWidth <= 0) {
      throw new Error("Couldn't read that video.");
    }
    const truncated = duration > VIDEO_MAX_DURATION_S + 0.05;
    const times = sampleTimes(duration || 1 / VIDEO_FPS);
    const { w, h } = scaledSize(video.videoWidth || 640, video.videoHeight || 360);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't create a drawing context.");

    const frames: Frame[] = [];
    const frameMs = Math.round(1000 / VIDEO_FPS);
    for (let i = 0; i < times.length; i++) {
      await seekTo(video, times[i]!);
      ctx.drawImage(video, 0, 0, w, h);
      const copy = document.createElement("canvas");
      copy.width = w;
      copy.height = h;
      copy.getContext("2d")!.drawImage(canvas, 0, 0);
      frames.push({ canvas: copy, durationMs: frameMs });
      onProgress?.(((i + 1) / times.length) * 0.7);
    }
    const blob = await encodeWebp(frames, (f) => onProgress?.(0.7 + f * 0.3));
    return { blob, width: w, height: h, truncated };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(srcUrl);
  }
};
