import type { ImagePanel } from "../state";
import { makeImagePanel } from "../state";
import { nextBlobId, putBlob, resolveBlobUrl } from "../storage/blobStore";
import { probeAnimation } from "../render/motion";
import { sniffVideoFile, videoFileToAnimatedWebp, VIDEO_MAX_DURATION_S } from "../render/videoIngest";

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

type IngestBusy = { file: string; fraction: number };

const setIngestBusy = (state: IngestBusy | null): void => {
  let el = document.querySelector<HTMLDivElement>(".ingest-busy");
  if (!state) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.className = "ingest-busy";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `
      <div class="ingest-busy-card">
        <div class="ingest-busy-title">Converting video</div>
        <div class="ingest-busy-file" data-file></div>
        <div class="ingest-busy-phase" data-phase></div>
        <div class="ingest-busy-bar" aria-hidden="true"><div class="ingest-busy-bar-fill" data-bar></div></div>
        <div class="ingest-busy-note">Stays in your browser — nothing is uploaded</div>
      </div>
    `;
    document.body.appendChild(el);
  }
  const pct = Math.max(0, Math.min(100, Math.round(state.fraction * 100)));
  const phase = state.fraction < 0.7 ? "Reading frames" : "Encoding WebP";
  el.querySelector("[data-file]")!.textContent = state.file || "video";
  el.querySelector("[data-phase]")!.textContent = `${phase}… ${pct}%`;
  (el.querySelector("[data-bar]") as HTMLElement).style.width = `${pct}%`;
};

const ingestImageFile = async (file: File): Promise<ImagePanel | null> => {
  if (!file.type.startsWith("image/")) return null;
  const blobId = nextBlobId();
  await putBlob(blobId, file);
  const src = (await resolveBlobUrl(blobId)) ?? "";
  const dims = await loadDimensions(src);
  const animated = await probeAnimation(file).catch(() => false);
  return makeImagePanel(src, dims.w, dims.h, undefined, {
    blobId,
    mime: file.type,
    animated,
  });
};

export const fileToImagePanel = async (file: File): Promise<ImagePanel | null> => {
  if (await sniffVideoFile(file)) {
    try {
      setIngestBusy({ file: file.name, fraction: 0 });
      const result = await videoFileToAnimatedWebp(file, (f) => {
        setIngestBusy({ file: file.name, fraction: f });
      });
      if (result.truncated) showToast(`Using the first ${VIDEO_MAX_DURATION_S} seconds`);
      const webp = new File([result.blob], "clip.webp", { type: "image/webp" });
      return await ingestImageFile(webp);
    } catch (e) {
      showToast((e as Error).message || "Couldn't convert that video");
      return null;
    } finally {
      setIngestBusy(null);
    }
  }
  return ingestImageFile(file);
};

const loadDimensions = (src: string): Promise<{ w: number; h: number }> =>
  new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = reject;
    i.src = src;
  });

export const debounce = <T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number,
): ((...args: T) => void) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delayMs);
  };
};

const SUPPORTED_LANGS = [
  "auto", "python", "javascript", "typescript", "tsx", "jsx",
  "rust", "go", "java", "c", "cpp", "csharp",
  "ruby", "php", "swift", "kotlin", "scala",
  "html", "css", "scss", "json", "yaml", "toml", "xml",
  "bash", "shell", "powershell",
  "sql", "graphql",
  "markdown", "diff",
  "text",
] as const;

export const languageOptions = (): string[] => [...SUPPORTED_LANGS];

export const showToast = (msg: string): void => {
  let el = document.querySelector<HTMLDivElement>(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout((el as any)._t);
  (el as any)._t = window.setTimeout(() => el!.classList.remove("show"), 1800);
};
