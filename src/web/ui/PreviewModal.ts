// Preview modal — opens a native <dialog> with the current composition
// rendered as an image. Keeps the editor view untouched; users get a
// 1:1 sanity check before exporting. Reuses composeCanvas() and the
// existing export helpers.
import type { Store } from "../state";
import { renderForExport, exportImage, copyImageToClipboard } from "../export";
import { showToast } from "./util";
import { x as xIcon, download as dlIcon, clipboard as clipIcon } from "./icons";

export type PreviewModalHandle = {
  open: () => Promise<void>;
};

export const mountPreviewModal = (store: Store): PreviewModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "preview-modal";
  dlg.innerHTML = `
    <div class="preview-modal-header">
      <span class="preview-modal-title">Preview</span>
      <div class="preview-modal-actions">
        <button type="button" class="preview-modal-btn" data-action="download" title="Download">
          <span class="ico"></span><span>Download</span>
        </button>
        <button type="button" class="preview-modal-btn" data-action="copy" title="Copy to clipboard">
          <span class="ico"></span><span>Copy</span>
        </button>
        <button type="button" class="icon-btn" data-action="close" title="Close" aria-label="Close"></button>
      </div>
    </div>
    <div class="preview-modal-body">
      <div class="preview-modal-loading">Rendering…</div>
      <img class="preview-modal-img" alt="composition preview" hidden />
    </div>
  `;

  const dlBtn = dlg.querySelector<HTMLButtonElement>('[data-action="download"]')!;
  const copyBtn = dlg.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  const closeBtn = dlg.querySelector<HTMLButtonElement>('[data-action="close"]')!;
  dlBtn.querySelector(".ico")!.appendChild(dlIcon());
  copyBtn.querySelector(".ico")!.appendChild(clipIcon());
  closeBtn.appendChild(xIcon());

  const loading = dlg.querySelector<HTMLDivElement>(".preview-modal-loading")!;
  const img = dlg.querySelector<HTMLImageElement>(".preview-modal-img")!;
  let currentUrl: string | null = null;

  closeBtn.addEventListener("click", () => dlg.close());
  // Click outside closes.
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
