// Load image data URL into a Canvas at its natural size. Optional rounded-corner
// clipping mirrors apply_rounded_corners() from src/cli/compose.py.

const cache = new Map<string, Promise<HTMLImageElement>>();

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  const existing = cache.get(src);
  if (existing) return existing;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      // Evict so a re-render after the user fixes the panel doesn't get
      // stuck on the cached rejection forever.
      cache.delete(src);
      reject(e);
    };
    img.src = src;
  });
  cache.set(src, p);
  return p;
};

export type ImagePanelCanvas = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export const renderImagePanel = async (
  src: string,
  rounded: boolean,
  radius: number,
): Promise<ImagePanelCanvas> => {
  const img = await loadImage(src);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (rounded && radius > 0) {
    ctx.save();
    roundedRectPath(ctx, 0, 0, w, h, Math.min(radius, Math.min(w, h) / 2));
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0);
  }
  return { canvas, width: w, height: h };
};

export const roundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
};
