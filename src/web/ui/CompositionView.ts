// Center pane: cards arranged matching the composition layout (horizontal
// row or vertical stack), with SVG arrows between them and an "add panel"
// affordance at the end.
import type { Store } from "../state";
import { makeCodePanel } from "../state";
import { createPanelCard } from "./PanelCard";

export const mountCompositionView = (root: HTMLElement, store: Store): void => {
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
    const desired = c.layout + ":" + c.panels.map((p) => p.id).join("|");
    if (stage.dataset.signature === desired) {
      // In-place update each card.
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
    // Drop the old add-row (anything that isn't the panels container).
    Array.from(stage.children).forEach((el) => {
      if (el !== panelsRow) el.remove();
    });

    if (c.panels.length === 0) {
      const empty = document.createElement("div");
      empty.className = "composition-empty";
      empty.innerHTML = `<p>No panels yet.</p><p class="hint">Paste code/images, drag files here, or use the buttons below.</p>`;
      panelsRow.appendChild(empty);
    } else {
      c.panels.forEach((p, i) => {
        const handle = createPanelCard(store, p);
        (handle.root as any)._update = handle.update;
        panelsRow.appendChild(handle.root);
        if (i < c.panels.length - 1) {
          panelsRow.appendChild(buildArrow(c.layout));
        }
      });
    }

    stage.appendChild(buildAddRow(store));
  };

  render();
  store.subscribe(render);
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

const buildAddRow = (store: Store): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "composition-add-row";
  wrap.innerHTML = `
    <button type="button" data-add="code">+ code</button>
    <button type="button" data-add="image">+ image</button>
    <input type="file" accept="image/*" multiple hidden />
  `;
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
