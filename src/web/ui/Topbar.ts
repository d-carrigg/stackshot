// Topbar: brand + layout segment + preview button + github link.
// The layout segment moved here from the right-rail Composition settings
// so the primary structural choice (Horizontal / Vertical / Grid) is one
// click away regardless of where the user is looking.
import type { Store, Layout } from "../state";
import { rows as rowsIcon, columns as colsIcon, grid as gridIcon, eye as eyeIcon, github as ghIcon } from "./icons";

export type TopbarHandle = {
  onPreview: (handler: () => void) => void;
};

export const mountTopbar = (root: HTMLElement, store: Store): TopbarHandle => {
  root.innerHTML = `
    <header class="topbar">
      <span class="brand">codeimg</span>
      <div class="topbar-layout seg" role="group" aria-label="Layout">
        <button type="button" data-layout-val="vertical" title="Vertical layout" aria-label="Vertical layout"></button>
        <button type="button" data-layout-val="horizontal" title="Horizontal layout" aria-label="Horizontal layout"></button>
        <button type="button" data-layout-val="grid" title="Grid layout" aria-label="Grid layout"></button>
      </div>
      <button type="button" class="topbar-preview" data-preview title="Preview"><span class="topbar-preview-icon"></span><span class="topbar-preview-label">Preview</span></button>
      <span class="subtitle" style="color: var(--muted); font-weight: 500;">quickly create code screenshots, data never leaves your browser</span>
      <span class="spacer"></span>
      <a class="topbar-link" href="https://github.com/d-carrigg/codeimg" target="_blank" rel="noreferrer" title="View on GitHub" aria-label="View on GitHub"></a>
    </header>
  `;

  // Slot icons into the layout buttons. Order matches the markup above.
  const segButtons = root.querySelectorAll<HTMLButtonElement>(".topbar-layout button");
  segButtons[0]?.appendChild(rowsIcon());
  segButtons[1]?.appendChild(colsIcon());
  segButtons[2]?.appendChild(gridIcon());
  const previewBtn = root.querySelector<HTMLButtonElement>("[data-preview]")!;
  previewBtn.querySelector(".topbar-preview-icon")!.appendChild(eyeIcon());
  const ghLink = root.querySelector<HTMLAnchorElement>(".topbar-link")!;
  ghLink.appendChild(ghIcon());

  for (const btn of segButtons) {
    btn.addEventListener("click", () => {
      const val = btn.dataset.layoutVal as Layout;
      store.patch({ layout: val });
    });
  }

  let previewHandler: (() => void) | null = null;
  previewBtn.addEventListener("click", () => previewHandler?.());

  const render = () => {
    const c = store.get();
    for (const btn of segButtons) {
      btn.classList.toggle("active", btn.dataset.layoutVal === c.layout);
    }
  };
  render();
  store.subscribe(render);

  return {
    onPreview(h) {
      previewHandler = h;
    },
  };
};
