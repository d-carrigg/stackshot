# Changelog

## 0.12.2 — 2026-05-23

### Fixed
- **Accessibility (web).** Added an `<h1>` page heading, labeled the code
  editor textareas (`aria-label="Code"`) and the custom-scale input, gave
  every modal an accessible name (`aria-label`/`aria-labelledby`), and
  wired the licenses modal's tabs to their panel (`role="tabpanel"` +
  `aria-controls`/`aria-labelledby`).

## 0.12.1 — 2026-05-22

### Fixed
- **Dialogs now actually close** (web). The chrome dialogs (Templates,
  About, Open-source licenses) set `display: flex`, an author rule that
  overrode the UA `dialog:not([open]) { display: none }`. Clicking close
  removed the backdrop but left the dialog card on screen; closed dialogs
  are now hidden again.

## 0.12.0 — 2026-05-22

### Added
- **Arrow styles** (web). Connectors between panels can now be **solid**
  (the classic filled arrow), **dashed**, or a **VS badge** for
  comparisons.
- **Per-arrow editing** (web). Hover any connector in the editor to reveal
  an edit button; pick its style and color, or "Apply to all" to push one
  arrow's look onto every connector. Picking a theme or custom arrow color
  resets per-arrow color overrides (it acts as an apply-to-all).
- **Show-arrows toggle** (web). A new topbar toggle shows/hides connectors
  in every layout.
- **Arrows in grid layout** (web). Grid compositions now draw connectors
  between orthogonally-adjacent cells (in reading order).
- **"This vs That" template** (web). A two-image comparison starter with a
  VS badge between the panels.
- **"Numbered pipeline" template** (web). A numbered 2×2 grid walking a
  load → aggregate → fit → forecast data flow, with arrows linking each
  step.

### Fixed
- **Grid export now matches the editor** (web). Panels stretch to a
  uniform column width and equal row heights instead of floating at their
  natural size, and connectors center on the panel boxes.
- **Dialogs and the overflow menu are opaque** (web). They used a
  translucent surface token, so on the light/sunset/ocean themes the
  canvas (and its arrows) bled through.
- **Dialog close buttons are easier to tap** (web). The close control is
  larger on touch devices so taps no longer miss and fall through to the
  backdrop.

## 0.11.1 — 2026-05-22

### Added
- **About dialog** (web). A new "About" item in the ⋯ overflow menu (above
  "Open-source licenses") opens a small dialog describing stackshot with
  links to the repo and releases.

### Changed
- **Browse templates is now a topbar button** (web) instead of an item
  buried in the ⋯ overflow menu, sitting alongside Preview / Copy /
  Download.

### Fixed
- **No more stray divider at the top of the ⋯ overflow menu** (web). The
  separator above the licenses / CLI links now only appears once a
  control has actually folded into the menu at narrow widths.

## 0.11.0 — 2026-05-22

### Changed
- **Animated WEBP export is dramatically faster** (web) and no longer freezes
  the UI. Encoding now uses the browser's native WebCodecs `VideoEncoder`
  (VP8 keyframes muxed straight into the WEBP container) instead of a serial,
  main-thread `canvas.toBlob` per frame. Output is the same animated WEBP.
- **Unified rendering pipeline.** All exports now flow through one frame
  generator (`renderFrames` — one frame for a still, N for animation) and a
  single per-format encoder dispatch. PNG, WEBP, and GIF — static and
  animated — all share the same path; "static vs animated" is just frame
  count, not a separate code path.
- **Render progress is shown as a percentage.** The preview modal shows
  "Rendering… NN%", and the copy/download buttons show a live percentage in
  place of their icon while encoding. Copy/Download are disabled until the
  render is ready.
- **Renders are cached.** Repeated preview/copy/download reuse the last
  render until something output-affecting changes (content, titles, styling,
  scale, layout, or format) — so copying after a preview is instant.

### Changed
- **Copy is disabled when the composition is animated.** Browsers only put a
  static image on the clipboard, so for animated content the Copy button (and
  ⌘C) are disabled with a tooltip pointing to Download, which gives the real
  webp/gif. The state stays in sync as panels are added or removed; a still
  image leaves Copy enabled.

### Fixed
- **Copy to clipboard no longer fails on the first click.** The write is now
  issued synchronously within the click (with a promised blob), so a slow
  first render can't outlive the browser's user-activation window. Copy uses
  the selected format where the browser supports it on the clipboard; since
  browsers only accept PNG images on the clipboard in practice (webp/gif are
  rejected), it falls back to a PNG still — download still produces the true
  webp/gif file. The button shows a spinner while the OS clipboard write
  completes.

## 0.10.4 — 2026-05-22

### Fixed
- **Export/preview/copy works again for compositions with a GIF** (web).
  Animated panels failed with "ImageDecoder constructor: 'data' member of
  ImageDecoderInit could not be converted…" because the decoder was handed
  a `Blob`, which it no longer accepts. We now read the blob into an
  `ArrayBuffer` before decoding.
- **Image and GIF panels now render at the composition scale** (web),
  instead of their tiny native pixel size next to scale-rasterized code
  panels. Images are upscaled by the active scale (capped at 1200 logical
  px), matching the CLI's behavior, so a small screenshot or GIF sits at a
  consistent size in both the preview and the export.

## 0.10.3 — 2026-05-22

### Fixed
- **Add/Reset/Clear row stays centered on screen** (web). In horizontal
  layout the button row no longer drifts right as panels are added — it
  is pinned to the viewport center and stays put while scrolling. In
  grid layout the row is now centered like vertical instead of
  left-aligned. The empty-state message ("No panels yet.") is also
  centered in horizontal layout instead of sitting off to the side.

## 0.10.2 — 2026-05-22

### Changed
- **"Clear all" is now just "Clear"** (web), and clearing the canvas
  keeps your current layout, theme, and scale instead of snapping back
  to the vertical default — it only removes the panels.

## 0.10.1 — 2026-05-22

### Changed
- **Grid layout is now always two columns** (web). 3, 5, and 6 panels
  previously spread across three columns; they now wrap into rows of two
  (3/4 → 2×2, 5/6 → 3×2) for a more consistent, readable grid.

## 0.10.0 — 2026-05-22

### Added
- **Grid-mode card numbering** (web). A `#` "numbers" toggle appears in
  the top bar (and overflow menu) when grid layout is active. When on,
  each cell's title is prefixed with its reading-order number
  (left-to-right, top-to-bottom); cells without a title get a bare
  number. Shown in both the live editor and the exported image.

## 0.9.0 — 2026-05-21

### Added
- **Per-panel line numbers** (web). Each code panel has a `#` toggle
  in its header that renders a line-number gutter in both the live
  editor and the exported image. ⌃/⌘-click (or a long-press on touch)
  toggles every code panel at once. Off by default, persisted per
  panel, and recorded in PNG export metadata.
- **Get the CLI link** (web). The ⋯ menu now links to the GitHub
  Releases page for the standalone binaries.

### Changed
- **Image drag-to-replace now works over code panels** (web).
  Dropping a single image file onto a code panel converts it to an
  image panel in place (keeping its position and title) instead of
  appending a new panel at the end. The hovered code panel is
  highlighted during the drag and the drop prompt reads "Drop to
  replace".
- **Horizontal-layout add buttons are centered** (web). The
  add/reset/clear row now sits centered under the whole composition
  rather than bunched under the first card.

### Fixed
- **Mobile add-button layout** (web). On narrow viewports the
  add/reset/clear buttons now wrap and flex to share the screen width
  (two per row) instead of overflowing off-screen.

## 0.8.0 — 2026-05-21

### Changed
- **Project renamed from `codeimg` to `stackshot`.** Breaking on
  every public surface: PyPI package name, CLI command, Python
  import (`from stackshot import …`), default output filename
  (`stackshot.png`), GitHub repo URL, standalone binary asset
  names (`stackshot-linux-x86_64`, …). The web app changes its
  brand, page title, PWA manifest, IndexedDB name, localStorage
  keys, and download filename prefix to match — existing browser
  state under the old `codeimg.*` keys is silently abandoned (no
  migration). PNG export metadata `app` field also moves from
  `"codeshot"` to `"stackshot"`. The original name collided with
  existing products at `codeimg.io` / `codeimg.dev`; renaming now
  while the package is still unpublished and the repo is private
  is the cheapest moment to do it.

## 0.7.1 — 2026-05-21

### Fixed
- CI: **Standalone binaries ship again.** The release workflow's
  PyInstaller stage was copying the whole `src/` tree (which now
  contains both `cli/` and `web/`) into `codeimg/`, nesting the
  entry point at `codeimg/cli/__main__.py` and breaking the build
  with "Script file 'codeimg/__main__.py' does not exist." Stage
  step now mirrors only `src/cli/` → `codeimg/`, matching the
  setuptools `package-dir` layout. v0.7.0 shipped without binaries;
  v0.7.1 is a re-cut with the same source + working binaries.

## 0.7.0 — 2026-05-21

### Fixed
- Web: **Panel reorder drops now register reliably.** The code-editor
  textarea was calling `stopPropagation()` on every drop, including
  panel-reorder drags — so the drop indicator showed but the actual
  move never reached the card's drop handler when the cursor landed
  over the editor body. The textarea now only blocks file/text drops
  and lets `text/x-panel-id` bubble.
- Web: Drop indicators no longer flash on adjacent same-side drops
  that would result in no movement (e.g. dropping a panel on the
  half right next to its current slot). Cleared stale indicator
  classes that could linger if a drag ended outside any target.
- Web: **Image panels are now centered horizontally** in vertical
  layout instead of pinning to the left edge of the wider column.
- Web: **Sunset theme chrome no longer clashes.** Themes now carry
  their own `accent` (and `accentText`) so the brand text, active
  pill underline, and download button adapt instead of staying
  catppuccin blue on the peach bg. Sunset uses dark navy as its
  accent for a monochromatic warm-on-cool look; muted text and
  borders were retuned to warm tones too.

### Added
- Web: **Language picker is now a typed-filter combobox.** The flat
  text input narrows the dropdown as you type and the dropdown
  itself is themed (surface / border / accent tokens) instead of
  using the browser's default `<select>` chrome.

### Added
- Web: **Templates modal.** "Browse templates…" in the overflow menu
  opens a card grid of starter compositions (Code → Code,
  Code → Image, Code → GIF) with live-rendered thumbnails. Picking a
  card replaces the current composition (confirms when non-empty).
- Web: **Open-source licenses modal.** Overflow menu entry that
  surfaces both `THIRD_PARTY_LICENSES.md` (CLI/Python binaries) and
  `THIRD_PARTY_LICENSES_WEB.md` (web bundle deps, generated from
  the production npm tree) in a tabbed dialog. Content is rendered
  as proper HTML — headings, code blocks, tables, links — via a
  tiny in-house markdown renderer rather than dumped as raw text.
- Web: **Reset button** moved from the overflow menu into the bottom
  add-row alongside +code / +image / Clear-all, so restoring the
  default composition isn't buried two clicks deep.

### Changed
- Web: **Inner panel border is now per-image, default off.** Removed
  the composition-wide "Inner panel border" toggle from the overflow
  menu; each image panel now carries its own `innerBorder` flag with
  a small `border` checkbox in the panel header controls. The UI
  card mirror reflects the toggle live (padded frame when on, just
  the image with rounded corners when off).
- Web: **Grid mode caps at 6 panels.** Grid dimensions auto-fit the
  panel count (1×1 → 1×2 → 1×3 → 2×2 → 2×3) so every added panel
  shows up in the export instead of silently falling off-grid. Add
  buttons disable at the cap; switching to grid with more than six
  panels is refused with a toast.
- Web: **Form/textarea inputs use `data-form-type="other"`** instead
  of `autocomplete="off"`, which password managers were ignoring on
  some form-shaped widgets. Title input, code textarea, and the new
  language combobox all carry the hint.

## 0.6.1 — 2026-05-21

### Fixed
- Web: theme-pill tooltips now anchor **below** the swatch instead
  of above, so they're no longer clipped by the top of the viewport
  when the theme strip sits in the topbar.

## 0.6.0 — 2026-05-21

### Changed
- Web: **Topbar-only chrome**. The right rail is gone; every primary
  control (layout, theme, scale, format, preview, copy, download)
  lives in the topbar, with a `⋯` overflow menu and a footer status
  bar carrying composition meta + keyboard-shortcut hints.
- Web: **Scale as flat pills** — `LOW / MED / HIGH / CUSTOM` instead
  of a slider. Defaults bumped: `low=3.0`, `med=4.0` (new default),
  `high=5.0`. Custom accepts any value in `1.0–8.0` (step `0.5`).
- Web: **Icon-only action buttons** for Preview / Copy / Download
  with native tooltips. Download keeps its accent fill as the
  primary CTA; the trio takes roughly a third of the horizontal
  space its labeled predecessors did.
- Web: **Theme-custom popover** replaces the always-on color inputs
  — click the `+` swatch in the topbar theme strip (or in the menu's
  Theme section) to open bg/arrow color pickers.
- Web: **Clear all** moves from the overflow menu into the bottom
  add-row alongside `+code` / `+image`, styled as a danger
  affordance.

### Added
- Web: **Responsive collapse**. As the viewport narrows the topbar
  progressively folds Format `<880`, Scale `<740`, Theme `<600`,
  Layout `<460` into the `⋯` menu as clearly labeled sections.
  Below `480` the topbar still flex-wraps as a fallback so labels
  remain reachable.
- Web: **Footer status bar** at the bottom of the viewport: live
  composition meta on the left (panel count, layout, scale, border
  state), `⌘S` / `⌘C` keyboard hints on the right. The shortcuts
  are wired globally — `⌘S` triggers download, `⌘C` copies to
  clipboard (skipped when a text selection or input is focused).
- Web: **`SCALE_VALUES` / `DEFAULT_SCALE`** exported from
  `state.ts`; the default composition tracks the named med preset
  rather than a literal `2.0`.

### Removed
- Web: right-rail `SettingsPanel.ts` and its CSS.

## 0.5.0 — 2026-05-20

### Added
- Web: **Grid layout**. Third layout option alongside Horizontal and
  Vertical, with snap-to-grid rows × cols (configurable 1–4 each).
  Drag a panel onto another to swap cells. New `gridRows` / `gridCols`
  on `Composition` and optional `gridRow` / `gridCol` per panel.
- Web: **Animated GIF / WEBP input → animated WEBP output**. Drop a
  GIF or animated WEBP and the panel plays in the exported image. The
  Export button switches to "Export WEBP" automatically. Uses the
  browser's native `ImageDecoder` for frame extraction and a pure-JS
  WEBP muxer that wraps per-frame `canvas.toBlob("image/webp")` output
  — no WASM dependency added.
- Web: **Preview modal**. Topbar button opens a native `<dialog>` with
  the exact image that would be exported, plus inline Download / Copy
  actions.
- Web: **PWA**. Installable via `vite-plugin-pwa`; ships a service
  worker that precaches the build (and the Shiki language chunks) for
  offline use. New manifest at `public/manifest.webmanifest` and PNG
  icons in `public/icons/` (regeneratable via `scripts/make-icons.mjs`).
- Web: **IndexedDB image store**. Image blobs persist to IndexedDB
  (`codeimg/images`) so animated assets no longer blow past the 5MB
  localStorage quota. Composition shape stays in compressed
  localStorage with `blobId` refs. One-time v1 → v2 migration runs on
  first load.
- Web: **Lucide-style icon set** at `src/web/ui/icons.ts`. Replaces
  unicode `‹ › ×` placeholders and feeds the new topbar / preview
  buttons. No external dep.

### Changed
- Web: **Default layout is now Vertical** (new compositions only;
  existing persisted compositions keep their layout).
- Web: **Layout selector moved to the topbar** as a segmented control
  (Vertical / Horizontal / Grid). Right-rail "Composition" section
  now only carries scale, colours, image options, and (when grid is
  active) rows/cols sliders.
- Web: Inner-panel-border toggle nested under an **"Image options"**
  subhead, since it only affects image panels.
- Web: Persistence schema bumped to `codeimg.composition.v2`. v1
  payloads migrate transparently and are removed.

## 0.4.3 — 2026-05-20

### Fixed
- Web: language `<select>` no longer triggers password-manager /
  browser autofill. Adds `autocomplete="off"` plus
  `data-1p-ignore` / `data-lpignore` / `data-form-type="other"`
  hints, and a unique `name` so 1Password and similar stop matching
  it as a country/language field.
- Web: dragging files or text over a code editor no longer shows the
  textarea's native drop-caret indicator and can no longer replace
  the editor contents. The global drop handler still catches the
  file and adds a new panel.

### Changed
- Web: in horizontal layout, the "+ code" / "+ image" buttons now sit
  in a row beneath the panels instead of stacked to the right, so the
  panel row reads as a single composition. Buttons restyled as
  dashed-outline affordances ("+ code", "+ image") to match the
  empty/placeholder visual language.

## 0.4.2 — 2026-05-20

### Added
- Web app loads Umami analytics from `cloud.umami.is`. CSP updated
  to whitelist that origin in `script-src` and `connect-src`. Umami
  is cookieless and PII-free, but a privacy-conscious update to the
  topbar tagline ("data never leaves your browser") may be worth
  considering separately.

### Fixed
- `tsc --noEmit` failed in CI with `TS2882: Cannot find module or type
  declarations for side-effect import of './ui/styles.css'` because
  `tsconfig.json` sets `types: []` (disables auto-loaded `@types/*`)
  but never explicitly referenced Vite's client types. Add
  `src/web/env.d.ts` with `/// <reference types="vite/client" />`
  so CSS / asset side-effect imports type-check.

## 0.4.1 — 2026-05-20

### Fixed
- Pin web app to `vite ^7.1.0`. Dependabot bumped to `vite ^8.0.13`
  (#10), which requires Node 20.19+/22.12+ and ships the rolldown
  bundler — whose Linux x64 native binding doesn't install cleanly
  under the current npm optional-deps bug, breaking the production
  build. Reverting unblocks the deploy.

### Added
- `.github/dependabot.yml` ignores major `vite` bumps until rolldown
  stabilises in stable npm distributions, so this doesn't regress.

## 0.4.0 — 2026-05-20

### Added
- Browser-based composer in `src/web/`. Vite + TypeScript + Shiki +
  Canvas; no backend, no Pyodide. Deploys as a static site (Azure
  Static Web Apps free tier). Mirrors the CLI's palette, layout
  geometry, and arrow rendering so output matches the Python pipeline.
- Three-pane web UI: panel list (drag-reorder, +Code/+Image), per-panel
  editor (styled textarea + language picker, or image dropzone), and
  composition settings (layout, scale, colors, inner border).
- Paste-to-add: paste an image from the clipboard or drop image/code
  files anywhere on the page to create new panels.
- Shareable URL: composition state is LZ-compressed into `location.hash`
  on every change; opening the same URL restores the composition.
- PNG export via `canvas.toBlob` and "Copy to clipboard" via the async
  Clipboard API.
- `staticwebapp.config.json` with SPA fallback for Azure SWA hosting.

### Changed
- Python sources moved from `src/*.py` to `src/cli/*.py` to make room
  for `src/web/`. `pyproject.toml`'s `package-dir` re-points the
  `codeimg` package at `src/cli`; imports and the `codeimg` console
  script entry point are unchanged.

## 0.3.1 — 2026-05-20

### Added
- `THIRD_PARTY_LICENSES.md` collecting verbatim license texts for every
  runtime dependency bundled into the standalone binaries: Pillow
  (MIT-CMU), prompt_toolkit (BSD-3-Clause), Pygments (BSD-2-Clause),
  wcwidth (MIT), and the optional `[ui]` extra tkinterdnd2 (MIT). The
  Pillow section also carries the native-library notices (libjpeg,
  libpng, libtiff, libwebp, FreeType, etc.) that Pillow vendors and
  that ship inside the binaries.
- `release.yml` now attaches `LICENSE` and `THIRD_PARTY_LICENSES.md` to
  each GitHub Release once (from the Linux matrix job), alongside the
  three platform binaries — closing the attribution gap for users who
  only ever see the binary. Source/wheel installs were already
  compliant via each dep's bundled LICENSE.

## 0.3.0 — 2026-05-20

### Changed
- `--ui` window is rebuilt from scratch. It's now a clean dark editor
  matching the output palette, with:
  - N-panel support (not just 2) with `+ Add panel` / per-panel remove,
    backed by `compose_panels`.
  - Per-panel title entry and a real code editor (the previous build
    created the text widgets but never gridded them — the fields were
    invisible).
  - Drag-and-drop image files onto a panel to convert it to an image
    panel, plus a Browse button (works without the optional extra).
  - Background and arrow color pickers, horizontal/vertical layout
    toggle, no-inner-border toggle, and a scale selector (1.0–3.0) that
    drives the saved output's resolution.
  - Live debounced preview, Save As (PNG/WebP), clipboard copy on save.
- The 0.2.5 "Known gap" — `--ui` ignoring `--scale` — is resolved; the
  new UI has its own scale picker that defaults to `2.0` to match the
  CLI default.

### Added
- `codeimg[ui]` extra installs `tkinterdnd2` for cross-platform
  drag-and-drop. Without it the UI still runs (Browse-only); with it,
  files dropped onto a panel set the image.

## 0.2.5 — 2026-05-20

### Added
- `--scale FLOAT` CLI flag (default `2.0`) — a single multiplier that
  scales fonts, paddings, gutters, arrow dimensions, and the per-panel
  max-size bounds together so layout proportions stay identical. Code
  panels rasterize natively at the higher size via Pygments (no LANCZOS
  blur on glyphs); image panels are upscaled via LANCZOS. Use
  `--scale 1` to reproduce the pre-0.2.5 compact sizing; `--scale 3`
  for ~1080p-class output.

### Changed
- Default output is now HD-quality. The committed sample PNGs in
  `docs/img/` regenerate at roughly 2× their previous dimensions (e.g.
  `vertical.png` 608×483 → 1216×951). Pass `--scale 1` to opt back into
  the old sizing.
- `compose_panels`, `compose_side_by_side`, `compute_layout`, and
  `render_code_image` gained a `scale: float = 1.0` keyword argument.
  Library callers don't need to change unless they want crisper output.
- New `io_utils.fit_image` / `fit_frames` helpers handle the
  bounds-scaling and optional LANCZOS upscale for image panels,
  used by the CLI and interactive paths.

### Known gaps
- `--ui` (desktop preview window) does not yet honor `--scale` and
  still renders at the pre-0.2.5 compact sizing. CLI invocations
  (the primary path) pick up the new default automatically.

## 0.2.4 — 2026-05-20

### Added
- `docs/examples/record_print_loop.sh` — one-command regeneration of
  the README's `print_loop.gif` sample via asciinema + agg.
- `*.cast` is now gitignored; recordings are kept local and the
  committed GIFs are the source of truth.

## 0.2.3 — 2026-05-20

### Fixed
- Horizontal layouts now vertically center each panel within the row.
  Previously panels were top-aligned, so a tall panel next to a short
  one left the short one floating against the top while the arrow
  pointed somewhere between them. Affects both `compose_panels` and
  the per-frame `compose_side_by_side` used in animated output.
- Animated code → gif output no longer speeds up the source GIF. The
  parallel-mode duration picker used `min(left, right)`, which capped
  slow animations at the static code panel's 100ms placeholder (a 7×
  speedup for a 500ms-per-frame source). Now the animated panel's
  durations drive the output when the other side is static.

## 0.2.2 — 2026-05-20

### Changed
- Interactive mode reacts to terminal paste: if the clipboard holds an
  image, the paste creates an image panel and auto-advances to the next
  block. Pasting text stays in the editor. Replaces the previous
  "submit an empty block to grab the clipboard image" gesture entirely
  (TTY and non-TTY).
- Clipboard image fetch is now cross-platform via Pillow's `ImageGrab`
  (works on macOS, Windows, and Linux). Previous Linux-only
  `wl-paste`/`xclip` subprocess loop is removed.

### Added
- README covers PyPI (`uv tool install codeimg`), standalone GitHub
  Release binaries, and from-source install.
- Auto-tag workflow: pushing to `main` with a bumped version in
  `pyproject.toml` creates a `v<version>` tag, which triggers the
  existing release/binary build.
- `CLAUDE.md` documents the feature-branch → bump → PR → auto-tag flow.

## 0.2.1 — 2026-05-20

### Fixed
- Clipboard no longer auto-grabs whatever's already on the clipboard at app
  launch. Images are only inserted when the user submits an empty block
  (the explicit "paste" gesture).
- Code images render directly on the panel background, removing the
  Monokai-tinted fringe around glyph edges.
- Arrows are now drawn as a single supersampled polygon (4× then LANCZOS
  downsample), eliminating aliasing and the square-shaft artifact.

### Changed
- Default arrow color is now white (was mauve).
- Removed the `:cancel` interactive command — Ctrl+C handles abort.
- Image panels get rounded corners when `--no-border` is set.

### Added
- `--arrow-color` flag accepts hex (`#fff`, `#aabbcc`) or named colors.
- `compose_panels` gains a `background=(r,g,b)` parameter for callers
  that want to override the canvas color.

## 0.2.0 — 2026-05-20

### Changed (breaking)
- Renamed package and CLI from `codeshot` to `codeimg` (PyPI name conflict).
  Update imports: `from codeshot.X` → `from codeimg.X`. Invoke as `codeimg`.
- CLI now takes panels as positional arguments; removed `--left`, `--right`,
  `--left-image`, `--right-image`, `--left-lang`, `--right-lang`, `--left-title`,
  `--right-title`, `--max-left-width`, `--max-right-width`. Replaced with a single
  positional `panels` list plus parallel-list flags `--title`, `--lang`, `--file`,
  `--max-width`. Example: `codeimg before.py after.py:10-20 --title Before After`.
- Default output filename: `codeshot.png` → `codeimg.png`.
- Lowered Python floor to 3.10 (was 3.12).

### Added
- File-path panel inputs: pass a code file path (lang inferred from extension),
  optionally sliced with `path:N` / `path:N-M` / `path:N:M`.
- Image file paths auto-detected — no separate `--*-image` flag needed.
- `--no-clip` to skip the default clipboard copy.
- `python -m codeimg` entry point.
- Standalone single-file binaries for Linux, macOS, Windows on GitHub Releases.
- Published to PyPI as `codeimg`.
