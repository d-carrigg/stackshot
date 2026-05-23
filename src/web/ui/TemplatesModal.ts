// Templates modal — a card grid of starter compositions. Each card
// shows a live thumbnail rendered from the template itself, plus a
// label and short description. Picking a card replaces the current
// composition (with confirm when the canvas isn't empty).
import type { Store, Composition } from "../state";
import { TEMPLATES, buildTemplate, type TemplateId } from "../templates";
import { composeStill } from "../render/frames";
import { x as xIcon } from "./icons";
import { clearPersisted } from "../persist";

export type TemplatesModalHandle = {
  open: () => void;
};

// Thumbnails are expensive — rendering pulls in shiki + image blobs.
// Cache once they've been generated; reuse across opens.
const thumbCache = new Map<TemplateId, string>();

const renderThumbnail = async (id: TemplateId): Promise<string> => {
  const cached = thumbCache.get(id);
  if (cached) return cached;
  const comp: Composition = await buildTemplate(id);
  // Force a small scale so thumbnail rendering is cheap.
  const small = { ...comp, scale: 1.5 };
  const canvas = await composeStill(small);
  const url = await new Promise<string>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85,
    ),
  );
  thumbCache.set(id, url);
  return url;
};

export const mountTemplatesModal = (store: Store): TemplatesModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "templates-modal";
  dlg.setAttribute("aria-labelledby", "templates-modal-title");

  const header = document.createElement("div");
  header.className = "templates-modal-header";
  const title = document.createElement("h2");
  title.id = "templates-modal-title";
  title.textContent = "Templates";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.title = "Close";
  closeBtn.appendChild(xIcon());
  header.append(title, closeBtn);

  const grid = document.createElement("div");
  grid.className = "templates-modal-grid";

  // Build cards once; thumbnails populate on open.
  type CardRefs = { thumb: HTMLImageElement; spinner: HTMLElement };
  const cardRefs = new Map<TemplateId, CardRefs>();
  for (const tpl of TEMPLATES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "template-card";
    card.dataset.tplId = tpl.id;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "template-card-thumb";
    const spinner = document.createElement("span");
    spinner.className = "template-card-spinner";
    spinner.setAttribute("role", "status");
    spinner.textContent = "Rendering…";
    const thumb = document.createElement("img");
    thumb.alt = `${tpl.label} preview`;
    thumb.hidden = true;
    thumbWrap.append(spinner, thumb);

    const meta = document.createElement("div");
    meta.className = "template-card-meta";
    const label = document.createElement("div");
    label.className = "template-card-label";
    label.textContent = tpl.label;
    const desc = document.createElement("div");
    desc.className = "template-card-desc";
    desc.textContent = tpl.description;
    meta.append(label, desc);

    card.append(thumbWrap, meta);
    card.addEventListener("click", async () => {
      const cur = store.get();
      if (cur.panels.length > 0 && !confirm(`Replace the current composition with the "${tpl.label}" template?`)) {
        return;
      }
      try {
        const next = await buildTemplate(tpl.id);
        clearPersisted();
        store.set(() => next);
        dlg.close();
      } catch (e) {
        // Surface failure in-place rather than silently swallowing.
        spinner.hidden = false;
        spinner.textContent = `Failed: ${(e as Error).message}`;
      }
    });
    grid.appendChild(card);
    cardRefs.set(tpl.id, { thumb, spinner });
  }

  dlg.append(header, grid);
  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  document.body.appendChild(dlg);

  return {
    open() {
      dlg.showModal();
      // Lazy-render thumbnails on first open (and any open where they
      // weren't cached).
      for (const tpl of TEMPLATES) {
        const refs = cardRefs.get(tpl.id)!;
        if (!refs.thumb.hidden && refs.thumb.src) continue;
        refs.spinner.hidden = false;
        refs.spinner.textContent = "Rendering…";
        refs.thumb.hidden = true;
        renderThumbnail(tpl.id)
          .then((url) => {
            refs.thumb.src = url;
            refs.thumb.hidden = false;
            refs.spinner.hidden = true;
          })
          .catch((e: Error) => {
            refs.spinner.textContent = `Preview unavailable: ${e.message}`;
          });
      }
    },
  };
};
