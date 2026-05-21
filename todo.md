# stackshot — todo

Web app feature backlog. `[x]` shipped · `[~]` partial · `[ ]` open.
Numbers in parens map back to the original list.

## Shipped
- [x] Gif/WebP support; auto-select WebP when motion content is added; webp/png/gif picker (1)
- [x] WebP is the default export format (22)
- [x] Preview button → dialog showing the rendered image (2)
- [x] Layout controls live in the top bar (3)
- [x] PWA — installable, offline, service worker (4)
- [x] Inner panel border nested as an image-only option (5)
- [x] Grid layout with free row/col drag (6)
- [x] Local storage — composition in localStorage, image blobs in IndexedDB (8)
- [x] Default to vertical layout (9)
- [x] Icon set for actions (10)
- [x] Drag handle to reorder cards (replaces the `<` / `>` buttons) (20)
- [x] Themes — dark / light / sunset / ocean, plus custom (bg + arrow color) (14)
- [x] Whole page adopts the selected theme (21)
- [x] Background color adjustment (via custom theme) (33)
- [x] Embed composition/code data in PNG metadata (15)
- [x] Scale — low / medium / high / custom (17)
- [x] Flat, borderless language dropdown (19)
- [x] Examples / templates browser (24)
- [x] Open-source licenses modal (26)
- [x] Reset button relocated into the add-panel row (27)
- [x] "Canvas never leaves your browser" messaging (31)

## In progress
- [~] Panel controls as an in-block overlay — lang indicator, remove, drag handle top-right of each panel (11)
- [~] Image drag-to-replace — works on image panels; still doesn't work over code panels (37)
- [~] Accessibility — aria labels + keyboard nav on combobox/modals; no full audit yet (36)

## Backlog

### Canvas & layout
- [ ] Device-aware default — zoom-to-fit 2 panels by screen size; default to vertical on small screens (7)
- [ ] Horizontal mode: "after" panel gets cut off when zoomed (~130% on 1440p) — proper crop/scale (16)
- [ ] Center the add/action buttons on the page in horizontal mode, not under the first card (18)

### Arrows
- [ ] Multiple arrow styles/shapes (28)
- [ ] Show arrows only in grid layout; drop them in vertical/horizontal (29)
- [ ] Inline arrow editing on canvas — hover edit button, per-arrow color, "apply to all" (30)

### Panels & content
- [ ] Per-panel color customization (25)
- [ ] Line numbers toggle (35)
- [ ] Import code from a GitHub URL — file path + line selector/preview (38)
- [ ] Better default example that shows a true input → output (12)

### Editing & UX
- [ ] Undo / redo (32)
- [ ] Download-the-CLI link (PyPI / GitHub binaries) (34)
- [ ] Dialog icons — drop backgrounds, move to the right, polish (13)
- [ ] On mobile, button actions (add code, image, reset, etc) don't flex to fit the width of the screen (39)
- [ ] Integrate title into the panel (currently it's a separate text element above the panel) (40)
- [ ] Grid mode card numbering (41)

## Dropped
- ~~Move preview button into the right pane (23)~~ — the right rail was removed; preview now lives in the top bar.
