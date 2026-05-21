// Arrow polygons — ported from src/cli/compose.py. Constants at scale=1.0; all
// callers multiply by the active scale via _s().
export const SHAFT_HALF = 3;
export const HEAD_LEN = 18;
export const HEAD_HALF = 11;
const SS = 4;

export const _s = (v: number, scale: number): number => Math.max(1, Math.round(v * scale));

export type Point = [number, number];

export const arrowRight = (
  x1: number, x2: number, y: number,
  shaftHalf: number, headLen: number, headHalf: number,
): Point[] => {
  const headBaseX = x2 - headLen;
  return [
    [x1, y - shaftHalf],
    [headBaseX, y - shaftHalf],
    [headBaseX, y - headHalf],
    [x2, y],
    [headBaseX, y + headHalf],
    [headBaseX, y + shaftHalf],
    [x1, y + shaftHalf],
  ];
};

export const arrowDown = (
  y1: number, y2: number, x: number,
  shaftHalf: number, headLen: number, headHalf: number,
): Point[] => {
  const headBaseY = y2 - headLen;
  return [
    [x - shaftHalf, y1],
    [x + shaftHalf, y1],
    [x + shaftHalf, headBaseY],
    [x + headHalf, headBaseY],
    [x, y2],
    [x - headHalf, headBaseY],
    [x - shaftHalf, headBaseY],
  ];
};

// Render polygon supersampled at SSx, then downsample into the target context.
// Mirrors _draw_arrow_supersampled() in src/cli/compose.py.
export const drawArrowSupersampled = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  fillCss: string,
): void => {
  const pad = 2;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const xMin = Math.min(...xs) - pad;
  const yMin = Math.min(...ys) - pad;
  const xMax = Math.max(...xs) + pad;
  const yMax = Math.max(...ys) + pad;
  const w = xMax - xMin;
  const h = yMax - yMin;
  if (w <= 0 || h <= 0) return;

  const layer = document.createElement("canvas");
  layer.width = w * SS;
  layer.height = h * SS;
  const lctx = layer.getContext("2d")!;
  lctx.fillStyle = fillCss;
  lctx.beginPath();
  const first = points[0]!;
  lctx.moveTo((first[0] - xMin) * SS, (first[1] - yMin) * SS);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    lctx.lineTo((p[0] - xMin) * SS, (p[1] - yMin) * SS);
  }
  lctx.closePath();
  lctx.fill();

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(layer, 0, 0, layer.width, layer.height, xMin, yMin, w, h);
};
