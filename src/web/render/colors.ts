// Ported from src/cli/colors.py — keep visually in lockstep with the CLI.

export type RGB = [number, number, number];

export const DEFAULT_BG: RGB = [30, 30, 46];
export const PANEL_BG: RGB = [49, 50, 68];
export const TEXT: RGB = [205, 214, 244];
export const SUBTLE: RGB = [166, 173, 200];
export const ARROW: RGB = [255, 255, 255];

export const PANEL_RADIUS = 18;

export const rgbToCss = (c: RGB): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
export const rgbToHex = (c: RGB): string =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

export const hexToRgb = (hex: string): RGB => {
  const m = hex.trim().replace(/^#/, "");
  const s = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
};

export const PANEL_BG_HEX = rgbToHex(PANEL_BG);
export const DEFAULT_BG_HEX = rgbToHex(DEFAULT_BG);
export const ARROW_HEX = rgbToHex(ARROW);
