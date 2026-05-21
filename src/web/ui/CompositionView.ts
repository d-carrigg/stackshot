// Center pane: cards arranged matching the composition layout (horizontal
// row or vertical stack), with SVG arrows between them and an "add panel"
// affordance at the end.
import type { Store } from "../state";
import { makeCodePanel } from "../state";
import { createPanelCard } from "./PanelCard";
import { eye as eyeIcon } from "./icons";

export type CompositionViewOptions = {
  onPreview?: () => void;
};

export const mountCompositionView = (
  root: HTMLElement,
  store: Store,
  opts: CompositionViewOptions = {},
): void => {
  root.innerHTML = `
    <div class="composition-scroll">
      <div class="composition" data-layout="horizontal">
        <div class="composition-panels"></div>
      </div>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>(".composition")!;
  const panelsRow = stage.querySelector<HTMLDivElement>(".composition-panels")!;

  const render = () => {
    const c = store.get();
    stage.dataset.layout = c.layout;
    stage.style.setProperty("--bg", c.bgColor);
    stage.style.setProperty("--arrow", c.arrowColor);

    // Full rebuild each time keeps this code dead-simple and the perf is
    // fine at the panel counts we expect (handfuls, not hundreds). The
    // textarea inside CodeEditor is recreated, so focus is lost on every
    // store change — to avoid that, skip rebuilds when only ids/order
    // changed and the panel set is identical.
    //
    // Layout is baked into the signature so toggling horizontal/vertical
    // forces the arrow SVGs (which differ per orientation) to be
    // recreated.
    // Signature includes grid dimensions and per-panel grid positions
    // so a swap forces re-layout. For grid, we re-render the cell
    // skeleton each pass; for other layouts we use the simpler row.
    const gridSig =
      c.layout === "grid"
        ? `:${c.gridRows}x${c.gridCols}:` +
          c.panels.map((p) => `${p.id}@${p.gridRow ?? "-"},${p.gridCol ?? "-"}`).join("|")
        : "";
    const desired = c.layout + ":" + c.panels.map((p) => p.id).join("|") + gridSig;
    if (stage.dataset.signature === desired) {
      const cards = panelsRow.querySelectorAll<HTMLElement>(".panel-card");
      cards.forEach((cardEl, i) => {
        const panel = c.panels[i];
        if (!panel) return;
        const update = (cardEl as any)._update;
        update?.(panel);
      });
      return;
    }
    stage.dataset.signature = desired;
    panelsRow.innerHTML = "";
    Array.from(stage.children).forEach((el) => {
      if (el !== panelsRow) el.remove();
    });

    if (c.layout === "grid") {
      panelsRow.style.gridTemplateColumns = `repeat(${c.gridCols}, minmax(0, 1fr))`;
      panelsRow.style.gridTemplateRows = `repeat(${c.gridRows}, auto)`;
    } else {
      panelsRow.style.gridTemplateColumns = "";
      panelsRow.style.gridTemplateRows = "";
    }

    if (c.panels.length === 0) {
      const empty = document.createElement("div");
      empty.className = "composition-empty";
      empty.innerHTML = `<p>No panels yet.</p><p class="hint">Paste code/images, drag files here, or use the buttons below.</p>`;
      panelsRow.appendChild(empty);
    } else if (c.layout === "grid") {
      c.panels.forEach((p) => {
        const handle = createPanelCard(store, p);
        (handle.root as any)._update = handle.update;
        if (p.gridRow !== undefined && p.gridCol !== undefined) {
          handle.root.style.gridRow = String(p.gridRow + 1);
          handle.root.style.gridColumn = String(p.gridCol + 1);
        }
        attachGridDragHandlers(handle.root, p.id, store);
        panelsRow.appendChild(handle.root);
      });
    } else {
      const seqLayout = c.layout as "horizontal" | "vertical";
      c.panels.forEach((p, i) => {
        const handle = createPanelCard(store, p);
        (handle.root as any)._update = handle.update;
        panelsRow.appendChild(handle.root);
        if (i < c.panels.length - 1) {
          panelsRow.appendChild(buildArrow(seqLayout));
        }
      });
    }

    stage.appendChild(buildAddRow(store, opts.onPreview));
  };

  render();
  store.subscribe(render);
};

// HTML5 drag/drop swap for grid mode: drag a card onto another card's
// header to swap their (gridRow, gridCol). Drag handle is the whole
// card; we ignore drag attempts that start inside inputs/textareas so
// editing text still works.
const attachGridDragHandlers = (el: HTMLElement, panelId: string, store: import("../state").Store): void => {
  el.draggable = true;
  el.dataset.panelId = panelId;
  el.addEventListener("dragstart", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData("text/x-panel-id", panelId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("dragging"));
  el.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("text/x-panel-id")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drop-target");
    }
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop-target");
    const fromId = e.dataTransfer?.getData("text/x-panel-id");
    if (!fromId || fromId === panelId) return;
    e.preventDefault();
    const c = store.get();
    const a = c.panels.find((p) => p.id === fromId);
    const b = c.panels.find((p) => p.id === panelId);
    if (!a || !b) return;
    store.patchPanel(a.id, { gridRow: b.gridRow, gridCol: b.gridCol });
    store.patchPanel(b.id, { gridRow: a.gridRow, gridCol: a.gridCol });
  });
};

const buildArrow = (layout: "horizontal" | "vertical"): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "composition-arrow";
  if (layout === "horizontal") {
    wrap.innerHTML = `
      <svg viewBox="0 0 90 22" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d="M0 11 H72 M62 4 L80 11 L62 18 Z"
              fill="var(--arrow)" stroke="var(--arrow)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    `;
  } else {
    wrap.innerHTML = `
      <svg viewBox="0 0 22 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d="M11 0 V42 M4 32 L11 50 L18 32 Z"
              fill="var(--arrow)" stroke="var(--arrow)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    `;
  }
  return wrap;
};

const buildAddRow = (store: Store, onPreview?: () => void): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "composition-add-row";
  wrap.innerHTML = `
    <button type="button" data-add="code">+ code</button>
    <button type="button" data-add="image">+ image</button>
    <button type="button" class="composition-preview" data-preview>
      <span class="ico"></span><span>Preview</span>
    </button>
    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/*" multiple hidden />
  `;
  const previewBtn = wrap.querySelector<HTMLButtonElement>("[data-preview]")!;
  previewBtn.querySelector(".ico")!.appendChild(eyeIcon());
  previewBtn.addEventListener("click", () => onPreview?.());
  if (!onPreview) previewBtn.remove();
  const codeBtn = wrap.querySelector<HTMLButtonElement>('[data-add="code"]')!;
  const imgBtn = wrap.querySelector<HTMLButtonElement>('[data-add="image"]')!;
  const fileInput = wrap.querySelector<HTMLInputElement>('input[type="file"]')!;
  codeBtn.addEventListener("click", () => store.addPanel(makeCodePanel()));
  imgBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files) return;
    const { fileToImagePanel } = await import("./util");
    for (const f of Array.from(fileInput.files)) {
      const p = await fileToImagePanel(f);
      if (p) store.addPanel(p);
    }
    fileInput.value = "";
  });
  return wrap;
};
