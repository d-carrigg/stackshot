import type { Store } from "../state";
import { exportPng, copyPngToClipboard } from "../export";
import { showToast } from "./util";
import { clearPersisted } from "../persist";
import { defaultComposition, emptyComposition } from "../state";

export const mountSettingsPanel = (root: HTMLElement, store: Store): void => {
  root.innerHTML = `
    <div class="section-header" style="padding: 0 0 12px 0">Composition</div>

    <div class="setting">
      <label>Layout</label>
      <div class="seg" data-layout>
        <button data-val="horizontal">Horizontal</button>
        <button data-val="vertical">Vertical</button>
      </div>
    </div>

    <div class="setting">
      <label>Scale <span class="val" data-scale-val></span></label>
      <input type="range" min="1.0" max="3.0" step="0.5" data-scale />
    </div>

    <div class="setting">
      <label>Background</label>
      <div class="row"><input type="color" data-bg /></div>
    </div>

    <div class="setting">
      <label>Arrow color</label>
      <div class="row"><input type="color" data-arrow /></div>
    </div>

    <div class="setting">
      <label class="toggle">
        <input type="checkbox" data-border />
        <span>Inner panel border</span>
      </label>
    </div>

    <div class="actions">
      <button data-export>Export PNG</button>
      <button class="secondary" data-copy>Copy to clipboard</button>
      <div class="actions-row">
        <button class="secondary" data-clear>Clear</button>
        <button class="secondary" data-default>Default</button>
      </div>
    </div>
  `;

  const layoutSeg = root.querySelector<HTMLDivElement>("[data-layout]")!;
  const scale = root.querySelector<HTMLInputElement>("[data-scale]")!;
  const scaleVal = root.querySelector<HTMLSpanElement>("[data-scale-val]")!;
  const bg = root.querySelector<HTMLInputElement>("[data-bg]")!;
  const arrow = root.querySelector<HTMLInputElement>("[data-arrow]")!;
  const border = root.querySelector<HTMLInputElement>("[data-border]")!;
  const exportBtn = root.querySelector<HTMLButtonElement>("[data-export]")!;
  const copyBtn = root.querySelector<HTMLButtonElement>("[data-copy]")!;
  const clearBtn = root.querySelector<HTMLButtonElement>("[data-clear]")!;
  const defaultBtn = root.querySelector<HTMLButtonElement>("[data-default]")!;

  for (const btn of layoutSeg.querySelectorAll<HTMLButtonElement>("button")) {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val as "horizontal" | "vertical";
      store.patch({ layout: val });
    });
  }
  scale.addEventListener("input", () => store.patch({ scale: Number(scale.value) }));
  bg.addEventListener("input", () => store.patch({ bgColor: bg.value }));
  arrow.addEventListener("input", () => store.patch({ arrowColor: arrow.value }));
  border.addEventListener("change", () => store.patch({ innerBorder: border.checked }));

  exportBtn.addEventListener("click", async () => {
    try {
      await exportPng(store.get());
    } catch (e) {
      showToast(`Export failed: ${(e as Error).message}`);
    }
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await copyPngToClipboard(store.get());
      showToast("PNG copied to clipboard");
    } catch (e) {
      showToast(`Copy failed: ${(e as Error).message}`);
    }
  });
  clearBtn.addEventListener("click", () => {
    if (store.get().panels.length > 0 && !confirm("Remove all panels?")) return;
    clearPersisted();
    store.set(() => emptyComposition());
  });
  defaultBtn.addEventListener("click", () => {
    if (store.get().panels.length > 0 && !confirm("Replace the current composition with the default?")) return;
    clearPersisted();
    store.set(() => defaultComposition());
  });

  const render = () => {
    const c = store.get();
    for (const btn of layoutSeg.querySelectorAll<HTMLButtonElement>("button")) {
      btn.classList.toggle("active", btn.dataset.val === c.layout);
    }
    scale.value = String(c.scale);
    scaleVal.textContent = c.scale.toFixed(1) + "×";
    bg.value = c.bgColor;
    arrow.value = c.arrowColor;
    border.checked = c.innerBorder;
  };
  render();
  store.subscribe(render);
};
