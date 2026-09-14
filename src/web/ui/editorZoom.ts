// Editor-only canvas zoom (not the export `scale` multiplier). Fit never
// zooms in past 100% — it only shrinks wide/tall stacks to the viewport.

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;

export const clampZoom = (z: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export const zoomIn = (z: number): number =>
  clampZoom(Math.round((z + ZOOM_STEP) * 100) / 100);

export const zoomOut = (z: number): number =>
  clampZoom(Math.round((z - ZOOM_STEP) * 100) / 100);

export const fitZoom = (
  contentW: number,
  contentH: number,
  viewW: number,
  viewH: number,
  pad = 16,
): number => {
  if (contentW <= 0 || contentH <= 0 || viewW <= 0 || viewH <= 0) return 1;
  const sx = (viewW - pad) / contentW;
  const sy = (viewH - pad) / contentH;
  return clampZoom(Math.min(1, sx, sy));
};

export const formatZoom = (z: number): string => `${Math.round(z * 100)}%`;
