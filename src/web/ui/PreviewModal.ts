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
  const progress = document.createElement("div");
  progress.className = "preview-modal-progress";
  const progressBar = document.createElement("div");
  progressBar.className = "preview-modal-progress-bar";
  progress.appendChild(progressBar);
  const loadingText = document.createElement("span");
  loadingText.className = "preview-modal-loading-text";
  loadingText.textContent = "Rendering…";
  // Label above the bar (download-toast style). The bar is hidden in the
  // plain card state, so order only matters in the overlay.
  loading.append(loadingText, progress);
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

  const setProgress = (fraction: number) => {
    const pct = Math.round(fraction * 100);
    progressBar.style.width = `${pct}%`;
    loadingText.textContent = `Rendering… ${pct}%`;
  };

  // Float the progress readout over the first frame (YouTube-style),
  // versus the standalone card shown before any frame is ready.
  const setLoadingOverlay = (overlay: boolean) => {
    loading.classList.toggle("preview-modal-loading--overlay", overlay);
  };

  const resetLoading = () => {
    setLoadingOverlay(false);
    progressBar.style.width = "0%";
    loadingText.textContent = "Rendering…";
    loading.hidden = false;
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
    resetLoading();
  });

  document.body.appendChild(dlg);

  return {
    async open() {
      resetLoading();
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
          // the user will download. While it renders, stream each
          // composed frame onto a backdrop canvas so the user watches
          // the render happen live, with the progress readout floated
          // on top (YouTube-style render page).
          let display: HTMLCanvasElement | null = null;
          let dctx: CanvasRenderingContext2D | null = null;
          try {
            display = await composeStill(comp);
            display.className = "preview-modal-img";
            display.style.imageRendering = "auto";
            dctx = display.getContext("2d");
            figure.insertBefore(display, toolbar);
            canvasSlot = display;
            setLoadingOverlay(true);
          } catch {
            // First frame failed to compose — fall back to the plain
            // progress card; the full render below still drives things.
          }
          // composeStill and the streamed frames share comp + scale, so
          // every frame matches the backdrop's dimensions exactly.
          const onFrame = (frame: HTMLCanvasElement) => {
            if (dctx && display && frame.width === display.width && frame.height === display.height) {
              dctx.drawImage(frame, 0, 0);
            }
          };
          const rendered = await renderForExport(comp, setProgress, onFrame);
          renderedBlob = rendered.blob;
          renderedExt = rendered.ext;
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = URL.createObjectURL(rendered.blob);
          img.src = currentUrl;
          img.hidden = false;
          // Swap the first-frame backdrop for the encoded (animated) result.
          if (canvasSlot) { canvasSlot.remove(); canvasSlot = null; }
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
        loadingText.textContent = `Render failed: ${(e as Error).message}`;
        loading.hidden = false;
      }
    },
  };
};
