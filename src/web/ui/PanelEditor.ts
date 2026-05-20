import type { Store, Panel } from "../state";
import { fileToImagePanel, languageOptions } from "./util";

export const mountPanelEditor = (root: HTMLElement, store: Store): void => {
  const render = () => {
    const c = store.get();
    const panel = c.panels.find((p) => p.id === c.selectedId) ?? null;
    if (!panel) {
      root.innerHTML = `<div class="empty-pane">Select or create a panel to edit.</div>`;
      return;
    }
    if (panel.kind === "code") renderCode(root, store, panel);
    else renderImage(root, store, panel);
  };
  render();
  store.subscribe(render);
};

const renderCode = (root: HTMLElement, store: Store, panel: Panel & { kind: "code" }) => {
  root.innerHTML = `
    <div class="editor-pane">
      <div class="row">
        <input type="text" placeholder="Title (optional)" />
        <select></select>
      </div>
      <textarea spellcheck="false" wrap="off"></textarea>
    </div>
  `;
  const titleInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
  const langSelect = root.querySelector<HTMLSelectElement>("select")!;
  const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;

  for (const lang of languageOptions()) {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = lang;
    langSelect.appendChild(opt);
  }

  titleInput.value = panel.title ?? "";
  langSelect.value = panel.language;
  ta.value = panel.code;

  titleInput.addEventListener("input", () => {
    store.patchPanel(panel.id, { title: titleInput.value || undefined });
  });
  langSelect.addEventListener("change", () => {
    store.patchPanel(panel.id, { language: langSelect.value });
  });
  ta.addEventListener("input", () => {
    store.patchPanel(panel.id, { code: ta.value });
  });
  // Tab key inserts spaces instead of changing focus.
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const insert = "    ";
      ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + insert.length;
      store.patchPanel(panel.id, { code: ta.value });
    }
  });
};

const renderImage = (root: HTMLElement, store: Store, panel: Panel & { kind: "image" }) => {
  root.innerHTML = `
    <div class="editor-pane">
      <div class="row">
        <input type="text" placeholder="Title (optional)" />
      </div>
      <div class="image-dropzone has-image">
        <img alt="panel preview" />
        <button>Replace image</button>
        <input type="file" accept="image/*" hidden />
      </div>
    </div>
  `;
  const titleInput = root.querySelector<HTMLInputElement>('input[type="text"]')!;
  const dz = root.querySelector<HTMLDivElement>(".image-dropzone")!;
  const img = root.querySelector<HTMLImageElement>("img")!;
  const replaceBtn = root.querySelector<HTMLButtonElement>("button")!;
  const fileInput = root.querySelector<HTMLInputElement>('input[type="file"]')!;

  titleInput.value = panel.title ?? "";
  img.src = panel.src;

  titleInput.addEventListener("input", () => {
    store.patchPanel(panel.id, { title: titleInput.value || undefined });
  });
  replaceBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const newPanel = await fileToImagePanel(f);
    if (newPanel) {
      store.patchPanel(panel.id, {
        src: newPanel.src,
        naturalW: newPanel.naturalW,
        naturalH: newPanel.naturalH,
      });
    }
  });
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("drag-over");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
  dz.addEventListener("drop", async (e) => {
    e.preventDefault();
    dz.classList.remove("drag-over");
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const newPanel = await fileToImagePanel(f);
    if (newPanel) {
      store.patchPanel(panel.id, {
        src: newPanel.src,
        naturalW: newPanel.naturalW,
        naturalH: newPanel.naturalH,
      });
    }
  });
};
