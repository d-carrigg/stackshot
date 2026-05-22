// Top-level Canvas composition. Mirrors compose_panels() in src/cli/compose.py.
import { PANEL_RADIUS, hexToRgb, type RGB } from "./colors";
import {
  _s, arrowRight, arrowDown, drawArrowSupersampled, drawDashedArrow, drawVsBadge,
  SHAFT_HALF, HEAD_LEN, HEAD_HALF,
} from "./arrows";
import { renderCodePanelImage } from "./codePanel";
import { renderImagePanel, roundedRectPath } from "./imagePanel";
import { resolveArrow, type Composition, type Panel } from "../state";
import { resolveTheme, type Theme } from "../themes";

export type PanelImage = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  title?: string;
  isImage: boolean;
  innerBorder: boolean; // only meaningful for image panels
};

const TITLE_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';

const titleFontPx = (scale: number) => Math.max(1, Math.round(24 * scale));

export const renderPanel = async (
  p: Panel,
  scale: number,
  theme: Theme,
): Promise<PanelImage> => {
  if (p.kind === "code") {
    const img = await renderCodePanelImage(p.code, p.language, scale, theme, !!p.lineNumbers);
    return { canvas: img.canvas, width: img.width, height: img.height, title: p.title, isImage: false, innerBorder: true };
  }
  const innerBorder = !!p.innerBorder;
  const rounded = !innerBorder;
  const radius = _s(PANEL_RADIUS, scale);
  const img = await renderImagePanel(p.src, rounded, radius, scale);
  return { canvas: img.canvas, width: img.width, height: img.height, title: p.title, isImage: true, innerBorder };
};

const measureTitleHeight = (ctx: CanvasRenderingContext2D, text: string, fontPx: number): number => {
  if (!text) return 0;
  ctx.font = `600 ${fontPx}px ${TITLE_FONT_FAMILY}`;
  const m = ctx.measureText(text);
  // actualBoundingBoxAscent is well-supported in modern browsers.
  return Math.ceil((m.actualBoundingBoxAscent ?? fontPx * 0.8) + (m.actualBoundingBoxDescent ?? fontPx * 0.2));
};

const fillBg = (ctx: CanvasRenderingContext2D, w: number, h: number, bgHex: string) => {
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, w, h);
};

// True if this panel should get the padded inner-bg box. Code panels
// always do; image panels follow their per-panel `innerBorder` flag.
const hasInnerBg = (it: PanelImage): boolean => !it.isImage || it.innerBorder;

// Per-panel measurements shared by all three layouts. Each layout then
// does its own placement math; only this measurement step was duplicated.
type PanelMetrics = {
  titleFont: number;
  panelRadius: number;
  probe: CanvasRenderingContext2D;
  pads: number[];
  panelW: number[];
  panelH: number[];
};

const measurePanels = (items: PanelImage[], scale: number): PanelMetrics => {
  const basePanelPad = _s(24, scale);
  const titleFont = titleFontPx(scale);
  const panelRadius = _s(PANEL_RADIUS, scale);
  const probe = document.createElement("canvas").getContext("2d")!;
  const pads = items.map((it) => (hasInnerBg(it) ? basePanelPad : 0));
  const panelW = items.map((it, i) => it.width + 2 * pads[i]!);
  const panelH = items.map((it, i) => it.height + 2 * pads[i]!);
  return { titleFont, panelRadius, probe, pads, panelW, panelH };
};

// Draw the connector between two consecutive panels, dispatching on the
// per-arrow resolved style. `a1`/`a2` are the start/tip along the arrow axis;
// `cross` is the fixed cross-axis coordinate. Shared by all three layouts.
const drawConnector = (
  ctx: CanvasRenderingContext2D,
  comp: Composition,
  fromId: string,
  dir: "right" | "down",
  a1: number, a2: number, cross: number,
  shaftHalf: number, headLen: number, headHalf: number,
  vsRadius: number,
): void => {
  const { style, color } = resolveArrow(comp, fromId);
  if (style === "vs") {
    const mid = (a1 + a2) / 2;
    if (dir === "right") drawVsBadge(ctx, mid, cross, vsRadius, color);
    else drawVsBadge(ctx, cross, mid, vsRadius, color);
    return;
  }
  if (style === "dashed") {
    drawDashedArrow(ctx, dir, a1, a2, cross, shaftHalf, headLen, headHalf, color);
    return;
  }
  const poly = dir === "right"
    ? arrowRight(a1, a2, cross, shaftHalf, headLen, headHalf)
    : arrowDown(a1, a2, cross, shaftHalf, headLen, headHalf);
  drawArrowSupersampled(ctx, poly, color);
};

export const composeFromItems = (
  items: PanelImage[],
  comp: Composition,
  scale: number,
): HTMLCanvasElement => {
  if (comp.layout === "vertical") return composeVertical(items, comp, scale);
  if (comp.layout === "grid") return composeGrid(items, comp, scale);
  return composeHorizontal(items, comp, scale);
};

const composeGrid = (
  items: PanelImage[],
  comp: Composition,
  scale: number,
): HTMLCanvasElement => {
  const margin = _s(40, scale);
  // Widen the cell gutter when arrows are shown so the connector has room to
  // sit between cells instead of crammed against a panel edge.
  const gutter = _s(comp.showArrows ? 64 : 24, scale);
  const titleGap = _s(8, scale);
  const rows = Math.max(1, comp.gridRows);
  const cols = Math.max(1, comp.gridCols);
  const theme = resolveTheme(comp.bgColor, comp.arrowColor);
  const titleColor = theme.title;

  const { titleFont, panelRadius, probe, pads, panelW, panelH } = measurePanels(items, scale);
  // When grid numbering is on, prefix each cell's title with its
  // reading-order number (left-to-right, top-to-bottom). Cells without a
  // title get a bare "N." so the count stays unbroken.
  const labelFor = (i: number): string => {
    const p = comp.panels[i]!;
    const base = items[i]!.title ?? "";
    if (!comp.gridNumbers) return base;
    const r = p.gridRow ?? Math.floor(i / cols);
    const col = p.gridCol ?? i % cols;
    const num = r * cols + col + 1;
    return base ? `${num}. ${base}` : `${num}.`;
  };
  const labels = items.map((_, i) => labelFor(i));
  const titleHeights = labels.map((label) =>
    label ? measureTitleHeight(probe, label, titleFont) + titleGap : 0,
  );

  // Per-cell dimensions = max across the row/column for fairness.
  const colMaxW = new Array<number>(cols).fill(0);
  const rowMaxH = new Array<number>(rows).fill(0);
  comp.panels.forEach((p, i) => {
    const r = p.gridRow ?? Math.floor(i / cols);
    const c = p.gridCol ?? i % cols;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    colMaxW[c] = Math.max(colMaxW[c]!, panelW[i]!);
    rowMaxH[r] = Math.max(rowMaxH[r]!, panelH[i]! + titleHeights[i]!);
  });

  const colX = new Array<number>(cols).fill(0);
  let xCursor = margin;
  for (let c = 0; c < cols; c++) {
    colX[c] = xCursor;
    xCursor += colMaxW[c]! + (c < cols - 1 ? gutter : 0);
  }
  const totalW = xCursor + margin;

  const rowY = new Array<number>(rows).fill(0);
  let yCursor = margin;
  for (let r = 0; r < rows; r++) {
    rowY[r] = yCursor;
    yCursor += rowMaxH[r]! + (r < rows - 1 ? gutter : 0);
  }
  const totalH = yCursor + margin;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, totalW);
  canvas.height = Math.max(1, totalH);
  const ctx = canvas.getContext("2d")!;
  fillBg(ctx, canvas.width, canvas.height, comp.bgColor);

  comp.panels.forEach((p, i) => {
    const it = items[i]!;
    const pad = pads[i]!;
    const pw = panelW[i]!;
    const ph = panelH[i]!;
    const th = titleHeights[i]!;
    const r = p.gridRow ?? Math.floor(i / cols);
    const c = p.gridCol ?? i % cols;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const cellX = colX[c]!;
    const cellY = rowY[r]!;
    const cellW = colMaxW[c]!;
    const cellH = rowMaxH[r]!;
    const px = cellX + Math.floor((cellW - pw) / 2);
    const titleY = cellY + Math.floor((cellH - (ph + th)) / 2);
    const py = titleY + th;

    const label = labels[i]!;
    if (label) {
      ctx.fillStyle = titleColor;
      ctx.font = `600 ${titleFont}px ${TITLE_FONT_FAMILY}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(label, px + pad, titleY);
    }
    if (hasInnerBg(it)) {
      ctx.fillStyle = theme.panelBg;
      roundedRectPath(ctx, px, py, pw, ph, panelRadius);
      ctx.fill();
    }
    ctx.drawImage(it.canvas, px + pad, py + pad);
  });

  // Connectors between consecutive panels — only when the two land in
  // orthogonally-adjacent cells (right or down). Diagonal/non-adjacent
  // transitions are skipped so geometry stays purely horizontal/vertical.
  if (comp.showArrows) {
    const shaftHalf = _s(SHAFT_HALF, scale);
    const headLen = _s(HEAD_LEN, scale);
    const headHalf = _s(HEAD_HALF, scale);
    const vsRadius = _s(13, scale);
    const cellOf = (i: number) => {
      const p = comp.panels[i]!;
      return { r: p.gridRow ?? Math.floor(i / cols), c: p.gridCol ?? i % cols };
    };
    for (let i = 0; i < comp.panels.length - 1; i++) {
      const a = cellOf(i);
      const b = cellOf(i + 1);
      if (a.r < 0 || a.r >= rows || a.c < 0 || a.c >= cols) continue;
      if (b.r < 0 || b.r >= rows || b.c < 0 || b.c >= cols) continue;
      const fromId = comp.panels[i]!.id;
      const inset = Math.round(gutter * 0.18);
      if (a.r === b.r && b.c === a.c + 1) {
        const crossY = rowY[a.r]! + Math.floor(rowMaxH[a.r]! / 2);
        const x1 = colX[a.c]! + colMaxW[a.c]! + inset;
        const x2 = colX[b.c]! - inset;
        drawConnector(ctx, comp, fromId, "right", x1, x2, crossY,
          shaftHalf, headLen, headHalf, vsRadius);
      } else if (a.c === b.c && b.r === a.r + 1) {
        const crossX = colX[a.c]! + Math.floor(colMaxW[a.c]! / 2);
        const y1 = rowY[a.r]! + rowMaxH[a.r]! + inset;
        const y2 = rowY[b.r]! - inset;
        drawConnector(ctx, comp, fromId, "down", y1, y2, crossX,
          shaftHalf, headLen, headHalf, vsRadius);
      }
    }
  }

  return canvas;
};

const composeHorizontal = (
  items: PanelImage[],
  comp: Composition,
  scale: number,
): HTMLCanvasElement => {
  const gutter = _s(32, scale);
  const margin = _s(40, scale);
  const titleGap = _s(12, scale);
  const arrowWidth = _s(90, scale);
  const shaftHalf = _s(SHAFT_HALF, scale);
  const headLen = _s(HEAD_LEN, scale);
  const headHalf = _s(HEAD_HALF, scale);
  const theme = resolveTheme(comp.bgColor, comp.arrowColor);
  const titleColor = theme.title;

  const { titleFont, panelRadius, probe, pads, panelW, panelH } = measurePanels(items, scale);
  const titleH = Math.max(
    0,
    ...items.map((it) => (it.title ? measureTitleHeight(probe, it.title, titleFont) : 0)),
  );
  const maxPanelH = Math.max(...panelH);

  const topPad = margin + (titleH > 0 ? titleH + titleGap : 0);
  const bottomPad = margin;

  const n = items.length;
  // When arrows are hidden, panels sit a single gutter apart instead of
  // reserving the full arrow span.
  const connectorSpan = comp.showArrows ? gutter + arrowWidth + gutter : gutter;
  const arrowSpan = (n - 1) * connectorSpan;
  const totalW = margin * 2 + panelW.reduce((a, b) => a + b, 0) + arrowSpan;
  const totalH = topPad + maxPanelH + bottomPad;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;

  fillBg(ctx, totalW, totalH, comp.bgColor);

  let x = margin;
  for (let i = 0; i < n; i++) {
    const it = items[i]!;
    const pad = pads[i]!;
    const pw = panelW[i]!;
    const ph = panelH[i]!;
    const px = x;
    const py = topPad + Math.floor((maxPanelH - ph) / 2);
    if (hasInnerBg(it)) {
      ctx.fillStyle = theme.panelBg;
      roundedRectPath(ctx, px, py, pw, ph, panelRadius);
      ctx.fill();
    }
    if (it.title) {
      ctx.fillStyle = titleColor;
      ctx.font = `600 ${titleFont}px ${TITLE_FONT_FAMILY}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(it.title, px + pad, margin);
    }
    ctx.drawImage(it.canvas, px + pad, py + pad);
    x += pw;
    if (i < n - 1) {
      if (comp.showArrows) {
        const ax1 = x + gutter;
        const ax2 = x + gutter + arrowWidth;
        const shaftY = topPad + Math.floor(maxPanelH / 2);
        drawConnector(ctx, comp, comp.panels[i]!.id, "right", ax1, ax2, shaftY,
          shaftHalf, headLen, headHalf, _s(20, scale));
      }
      x += connectorSpan;
    }
  }

  return canvas;
};

const composeVertical = (
  items: PanelImage[],
  comp: Composition,
  scale: number,
): HTMLCanvasElement => {
  const margin = _s(40, scale);
  const gutter = _s(16, scale);
  const titleGap = _s(10, scale);
  const arrowHeight = _s(56, scale);
  const shaftHalf = _s(SHAFT_HALF, scale);
  const headLen = _s(HEAD_LEN, scale);
  const headHalf = _s(HEAD_HALF, scale);
  const theme = resolveTheme(comp.bgColor, comp.arrowColor);
  const titleColor = theme.title;

  const { titleFont, panelRadius, probe, pads, panelW, panelH } = measurePanels(items, scale);
  const maxPanelW = Math.max(...panelW);

  const titleHeights = items.map((it) =>
    it.title ? measureTitleHeight(probe, it.title, titleFont) + titleGap : 0,
  );

  const n = items.length;
  const arrowBlock = comp.showArrows ? gutter + arrowHeight + gutter : gutter;
  const totalH =
    margin +
    titleHeights.reduce((a, b) => a + b, 0) +
    panelH.reduce((a, b) => a + b, 0) +
    (n - 1) * arrowBlock +
    margin;
  const totalW = margin * 2 + maxPanelW;

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;
  fillBg(ctx, totalW, totalH, comp.bgColor);

  let y = margin;
  for (let i = 0; i < n; i++) {
    const it = items[i]!;
    const pad = pads[i]!;
    const pw = panelW[i]!;
    const ph = panelH[i]!;
    const th = titleHeights[i]!;
    // Code panels stay left-aligned (left-to-right reading); images are
    // centered horizontally within the column so a narrow screenshot
    // doesn't sit awkwardly against the left edge.
    const offsetX = it.isImage ? Math.floor((maxPanelW - pw) / 2) : 0;
    const px = margin + offsetX;
    if (it.title) {
      ctx.fillStyle = titleColor;
      ctx.font = `600 ${titleFont}px ${TITLE_FONT_FAMILY}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(it.title, px, y);
      y += th;
    }
    if (hasInnerBg(it)) {
      ctx.fillStyle = theme.panelBg;
      const bgW = it.isImage ? pw : maxPanelW;
      const bgX = it.isImage ? px : margin;
      roundedRectPath(ctx, bgX, y, bgW, ph, panelRadius);
      ctx.fill();
    }
    ctx.drawImage(it.canvas, px + pad, y + pad);
    y += ph;
    if (i < n - 1) {
      if (comp.showArrows) {
        y += gutter;
        const shaftX = margin + Math.floor(maxPanelW / 2);
        const ay1 = y;
        const ay2 = y + arrowHeight;
        drawConnector(ctx, comp, comp.panels[i]!.id, "down", ay1, ay2, shaftX,
          shaftHalf, headLen, headHalf, _s(20, scale));
        y += arrowHeight + gutter;
      } else {
        y += gutter;
      }
    }
  }

  return canvas;
};

// Re-export helpful color util.
export type { RGB };
export { hexToRgb };
