// Preview modal — opens a native <dialog> with the current composition
// rendered as an image. Minimal chrome: copy at top-left of the image,
// download + close at top-right. The dialog shrink-wraps the image so
// there's no surplus space.
import type { Store } from "../state";
import { renderForExport, exportImage, copyImageToClipboard } from "../export";
import { showToast } from "./util";
import { x as xIcon, download as dlIcon, clipboard as clipIcon } from "./icons";

export type PreviewModalHandle = {
  open: () => Promise<void>;
};

const mkOverlayButton = (
  position: string,
  title: string,
  icon: SVGSVGElement,
): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `preview-modal-overlay ${position}`;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.appendChild(icon);
  return b;
};

export const mountPreviewModal = (store: Store): PreviewModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "preview-modal";
  // The image is the dialog. Buttons float over its corners.
  const figure = document.createElement("div");
  figure.className = "preview-modal-figure";
  const loading = document.createElement("div");
  loading.className = "preview-modal-loading";
  loading.textContent = "Rendering…";
  const img = document.createElement("img");
  img.className = "preview-modal-img";
  img.alt = "composition preview";
  img.hidden = true;
  const copyBtn = mkOverlayButton("top-left", "Copy to clipboard", clipIcon());
  const dlBtn = mkOverlayButton("top-right-2", "Download", dlIcon());
  const closeBtn = mkOverlayButton("top-right", "Close", xIcon());
  figure.append(loading, img, copyBtn, dlBtn, closeBtn);
  dlg.appendChild(figure);

  let currentUrl: string | null = null;

  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  dlBtn.addEventListener("click", async () => {
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

  dlg.addEventListener("close", () => {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
    img.hidden = true;
    img.removeAttribute("src");
    loading.hidden = false;
  });

  document.body.appendChild(dlg);

  return {
    async open() {
      loading.hidden = false;
      img.hidden = true;
      dlg.showModal();
      try {
        const rendered = await renderForExport(store.get());
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = URL.createObjectURL(rendered.blob);
        img.src = currentUrl;
        img.hidden = false;
        loading.hidden = true;
      } catch (e) {
        loading.textContent = `Render failed: ${(e as Error).message}`;
      }
    },
  };
};
