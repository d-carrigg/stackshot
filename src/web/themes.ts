// Single source of truth for the look of a composition. Each theme
// carries every token the live editor (CSS vars) and the canvas renderer
// (panel bg, title colour, syntax theme) need. Add a theme here and it
// flows everywhere — no other file should define palette constants.

export type SyntaxThemeId = "one-dark-pro" | "github-light";

export type Theme = {
  id: string;          // "dark" | "light" | "sunset" | "ocean" | "custom"
  label: string;
  bg: string;          // composition background
  panelBg: string;     // code-panel background (canvas + live)
  arrow: string;       // arrow fill
  title: string;       // panel title text colour
  chromeText: string;  // editor chrome text (title input, lang select)
  chromeMuted: string; // editor chrome muted text + icons
  border: string;
  surface: string;     // chrome surface (lang select bg, hover bg base)
  surface2: string;    // chrome surface accent (hover, active)
  syntax: SyntaxThemeId;
};

export const DARK_THEME: Theme = {
  id: "dark", label: "Dark",
  bg: "#1e1e2e", panelBg: "#313244",
  arrow: "#ffffff", title: "#cdd6f4",
  chromeText: "#cdd6f4", chromeMuted: "#7f849c",
  border: "#313244", surface: "#1e1e2e", surface2: "#292a37",
  syntax: "one-dark-pro",
};

export const LIGHT_THEME: Theme = {
  id: "light", label: "Light",
  bg: "#f5f5f7", panelBg: "#ffffff",
  arrow: "#1e1e2e", title: "#1e1e2e",
  chromeText: "#1e1e2e", chromeMuted: "#5b617a",
  border: "rgba(0,0,0,0.18)",
  surface: "rgba(255,255,255,0.6)",
  surface2: "rgba(0,0,0,0.06)",
  syntax: "github-light",
};

export const SUNSET_THEME: Theme = {
  id: "sunset", label: "Sunset",
  bg: "#fab387", panelBg: "#1e1e2e",
  arrow: "#1e1e2e", title: "#1e1e2e",
  chromeText: "#1e1e2e", chromeMuted: "#5b617a",
  border: "rgba(0,0,0,0.22)",
  surface: "rgba(255,255,255,0.25)",
  surface2: "rgba(0,0,0,0.08)",
  syntax: "one-dark-pro",
};

export const OCEAN_THEME: Theme = {
  id: "ocean", label: "Ocean",
  bg: "#0d2748", panelBg: "#1e3a5f",
  arrow: "#89b4fa", title: "#cdd6f4",
  chromeText: "#cdd6f4", chromeMuted: "#a6adc8",
  border: "rgba(255,255,255,0.16)",
  surface: "rgba(255,255,255,0.06)",
  surface2: "rgba(255,255,255,0.1)",
  syntax: "one-dark-pro",
};

export const THEMES: Theme[] = [DARK_THEME, LIGHT_THEME, SUNSET_THEME, OCEAN_THEME];

const luminance = (hex: string): number => {
  const s = hex.replace(/^#/, "");
  const n = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Resolve a (bg, arrow) pair to a full theme. Matches against the presets
// first; otherwise builds a custom theme on the chosen light/dark base.
export const resolveTheme = (bg: string, arrow: string): Theme => {
  const preset = THEMES.find((t) => eqHex(t.bg, bg) && eqHex(t.arrow, arrow));
  if (preset) return preset;
  const base = luminance(bg) > 0.6 ? LIGHT_THEME : DARK_THEME;
  return { ...base, id: "custom", label: "Custom", bg, arrow };
};

// Set the theme tokens as CSS custom properties on an element. The live
// editor reads these via `var(--theme-*)` so its chrome adapts to whatever
// theme the canvas is rendering.
export const applyThemeVars = (el: HTMLElement, t: Theme): void => {
  el.style.setProperty("--bg", t.bg);
  el.style.setProperty("--panel-bg", t.panelBg);
  el.style.setProperty("--arrow", t.arrow);
  el.style.setProperty("--title", t.title);
  el.style.setProperty("--text", t.chromeText);
  el.style.setProperty("--muted", t.chromeMuted);
  el.style.setProperty("--border", t.border);
  el.style.setProperty("--surface", t.surface);
  el.style.setProperty("--surface-2", t.surface2);
};
