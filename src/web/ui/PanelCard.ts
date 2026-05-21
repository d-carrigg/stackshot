import type { Store, Panel } from "../state";
import { createCodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { fileToImagePanel, languageOptions } from "./util";

export type PanelCardHandle = {
  root: HTMLElement;
  update: (p: Panel) => void;
};

export const createPanelCard = (store: Store, panel: Panel): PanelCardHandle => {
  const root = document.createElement("div");
  root.className = `panel-card panel-card-${panel.kind}`;

  const header = document.createElement("div");
  header.className = "panel-card-header";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Title (optional)";
  titleInput.value = panel.title ?? "";
  titleInput.className = "panel-card-title";
  titleInput.addEventListener("input", () => {
    store.patchPanel(panel.id, { title: titleInput.value || undefined });
  });
  header.appendChild(titleInput);

  const controls = document.createElement("div");
  controls.className = "panel-card-controls";

  if (panel.kind === "code") {
    const langSelect = document.createElement("select");
    langSelect.className = "panel-card-lang";
    for (const lang of languageOptions()) {
      const opt = document.createElement("option");
      opt.value = lang;
      opt.textContent = lang;
      langSelect.appendChild(opt);
    }
    langSelect.value = panel.language;
    langSelect.addEventListener("change", () => {
      store.patchPanel(panel.id, { language: langSelect.value });
      editor?.setLanguage(langSelect.value);
    });
    controls.appendChild(langSelect);
  }

  const moveLeft = mkIconButton("‹", "Move earlier");
  const moveRight = mkIconButton("›", "Move later");
  const del = mkIconButton("×", "Remove panel", "danger");
  moveLeft.addEventListener("click", () => {
    const idx = store.get().panels.findIndex((p) => p.id === panel.id);
    if (idx > 0) store.movePanel(panel.id, idx - 1);
  });
  moveRight.addEventListener("click", () => {
    const c = store.get();
    const idx = c.panels.findIndex((p) => p.id === panel.id);
    if (idx >= 0 && idx < c.panels.length - 1) store.movePanel(panel.id, idx + 1);
  });
  del.addEventListener("click", () => store.removePanel(panel.id));
  controls.append(moveLeft, moveRight, del);

  header.appendChild(controls);
  root.appendChild(header);

  let editor: CodeEditorHandle | null = null;
  const body = document.createElement("div");
  body.className = "panel-card-body";
  root.appendChild(body);

  if (panel.kind === "code") {
    editor = createCodeEditor({
      initialCode: panel.code,
      initialLanguage: panel.language,
      onChange: (code) => store.patchPanel(panel.id, { code }),
    });
    body.appendChild(editor.root);
  } else {
    body.appendChild(buildImageEditor(store, panel));
  }

  return {
    root,
    update(p) {
      if (p.kind !== panel.kind) return; // kind changes are handled by recreate
      if (titleInput.value !== (p.title ?? "")) titleInput.value = p.title ?? "";
      if (p.kind === "code" && editor) {
        editor.setCode(p.code);
        editor.setLanguage(p.language);
      }
    },
  };
};

const mkIconButton = (label: string, title: string, variant?: string): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.className = "icon-btn" + (variant ? " " + variant : "");
  return b;
};

const buildImageEditor = (store: Store, panel: Panel & { kind: "image" }): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "image-card-body";
  wrap.innerHTML = `
    <img alt="panel image" />
    <div class="image-card-overlay">
      <button type="button" class="icon-btn">Replace</button>
      <input type="file" accept="image/*" hidden />
      <div class="hint">drag & drop, paste, or click Replace</div>
    </div>
  `;
  const img = wrap.querySelector<HTMLImageElement>("img")!;
  const btn = wrap.querySelector<HTMLButtonElement>("button")!;
  const fileInput = wrap.querySelector<HTMLInputElement>('input[type="file"]')!;
  img.src = panel.src;

  const applyFile = async (f: File) => {
    const next = await fileToImagePanel(f);
    if (next) {
      store.patchPanel(panel.id, {
        src: next.src,
        naturalW: next.naturalW,
        naturalH: next.naturalH,
      });
    }
  };

  btn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) applyFile(f);
  });
  wrap.addEventListener("dragover", (e) => {
    e.preventDefault();
    wrap.classList.add("drag-over");
  });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("drag-over"));
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    wrap.classList.remove("drag-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) applyFile(f);
  });
  return wrap;
};
