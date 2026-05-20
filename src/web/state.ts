import { ARROW_HEX, DEFAULT_BG_HEX } from "./render/colors";

export type Layout = "horizontal" | "vertical";

export type CodePanel = {
  id: string;
  kind: "code";
  title?: string;
  code: string;
  language: string; // "auto" or a Shiki/CodeMirror language id
};

export type ImagePanel = {
  id: string;
  kind: "image";
  title?: string;
  src: string;        // data URL
  naturalW: number;
  naturalH: number;
};

export type Panel = CodePanel | ImagePanel;

export type Composition = {
  panels: Panel[];
  layout: Layout;
  bgColor: string;     // hex
  arrowColor: string;  // hex
  scale: number;       // 1.0 - 3.0
  innerBorder: boolean; // when false → image panels get rounded corners, no inner panel bg
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

export const makeImagePanel = (src: string, w: number, h: number, title?: string): ImagePanel => ({
  id: nextId(),
  kind: "image",
  src,
  naturalW: w,
  naturalH: h,
  title,
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
    layout: "horizontal",
    bgColor: DEFAULT_BG_HEX,
    arrowColor: ARROW_HEX,
    scale: 2.0,
    innerBorder: true,
    selectedId: first.id,
  };
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
    this.set((c) => ({ ...c, ...partial }));
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
      return { ...c, panels, selectedId: p.id };
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
