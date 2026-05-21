// Rasterize tokenized code into a Canvas. Mirrors the dimensions of
// Pygments' ImageFormatter so panel sizes line up with the CLI: 18px base
// font, 12px image_pad, both scaled by `scale`.
import { tokenize, type TokenLine } from "./highlight";
import type { Theme } from "../themes";

const FONT_FAMILY = '"DejaVu Sans Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

const baseFontSize = (scale: number) => Math.max(1, Math.round(18 * scale));
const basePad = (scale: number) => Math.max(0, Math.round(12 * scale));

const measureCharWidth = (ctx: CanvasRenderingContext2D, fontSize: number): { charW: number; lineH: number } => {
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  // Use a wide-ish sample to handle subpixel metrics consistently.
  const sample = "MMMMMMMMMM";
  const w = ctx.measureText(sample).width / sample.length;
  // Pygments ImageFormatter uses ~1.2 line height visually for DejaVu Sans Mono.
  const lineH = Math.ceil(fontSize * 1.22);
  return { charW: w, lineH };
};

const computeWidth = (lines: TokenLine[]): number => {
  let max = 0;
  for (const line of lines) {
    const len = line.reduce((acc, t) => acc + t.content.length, 0);
    if (len > max) max = len;
  }
  return max;
};

export type CodePanelImage = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export const renderCodePanelImage = async (
  code: string,
  language: string,
  scale: number,
  theme: Theme,
  lineNumbers = false,
): Promise<CodePanelImage> => {
  const tokens = await tokenize(code, language, theme.syntax);
  const fontSize = baseFontSize(scale);
  const pad = basePad(scale);

  // Probe canvas for metrics.
  const probe = document.createElement("canvas");
  const probeCtx = probe.getContext("2d")!;
  const { charW, lineH } = measureCharWidth(probeCtx, fontSize);

  // Line-number gutter: a column wide enough for the highest line number,
  // plus a gap before the code. Zero-width when the toggle is off so the
  // panel matches the CLI dimensions exactly.
  const digits = String(Math.max(1, tokens.length)).length;
  const gutterW = lineNumbers ? Math.ceil(digits * charW) + pad : 0;
  const codeX = pad + gutterW;

  const longestChars = Math.max(1, computeWidth(tokens));
  const contentW = Math.ceil(longestChars * charW);
  const contentH = Math.max(lineH, tokens.length * lineH);

  const width = codeX + contentW + pad;
  const height = contentH + pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Fill with panel background so subpixel-AA glyph edges blend cleanly.
  ctx.fillStyle = theme.panelBg;
  ctx.fillRect(0, 0, width, height);

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = "alphabetic";

  // Baseline position: align text within line box.
  const ascent = Math.round(fontSize * 0.82);

  for (let row = 0; row < tokens.length; row++) {
    const line = tokens[row]!;
    const y = pad + row * lineH + ascent;
    if (lineNumbers) {
      ctx.fillStyle = theme.chromeMuted;
      ctx.textAlign = "right";
      ctx.fillText(String(row + 1), pad + digits * charW, y);
      ctx.textAlign = "left";
    }
    let xChar = 0;
    for (const tok of line) {
      if (!tok.content) continue;
      ctx.fillStyle = tok.color;
      ctx.fillText(tok.content, codeX + xChar * charW, y);
      xChar += tok.content.length;
    }
  }

  return { canvas, width, height };
};
