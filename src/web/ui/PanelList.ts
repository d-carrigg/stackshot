import type { Store, Panel } from "../state";
import { makeCodePanel, makeImagePanel } from "../state";
import { fileToImagePanel } from "./util";

const labelFor = (p: Panel): string => {
  if (p.title) return p.title;
  if (p.kind === "code") {
    const first = p.code.split("\n")[0]?.trim() ?? "";
    return first ? first.slice(0, 32) : "(empty code)";
  }
  return "(image)";
};

export const mountPanelList = (root: HTMLElement, store: Store): void => {
  root.innerHTML = `
    <div class="section-header">Panels</div>
    <div class="panel-list"></div>
    <div class="add-buttons">
      <button data-add="code">+ Code</button>
      <button data-add="image">+ Image</button>
      <input type="file" accept="image/*" multiple hidden data-image-input />
    </div>
  `;

  const listEl = root.querySelector<HTMLDivElement>(".panel-list")!;
  const fileInput = root.querySelector<HTMLInputElement>('[data-image-input]')!;

  root.querySelector<HTMLButtonElement>('[data-add="code"]')!.addEventListener("click", () => {
    store.addPanel(makeCodePanel());
  });
  root.querySelector<HTMLButtonElement>('[data-add="image"]')!.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files) return;
    for (const f of Array.from(fileInput.files)) {
      const p = await fileToImagePanel(f);
      if (p) store.addPanel(p);
    }
    fileInput.value = "";
  });

  const render = () => {
    const c = store.get();
    listEl.innerHTML = "";
    c.panels.forEach((p, idx) => {
      const item = document.createElement("div");
      item.className = "panel-list-item" + (c.selectedId === p.id ? " selected" : "");
      item.draggable = true;
      item.dataset.index = String(idx);
      item.dataset.id = p.id;
      item.innerHTML = `
        <span class="kind">${p.kind === "code" ? "code" : "img"}</span>
        <span class="label"></span>
        <button class="delete" title="Remove panel" aria-label="Remove panel">×</button>
      `;
      item.querySelector(".label")!.textContent = labelFor(p);
      item.addEventListener("click", (ev) => {
        if ((ev.target as HTMLElement).classList.contains("delete")) return;
        store.select(p.id);
      });
      item.querySelector(".delete")!.addEventListener("click", (ev) => {
        ev.stopPropagation();
        store.removePanel(p.id);
      });
      // Drag reorder.
      item.addEventListener("dragstart", (ev) => {
        ev.dataTransfer!.setData("text/x-panel-id", p.id);
        ev.dataTransfer!.effectAllowed = "move";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      item.addEventListener("dragover", (ev) => {
        if (!ev.dataTransfer?.types.includes("text/x-panel-id")) return;
        ev.preventDefault();
        item.classList.add("drop-target");
      });
      item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
      item.addEventListener("drop", (ev) => {
        item.classList.remove("drop-target");
        const id = ev.dataTransfer?.getData("text/x-panel-id");
        if (!id || id === p.id) return;
        ev.preventDefault();
        store.movePanel(id, idx);
      });
      listEl.appendChild(item);
    });
    if (c.panels.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-pane";
      empty.textContent = "No panels yet. Add one below.";
      listEl.appendChild(empty);
    }
  };

  render();
  store.subscribe(render);
};
