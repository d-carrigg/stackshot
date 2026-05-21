import type { ExportFormat, Store } from "../state";
import { exportImage, copyImageToClipboard, resolveExportFormat } from "../export";
import { showToast } from "./util";
import { clearPersisted } from "../persist";
import { defaultComposition, emptyComposition } from "../state";

export const mountSettingsPanel = (root: HTMLElement, store: Store): void => {
  root.innerHTML = `
    <div class="section-header" style="padding: 0 0 12px 0">Composition</div>

    <div class="setting" data-grid-only hidden>
      <label>Rows <span class="val" data-rows-val></span></label>
      <input type="range" min="1" max="4" step="1" data-rows />
    </div>
    <div class="setting" data-grid-only hidden>
      <label>Columns <span class="val" data-cols-val></span></label>
      <input type="range" min="1" max="4" step="1" data-cols />
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

    <div class="section-subhead">Image options</div>
    <div class="setting">
      <label class="toggle">
        <input type="checkbox" data-border />
        <span>Inner panel border</span>
      </label>
    </div>

    <div class="actions">
      <div class="setting" style="margin-bottom: 8px">
        <label>Format</label>
        <select data-format class="panel-card-lang" style="width: 100%">
          <option value="auto">Auto (PNG / animated WEBP)</option>
          <option value="png">PNG (static)</option>
          <option value="webp">WEBP (animated if input is)</option>
          <option value="gif">GIF (animated if input is)</option>
        </select>
      </div>
      <button data-export>Export</button>
      <button class="secondary" data-copy>Copy to clipboard</button>
      <div class="actions-row">
        <button class="secondary" data-clear>Clear</button>
        <button class="secondary" data-default>Default</button>
      </div>
    </div>
  `;

  const gridOnly = root.querySelectorAll<HTMLDivElement>("[data-grid-only]");
  const rowsInput = root.querySelector<HTMLInputElement>("[data-rows]")!;
  const rowsVal = root.querySelector<HTMLSpanElement>("[data-rows-val]")!;
  const colsInput = root.querySelector<HTMLInputElement>("[data-cols]")!;
  const colsVal = root.querySelector<HTMLSpanElement>("[data-cols-val]")!;
  const scale = root.querySelector<HTMLInputElement>("[data-scale]")!;
  const scaleVal = root.querySelector<HTMLSpanElement>("[data-scale-val]")!;
  const bg = root.querySelector<HTMLInputElement>("[data-bg]")!;
  const arrow = root.querySelector<HTMLInputElement>("[data-arrow]")!;
  const border = root.querySelector<HTMLInputElement>("[data-border]")!;
  const formatSelect = root.querySelector<HTMLSelectElement>("[data-format]")!;
  formatSelect.setAttribute("autocomplete", "off");
  formatSelect.setAttribute("data-1p-ignore", "true");
  const exportBtn = root.querySelector<HTMLButtonElement>("[data-export]")!;
  const copyBtn = root.querySelector<HTMLButtonElement>("[data-copy]")!;
  const clearBtn = root.querySelector<HTMLButtonElement>("[data-clear]")!;
  const defaultBtn = root.querySelector<HTMLButtonElement>("[data-default]")!;

  rowsInput.addEventListener("input", () => store.patch({ gridRows: Number(rowsInput.value) }));
  colsInput.addEventListener("input", () => store.patch({ gridCols: Number(colsInput.value) }));
  scale.addEventListener("input", () => store.patch({ scale: Number(scale.value) }));
  bg.addEventListener("input", () => store.patch({ bgColor: bg.value }));
  arrow.addEventListener("input", () => store.patch({ arrowColor: arrow.value }));
  border.addEventListener("change", () => store.patch({ innerBorder: border.checked }));
  formatSelect.addEventListener("change", () =>
    store.patch({ exportFormat: formatSelect.value as ExportFormat }),
  );

  exportBtn.addEventListener("click", async () => {
    try {
      await exportImage(store.get());
    } catch (e) {
      showToast(`Export failed: ${(e as Error).message}`);
    }
  });
  copyBtn.addEventListener("click", async () => {
    try {
      await copyImageToClipboard(store.get());
      showToast("Copied to clipboard");
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
    const isGrid = c.layout === "grid";
    for (const el of gridOnly) el.hidden = !isGrid;
    rowsInput.value = String(c.gridRows);
    rowsVal.textContent = String(c.gridRows);
    colsInput.value = String(c.gridCols);
    colsVal.textContent = String(c.gridCols);
    scale.value = String(c.scale);
    scaleVal.textContent = c.scale.toFixed(1) + "×";
    bg.value = c.bgColor;
    arrow.value = c.arrowColor;
    border.checked = c.innerBorder;
    formatSelect.value = c.exportFormat;
    // Surface what Export will actually produce ("Auto" resolves to
    // PNG or WEBP based on whether motion content is present).
    const resolved = resolveExportFormat(c).toUpperCase();
    exportBtn.textContent = `Export ${resolved}`;
  };
  render();
  store.subscribe(render);
};
