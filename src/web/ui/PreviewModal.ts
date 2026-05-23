// Preview modal — opens a native <dialog> with the current composition
// rendered as an image. Minimal chrome: copy at top-left of the image,
// download + close at top-right. The dialog shrink-wraps the image so
// there's no surplus space.
//
// Static compositions display the raw HTMLCanvasElement directly to
// avoid the lossy WEBP round-trip the export path applies — what you
// see here is the true rendered pixel output. Animated compositions
// still flow through renderForExport because canvas alone can't play
// a multi-frame animation.
import type { Store } from "../state";
import { renderForExport, exportImage, copyImageToClipboard, saveBlob } from "../export";
import { composeStill, hasAnimatedPanel } from "../render/frames";
import { showToast } from "./util";
import { x as xIcon, download as dlIcon, clipboard as clipIcon } from "./icons";

export type PreviewModalHandle = {
  open: () => Promise<void>;
};

const mkOverlayButton = (
  title: string,
  icon: SVGSVGElement,
): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "preview-modal-overlay";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.appendChild(icon);
  return b;
};

export const mountPreviewModal = (store: Store): PreviewModalHandle => {
  const dlg = document.createElement("dialog");
  dlg.className = "preview-modal";
  dlg.setAttribute("aria-label", "Composition preview");
  // The image is the dialog. A single icon toolbar sits at the top-right.
  const figure = document.createElement("div");
  figure.className = "preview-modal-figure";
  const loading = document.createElement("div");
  loading.className = "preview-modal-loading";
  loading.setAttribute("role", "status");
  loading.textContent = "Rendering…";
  const img = document.createElement("img");
  img.className = "preview-modal-img";
  img.alt = "composition preview";
  img.hidden = true;
  // Slot for the raw canvas (static previews — no encoding round-trip).
  // Replaced each open() so we never keep stale canvases around.
  let canvasSlot: HTMLCanvasElement | null = null;
  const toolbar = document.createElement("div");
  toolbar.className = "preview-modal-toolbar";
  const copyBtn = mkOverlayButton("Copy to clipboard", clipIcon());
  const dlBtn = mkOverlayButton("Download", dlIcon());
  const closeBtn = mkOverlayButton("Close", xIcon());
  toolbar.append(copyBtn, dlBtn, closeBtn);
  figure.append(loading, img, toolbar);
  dlg.appendChild(figure);

  let currentUrl: string | null = null;
  // The blob produced for the current preview (animated path), reused by
  // Download so we don't encode a second time. null for static previews
  // (which show the raw canvas) — those re-encode on download.
  let renderedBlob: Blob | null = null;
  let renderedExt = "png";

  const setBusy = (busy: boolean) => {
    copyBtn.disabled = busy;
    dlBtn.disabled = busy;
  };

  closeBtn.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });

  dlBtn.addEventListener("click", async () => {
    try {
      if (renderedBlob) saveBlob(renderedBlob, renderedExt);
      else await exportImage(store.get());
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
    if (canvasSlot) {
      canvasSlot.remove();
      canvasSlot = null;
    }
    renderedBlob = null;
    loading.textContent = "Rendering…";
    loading.hidden = false;
  });

  document.body.appendChild(dlg);

  return {
    async open() {
      loading.textContent = "Rendering…";
      loading.hidden = false;
      img.hidden = true;
      renderedBlob = null;
      setBusy(true);
      if (canvasSlot) { canvasSlot.remove(); canvasSlot = null; }
      dlg.showModal();
      try {
        const comp = store.get();
        const animated = hasAnimatedPanel(comp);
        if (animated) {
          // Animated → go through the export encoder so the modal can
          // actually play the result. Slightly lossy but matches what
          // the user will download.
          const rendered = await renderForExport(comp, (f) => {
            loading.textContent = `Rendering… ${Math.round(f * 100)}%`;
          });
          renderedBlob = rendered.blob;
          renderedExt = rendered.ext;
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = URL.createObjectURL(rendered.blob);
          img.src = currentUrl;
          img.hidden = false;
        } else {
          // Static → show the raw canvas. No PNG/WEBP encode, no
          // perceived blur from lossy compression.
          const canvas = await composeStill(comp);
          canvas.className = "preview-modal-img";
          // Hint the browser to use a quality-focused downscale when
          // CSS shrinks the canvas to fit the viewport.
          canvas.style.imageRendering = "auto";
          figure.insertBefore(canvas, toolbar);
          canvasSlot = canvas;
        }
        loading.hidden = true;
        dlBtn.disabled = false;
        // Animated content can't be copied (clipboard only holds a still) —
        // leave Copy disabled and point users to Download.
        copyBtn.disabled = animated;
        copyBtn.title = animated ? "Animated content can only be downloaded, not copied" : "Copy to clipboard";
        copyBtn.setAttribute("aria-label", copyBtn.title);
      } catch (e) {
        loading.textContent = `Render failed: ${(e as Error).message}`;
      }
    },
  };
};
