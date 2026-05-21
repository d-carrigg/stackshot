// Topbar: every primary control lives here. Layout / theme / size /
// format / download / overflow menu, plus the brand. The right rail is
// gone in this concept — the topbar is the only chrome.
import type { Store, Layout, ExportFormat } from "../state";
import { exportImage, copyImageToClipboard, resolveExportFormat } from "../export";
import { showToast } from "./util";
import { clearPersisted } from "../persist";
import { defaultComposition, emptyComposition } from "../state";
import {
  rows as rowsIcon,
  columns as colsIcon,
  grid as gridIcon,
  download as dlIcon,
  github as ghIcon,
} from "./icons";
import { THEMES, resolveTheme } from "../themes";

type ScalePreset = "low" | "med" | "high" | "custom";
const SCALE_VALUES: Record<Exclude<ScalePreset, "custom">, number> = {
  low: 1.0,
  med: 2.0,
  high: 3.0,
};
const resolveScalePreset = (scale: number): ScalePreset => {
  for (const k of ["low", "med", "high"] as const) {
    if (Math.abs(SCALE_VALUES[k] - scale) < 0.01) return k;
  }
  return "custom";
};

export const mountTopbar = (root: HTMLElement, store: Store): void => {
  root.innerHTML = `
    <header class="topbar">
      <span class="brand">codeimg</span>

      <div class="topbar-layout seg" role="group" aria-label="Layout">
        <button type="button" data-layout-val="vertical" title="Vertical layout" aria-label="Vertical layout"></button>
        <button type="button" data-layout-val="horizontal" title="Horizontal layout" aria-label="Horizontal layout"></button>
        <button type="button" data-layout-val="grid" title="Grid layout" aria-label="Grid layout"></button>
      </div>

      <span class="topbar-sep" aria-hidden="true"></span>

      <div class="topbar-themes" data-themes></div>

      <span class="topbar-sep" aria-hidden="true"></span>

      <div class="topbar-scale" role="group" aria-label="Scale">
        <button type="button" class="topbar-pill" data-scale-val="low">low</button>
        <button type="button" class="topbar-pill" data-scale-val="med">med</button>
        <button type="button" class="topbar-pill" data-scale-val="high">high</button>
        <button type="button" class="topbar-pill" data-scale-val="custom" data-scale-custom>custom</button>
        <input type="number" class="topbar-scale-input" min="0.5" max="6" step="0.1" data-scale-input hidden />
      </div>

      <span class="topbar-sep" aria-hidden="true"></span>

      <div class="topbar-format" role="group" aria-label="Export format">
        <button type="button" class="topbar-pill" data-format-val="webp">webp</button>
        <button type="button" class="topbar-pill" data-format-val="png">png</button>
        <button type="button" class="topbar-pill" data-format-val="gif">gif</button>
      </div>

      <span class="spacer"></span>

      <button type="button" class="topbar-export" data-export>
        <span class="ico" data-dl-ico></span><span>Download</span>
      </button>

      <div class="topbar-more">
        <button type="button" class="topbar-more-btn" data-more title="More" aria-label="More options" aria-haspopup="menu" aria-expanded="false">
          <span aria-hidden="true">⋯</span>
        </button>
        <div class="topbar-more-menu" data-more-menu hidden role="menu">
          <button type="button" role="menuitem" data-copy>Copy to clipboard</button>
          <label class="topbar-more-toggle" role="menuitemcheckbox">
            <input type="checkbox" data-border />
            <span>Inner panel border</span>
          </label>
          <div class="topbar-more-sep"></div>
          <button type="button" role="menuitem" data-clear>Clear all panels</button>
          <button type="button" role="menuitem" data-default>Reset to default</button>
          <div class="topbar-more-sep"></div>
          <a href="https://github.com/d-carrigg/codeimg" target="_blank" rel="noreferrer" role="menuitem">
            <span class="topbar-more-gh"></span><span>View on GitHub</span>
          </a>
        </div>
      </div>
    </header>
  `;

  // Layout segment ----------------------------------------------------
  const segButtons = root.querySelectorAll<HTMLButtonElement>(".topbar-layout button");
  segButtons[0]?.appendChild(rowsIcon());
  segButtons[1]?.appendChild(colsIcon());
  segButtons[2]?.appendChild(gridIcon());
  for (const btn of segButtons) {
    btn.addEventListener("click", () => {
      store.patch({ layout: btn.dataset.layoutVal as Layout });
    });
  }

  // Themes ------------------------------------------------------------
  const themesEl = root.querySelector<HTMLDivElement>("[data-themes]")!;
  const themeButtons: { id: string; el: HTMLButtonElement }[] = [];
  for (const t of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-pill";
    btn.dataset.theme = t.id;
    btn.title = t.label;
    btn.setAttribute("aria-label", t.label);
    btn.style.setProperty("--swatch-bg", t.bg);
    btn.style.setProperty("--swatch-arrow", t.arrow);
    btn.addEventListener("click", () => store.patch({ bgColor: t.bg, arrowColor: t.arrow }));
    themesEl.appendChild(btn);
    themeButtons.push({ id: t.id, el: btn });
  }
  // Custom pill — distinct, opens a tiny popover with bg + arrow color
  // pickers. Keeps the topbar free of always-visible color inputs.
  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "theme-pill theme-pill-custom";
  customBtn.dataset.theme = "custom";
  customBtn.title = "Custom colors";
  customBtn.setAttribute("aria-label", "Custom colors");
  customBtn.textContent = "+";
  themesEl.appendChild(customBtn);
  themeButtons.push({ id: "custom", el: customBtn });

  const customPop = document.createElement("div");
  customPop.className = "topbar-color-pop";
  customPop.hidden = true;
  customPop.innerHTML = `
    <label>BG <input type="color" data-bg /></label>
    <label>Arrow <input type="color" data-arrow /></label>
  `;
  themesEl.appendChild(customPop);
  const bg = customPop.querySelector<HTMLInputElement>("[data-bg]")!;
  const arrow = customPop.querySelector<HTMLInputElement>("[data-arrow]")!;
  bg.addEventListener("input", () => store.patch({ bgColor: bg.value }));
  arrow.addEventListener("input", () => store.patch({ arrowColor: arrow.value }));
  customBtn.addEventListener("click", () => {
    customPop.hidden = !customPop.hidden;
    if (!customPop.hidden) bg.focus();
  });
  document.addEventListener("click", (e) => {
    if (customPop.hidden) return;
    const t = e.target as Node;
    if (customPop.contains(t) || customBtn.contains(t)) return;
    customPop.hidden = true;
  });

  // Scale -------------------------------------------------------------
  const scalePills = root.querySelectorAll<HTMLButtonElement>(".topbar-scale [data-scale-val]");
  const customScalePill = root.querySelector<HTMLButtonElement>("[data-scale-custom]")!;
  const scaleInput = root.querySelector<HTMLInputElement>("[data-scale-input]")!;
  for (const pill of scalePills) {
    pill.addEventListener("click", () => {
      const val = pill.dataset.scaleVal as ScalePreset;
      if (val === "custom") {
        scaleInput.hidden = false;
        scaleInput.value = String(store.get().scale);
        scaleInput.focus();
        scaleInput.select();
        return;
      }
      scaleInput.hidden = true;
      store.patch({ scale: SCALE_VALUES[val] });
    });
  }
  scaleInput.addEventListener("input", () => {
    const v = Number(scaleInput.value);
    if (Number.isFinite(v) && v > 0) store.patch({ scale: v });
  });
  scaleInput.addEventListener("blur", () => {
    if (resolveScalePreset(store.get().scale) !== "custom") scaleInput.hidden = true;
  });

  // Format ------------------------------------------------------------
  const formatPills = root.querySelectorAll<HTMLButtonElement>(".topbar-format [data-format-val]");
  for (const pill of formatPills) {
    pill.addEventListener("click", () =>
      store.patch({ exportFormat: pill.dataset.formatVal as ExportFormat }),
    );
  }

  // Export / Copy -----------------------------------------------------
  const exportBtn = root.querySelector<HTMLButtonElement>("[data-export]")!;
  root.querySelector<HTMLSpanElement>("[data-dl-ico]")!.appendChild(dlIcon());
  exportBtn.addEventListener("click", async () => {
    try {
      await exportImage(store.get());
    } catch (e) {
      showToast(`Export failed: ${(e as Error).message}`);
    }
  });

  // Overflow menu -----------------------------------------------------
  const moreBtn = root.querySelector<HTMLButtonElement>("[data-more]")!;
  const moreMenu = root.querySelector<HTMLDivElement>("[data-more-menu]")!;
  const ghSpan = moreMenu.querySelector<HTMLSpanElement>(".topbar-more-gh")!;
  ghSpan.appendChild(ghIcon());
  const closeMenu = () => {
    moreMenu.hidden = true;
    moreBtn.setAttribute("aria-expanded", "false");
  };
  const openMenu = () => {
    moreMenu.hidden = false;
    moreBtn.setAttribute("aria-expanded", "true");
  };
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    moreMenu.hidden ? openMenu() : closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (moreMenu.hidden) return;
    const t = e.target as Node;
    if (moreMenu.contains(t) || moreBtn.contains(t)) return;
    closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !moreMenu.hidden) closeMenu();
  });

  const copyBtn = moreMenu.querySelector<HTMLButtonElement>("[data-copy]")!;
  const clearBtn = moreMenu.querySelector<HTMLButtonElement>("[data-clear]")!;
  const defaultBtn = moreMenu.querySelector<HTMLButtonElement>("[data-default]")!;
  const border = moreMenu.querySelector<HTMLInputElement>("[data-border]")!;

  copyBtn.addEventListener("click", async () => {
    closeMenu();
    try {
      await copyImageToClipboard(store.get());
      showToast("Copied to clipboard");
    } catch (e) {
      showToast(`Copy failed: ${(e as Error).message}`);
    }
  });
  border.addEventListener("change", () => store.patch({ innerBorder: border.checked }));
  clearBtn.addEventListener("click", () => {
    closeMenu();
    if (store.get().panels.length > 0 && !confirm("Remove all panels?")) return;
    clearPersisted();
    store.set(() => emptyComposition());
  });
  defaultBtn.addEventListener("click", () => {
    closeMenu();
    if (store.get().panels.length > 0 && !confirm("Replace the current composition with the default?")) return;
    clearPersisted();
    store.set(() => defaultComposition());
  });

  // ⌘S / ⌘C keyboard shortcuts (advertised in the footer) -------------
  window.addEventListener("keydown", async (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const tgt = e.target as HTMLElement | null;
    // Don't hijack copy in text inputs / textareas — users still expect
    // ⌘C to copy text selection there.
    const inEditable =
      tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      try { await exportImage(store.get()); } catch (err) {
        showToast(`Export failed: ${(err as Error).message}`);
      }
    } else if (e.key.toLowerCase() === "c" && !inEditable && !window.getSelection()?.toString()) {
      e.preventDefault();
      try {
        await copyImageToClipboard(store.get());
        showToast("Copied to clipboard");
      } catch (err) {
        showToast(`Copy failed: ${(err as Error).message}`);
      }
    }
  });

  // Render ------------------------------------------------------------
  const render = () => {
    const c = store.get();
    for (const btn of segButtons) {
      btn.classList.toggle("active", btn.dataset.layoutVal === c.layout);
    }
    const activeTheme = resolveTheme(c.bgColor, c.arrowColor).id;
    for (const tb of themeButtons) tb.el.classList.toggle("active", tb.id === activeTheme);
    bg.value = c.bgColor;
    arrow.value = c.arrowColor;

    const preset = resolveScalePreset(c.scale);
    for (const pill of scalePills) {
      pill.classList.toggle("active", pill.dataset.scaleVal === preset);
    }
    if (preset === "custom") {
      scaleInput.hidden = false;
      if (document.activeElement !== scaleInput) scaleInput.value = String(c.scale);
      customScalePill.textContent = `${c.scale.toFixed(1)}×`;
    } else {
      customScalePill.textContent = "custom";
      if (document.activeElement !== scaleInput) scaleInput.hidden = true;
    }

    const resolved = resolveExportFormat(c);
    for (const pill of formatPills) {
      pill.classList.toggle("active", pill.dataset.formatVal === resolved);
    }
    border.checked = c.innerBorder;
  };
  render();
  store.subscribe(render);
};
