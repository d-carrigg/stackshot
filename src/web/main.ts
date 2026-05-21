import "./ui/styles.css";

import { Store, defaultComposition, makeCodePanel } from "./state";
import { mountCompositionView } from "./ui/CompositionView";
import { mountSettingsPanel } from "./ui/SettingsPanel";
import { mountTopbar } from "./ui/Topbar";
import { mountPreviewModal } from "./ui/PreviewModal";
import { fileToImagePanel, debounce } from "./ui/util";
import { load as loadPersisted, save as savePersisted } from "./persist";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <div id="topbar"></div>
  <main class="center" id="composition"></main>
  <aside class="right" id="settings"></aside>
`;

const initial = (await loadPersisted()) ?? defaultComposition();
const store = new Store(initial);

const topbar = mountTopbar(document.getElementById("topbar")!, store);
mountCompositionView(document.getElementById("composition")!, store);
mountSettingsPanel(document.getElementById("settings")!, store);
const preview = mountPreviewModal(store);
topbar.onPreview(() => preview.open());

// Auto-save to localStorage, debounced.
const debouncedSave = debounce(() => savePersisted(store.get()), 300);
store.subscribe(debouncedSave);

// Global file-drop overlay → adds images / code as new panels. Handlers
// run on document in the capture phase so they fire BEFORE Firefox's
// default file-handling (open-file or paste-path-into-textarea) and
// before any child element gets the event.
const dropOverlay = document.createElement("div");
dropOverlay.className = "global-drop-overlay";
dropOverlay.textContent = "Drop to add panel";
dropOverlay.style.display = "none";
document.body.appendChild(dropOverlay);

const isFileDrag = (e: DragEvent): boolean => {
  const dt = e.dataTransfer;
  if (!dt) return false;
  const types = Array.from(dt.types ?? []);
  // "Files" in Chrome/Firefox; "application/x-moz-file" in some Firefox flows.
  return types.includes("Files") || types.includes("application/x-moz-file");
};

let dragDepth = 0;

document.addEventListener("dragenter", (e) => {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth++;
  dropOverlay.style.display = "flex";
}, true);

document.addEventListener("dragover", (e) => {
  if (!isFileDrag(e)) return;
  // Required: without preventDefault on dragover, the element isn't
  // treated as a drop target and `drop` never fires.
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}, true);

document.addEventListener("dragleave", (e) => {
  if (!isFileDrag(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.style.display = "none";
}, true);

document.addEventListener("drop", async (e) => {
  if (!isFileDrag(e)) return;
  dragDepth = 0;
  dropOverlay.style.display = "none";

  // Drops onto an existing image card route to its own handler (replace
  // the image). Image cards mark themselves so we can detect it here.
  const target = e.target as HTMLElement | null;
  if (target?.closest(".image-card-body")) return;

  e.preventDefault();
  e.stopPropagation();
  const files = Array.from(e.dataTransfer?.files ?? []);
  for (const f of files) {
    if (f.type.startsWith("image/")) {
      const panel = await fileToImagePanel(f);
      if (panel) store.addPanel(panel);
    } else if (f.type.startsWith("text/") || /\.(py|js|ts|tsx|jsx|rs|go|java|c|cpp|h|hpp|sh|rb|php|swift|kt|scala|html|css|scss|json|yaml|yml|toml|xml|sql|md|markdown)$/i.test(f.name)) {
      const text = await f.text();
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const langByExt: Record<string, string> = {
        py: "python", js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx",
        rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp", h: "cpp", hpp: "cpp",
        sh: "bash", rb: "ruby", php: "php", swift: "swift", kt: "kotlin", scala: "scala",
        html: "html", css: "css", scss: "scss", json: "json", yaml: "yaml", yml: "yaml",
        toml: "toml", xml: "xml", sql: "sql", md: "markdown", markdown: "markdown",
      };
      store.addPanel(makeCodePanel({
        code: text,
        language: langByExt[ext] ?? "auto",
        title: f.name,
      }));
    }
  }
}, true);

// Paste handler — image from clipboard adds an image panel. Skip when
// pasting into an input/textarea so normal text paste works.
window.addEventListener("paste", async (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        const p = await fileToImagePanel(file);
        if (p) store.addPanel(p);
      }
      e.preventDefault();
      return;
    }
  }
});
