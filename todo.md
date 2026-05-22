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
- [x] Per-panel line numbers — `#` toggle per code panel (live editor + export); ⌃/⌘-click or long-press toggles all (35)
- [x] Image drag-to-replace — drop an image on an image or code panel to replace it in place (37)
- [x] Center the add/action buttons in horizontal mode (18)
- [x] Download-the-CLI link — "Get the CLI" → GitHub Releases, in the ⋯ menu (34)
- [x] Mobile: add/reset/clear buttons wrap and flex to fit the screen width (39)

## In progress
- [~] Panel controls as an in-block overlay — lang indicator, remove, drag handle top-right of each panel (11)
- [~] Accessibility — aria labels + keyboard nav on combobox/modals; no full audit yet (36)

## Backlog

### Canvas & layout
- [ ] Device-aware default — zoom-to-fit 2 panels by screen size; default to vertical on small screens (7)
- [ ] Horizontal mode: "after" panel gets cut off when zoomed (~130% on 1440p) — proper crop/scale (16)

### Arrows
- [x] Multiple arrow styles/shapes (28) — solid / dashed / VS badge
- [x] Global show/hide arrows toggle in the topbar, working in all layouts incl. grid (29)
- [x] Inline arrow editing on canvas — hover edit button, per-arrow style + color, "apply to all" (30)

### Panels & content
- [ ] Per-panel color customization (25)
- [ ] Import code from a GitHub URL — file path + line selector/preview (38), could be
      and generic add web link option, screenshots the site, with a special hook for github urls to point to prompt and select lines
- [x] Better default example that shows a true input → output (12)
- [ ] Run/generate for supported langs, like run the code and then auto-generate the output (43)
- [ ] Maybe some query param to pass in a site or something automatically, inspiration is those sites where you just replace github.com with the domain to get details about the repo

### Editing & UX
- [ ] Undo / redo (32)
- [x] Dialog icons — drop backgrounds, move to the right, polish (13)
- [ ] Integrate title into the panel (currently it's a separate text element above the panel) (40)
- [x] Grid mode card numbering option (41)
- [ ] Save/load compositions (42)
- [x] Tempaltes button should be somewhere else, not in the overflow menu
- [x] There is a horizontal rule/seperator at the top of the overflow menu, it shouldn't be there
- [ ] Sometimes have to hard refresh to see new features after new release
- [ ] Descriptions/captions in addition to the title
- [ ] Abotu dialog does not close on x, closes when you click outside
- [ ] Transparency is an issue for some dialogs (e.g templates dialog has arrows from canvas drawn on it). Also on mobile the overflow menu is partialy transparent and things like arrows are drawn on top

### Remndering
- [x] Display status indicator when rendering, for animated stuff where it may take a while
- [x] Why did the site ask permission to see content on my clipboard?

## Dropped
- ~~Move preview button into the right pane (23)~~ — the right rail was removed; preview now lives in the top bar.
