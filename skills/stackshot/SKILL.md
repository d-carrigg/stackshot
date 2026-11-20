---
name: stackshot
description: Render code snippets, source-file line ranges, screenshots, and images into a single multi-panel PNG/WebP/GIF with titles and arrows between panels. Use when the user wants a picture of code, a before/after or code-to-output illustration, or an image for a README, doc, PR, blog post, or tutorial.
argument-hint: "[what to illustrate]"
allowed-tools: Bash(uv run --project ${CLAUDE_PLUGIN_ROOT} *), Bash(stackshot *)
---

# stackshot

Compose panels (code, files, images) into one illustration with the
`stackshot` CLI. The CLI source ships with this plugin, so run it with:

```bash
uv run --project "${CLAUDE_PLUGIN_ROOT}" --no-dev --frozen stackshot <panels...> [flags]
```

The first run creates a virtualenv inside the plugin and installs Pillow,
Pygments and prompt-toolkit (needs Python 3.11+; `uv` downloads one if
missing). If `uv` isn't installed but a `stackshot` binary is on `PATH`,
run `stackshot <panels...> [flags]` instead. If neither exists, tell the
user to install `uv` (https://docs.astral.sh/uv/) or download a binary
from https://github.com/d-carrigg/stackshot/releases/latest.

## Rules

- **Always pass at least one panel.** With no panels the CLI starts an
  interactive editor and waits on stdin.
- **Always pass `--no-clip`** unless the user asked for the clipboard;
  otherwise it tries `wl-copy`/`xclip`.
- **Always pass `--out`** with an explicit path the user will find
  (default is `./stackshot.png`). Extension picks the format: `.png`,
  `.webp`, or `.gif`.
- After it saves, read the output image to check it looks right, then
  give the user its path.

## Panels

Each positional argument is one panel, auto-detected in this order:

- existing image file (`.png`, `.jpg`, `.gif`, `.webp`, …) → image panel
- existing text file → code panel, language from the extension
- `path:N`, `path:N-M` or `path:N:M` → that line range of the file
- anything else → literal code

Prefer real files and line ranges over pasting code as a literal. For a
snippet that isn't in a file (for example output you produced), write it
to a temp file with the right extension and pass that path.

## Flags

Per-panel lists, matched to panels by position:

- `--title T1 T2 …` panel titles
- `--lang py rust …` language hints (override the extension guess)
- `--file a.py b.rs …` filename hints for lexer guessing
- `--max-width 800 1200 …` max content width per panel (default 1200)

Whole image:

- `--vertical` stack top-to-bottom with downward arrows (default is left-to-right)
- `--no-border` no inner card around image panels
- `--arrow-color COLOR` hex (`#aabbcc`) or a name (`white`, `cyan`)
- `--max-height N` max content height per panel (default 1200)
- `--scale F` resolution multiplier (default 2.0; 1.0 compact, 3.0 ≈ 1080p)
- `--webp-quality N`, `--webp-method N` WebP encoder settings

Animated: if a panel is an animated GIF/WebP, the output is animated.
This needs exactly 2 panels; `--sequential` plays left then right. Use
`--out x.gif` or `--out x.webp`.

## Examples

```bash
# One file, one panel
uv run --project "${CLAUDE_PLUGIN_ROOT}" --no-dev --frozen stackshot \
  src/app.py:10-40 --no-clip --out docs/img/app.png

# Before / after
uv run --project "${CLAUDE_PLUGIN_ROOT}" --no-dev --frozen stackshot \
  old.py new.py --title Before After --no-clip --out before-after.png

# Code and its output screenshot, stacked
uv run --project "${CLAUDE_PLUGIN_ROOT}" --no-dev --frozen stackshot \
  main.rs:1-20 terminal.png --title Code Output --vertical --no-clip --out demo.png
```

## User request

$ARGUMENTS
