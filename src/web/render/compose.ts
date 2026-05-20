// Top-level Canvas composition. Mirrors compose_panels() in src/cli/compose.py.
import { PANEL_BG_HEX, PANEL_RADIUS, hexToRgb, type RGB } from "./colors";
import { _s, arrowRight, arrowDown, drawArrowSupersampled, SHAFT_HALF, HEAD_LEN, HEAD_HALF } from "./arrows";
import { renderCodePanelImage } from "./codePanel";
import { renderImagePanel, roundedRectPath } from "./imagePanel";
import type { Composition, Panel } from "../state";

type PanelImage = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  title?: string;
  isImage: boolean;
};

const TITLE_FONT_FAMILY = '"Inter", "Helvetica Neue", Arial, sans-serif';
const TITLE_COLOR = "#cdd6f4";

const titleFontPx = (scale: number) => Math.max(1, Math.round(24 * scale));

const renderPanel = async (p: Panel, scale: number, noInnerBorder: boolean): Promise<PanelImage> => {
  if (p.kind === "code") {
    const img = await renderCodePanelImage(p.code, p.language, scale);
    return { canvas: img.canvas, width: img.width, height: img.height, title: p.title, isImage: false };
  }
  const rounded = noInnerBorder;
  const radius = _s(PANEL_RADIUS, scale);
  const img = await renderImagePanel(p.src, rounded, radius);
  return { canvas: img.canvas, width: img.width, height: img.height, title: p.title, isImage: true };
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

export const composeCanvas = async (comp: Composition): Promise<HTMLCanvasElement> => {
  if (comp.panels.length === 0) {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 120;
    const ctx = canvas.getContext("2d")!;
    fillBg(ctx, canvas.width, canvas.height, comp.bgColor);
    ctx.fillStyle = "#888";
    ctx.font = `14px ${TITLE_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add a panel to begin", canvas.width / 2, canvas.height / 2);
    return canvas;
  }

  const scale = comp.scale;
  const noInnerBorder = !comp.innerBorder;

  const items = await Promise.all(comp.panels.map((p) => renderPanel(p, scale, noInnerBorder)));

  return comp.layout === "vertical"
    ? composeVertical(items, comp, scale, noInnerBorder)
    : composeHorizontal(items, comp, scale, noInnerBorder);
};

const composeHorizontal = (
  items: PanelImage[],
  comp: Composition,
  scale: number,
  noInnerBorder: boolean,
): HTMLCanvasElement => {
  const gutter = _s(32, scale);
  const margin = _s(40, scale);
  const titleGap = _s(12, scale);
  const arrowWidth = _s(90, scale);
  const basePanelPad = _s(24, scale);
  const titleFont = titleFontPx(scale);
  const panelRadius = _s(PANEL_RADIUS, scale);
  const shaftHalf = _s(SHAFT_HALF, scale);
  const headLen = _s(HEAD_LEN, scale);
  const headHalf = _s(HEAD_HALF, scale);

  const probe = document.createElement("canvas").getContext("2d")!;
  const titleH = Math.max(
    0,
    ...items.map((it) => (it.title ? measureTitleHeight(probe, it.title, titleFont) : 0)),
  );

  const pads = items.map((it) => (noInnerBorder && it.isImage ? 0 : basePanelPad));
  const panelW = items.map((it, i) => it.width + 2 * pads[i]!);
  const panelH = items.map((it, i) => it.height + 2 * pads[i]!);
  const maxPanelH = Math.max(...panelH);

  const topPad = margin + (titleH > 0 ? titleH + titleGap : 0);
  const bottomPad = margin;

  const n = items.length;
  const arrowSpan = (n - 1) * (gutter + arrowWidth + gutter);
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
    const drawBg = !(noInnerBorder && it.isImage);
    if (drawBg) {
      ctx.fillStyle = PANEL_BG_HEX;
      roundedRectPath(ctx, px, py, pw, ph, panelRadius);
      ctx.fill();
    }
    if (it.title) {
      ctx.fillStyle = TITLE_COLOR;
      ctx.font = `600 ${titleFont}px ${TITLE_FONT_FAMILY}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(it.title, px + pad, margin);
    }
    ctx.drawImage(it.canvas, px + pad, py + pad);
    x += pw;
    if (i < n - 1) {
      const ax1 = x + gutter;
      const ax2 = x + gutter + arrowWidth;
      const shaftY = topPad + Math.floor(maxPanelH / 2);
      drawArrowSupersampled(
        ctx,
        arrowRight(ax1, ax2, shaftY, shaftHalf, headLen, headHalf),
        comp.arrowColor,
      );
      x += gutter + arrowWidth + gutter;
    }
  }

  return canvas;
};

const composeVertical = (
  items: PanelImage[],
  comp: Composition,
  scale: number,
  noInnerBorder: boolean,
): HTMLCanvasElement => {
  const margin = _s(40, scale);
  const gutter = _s(16, scale);
  const titleGap = _s(10, scale);
  const arrowHeight = _s(56, scale);
  const basePanelPad = _s(24, scale);
  const titleFont = titleFontPx(scale);
  const panelRadius = _s(PANEL_RADIUS, scale);
  const shaftHalf = _s(SHAFT_HALF, scale);
  const headLen = _s(HEAD_LEN, scale);
  const headHalf = _s(HEAD_HALF, scale);

  const probe = document.createElement("canvas").getContext("2d")!;
  const pads = items.map((it) => (noInnerBorder && it.isImage ? 0 : basePanelPad));
  const panelW = items.map((it, i) => it.width + 2 * pads[i]!);
  const panelH = items.map((it, i) => it.height + 2 * pads[i]!);
  const maxPanelW = Math.max(...panelW);

  const titleHeights = items.map((it) =>
    it.title ? measureTitleHeight(probe, it.title, titleFont) + titleGap : 0,
  );

  const n = items.length;
  const arrowBlock = gutter + arrowHeight + gutter;
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
    const ph = panelH[i]!;
    const th = titleHeights[i]!;
    if (it.title) {
      ctx.fillStyle = TITLE_COLOR;
      ctx.font = `600 ${titleFont}px ${TITLE_FONT_FAMILY}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(it.title, margin, y);
      y += th;
    }
    const drawBg = !(noInnerBorder && it.isImage);
    if (drawBg) {
      ctx.fillStyle = PANEL_BG_HEX;
      roundedRectPath(ctx, margin, y, maxPanelW, ph, panelRadius);
      ctx.fill();
    }
    ctx.drawImage(it.canvas, margin + pad, y + pad);
    y += ph;
    if (i < n - 1) {
      y += gutter;
      const shaftX = margin + Math.floor(maxPanelW / 2);
      const ay1 = y;
      const ay2 = y + arrowHeight;
      drawArrowSupersampled(
        ctx,
        arrowDown(ay1, ay2, shaftX, shaftHalf, headLen, headHalf),
        comp.arrowColor,
      );
      y += arrowHeight + gutter;
    }
  }

  return canvas;
};

// Re-export helpful color util.
export type { RGB };
export { hexToRgb };
