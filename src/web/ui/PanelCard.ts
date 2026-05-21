import type { Store, Panel } from "../state";
import { createCodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { createCombobox } from "./Combobox";
import { fileToImagePanel, languageOptions } from "./util";
import { gripVertical, trash } from "./icons";
import type { Theme } from "../themes";

export type PanelCardHandle = {
  root: HTMLElement;
  update: (p: Panel) => void;
  setTheme: (t: Theme) => void;
};

export const createPanelCard = (store: Store, panel: Panel, theme: Theme): PanelCardHandle => {
  const root = document.createElement("div");
  root.className = `panel-card panel-card-${panel.kind}`;

  const header = document.createElement("div");
  header.className = "panel-card-header";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "Title (optional)";
  titleInput.value = panel.title ?? "";
  titleInput.className = "panel-card-title";
  titleInput.setAttribute("data-form-type", "other");
  titleInput.addEventListener("input", () => {
    store.patchPanel(panel.id, { title: titleInput.value || undefined });
  });
  header.appendChild(titleInput);

  const controls = document.createElement("div");
  controls.className = "panel-card-controls";

  let lang: ReturnType<typeof createCombobox> | null = null;
  let borderToggle: HTMLInputElement | null = null;
  if (panel.kind === "code") {
    lang = createCombobox({
      value: panel.language,
      options: languageOptions(),
      placeholder: "Language",
      ariaLabel: "Syntax language",
      onChange: (value) => {
        store.patchPanel(panel.id, { language: value });
        editor?.setLanguage(value);
      },
    });
    controls.appendChild(lang.root);
  } else {
    // Per-image "inner border" toggle. Off by default so a freshly added
    // image sits flush in the layout without an unrequested panel frame.
    // Rendered as a Google-style switch so it reads as a clear binary,
    // not a vestigial checkbox.
    const label = document.createElement("label");
    label.className = "panel-card-switch";
    label.title = "Wrap the image in a panel background";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!panel.innerBorder;
    cb.addEventListener("change", () => {
      store.patchPanel(panel.id, { innerBorder: cb.checked });
    });
    const track = document.createElement("span");
    track.className = "panel-card-switch-track";
    track.setAttribute("aria-hidden", "true");
    const txt = document.createElement("span");
    txt.className = "panel-card-switch-label";
    txt.textContent = "border";
    label.append(cb, track, txt);
    controls.appendChild(label);
    borderToggle = cb;
  }

  const grip = mkIconButton(gripVertical(), "Drag to reorder", "grip");
  const del = mkIconButton(trash(), "Remove panel", "danger");
  del.addEventListener("click", () => store.removePanel(panel.id));
  controls.append(grip, del);

  header.appendChild(controls);
  root.appendChild(header);

  let editor: CodeEditorHandle | null = null;
  const body = document.createElement("div");
  body.className = "panel-card-body";
  root.appendChild(body);

  let imageBody: HTMLElement | null = null;
  if (panel.kind === "code") {
    editor = createCodeEditor({
      initialCode: panel.code,
      initialLanguage: panel.language,
      theme,
      onChange: (code) => store.patchPanel(panel.id, { code }),
    });
    body.appendChild(editor.root);
  } else {
    imageBody = buildImageEditor(store, panel);
    imageBody.classList.toggle("bordered", !!panel.innerBorder);
    body.appendChild(imageBody);
  }

  return {
    root,
    update(p) {
      if (p.kind !== panel.kind) return; // kind changes are handled by recreate
      if (titleInput.value !== (p.title ?? "")) titleInput.value = p.title ?? "";
      if (p.kind === "code" && editor) {
        editor.setCode(p.code);
        editor.setLanguage(p.language);
        if (lang && lang.getValue() !== p.language) lang.setValue(p.language);
      }
      if (p.kind === "image" && imageBody) {
        imageBody.classList.toggle("bordered", !!p.innerBorder);
        if (borderToggle && borderToggle.checked !== !!p.innerBorder) {
          borderToggle.checked = !!p.innerBorder;
        }
      }
    },
    setTheme(t) {
      editor?.setTheme(t);
    },
  };
};

const mkIconButton = (
  icon: SVGSVGElement,
  title: string,
  variant?: string,
): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.appendChild(icon);
  b.title = title;
  b.setAttribute("aria-label", title);
  b.className = "icon-btn" + (variant ? " " + variant : "");
  if (variant === "grip") b.classList.add("panel-card-grip");
  return b;
};

const buildImageEditor = (store: Store, panel: Panel & { kind: "image" }): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "image-card-body";
  wrap.innerHTML = `
    <img alt="panel image" />
    <div class="image-card-overlay">
      <button type="button" class="icon-btn">Replace</button>
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/*" hidden />
      <div class="hint">drag & drop, paste, or click Replace<br/>png · jpeg · gif · webp · avif</div>
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
        blobId: next.blobId,
        mime: next.mime,
        animated: next.animated,
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
