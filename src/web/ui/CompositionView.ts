// Center pane: cards arranged matching the composition layout (horizontal
// row or vertical stack), with SVG arrows between them and an "add panel"
// affordance at the end.
import type { Store, ArrowStyle, ResolvedArrow } from "../state";
import { makeCodePanel, defaultComposition, GRID_MAX_PANELS, resolveArrow } from "../state";
import { clearPersisted } from "../persist";
import { createPanelCard } from "./PanelCard";
import { trash as trashIcon, refresh as refreshIcon, pencil as pencilIcon, zoomIn as zoomInIcon, zoomOut as zoomOutIcon, maximize as fitIcon } from "./icons";
import { resolveTheme, applyThemeVars } from "../themes";
import { showToast } from "./util";
import { clampZoom, fitZoom, formatZoom, zoomIn, zoomOut, ZOOM_MAX, ZOOM_MIN } from "./editorZoom";

export type CompositionViewOptions = {};

// Reading-order number for a panel's editor card, or null when grid
// numbering is off / not in grid mode. Mirrors composeGrid's labelFor.
const numberFor = (
  c: import("../state").Composition,
  p: import("../state").Panel,
  i: number,
): number | null => {
  if (c.layout !== "grid" || !c.gridNumbers) return null;
  const cols = Math.max(1, c.gridCols);
  const r = p.gridRow ?? Math.floor(i / cols);
  const col = p.gridCol ?? i % cols;
  return r * cols + col + 1;
};

export const mountCompositionView = (
  root: HTMLElement,
  store: Store,
  _opts: CompositionViewOptions = {},
): void => {
  root.innerHTML = `
    <div class="composition-scroll">
      <div class="composition-sizer">
        <div class="composition-zoom">
          <div class="composition" data-layout="horizontal">
            <div class="composition-panels"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="editor-zoom-hud" hidden>
      <button type="button" data-zoom-out title="Zoom out" aria-label="Zoom out"></button>
      <span class="editor-zoom-label" data-zoom-label>100%</span>
      <button type="button" data-zoom-in title="Zoom in" aria-label="Zoom in"></button>
      <button type="button" data-zoom-fit title="Fit to view" aria-label="Fit to view"></button>
    </div>
  `;

  const scroll = root.querySelector<HTMLDivElement>(".composition-scroll")!;
  const sizer = root.querySelector<HTMLDivElement>(".composition-sizer")!;
  const zoomEl = root.querySelector<HTMLDivElement>(".composition-zoom")!;
  const stage = root.querySelector<HTMLDivElement>(".composition")!;
  const panelsRow = stage.querySelector<HTMLDivElement>(".composition-panels")!;
  const hud = root.querySelector<HTMLDivElement>(".editor-zoom-hud")!;
  const zoomOutBtn = hud.querySelector<HTMLButtonElement>("[data-zoom-out]")!;
  const zoomInBtn = hud.querySelector<HTMLButtonElement>("[data-zoom-in]")!;
  const zoomFitBtn = hud.querySelector<HTMLButtonElement>("[data-zoom-fit]")!;
  const zoomLabel = hud.querySelector<HTMLSpanElement>("[data-zoom-label]")!;
  zoomOutBtn.appendChild(zoomOutIcon());
  zoomInBtn.appendChild(zoomInIcon());
  zoomFitBtn.appendChild(fitIcon());

  // Editor zoom is view-only (export still uses composition.scale). Fit
  // mode shrinks overflowing horizontal/grid stacks to the viewport;
  // +/- takes over until Fit is clicked again.
  let viewZoom = 1;
  let fitMode = true;
  const applyViewZoom = () => {
    zoomEl.style.transform = `scale(${viewZoom})`;
    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    sizer.style.width = `${Math.max(1, Math.round(w * viewZoom))}px`;
    sizer.style.height = `${Math.max(1, Math.round(h * viewZoom))}px`;
    zoomLabel.textContent = formatZoom(viewZoom);
    zoomOutBtn.disabled = viewZoom <= ZOOM_MIN + 0.001;
    zoomInBtn.disabled = viewZoom >= ZOOM_MAX - 0.001;
    hud.hidden = false;
  };
  const fitToView = () => {
    fitMode = true;
    viewZoom = fitZoom(stage.offsetWidth, stage.offsetHeight, scroll.clientWidth, scroll.clientHeight);
    applyViewZoom();
  };
  const setManualZoom = (next: number) => {
    fitMode = false;
    viewZoom = clampZoom(next);
    applyViewZoom();
  };
  zoomOutBtn.addEventListener("click", () => setManualZoom(zoomOut(viewZoom)));
  zoomInBtn.addEventListener("click", () => setManualZoom(zoomIn(viewZoom)));
  zoomFitBtn.addEventListener("click", () => fitToView());

  scroll.addEventListener(
    "wheel",
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = scroll.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const contentX = (scroll.scrollLeft + offsetX) / viewZoom;
      const contentY = (scroll.scrollTop + offsetY) / viewZoom;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setManualZoom(viewZoom * factor);
      scroll.scrollLeft = contentX * viewZoom - offsetX;
      scroll.scrollTop = contentY * viewZoom - offsetY;
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      setManualZoom(zoomIn(viewZoom));
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setManualZoom(zoomOut(viewZoom));
    } else if (e.key === "0") {
      e.preventDefault();
      fitToView();
    }
  });
  const addRow = buildAddRow(store);
  scroll.appendChild(addRow);

  // Grid arrows live in an absolutely-positioned overlay (the CSS grid has no
  // slots between cells). We keep references to recolor them in-place and to
  // reposition on resize.
  let gridArrowEls: { el: HTMLElement; fromId: string }[] = [];

  // Recolor/restyle existing arrow elements without a full rebuild.
  const updateArrowVisuals = (c: import("../state").Composition) => {
    if (!c.showArrows) return;
    if (c.layout === "grid") {
      for (const a of gridArrowEls) (a.el as any)._updateArrow?.(resolveArrow(c, a.fromId));
    } else {
      const arrows = panelsRow.querySelectorAll<HTMLElement>(".composition-arrow");
      arrows.forEach((el, i) => {
        const p = c.panels[i];
        if (p) (el as any)._updateArrow?.(resolveArrow(c, p.id));
      });
    }
  };

  // Place the grid overlay arrows between orthogonally-adjacent consecutive
  // cells, measured from the laid-out card rects. Runs after layout (rAF) and
  // on resize.
  const layoutGridArrows = (c: import("../state").Composition, overlay: HTMLElement) => {
    if (c.layout !== "grid" || !c.showArrows) return;
    const cont = panelsRow.getBoundingClientRect();
    const cards = Array.from(panelsRow.querySelectorAll<HTMLElement>(".panel-card"));
    overlay.innerHTML = "";
    gridArrowEls = [];
    const cellOf = (i: number) => {
      const p = c.panels[i]!;
      const cols = Math.max(1, c.gridCols);
      return { r: p.gridRow ?? Math.floor(i / cols), c: p.gridCol ?? i % cols };
    };
    for (let i = 0; i < c.panels.length - 1; i++) {
      const a = cellOf(i);
      const b = cellOf(i + 1);
      const cardA = cards[i];
      const cardB = cards[i + 1];
      if (!cardA || !cardB) continue;
      const ra = cardA.getBoundingClientRect();
      const rb = cardB.getBoundingClientRect();
      const fromId = c.panels[i]!.id;
      let orient: ArrowOrient | null = null;
      let cx = 0;
      let cy = 0;
      if (a.r === b.r && b.c === a.c + 1) {
        orient = "horizontal";
        cx = (ra.right + rb.left) / 2 - cont.left;
        cy = (ra.top + ra.bottom) / 2 - cont.top;
      } else if (a.c === b.c && b.r === a.r + 1) {
        orient = "vertical";
        cx = (ra.left + ra.right) / 2 - cont.left;
        cy = (ra.bottom + rb.top) / 2 - cont.top;
      }
      if (!orient) continue;
      const el = buildArrow(orient, store, fromId, resolveArrow(c, fromId));
      el.classList.add("composition-grid-arrow");
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      overlay.appendChild(el);
      gridArrowEls.push({ el, fromId });
    }
  };

  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    const c = store.get();
    if (c.layout !== "grid" || !c.showArrows) return;
    const overlay = panelsRow.querySelector<HTMLElement>(".composition-grid-arrows");
    if (!overlay) return;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => layoutGridArrows(c, overlay));
  });

  const render = () => {
    const c = store.get();
    const theme = resolveTheme(c.bgColor, c.arrowColor);
    stage.dataset.layout = c.layout;
    stage.dataset.arrows = c.showArrows ? "1" : "0";
    document.documentElement.dataset.theme = theme.id;
    // Apply every theme token as a CSS var on the document root. The
    // whole page (topbar, right rail, composition, dialogs) reads these
    // via `var(--text)` etc., so the entire UI re-skins on theme change.
    applyThemeVars(document.documentElement, theme);

    // Full rebuild each time keeps this code dead-simple and the perf is
    // fine at the panel counts we expect (handfuls, not hundreds). The
    // textarea inside CodeEditor is recreated, so focus is lost on every
    // store change — to avoid that, skip rebuilds when only ids/order
    // changed and the panel set is identical.
    //
    // Layout is baked into the signature so toggling horizontal/vertical
    // forces the arrow SVGs (which differ per orientation) to be
    // recreated.
    // Signature includes grid dimensions and per-panel grid positions
    // so a swap forces re-layout. For grid, we re-render the cell
    // skeleton each pass; for other layouts we use the simpler row.
    const gridSig =
      c.layout === "grid"
        ? `:${c.gridRows}x${c.gridCols}:` +
          c.panels.map((p) => `${p.id}@${p.gridRow ?? "-"},${p.gridCol ?? "-"}`).join("|")
        : "";
    // Include `kind` so converting a code panel to an image (drag-replace)
    // forces a full rebuild — the panel id stays the same, so an id-only
    // signature would skip the rebuild and PanelCard.update() bails on a
    // kind change, leaving the stale editor on screen.
    // showArrows toggles arrow DOM existence (structural) → in the signature.
    // Per-arrow style/color is applied in-place below, so it stays out of the
    // signature to avoid a full rebuild (which would drop editor focus) on
    // every color-picker tick.
    const desired =
      c.layout + ":" + c.panels.map((p) => `${p.id}:${p.kind}`).join("|") + gridSig +
      `:a${c.showArrows ? 1 : 0}`;
    if (stage.dataset.signature === desired) {
      const cards = panelsRow.querySelectorAll<HTMLElement>(".panel-card");
      cards.forEach((cardEl, i) => {
        const panel = c.panels[i];
        if (!panel) return;
        const update = (cardEl as any)._update;
        update?.(panel);
        const setTheme = (cardEl as any)._setTheme;
        setTheme?.(theme);
        const setNumber = (cardEl as any)._setNumber;
        setNumber?.(numberFor(c, panel, i));
      });
      updateArrowVisuals(c);
      return;
    }
    stage.dataset.signature = desired;
    panelsRow.innerHTML = "";
    Array.from(stage.children).forEach((el) => {
      if (el !== panelsRow) el.remove();
    });

    if (c.layout === "grid") {
      panelsRow.style.gridTemplateColumns = `repeat(${c.gridCols}, minmax(0, 1fr))`;
      panelsRow.style.gridTemplateRows = `repeat(${c.gridRows}, auto)`;
    } else {
      panelsRow.style.gridTemplateColumns = "";
      panelsRow.style.gridTemplateRows = "";
    }

    if (c.panels.length === 0) {
      const empty = document.createElement("div");
      empty.className = "composition-empty";
      empty.innerHTML = `<p>No panels yet.</p><p class="hint">Paste code/images, drop a short video (mp4/webm/mov → WebP), or use the buttons below.</p>`;
      panelsRow.appendChild(empty);
    } else if (c.layout === "grid") {
      c.panels.forEach((p, i) => {
        const handle = createPanelCard(store, p, theme);
        (handle.root as any)._update = handle.update;
        (handle.root as any)._setTheme = handle.setTheme;
        (handle.root as any)._setNumber = handle.setNumber;
        handle.setNumber(numberFor(c, p, i));
        if (p.gridRow !== undefined && p.gridCol !== undefined) {
          handle.root.style.gridRow = String(p.gridRow + 1);
          handle.root.style.gridColumn = String(p.gridCol + 1);
        }
        attachGridDragHandlers(handle.root, p.id, store);
        panelsRow.appendChild(handle.root);
      });
      gridArrowEls = [];
      if (c.showArrows && c.panels.length > 1) {
        const overlay = document.createElement("div");
        overlay.className = "composition-grid-arrows";
        panelsRow.appendChild(overlay);
        requestAnimationFrame(() => layoutGridArrows(store.get(), overlay));
      }
    } else {
      const seqLayout = c.layout as "horizontal" | "vertical";
      c.panels.forEach((p, i) => {
        const handle = createPanelCard(store, p, theme);
        (handle.root as any)._update = handle.update;
        (handle.root as any)._setTheme = handle.setTheme;
        (handle.root as any)._setNumber = handle.setNumber;
        attachSeqDragHandlers(handle.root, p.id, store, seqLayout);
        panelsRow.appendChild(handle.root);
        if (c.showArrows && i < c.panels.length - 1) {
          panelsRow.appendChild(buildArrow(seqLayout, store, p.id, resolveArrow(c, p.id)));
        }
      });
    }

  };

  const afterLayout = () => {
    requestAnimationFrame(() => {
      if (fitMode) fitToView();
      else applyViewZoom();
    });
  };
  const origRender = render;
  const renderAndFit = () => {
    origRender();
    afterLayout();
  };

  renderAndFit();
  store.subscribe(renderAndFit);
  window.addEventListener("resize", () => {
    if (fitMode) afterLayout();
  });
};

// Source panel id of the active drag. The DataTransfer API only exposes
// getData() during the actual drop event, so we mirror the id in module
// scope to make it readable from dragover (e.g. to hide the drop
// indicator on no-op positions).
let activeDragPanelId: string | null = null;

// Arm the card to be draggable only when the user grabs it by the grip
// handle. Returns the "armed" state ref so dragstart can early-cancel
// drags that start from text inputs, selects, etc.
const wireGripDrag = (el: HTMLElement, panelId: string): { isArmed: () => boolean } => {
  let armed = false;
  el.dataset.panelId = panelId;
  el.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement | null;
    armed = !!target?.closest(".panel-card-grip");
    el.draggable = armed;
  });
  el.addEventListener("dragstart", (e) => {
    if (!armed) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData("text/x-panel-id", panelId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    el.classList.add("dragging");
    activeDragPanelId = panelId;
  });
  el.addEventListener("dragend", () => {
    armed = false;
    el.draggable = false;
    el.classList.remove("dragging");
    activeDragPanelId = null;
    // Pure-CSS leaks: drop fires before dragend on success and clears
    // these, but if the drop landed outside any handler they linger.
    document
      .querySelectorAll<HTMLElement>(".panel-card.drop-before, .panel-card.drop-after, .panel-card.drop-target")
      .forEach((c) => c.classList.remove("drop-before", "drop-after", "drop-target"));
  });
  return { isArmed: () => armed };
};

// Grid drag/drop: drop the dragged card on another → swap their cell
// positions. Drag must start from the grip handle.
const attachGridDragHandlers = (el: HTMLElement, panelId: string, store: import("../state").Store): void => {
  wireGripDrag(el, panelId);
  el.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("text/x-panel-id")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drop-target");
    }
  });
  el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop-target");
    const fromId = e.dataTransfer?.getData("text/x-panel-id");
    if (!fromId || fromId === panelId) return;
    e.preventDefault();
    const c = store.get();
    const a = c.panels.find((p) => p.id === fromId);
    const b = c.panels.find((p) => p.id === panelId);
    if (!a || !b) return;
    store.patchPanel(a.id, { gridRow: b.gridRow, gridCol: b.gridCol });
    store.patchPanel(b.id, { gridRow: a.gridRow, gridCol: a.gridCol });
  });
};

// Sequential (horizontal / vertical) drag-to-reorder: pick a card up by
// the grip, drop on another card; cursor position relative to that card
// decides whether the insert lands before or after it.
const attachSeqDragHandlers = (
  el: HTMLElement,
  panelId: string,
  store: import("../state").Store,
  layout: "horizontal" | "vertical",
): void => {
  wireGripDrag(el, panelId);
  const insertBeforeFromEvent = (e: DragEvent): boolean => {
    const rect = el.getBoundingClientRect();
    return layout === "horizontal"
      ? e.clientX - rect.left < rect.width / 2
      : e.clientY - rect.top < rect.height / 2;
  };
  // True if dropping at (before|after) this card would actually move
  // the dragged panel — used to suppress the indicator on adjacent
  // same-side drops that would otherwise be silent no-ops.
  const wouldMove = (before: boolean): boolean => {
    if (!activeDragPanelId || activeDragPanelId === panelId) return false;
    const panels = store.get().panels;
    const fromIdx = panels.findIndex((p) => p.id === activeDragPanelId);
    const toIdx = panels.findIndex((p) => p.id === panelId);
    if (fromIdx < 0 || toIdx < 0) return false;
    let target = before ? toIdx : toIdx + 1;
    if (fromIdx < target) target -= 1;
    return target !== fromIdx;
  };
  el.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("text/x-panel-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const before = insertBeforeFromEvent(e);
    const show = wouldMove(before);
    el.classList.toggle("drop-before", show && before);
    el.classList.toggle("drop-after", show && !before);
  });
  el.addEventListener("dragleave", () => {
    el.classList.remove("drop-before", "drop-after");
  });
  el.addEventListener("drop", (e) => {
    el.classList.remove("drop-before", "drop-after");
    const fromId = e.dataTransfer?.getData("text/x-panel-id");
    if (!fromId || fromId === panelId) return;
    e.preventDefault();
    const c = store.get();
    const fromIdx = c.panels.findIndex((p) => p.id === fromId);
    const toIdx = c.panels.findIndex((p) => p.id === panelId);
    if (fromIdx < 0 || toIdx < 0) return;
    const before = insertBeforeFromEvent(e);
    let target = before ? toIdx : toIdx + 1;
    // movePanel splices: dragging downward, the index after the dragged
    // element is removed shifts left by one.
    if (fromIdx < target) target -= 1;
    store.movePanel(fromId, target);
  });
};

type ArrowOrient = "horizontal" | "vertical";

// SVG markup for a solid/dashed arrow in the given orientation, colored
// directly (per-arrow color must win over the theme's --arrow).
const arrowSvg = (orient: ArrowOrient, resolved: ResolvedArrow): string => {
  const dash = resolved.style === "dashed" ? ` stroke-dasharray="6 5"` : "";
  const c = resolved.color;
  if (orient === "horizontal") {
    return `
      <svg viewBox="0 0 90 22" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d="M0 11 H72" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"${dash} />
        <path d="M62 4 L80 11 L62 18 Z" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round" />
      </svg>`;
  }
  return `
    <svg viewBox="0 0 22 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M11 0 V42" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"${dash} />
      <path d="M4 32 L11 50 L18 32 Z" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round" />
    </svg>`;
};

// Paint the swappable visual part of an arrow element from a resolved spec.
const renderArrowVisual = (el: HTMLElement, orient: ArrowOrient, resolved: ResolvedArrow): void => {
  const visual = el.querySelector<HTMLElement>(".composition-arrow-visual")!;
  if (resolved.style === "vs") {
    visual.innerHTML = `<div class="composition-vs">VS</div>`;
    visual.querySelector<HTMLElement>(".composition-vs")!.style.color = resolved.color;
  } else {
    visual.innerHTML = arrowSvg(orient, resolved);
  }
};

// Build an interactive connector element. Carries a hover edit button that
// opens the per-arrow editor popover; exposes `_updateArrow` so the
// lightweight render path can recolor/restyle it without a full rebuild.
const buildArrow = (
  orient: ArrowOrient,
  store: Store,
  fromId: string,
  resolved: ResolvedArrow,
): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "composition-arrow";
  wrap.dataset.orient = orient;
  const visual = document.createElement("div");
  visual.className = "composition-arrow-visual";
  wrap.appendChild(visual);
  renderArrowVisual(wrap, orient, resolved);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "composition-arrow-edit";
  edit.title = "Edit arrow";
  edit.setAttribute("aria-label", "Edit arrow");
  edit.appendChild(pencilIcon());
  edit.addEventListener("click", (e) => {
    e.stopPropagation();
    openArrowEditor(store, fromId, wrap);
  });
  wrap.appendChild(edit);

  (wrap as any)._updateArrow = (r: ResolvedArrow) => renderArrowVisual(wrap, orient, r);
  (wrap as any)._fromId = fromId;
  return wrap;
};

// ---- Per-arrow editor popover (singleton, body-mounted) ----------------
// Lives outside the composition subtree so it survives the rebuilds that
// arrow edits trigger; positioned next to the clicked arrow's edit button.
let arrowPop: HTMLDivElement | null = null;
let arrowPopFromId: string | null = null;

const closeArrowEditor = (): void => {
  if (arrowPop) arrowPop.hidden = true;
  arrowPopFromId = null;
};

const openArrowEditor = (store: Store, fromId: string, anchor: HTMLElement): void => {
  if (!arrowPop) {
    arrowPop = document.createElement("div");
    arrowPop.className = "composition-arrow-pop";
    arrowPop.hidden = true;
    // Each style option previews the connector it sets (a solid arrow, a
    // dashed arrow, a VS badge) instead of a text label.
    const miniArrow = (dash: boolean) =>
      `<svg viewBox="0 0 30 14" aria-hidden="true">` +
      `<path d="M2 7 H19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"${dash ? ' stroke-dasharray="3 3"' : ""}/>` +
      `<path d="M16 3 L26 7 L16 11 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
    arrowPop.innerHTML = `
      <div class="arrow-pop-styles" role="group" aria-label="Arrow style">
        <button type="button" data-style="solid" title="Solid arrow" aria-label="Solid arrow">${miniArrow(false)}</button>
        <button type="button" data-style="dashed" title="Dashed arrow" aria-label="Dashed arrow">${miniArrow(true)}</button>
        <button type="button" data-style="vs" title="VS badge" aria-label="VS badge"><span class="arrow-pop-vs">VS</span></button>
      </div>
      <input type="color" class="arrow-pop-color" data-arrow-color title="Arrow color" aria-label="Arrow color" />
      <button type="button" class="arrow-pop-apply" data-apply title="Apply this style to every arrow">Apply to all</button>
    `;
    document.body.appendChild(arrowPop);
    document.addEventListener("click", (e) => {
      if (!arrowPop || arrowPop.hidden) return;
      const t = e.target as Node;
      if (arrowPop.contains(t)) return;
      if ((t as HTMLElement).closest?.(".composition-arrow-edit")) return;
      closeArrowEditor();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeArrowEditor();
    });
  }
  arrowPopFromId = fromId;
  const pop = arrowPop;

  const sync = () => {
    const resolved = resolveArrow(store.get(), fromId);
    pop.querySelectorAll<HTMLButtonElement>("[data-style]").forEach((b) => {
      const active = b.dataset.style === resolved.style;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    pop.querySelector<HTMLInputElement>("[data-arrow-color]")!.value = resolved.color;
  };

  // (Re)wire handlers against the current fromId.
  pop.querySelectorAll<HTMLButtonElement>("[data-style]").forEach((b) => {
    b.onclick = () => {
      store.setArrow(arrowPopFromId!, { style: b.dataset.style as ArrowStyle });
      sync();
    };
  });
  const colorInput = pop.querySelector<HTMLInputElement>("[data-arrow-color]")!;
  colorInput.oninput = () => store.setArrow(arrowPopFromId!, { color: colorInput.value });
  pop.querySelector<HTMLButtonElement>("[data-apply]")!.onclick = () => {
    const r = resolveArrow(store.get(), arrowPopFromId!);
    store.applyArrowToAll({ style: r.style, color: r.color });
    closeArrowEditor();
  };

  sync();
  pop.hidden = false;
  // Center horizontally on the arrow and drop clearly below it so the strip
  // never covers the connector. Flip above if there's no room below.
  const rect = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  const gap = 10;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - pw / 2, window.innerWidth - pw - 8));
  let top = rect.bottom + gap;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - gap - ph);
  arrowPop.style.left = `${left}px`;
  arrowPop.style.top = `${top}px`;
};

const buildAddRow = (store: Store): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.className = "composition-add-row";
  wrap.innerHTML = `
    <button type="button" data-add="code">+ code</button>
    <button type="button" data-add="image">+ image / video</button>
    <button type="button" class="composition-reset" data-reset>
      <span class="ico"></span><span>Reset</span>
    </button>
    <button type="button" class="composition-clear" data-clear>
      <span class="ico"></span><span>Clear</span>
    </button>
    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" multiple hidden />
  `;
  const clearBtn = wrap.querySelector<HTMLButtonElement>("[data-clear]")!;
  clearBtn.querySelector(".ico")!.appendChild(trashIcon());
  clearBtn.addEventListener("click", () => {
    if (store.get().panels.length > 0 && !confirm("Remove all panels?")) return;
    clearPersisted();
    // Empty the panels but keep the current layout, theme, scale, etc.
    store.set((c) => ({ ...c, panels: [], selectedId: null }));
  });
  const resetBtn = wrap.querySelector<HTMLButtonElement>("[data-reset]")!;
  resetBtn.querySelector(".ico")!.appendChild(refreshIcon());
  resetBtn.addEventListener("click", () => {
    if (store.get().panels.length > 0 && !confirm("Replace the current composition with the default?")) return;
    clearPersisted();
    store.set(() => defaultComposition());
  });
  const codeBtn = wrap.querySelector<HTMLButtonElement>('[data-add="code"]')!;
  const imgBtn = wrap.querySelector<HTMLButtonElement>('[data-add="image"]')!;
  const fileInput = wrap.querySelector<HTMLInputElement>('input[type="file"]')!;
  const tryAdd = (p: Parameters<Store["addPanel"]>[0]): boolean => {
    const added = store.addPanel(p);
    if (!added) showToast(`Grid mode is capped at ${GRID_MAX_PANELS} panels`);
    return added;
  };
  codeBtn.addEventListener("click", () => tryAdd(makeCodePanel()));
  imgBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files) return;
    const { fileToImagePanel } = await import("./util");
    for (const f of Array.from(fileInput.files)) {
      const p = await fileToImagePanel(f);
      if (p && !tryAdd(p)) break;
    }
    fileInput.value = "";
  });
  const renderDisabled = () => {
    const c = store.get();
    const atMax = c.layout === "grid" && c.panels.length >= GRID_MAX_PANELS;
    codeBtn.disabled = atMax;
    imgBtn.disabled = atMax;
    codeBtn.title = atMax ? `Grid mode is capped at ${GRID_MAX_PANELS} panels` : "";
    imgBtn.title = atMax ? `Grid mode is capped at ${GRID_MAX_PANELS} panels` : "";
  };
  renderDisabled();
  store.subscribe(renderDisabled);
  return wrap;
};
