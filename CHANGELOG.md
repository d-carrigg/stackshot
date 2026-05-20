# Changelog

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
