import "./ui/styles.css";

import { Store, defaultComposition, makeCodePanel } from "./state";
import { mountCompositionView } from "./ui/CompositionView";
import { mountSettingsPanel } from "./ui/SettingsPanel";
import { fileToImagePanel, debounce } from "./ui/util";
import { decodeFromHash, writeHash } from "./share";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `
  <header class="topbar">
    <span class="brand">codeimg</span>
    <span style="color: var(--muted); font-weight: 500;">create images from code and gifs</span>
    <span class="spacer"></span>
    <a href="https://github.com/d-carrigg/codeimg" target="_blank" rel="noreferrer">GitHub</a>
  </header>
  <main class="center" id="composition"></main>
  <aside class="right" id="settings"></aside>
`;

const initial = decodeFromHash(location.hash) ?? defaultComposition();
const store = new Store(initial);

mountCompositionView(document.getElementById("composition")!, store);
mountSettingsPanel(document.getElementById("settings")!, store);

// Persist to URL hash, debounced.
const debouncedHash = debounce(() => writeHash(store.get()), 250);
store.subscribe(debouncedHash);

// Global file-drop overlay → adds images / code as new panels.
let dragDepth = 0;
const dropOverlay = document.createElement("div");
dropOverlay.className = "global-drop-overlay";
dropOverlay.textContent = "Drop to add panel";
dropOverlay.style.display = "none";
document.body.appendChild(dropOverlay);

const hasFiles = (e: DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  dropOverlay.style.display = "flex";
});
window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
});
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.style.display = "none";
});
window.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return;
  // Don't intercept drops onto editable image cards — they have their own handler.
  const target = e.target as HTMLElement | null;
  if (target?.closest(".image-card-body")) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.style.display = "none";
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
});

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
