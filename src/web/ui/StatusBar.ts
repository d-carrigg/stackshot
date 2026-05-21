// Footer status bar — composition meta on the left, keyboard shortcut
// hints on the right. Mirrors the mockup. Skips live pixel dimensions:
// computing those requires rendering every panel, which isn't worth the
// cost just for a status line.
import type { Store } from "../state";

const layoutLabel: Record<string, string> = {
  vertical: "vertical",
  horizontal: "horizontal",
  grid: "grid",
};

export const mountStatusBar = (root: HTMLElement, store: Store): void => {
  root.innerHTML = `
    <div class="status">
      <span class="status-meta" data-meta></span>
      <span class="spacer"></span>
      <span class="status-keys">
        <kbd>⌘S</kbd> save · <kbd>⌘C</kbd> copy
      </span>
    </div>
  `;
  const meta = root.querySelector<HTMLSpanElement>("[data-meta]")!;

  const render = () => {
    const c = store.get();
    const parts = [
      `${c.panels.length} panel${c.panels.length === 1 ? "" : "s"}`,
      `${layoutLabel[c.layout] ?? c.layout} layout`,
      `${c.scale.toFixed(1)}× scale`,
    ];
    meta.textContent = parts.join("  ·  ");
  };
  render();
  store.subscribe(render);
};
