import { ARROW_HEX, DEFAULT_BG_HEX } from "./render/colors";

export type Layout = "horizontal" | "vertical" | "grid";

export type CodePanel = {
  id: string;
  kind: "code";
  title?: string;
  code: string;
  language: string; // "auto" or a Shiki/CodeMirror language id
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
  gridRow?: number;
  gridCol?: number;
};

export type Panel = CodePanel | ImagePanel;

export type Composition = {
  panels: Panel[];
  layout: Layout;
  bgColor: string;     // hex
  arrowColor: string;  // hex
  scale: number;       // 1.0 - 3.0
  innerBorder: boolean; // when false → image panels get rounded corners, no inner panel bg
  gridRows: number;    // only used when layout === "grid"
  gridCols: number;    // only used when layout === "grid"
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
  scale: 2.0,
  innerBorder: true,
  gridRows: 2,
  gridCols: 2,
  selectedId: null,
});

export const defaultComposition = (): Composition => {
  const first = makeCodePanel({
    code: "def hello(name):\n    return f\"hello, {name}\"\n\nprint(hello(\"world\"))\n",
    language: "python",
    title: "before",
  });
  const second = makeCodePanel({
    code: "def hello(name: str) -> str:\n    return f\"hello, {name}\"\n\nprint(hello(\"world\"))\n",
    language: "python",
    title: "after",
  });
  return {
    panels: [first, second],
    layout: "vertical",
    bgColor: DEFAULT_BG_HEX,
    arrowColor: ARROW_HEX,
    scale: 2.0,
    innerBorder: true,
    gridRows: 2,
    gridCols: 2,
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
      // When entering grid mode (or resizing the grid), make sure every
      // panel has a (gridRow, gridCol) within bounds. Fill row-by-row.
      if (next.layout === "grid") {
        return ensureGridPositions(next);
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

  addPanel(p: Panel, position?: number): void {
    this.set((c) => {
      const idx = position ?? c.panels.length;
      const panels = [...c.panels.slice(0, idx), p, ...c.panels.slice(idx)];
      const next = { ...c, panels, selectedId: p.id };
      if (next.layout === "grid") return ensureGridPositions(next);
      return next;
    });
  }

  removePanel(id: string): void {
    this.set((c) => {
      const panels = c.panels.filter((p) => p.id !== id);
      const selectedId =
        c.selectedId === id ? panels[0]?.id ?? null : c.selectedId;
      return { ...c, panels, selectedId };
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

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
