# Changelog

## 0.2.2 — 2026-05-20

### Changed
- Interactive mode reacts to terminal paste: if the clipboard holds an
  image, the paste creates an image panel and auto-advances to the next
  block. Pasting text stays in the editor. Replaces the previous
  "submit an empty block to grab the clipboard image" gesture in TTY
  mode (non-TTY/piped path keeps empty-block grab for tests).

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
