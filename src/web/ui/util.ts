import type { ImagePanel } from "../state";
import { makeImagePanel } from "../state";
import { nextBlobId, putBlob, resolveBlobUrl } from "../storage/blobStore";
import { probeAnimation } from "../render/motion";

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export const fileToImagePanel = async (file: File): Promise<ImagePanel | null> => {
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
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout((el as any)._t);
  (el as any)._t = window.setTimeout(() => el!.classList.remove("show"), 1800);
};
