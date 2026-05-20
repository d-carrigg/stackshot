"""Resolve a CLI panel spec string into image-or-code input.

A spec is one of:
  * `path/to/image.png`           — existing image file
  * `path/to/code.py`             — existing text file (code)
  * `path/to/code.py:42`          — single line
  * `path/to/code.py:42-58`       — line range
  * `path/to/code.py:42:58`       — line range (alt syntax)
  * literal code, anything else
"""
import os
import re
from dataclasses import dataclass
from typing import Optional


IMAGE_EXTENSIONS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".ico", ".avif",
})

_RANGE_SUFFIX = re.compile(r"(.*?)(?::(\d+)(?:[-:](\d+))?)?$", re.DOTALL)


@dataclass
class ResolvedPanel:
    is_image: bool
    code: str = ""
    image_path: Optional[str] = None
    filename_hint: Optional[str] = None  # for lexer guessing
    source_path: Optional[str] = None  # original file (None for literal code)
    line_range: Optional[tuple[int, int]] = None  # 1-indexed inclusive


def _split_line_range(spec: str) -> tuple[str, Optional[tuple[int, int]]]:
    """Strip a trailing `:N`, `:N-M`, or `:N:M` and return (path, range)."""
    m = _RANGE_SUFFIX.match(spec)
    if not m or not m.group(2):
        return spec, None
    start = int(m.group(2))
    end = int(m.group(3)) if m.group(3) else start
    if end < start:
        start, end = end, start
    return m.group(1), (start, end)


def _slice_lines(text: str, line_range: tuple[int, int]) -> str:
    start, end = line_range
    lines = text.splitlines()
    # 1-indexed inclusive
    return "\n".join(lines[max(0, start - 1):end])


def resolve_panel(spec: str) -> ResolvedPanel:
    """Interpret `spec` as image path, code file (optionally sliced),
    or literal code. Falls back to literal if no file matches."""
    # Try with range suffix stripped first; if that resolves to a file, win.
    candidate, line_range = _split_line_range(spec)
    expanded = os.path.expanduser(os.path.expandvars(candidate))
    if os.path.isfile(expanded):
        ext = os.path.splitext(expanded)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            return ResolvedPanel(is_image=True, image_path=expanded, source_path=expanded)
        with open(expanded, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        if line_range is not None:
            text = _slice_lines(text, line_range)
        return ResolvedPanel(
            is_image=False,
            code=text.rstrip("\n"),
            filename_hint=os.path.basename(expanded),
            source_path=expanded,
            line_range=line_range,
        )

    # No range stripped, or range-stripped path didn't exist — try the raw spec.
    expanded_full = os.path.expanduser(os.path.expandvars(spec))
    if os.path.isfile(expanded_full):
        ext = os.path.splitext(expanded_full)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            return ResolvedPanel(is_image=True, image_path=expanded_full, source_path=expanded_full)
        with open(expanded_full, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        return ResolvedPanel(
            is_image=False,
            code=text.rstrip("\n"),
            filename_hint=os.path.basename(expanded_full),
            source_path=expanded_full,
        )

    return ResolvedPanel(is_image=False, code=spec)
