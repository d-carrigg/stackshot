import { DARK_THEME } from "./themes";

const DEFAULT_BG_HEX = DARK_THEME.bg;
const ARROW_HEX = DARK_THEME.arrow;

export type Layout = "horizontal" | "vertical" | "grid";
export type ExportFormat = "auto" | "png" | "webp" | "gif";

// Connector between two consecutive panels. "solid" is the classic filled
// arrow, "dashed" a dashed line + head, "vs" a "VS" badge for comparisons.
export type ArrowStyle = "solid" | "dashed" | "vs";
// Per-connector override. Both optional → fall back to global (arrowColor /
// "solid"). Stored keyed by the "from" panel id so overrides survive
// reorder/removal without index drift.
export type ArrowSpec = { style?: ArrowStyle; color?: string };

export type ResolvedArrow = { style: ArrowStyle; color: string };
export const resolveArrow = (c: Composition, fromId: string): ResolvedArrow => {
  const spec = c.arrows[fromId];
  return { style: spec?.style ?? "solid", color: spec?.color ?? c.arrowColor };
};

// Grid mode renders panels into a fixed cell grid. Beyond 6 panels the
// layout stops being readable at any export size, and our compose path
// only draws panels whose (gridRow, gridCol) fall in-bounds — so silently
// dropping the 7th was the bug we used to ship. Hard-cap and auto-size
// the grid dims to fit the current panel count.
export const GRID_MAX_PANELS = 6;
export const gridDimsFor = (panelCount: number): { rows: number; cols: number } => {
  const n = Math.max(1, Math.min(panelCount, GRID_MAX_PANELS));
  if (n === 1) return { rows: 1, cols: 1 };
  // Always two columns; rows grow to fit. 2→1×2, 3/4→2×2, 5/6→3×2.
  return { rows: Math.ceil(n / 2), cols: 2 };
};

// Scale presets — the topbar exposes these as low/med/high pills with a
// "custom" escape hatch (numeric input). Centralised here so the default
// composition stays in sync with the preset map.
export type ScalePreset = "low" | "med" | "high" | "custom";
export const SCALE_VALUES: Record<Exclude<ScalePreset, "custom">, number> = {
  low: 3.0,
  med: 4.0,
  high: 5.0,
};
export const DEFAULT_SCALE = SCALE_VALUES.med;
export const resolveScalePreset = (scale: number): ScalePreset => {
  for (const k of ["low", "med", "high"] as const) {
    if (Math.abs(SCALE_VALUES[k] - scale) < 0.01) return k;
  }
  return "custom";
};

export type CodePanel = {
  id: string;
  kind: "code";
  title?: string;
  code: string;
  language: string; // "auto" or a Shiki/CodeMirror language id
  lineNumbers?: boolean; // render a line-number gutter on this panel
  gridRow?: number; // 0-indexed; only meaningful when composition.layout === "grid"
  gridCol?: number;
};

export type ImagePanel = {
  id: string;
  kind: "image";
  title?: string;
  // Either a directly-usable URL (data: or blob:/object URL) or a blobId
  // that resolves to a blob in IndexedDB. Persistence stores blobId only.
  src: string;
  blobId?: string;
  mime?: string;       // image/png, image/gif, image/webp, ...
  animated?: boolean;  // true if the source has more than one frame
  naturalW: number;
  naturalH: number;
  // true → image sits inside a padded panel bg (matching code panels);
  // false (default) → just the image with rounded corners. Used to be a
  // composition-wide toggle; per-image since 0.7.
  innerBorder?: boolean;
  gridRow?: number;
  gridCol?: number;
};

export type Panel = CodePanel | ImagePanel;

export type Composition = {
  panels: Panel[];
  layout: Layout;
  bgColor: string;     // hex
  arrowColor: string;  // hex — global default arrow color
  showArrows: boolean; // global toggle; applies to every layout
  arrows: Record<string, ArrowSpec>; // sparse per-connector overrides (key = "from" panel id)
  scale: number;       // 1.0 - 8.0 (presets: low=3, med=4, high=5)
  gridRows: number;    // only used when layout === "grid"
  gridCols: number;    // only used when layout === "grid"
  gridNumbers: boolean; // grid mode: prefix each cell's title with its reading-order number
  exportFormat: ExportFormat; // "auto" → webp
  selectedId: string | null;
};

let idCounter = 0;
export const nextId = (): string => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export const makeCodePanel = (overrides: Partial<CodePanel> = {}): CodePanel => ({
  id: nextId(),
  kind: "code",
  code: overrides.code ?? "",
  language: overrides.language ?? "auto",
  title: overrides.title,
});

export const makeImagePanel = (
  src: string,
  w: number,
  h: number,
  title?: string,
  extra: Partial<Pick<ImagePanel, "blobId" | "mime" | "animated">> = {},
): ImagePanel => ({
  id: nextId(),
  kind: "image",
  src,
  naturalW: w,
  naturalH: h,
  title,
  ...extra,
});

export const emptyComposition = (): Composition => ({
  panels: [],
  layout: "vertical",
  bgColor: DEFAULT_BG_HEX,
  arrowColor: ARROW_HEX,
  showArrows: true,
  arrows: {},
  scale: DEFAULT_SCALE,
  gridRows: 2,
  gridCols: 2,
  gridNumbers: false,
  exportFormat: "auto",
  selectedId: null,
});

export const defaultComposition = (): Composition => {
  const first = makeCodePanel({
    code:
      "nums = [1, 2, 3, 4, 5]\n" +
      "squares = [n ** 2 for n in nums]\n" +
      "print(squares)\n",
    language: "python",
    title: "input",
  });
  const second = makeCodePanel({
    code: "[1, 4, 9, 16, 25]\n",
    language: "text",
    title: "output",
  });
  return {
    panels: [first, second],
    layout: "vertical",
    bgColor: DEFAULT_BG_HEX,
    arrowColor: ARROW_HEX,
    showArrows: true,
    arrows: {},
    scale: DEFAULT_SCALE,
    gridRows: 2,
    gridCols: 2,
    gridNumbers: false,
    exportFormat: "auto",
    selectedId: first.id,
  };
};

// For grid mode, assign every panel an in-bounds (gridRow, gridCol).
// Existing positions are kept when valid; the rest fill the first empty
// cell row-by-row. Caller is expected to have set `next.layout = "grid"`.
export const ensureGridPositions = (c: Composition): Composition => {
  const rows = Math.max(1, c.gridRows);
  const cols = Math.max(1, c.gridCols);
  const occupied = new Set<string>();
  const cellKey = (r: number, col: number) => `${r},${col}`;
  const inBounds = (r?: number, col?: number) =>
    r !== undefined && col !== undefined && r >= 0 && r < rows && col >= 0 && col < cols;

  // Pass 1: keep valid positions, claim cells.
  const kept = c.panels.map((p) => {
    if (inBounds(p.gridRow, p.gridCol)) {
      const key = cellKey(p.gridRow!, p.gridCol!);
      if (!occupied.has(key)) {
        occupied.add(key);
        return p;
      }
    }
    return { ...p, gridRow: undefined, gridCol: undefined };
  });
  // Pass 2: fill the rest.
  let cursor = 0;
  const panels = kept.map((p) => {
    if (inBounds(p.gridRow, p.gridCol)) return p;
    while (cursor < rows * cols) {
      const r = Math.floor(cursor / cols);
      const col = cursor % cols;
      cursor++;
      const key = cellKey(r, col);
      if (!occupied.has(key)) {
        occupied.add(key);
        return { ...p, gridRow: r, gridCol: col } as Panel;
      }
    }
    // Out of cells — leave unpositioned; the renderer will overflow.
    return p;
  });
  return { ...c, panels };
};

type Listener = (c: Composition) => void;

export class Store {
  private state: Composition;
  private listeners = new Set<Listener>();

  constructor(initial: Composition) {
    this.state = initial;
  }

  get(): Composition {
    return this.state;
  }

  set(updater: (c: Composition) => Composition): void {
    this.state = updater(this.state);
    for (const l of this.listeners) l(this.state);
  }

  patch(partial: Partial<Composition>): void {
    this.set((c) => {
      const next = { ...c, ...partial };
      // When entering grid mode (or resizing the grid), auto-fit the grid
      // dims to the panel count and make sure every panel has a
      // (gridRow, gridCol) within bounds.
      if (next.layout === "grid") {
        const dims = gridDimsFor(next.panels.length);
        return ensureGridPositions({ ...next, gridRows: dims.rows, gridCols: dims.cols });
      }
      return next;
    });
  }

  patchPanel(id: string, partial: Partial<Panel>): void {
    this.set((c) => ({
      ...c,
      panels: c.panels.map((p) => (p.id === id ? ({ ...p, ...partial } as Panel) : p)),
    }));
  }

  // Returns false when the panel would have pushed grid mode past
  // GRID_MAX_PANELS. Callers can surface a toast on false.
  addPanel(p: Panel, position?: number): boolean {
    if (this.state.layout === "grid" && this.state.panels.length >= GRID_MAX_PANELS) {
      return false;
    }
    this.set((c) => {
      const idx = position ?? c.panels.length;
      const panels = [...c.panels.slice(0, idx), p, ...c.panels.slice(idx)];
      const next = { ...c, panels, selectedId: p.id };
      if (next.layout === "grid") {
        const dims = gridDimsFor(panels.length);
        return ensureGridPositions({ ...next, gridRows: dims.rows, gridCols: dims.cols });
      }
      return next;
    });
    return true;
  }

  // Swap a panel for one of a different kind (e.g. dropping an image
  // onto a code panel). Keeps the slot's id, title, and grid position so
  // ordering, selection, and drag handlers stay stable.
  replacePanel(id: string, panel: Panel): void {
    this.set((c) => {
      const idx = c.panels.findIndex((p) => p.id === id);
      if (idx < 0) return c;
      const prev = c.panels[idx]!;
      const merged = {
        ...panel,
        id: prev.id,
        title: prev.title,
        gridRow: prev.gridRow,
        gridCol: prev.gridCol,
      } as Panel;
      const panels = c.panels.slice();
      panels[idx] = merged;
      return { ...c, panels, selectedId: prev.id };
    });
  }

  removePanel(id: string): void {
    this.set((c) => {
      const panels = c.panels.filter((p) => p.id !== id);
      const selectedId =
        c.selectedId === id ? panels[0]?.id ?? null : c.selectedId;
      const next = { ...c, panels, selectedId };
      if (next.layout === "grid") {
        const dims = gridDimsFor(panels.length);
        return ensureGridPositions({ ...next, gridRows: dims.rows, gridCols: dims.cols });
      }
      return next;
    });
  }

  movePanel(id: string, toIndex: number): void {
    this.set((c) => {
      const from = c.panels.findIndex((p) => p.id === id);
      if (from < 0) return c;
      const panels = c.panels.slice();
      const [item] = panels.splice(from, 1);
      panels.splice(Math.max(0, Math.min(toIndex, panels.length)), 0, item!);
      return { ...c, panels };
    });
  }

  select(id: string | null): void {
    this.set((c) => ({ ...c, selectedId: id }));
  }

  // Merge an override for the connector that starts after `fromId`.
  setArrow(fromId: string, partial: ArrowSpec): void {
    this.set((c) => ({
      ...c,
      arrows: { ...c.arrows, [fromId]: { ...c.arrows[fromId], ...partial } },
    }));
  }

  // Push one spec onto every connector (the "apply to all" affordance). A
  // color in the spec also becomes the new global default so future panels
  // inherit it.
  applyArrowToAll(spec: ArrowSpec): void {
    this.set((c) => {
      const arrows: Record<string, ArrowSpec> = {};
      for (let i = 0; i < c.panels.length - 1; i++) {
        arrows[c.panels[i]!.id] = { ...spec };
      }
      return { ...c, arrows, ...(spec.color ? { arrowColor: spec.color } : {}) };
    });
  }

  // Drop per-arrow color overrides so the global arrowColor wins again. Used
  // when a theme / custom color is picked — that acts as an apply-to-all.
  // Style overrides are preserved.
  clearArrowColorOverrides(): void {
    this.set((c) => {
      const arrows: Record<string, ArrowSpec> = {};
      for (const [id, spec] of Object.entries(c.arrows)) {
        if (spec.style) arrows[id] = { style: spec.style };
      }
      return { ...c, arrows };
    });
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
