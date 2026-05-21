// Topbar: every primary control lives here, plus a ⋯ overflow menu
// that progressively absorbs them as the viewport narrows. Each pill
// group has a builder that returns a self-contained element wired to
// the store; the topbar mounts one instance and the menu mounts a
// second compact instance. CSS @media rules hide one or the other at
// each breakpoint, so the controls stay reachable at every width.
import type { Store, Layout, ExportFormat, ScalePreset } from "../state";
import { SCALE_VALUES, resolveScalePreset, GRID_MAX_PANELS } from "../state";
import { exportImage, copyImageToClipboard, resolveExportFormat } from "../export";
import { showToast } from "./util";
import {
  rows as rowsIcon,
  columns as colsIcon,
  grid as gridIcon,
  download as dlIcon,
  clipboard as clipIcon,
  eye as eyeIcon,
  github as ghIcon,
} from "./icons";
import { THEMES, resolveTheme } from "../themes";

export type TopbarOptions = {
  onPreview?: () => void;
  onTemplates?: () => void;
  onLicenses?: () => void;
};

type Variant = "topbar" | "menu";

const buildLayoutGroup = (store: Store, variant: Variant): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = variant === "topbar" ? "topbar-layout seg" : "menu-layout seg";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Layout");
  wrap.innerHTML = `
    <button type="button" data-layout-val="vertical" title="Vertical layout" aria-label="Vertical layout"></button>
    <button type="button" data-layout-val="horizontal" title="Horizontal layout" aria-label="Horizontal layout"></button>
    <button type="button" data-layout-val="grid" title="Grid layout" aria-label="Grid layout"></button>
  `;
  const btns = wrap.querySelectorAll<HTMLButtonElement>("button");
  btns[0]?.appendChild(rowsIcon());
  btns[1]?.appendChild(colsIcon());
  btns[2]?.appendChild(gridIcon());
  for (const b of btns) {
    b.addEventListener("click", () => {
      const layout = b.dataset.layoutVal as Layout;
      if (layout === "grid" && store.get().panels.length > GRID_MAX_PANELS) {
        showToast(`Grid mode supports up to ${GRID_MAX_PANELS} panels — remove some first`);
        return;
      }
      store.patch({ layout });
    });
  }
  const render = () => {
    const c = store.get();
    for (const b of btns) b.classList.toggle("active", b.dataset.layoutVal === c.layout);
  };
  render();
  store.subscribe(render);
  return wrap;
};

const buildThemeGroup = (store: Store, variant: Variant): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = variant === "topbar" ? "topbar-themes" : "menu-themes";

  const themeButtons: { id: string; el: HTMLButtonElement }[] = [];
  for (const t of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-pill";
    btn.dataset.theme = t.id;
    // No `title` — the CSS ::before pseudo handles the hover label,
    // and a native browser tooltip on top would duplicate it.
    btn.setAttribute("aria-label", t.label);
    btn.style.setProperty("--swatch-bg", t.bg);
    btn.style.setProperty("--swatch-arrow", t.arrow);
    btn.addEventListener("click", () => store.patch({ bgColor: t.bg, arrowColor: t.arrow }));
    wrap.appendChild(btn);
    themeButtons.push({ id: t.id, el: btn });
  }
  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "theme-pill theme-pill-custom";
  customBtn.dataset.theme = "custom";
  customBtn.setAttribute("aria-label", "Custom colors");
  customBtn.textContent = "+";
  wrap.appendChild(customBtn);
  themeButtons.push({ id: "custom", el: customBtn });

  // Topbar variant: floating popover. Menu variant: inline color inputs.
  let bg: HTMLInputElement;
  let arrow: HTMLInputElement;
  if (variant === "topbar") {
    const pop = document.createElement("div");
    pop.className = "topbar-color-pop";
    pop.hidden = true;
    pop.innerHTML = `
      <label>BG <input type="color" data-bg /></label>
      <label>Arrow <input type="color" data-arrow /></label>
    `;
    wrap.appendChild(pop);
    bg = pop.querySelector<HTMLInputElement>("[data-bg]")!;
    arrow = pop.querySelector<HTMLInputElement>("[data-arrow]")!;
    customBtn.addEventListener("click", () => {
      pop.hidden = !pop.hidden;
      if (!pop.hidden) bg.focus();
    });
    document.addEventListener("click", (e) => {
      if (pop.hidden) return;
      const t = e.target as Node;
      if (pop.contains(t) || customBtn.contains(t)) return;
      pop.hidden = true;
    });
  } else {
    const row = document.createElement("div");
    row.className = "menu-themes-custom";
    row.innerHTML = `
      <label>BG <input type="color" data-bg /></label>
      <label>Arrow <input type="color" data-arrow /></label>
    `;
    wrap.appendChild(row);
    bg = row.querySelector<HTMLInputElement>("[data-bg]")!;
    arrow = row.querySelector<HTMLInputElement>("[data-arrow]")!;
  }
  bg.addEventListener("input", () => store.patch({ bgColor: bg.value }));
  arrow.addEventListener("input", () => store.patch({ arrowColor: arrow.value }));

  const render = () => {
    const c = store.get();
    const activeId = resolveTheme(c.bgColor, c.arrowColor).id;
    for (const tb of themeButtons) tb.el.classList.toggle("active", tb.id === activeId);
    bg.value = c.bgColor;
    arrow.value = c.arrowColor;
  };
  render();
  store.subscribe(render);
  return wrap;
};

const buildScaleGroup = (store: Store, variant: Variant): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = variant === "topbar" ? "topbar-scale" : "menu-scale";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Scale");
  wrap.innerHTML = `
    <button type="button" class="topbar-pill" data-scale-val="low">low</button>
    <button type="button" class="topbar-pill" data-scale-val="med">med</button>
    <button type="button" class="topbar-pill" data-scale-val="high">high</button>
    <button type="button" class="topbar-pill" data-scale-val="custom" data-scale-custom>custom</button>
    <input type="number" class="topbar-scale-input" min="1" max="8" step="0.5" data-scale-input hidden />
  `;
  const pills = wrap.querySelectorAll<HTMLButtonElement>("[data-scale-val]");
  const customPill = wrap.querySelector<HTMLButtonElement>("[data-scale-custom]")!;
  const input = wrap.querySelector<HTMLInputElement>("[data-scale-input]")!;

  for (const pill of pills) {
    pill.addEventListener("click", () => {
      const val = pill.dataset.scaleVal as ScalePreset;
      if (val === "custom") {
        input.hidden = false;
        input.value = String(store.get().scale);
        input.focus();
        input.select();
        return;
      }
      input.hidden = true;
      store.patch({ scale: SCALE_VALUES[val] });
    });
  }
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (Number.isFinite(v) && v > 0) store.patch({ scale: v });
  });
  input.addEventListener("blur", () => {
    if (resolveScalePreset(store.get().scale) !== "custom") input.hidden = true;
  });

  const render = () => {
    const c = store.get();
    const preset = resolveScalePreset(c.scale);
    for (const p of pills) p.classList.toggle("active", p.dataset.scaleVal === preset);
    if (preset === "custom") {
      input.hidden = false;
      if (document.activeElement !== input) input.value = String(c.scale);
      customPill.textContent = `${c.scale.toFixed(1)}×`;
    } else {
      customPill.textContent = "custom";
      if (document.activeElement !== input) input.hidden = true;
    }
  };
  render();
  store.subscribe(render);
  return wrap;
};

const buildFormatGroup = (store: Store, variant: Variant): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = variant === "topbar" ? "topbar-format" : "menu-format";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Export format");
  wrap.innerHTML = `
    <button type="button" class="topbar-pill" data-format-val="webp">webp</button>
    <button type="button" class="topbar-pill" data-format-val="png">png</button>
    <button type="button" class="topbar-pill" data-format-val="gif">gif</button>
  `;
  const pills = wrap.querySelectorAll<HTMLButtonElement>("[data-format-val]");
  for (const pill of pills) {
    pill.addEventListener("click", () =>
      store.patch({ exportFormat: pill.dataset.formatVal as ExportFormat }),
    );
  }
  const render = () => {
    const resolved = resolveExportFormat(store.get());
    for (const pill of pills) pill.classList.toggle("active", pill.dataset.formatVal === resolved);
  };
  render();
  store.subscribe(render);
  return wrap;
};

// Section wrapper used inside the overflow menu — a small label sits
// above the group of pills so users know what the controls are.
const wrapMenuSection = (label: string, el: HTMLElement): HTMLElement => {
  const sec = document.createElement("div");
  sec.className = "menu-section";
  sec.innerHTML = `<div class="menu-section-label">${label}</div>`;
  sec.appendChild(el);
  return sec;
};

export const mountTopbar = (root: HTMLElement, store: Store, opts: TopbarOptions = {}): void => {
  root.innerHTML = `
    <header class="topbar">
      <span class="brand">codeimg</span>

      <div class="topbar-slot" data-slot="layout"></div>
      <span class="topbar-sep" data-sep-after="layout" aria-hidden="true"></span>

      <div class="topbar-slot" data-slot="themes"></div>
      <span class="topbar-sep" data-sep-after="themes" aria-hidden="true"></span>

      <div class="topbar-slot" data-slot="scale"></div>
      <span class="topbar-sep" data-sep-after="scale" aria-hidden="true"></span>

      <div class="topbar-slot" data-slot="format"></div>

      <span class="spacer"></span>

      <button type="button" class="topbar-icon-btn" data-preview-top
              title="Preview" aria-label="Preview" hidden>
        <span class="ico" data-preview-top-ico></span>
      </button>
      <button type="button" class="topbar-icon-btn" data-copy-top
              title="Copy to clipboard" aria-label="Copy to clipboard">
        <span class="ico" data-copy-top-ico></span>
      </button>
      <button type="button" class="topbar-icon-btn topbar-icon-btn-primary"
              data-export title="Download" aria-label="Download">
        <span class="ico" data-dl-ico></span>
      </button>

      <div class="topbar-more">
        <button type="button" class="topbar-more-btn" data-more title="More" aria-label="More options" aria-haspopup="menu" aria-expanded="false">
          <span aria-hidden="true">⋯</span>
        </button>
        <div class="topbar-more-menu" data-more-menu hidden role="menu">
          <div class="menu-overflow" data-overflow="layout"></div>
          <div class="menu-overflow" data-overflow="themes"></div>
          <div class="menu-overflow" data-overflow="scale"></div>
          <div class="menu-overflow" data-overflow="format"></div>
          <div class="topbar-more-sep menu-always-sep"></div>
          <button type="button" role="menuitem" data-templates>Browse templates…</button>
          <button type="button" role="menuitem" data-licenses>Open-source licenses</button>
          <div class="topbar-more-sep"></div>
          <a href="https://github.com/d-carrigg/codeimg" target="_blank" rel="noreferrer" role="menuitem">
            <span class="topbar-more-gh"></span><span>View on GitHub</span>
          </a>
        </div>
      </div>
    </header>
  `;

  // Mount primary (topbar) instances + overflow (menu) instances of
  // each group. CSS toggles which one is visible at each breakpoint.
  const slot = (name: string) =>
    root.querySelector<HTMLDivElement>(`.topbar-slot[data-slot="${name}"]`)!;
  const over = (name: string) =>
    root.querySelector<HTMLDivElement>(`.menu-overflow[data-overflow="${name}"]`)!;

  slot("layout").appendChild(buildLayoutGroup(store, "topbar"));
  over("layout").appendChild(wrapMenuSection("Layout", buildLayoutGroup(store, "menu")));

  slot("themes").appendChild(buildThemeGroup(store, "topbar"));
  over("themes").appendChild(wrapMenuSection("Theme", buildThemeGroup(store, "menu")));

  slot("scale").appendChild(buildScaleGroup(store, "topbar"));
  over("scale").appendChild(wrapMenuSection("Scale", buildScaleGroup(store, "menu")));

  slot("format").appendChild(buildFormatGroup(store, "topbar"));
  over("format").appendChild(wrapMenuSection("Format", buildFormatGroup(store, "menu")));

  // Preview / Copy / Download — icon-only with tooltips ---------------
  const previewTop = root.querySelector<HTMLButtonElement>("[data-preview-top]")!;
  root.querySelector<HTMLSpanElement>("[data-preview-top-ico]")!.appendChild(eyeIcon());
  if (opts.onPreview) {
    previewTop.hidden = false;
    previewTop.addEventListener("click", () => opts.onPreview?.());
  }

  const copyTop = root.querySelector<HTMLButtonElement>("[data-copy-top]")!;
  root.querySelector<HTMLSpanElement>("[data-copy-top-ico]")!.appendChild(clipIcon());
  copyTop.addEventListener("click", async () => {
    try {
      await copyImageToClipboard(store.get());
      showToast("Copied to clipboard");
    } catch (e) {
      showToast(`Copy failed: ${(e as Error).message}`);
    }
  });

  const exportBtn = root.querySelector<HTMLButtonElement>("[data-export]")!;
  root.querySelector<HTMLSpanElement>("[data-dl-ico]")!.appendChild(dlIcon());
  exportBtn.addEventListener("click", async () => {
    try {
      await exportImage(store.get());
    } catch (e) {
      showToast(`Export failed: ${(e as Error).message}`);
    }
  });

  // Overflow ⋯ menu --------------------------------------------------
  const moreBtn = root.querySelector<HTMLButtonElement>("[data-more]")!;
  const moreMenu = root.querySelector<HTMLDivElement>("[data-more-menu]")!;
  moreMenu.querySelector<HTMLSpanElement>(".topbar-more-gh")!.appendChild(ghIcon());
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

  const templatesBtn = moreMenu.querySelector<HTMLButtonElement>("[data-templates]")!;
  templatesBtn.addEventListener("click", () => {
    closeMenu();
    opts.onTemplates?.();
  });
  const licensesBtn = moreMenu.querySelector<HTMLButtonElement>("[data-licenses]")!;
  licensesBtn.addEventListener("click", () => {
    closeMenu();
    opts.onLicenses?.();
  });

  // ⌘S / ⌘C keyboard shortcuts ---------------------------------------
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

};
