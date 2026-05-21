// Animated compose: walks a timeline at a fixed cadence, swapping each
// animated image panel for its current frame's ImageBitmap, then hands
// the canvas to the WEBP muxer. Static panels (code, non-animated
// images) are rendered once and reused.
import type { Composition, Panel } from "../state";
import { renderPanel, composeFromItems, type PanelImage } from "./compose";
import { getBlob } from "../storage/blobStore";
import { decodeFrames, type Frame } from "./motion";
import { encodeAnimatedWebp, type AnimatedWebpFrame } from "./webpMuxer";
import { PANEL_RADIUS } from "./colors";
import { _s } from "./arrows";
import { roundedRectPath } from "./imagePanel";
import { resolveTheme } from "../themes";

const FPS = 25;
const FRAME_MS = Math.round(1000 / FPS);
const MAX_FRAMES = 120; // cap output length so a 10-second loop is the worst case

type AnimSlot = {
  panelIndex: number;
  frames: Frame[];
  totalMs: number;
  rounded: boolean;
  radius: number;
};

const renderFrameToCanvas = (
  frame: Frame,
  rounded: boolean,
  radius: number,
): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = frame.bitmap.width;
  c.height = frame.bitmap.height;
  const ctx = c.getContext("2d")!;
  if (rounded && radius > 0) {
    ctx.save();
    roundedRectPath(ctx, 0, 0, c.width, c.height, Math.min(radius, Math.min(c.width, c.height) / 2));
    ctx.clip();
    ctx.drawImage(frame.bitmap, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(frame.bitmap, 0, 0);
  }
  return c;
};

// Pick which frame plays at time `t` in a panel's timeline (looped).
const frameAtTime = (slot: AnimSlot, t: number): Frame => {
  const tm = ((t % slot.totalMs) + slot.totalMs) % slot.totalMs;
  let acc = 0;
  for (const f of slot.frames) {
    const d = Math.max(20, f.durationMs);
    acc += d;
    if (tm < acc) return f;
  }
  return slot.frames[slot.frames.length - 1]!;
};

export const hasAnimatedPanel = (comp: Composition): boolean =>
  comp.panels.some((p) => p.kind === "image" && p.animated === true);

// Build the per-output-frame canvases for an animated composition.
// Returns one canvas per frame plus the frame's display duration in ms.
// Reuses static panel renderings, only swaps the animated images.
export const composeAnimatedFrames = async (
  comp: Composition,
): Promise<AnimatedWebpFrame[]> => {
  const scale = comp.scale;
  const radius = _s(PANEL_RADIUS, scale);
  const theme = resolveTheme(comp.bgColor, comp.arrowColor);

  const items: PanelImage[] = await Promise.all(
    comp.panels.map((p) => renderPanel(p, scale, theme)),
  );

  const slots: AnimSlot[] = [];
  for (let i = 0; i < comp.panels.length; i++) {
    const p = comp.panels[i] as Panel;
    if (p.kind !== "image" || !p.animated || !p.blobId) continue;
    const blob = await getBlob(p.blobId);
    if (!blob) continue;
    const frames = await decodeFrames(blob);
    if (frames.length < 2) continue;
    const totalMs = frames.reduce((a, f) => a + Math.max(20, f.durationMs), 0);
    // rounded → image is drawn without panel bg (the inner border)
    slots.push({ panelIndex: i, frames, totalMs, rounded: !p.innerBorder, radius });
  }

  if (slots.length === 0) {
    // No motion — return a single frame.
    const canvas = composeFromItems(items, comp, scale);
    return [{ canvas, durationMs: 1000 }];
  }

  const maxLen = slots.reduce((a, s) => Math.max(a, s.totalMs), 0);
  const totalFrames = Math.min(MAX_FRAMES, Math.max(2, Math.ceil(maxLen / FRAME_MS)));

  const output: AnimatedWebpFrame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i * FRAME_MS;
    for (const slot of slots) {
      const f = frameAtTime(slot, t);
      const swapped = renderFrameToCanvas(f, slot.rounded, slot.radius);
      const existing = items[slot.panelIndex]!;
      items[slot.panelIndex] = {
        ...existing,
        canvas: swapped,
        width: swapped.width,
        height: swapped.height,
      };
    }
    const canvas = composeFromItems(items, comp, scale);
    output.push({ canvas, durationMs: FRAME_MS });
  }
  return output;
};

export const composeAnimatedBlob = async (comp: Composition): Promise<Blob> => {
  const frames = await composeAnimatedFrames(comp);
  if (frames.length === 1) {
    // Single-frame fallback when no panel was animated.
    return new Promise((resolve, reject) =>
      (frames[0]!.canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob webp null"))),
        "image/webp",
        0.92,
      ),
    );
  }
  return encodeAnimatedWebp(frames, { quality: 0.9, loop: 0 });
};
