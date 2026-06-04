// The single frame generator for the whole app. A composition becomes a
// list of frames: exactly one for a static composition, N sampled along
// the timeline when it contains an animated (GIF/animated-WEBP) panel.
// Encoders (render/encode/*) consume Frame[] and don't care about the
// count — "static vs animated" is just length here, not a code fork.
import type { Composition, Panel } from "../state";
import { renderPanel, composeFromItems } from "./compose";
import { getBlob } from "../storage/blobStore";
import { decodeFrames, type Frame as SourceFrame } from "./motion";
import { PANEL_RADIUS } from "./colors";
import { _s } from "./arrows";
import { roundedRectPath } from "./imagePanel";
import { resolveTheme } from "../themes";

export type Frame = {
  canvas: HTMLCanvasElement;
  durationMs: number;
};

// Animated output cadence. We resample every animated panel onto a shared
// fixed-step timeline; MAX_FRAMES caps a long loop's output length.
const FPS = 25;
const FRAME_MS = Math.round(1000 / FPS);
const MAX_FRAMES = 120;

const PLACEHOLDER_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

type AnimSlot = {
  panelIndex: number;
  frames: SourceFrame[];
  totalMs: number;
  rounded: boolean;
  radius: number;
};

// Render a single decoded source frame at the target panel dimensions (the
// size the static renderPanel produced) so motion panels match the rest of
// the composition's scale instead of the source's tiny native pixel size.
const renderFrameToCanvas = (
  frame: SourceFrame,
  rounded: boolean,
  radius: number,
  width: number,
  height: number,
): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (rounded && radius > 0) {
    ctx.save();
    roundedRectPath(ctx, 0, 0, width, height, Math.min(radius, Math.min(width, height) / 2));
    ctx.clip();
    ctx.drawImage(frame.bitmap, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(frame.bitmap, 0, 0, width, height);
  }
  return c;
};

// Pick which source frame plays at time `t` in a panel's looped timeline.
const frameAtTime = (slot: AnimSlot, t: number): SourceFrame => {
  const tm = ((t % slot.totalMs) + slot.totalMs) % slot.totalMs;
  let acc = 0;
  for (const f of slot.frames) {
    acc += Math.max(20, f.durationMs);
    if (tm < acc) return f;
  }
  return slot.frames[slot.frames.length - 1]!;
};

const emptyPlaceholder = (bgHex: string): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 120;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#888";
  ctx.font = `14px ${PLACEHOLDER_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Add a panel to begin", canvas.width / 2, canvas.height / 2);
  return canvas;
};

export const hasAnimatedPanel = (comp: Composition): boolean =>
  comp.panels.some((p) => p.kind === "image" && p.animated === true);

// Reports compose progress as a 0→1 fraction (per output frame).
export type ProgressFn = (fraction: number) => void;
// Receives each composed frame as it's produced — lets a live preview
// stream the render. Providing it also makes renderFrames yield to the
// browser between frames so the paints are actually visible; omit it
// (download/copy) for a fast, tight synchronous loop.
export type FrameFn = (canvas: HTMLCanvasElement) => void;

const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

export const renderFrames = async (
  comp: Composition,
  onProgress?: ProgressFn,
  onFrame?: FrameFn,
): Promise<Frame[]> => {
  if (comp.panels.length === 0) {
    onProgress?.(1);
    return [{ canvas: emptyPlaceholder(comp.bgColor), durationMs: 0 }];
  }

  const scale = comp.scale;
  const theme = resolveTheme(comp.bgColor, comp.arrowColor);
  const items = await Promise.all(comp.panels.map((p) => renderPanel(p, scale, theme)));

  // Gather the animated panels and their decoded source frames.
  const radius = _s(PANEL_RADIUS, scale);
  const slots: AnimSlot[] = [];
  for (let i = 0; i < comp.panels.length; i++) {
    const p = comp.panels[i] as Panel;
    if (p.kind !== "image" || !p.animated || !p.blobId) continue;
    const blob = await getBlob(p.blobId);
    if (!blob) continue;
    const frames = await decodeFrames(blob);
    if (frames.length < 2) {
      // Not actually animated — drop the decoded bitmaps now.
      for (const f of frames) f.bitmap.close();
      continue;
    }
    const totalMs = frames.reduce((a, f) => a + Math.max(20, f.durationMs), 0);
    // rounded → image is drawn without the padded panel bg (inner border).
    slots.push({ panelIndex: i, frames, totalMs, rounded: !p.innerBorder, radius });
  }

  // No motion → a single still frame. Same compositor, just length 1.
  if (slots.length === 0) {
    onProgress?.(1);
    return [{ canvas: composeFromItems(items, comp, scale), durationMs: 0 }];
  }

  const maxLen = slots.reduce((a, s) => Math.max(a, s.totalMs), 0);
  const totalFrames = Math.min(MAX_FRAMES, Math.max(2, Math.ceil(maxLen / FRAME_MS)));
  const output: Frame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i * FRAME_MS;
    for (const slot of slots) {
      const f = frameAtTime(slot, t);
      const existing = items[slot.panelIndex]!;
      const swapped = renderFrameToCanvas(f, slot.rounded, slot.radius, existing.width, existing.height);
      items[slot.panelIndex] = { ...existing, canvas: swapped };
    }
    const frame = composeFromItems(items, comp, scale);
    output.push({ canvas: frame, durationMs: FRAME_MS });
    onProgress?.((i + 1) / totalFrames);
    if (onFrame) {
      onFrame(frame);
      // Hand the frame to the browser to paint before composing the next.
      await nextPaint();
    }
  }
  // Source frames are now baked into the output canvases; free the
  // GPU-backed bitmaps instead of waiting on GC finalization.
  for (const slot of slots) for (const f of slot.frames) f.bitmap.close();
  return output;
};

// A single composed still — for raw previews, template thumbnails, and
// clipboard copy. Composes one frame; for animated panels `renderPanel`
// rasterizes the source's first frame, so we never decode or compose the
// whole timeline here.
export const composeStill = async (comp: Composition): Promise<HTMLCanvasElement> => {
  if (comp.panels.length === 0) return emptyPlaceholder(comp.bgColor);
  const scale = comp.scale;
  const theme = resolveTheme(comp.bgColor, comp.arrowColor);
  const items = await Promise.all(comp.panels.map((p) => renderPanel(p, scale, theme)));
  return composeFromItems(items, comp, scale);
};
