# Changelog

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
