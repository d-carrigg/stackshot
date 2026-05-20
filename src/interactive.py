import hashlib
import io
import select
import sys
import tempfile
from typing import Optional

from PIL import Image

from .compose import compose_panels
from .highlight import render_code_image
from .io_utils import (
    copy_to_clipboard,
    expand_path,
    open_image,
    save_image,
    scale_image_to_max,
    try_get_clipboard_image,
)
from .markdown import Panel, parse_markdown


CLIPBOARD_POLL_SECONDS = 0.25


def _build_session():
    """Lazy-import prompt_toolkit so test/non-TTY paths don't pay the cost."""
    from prompt_toolkit import PromptSession
    from prompt_toolkit.key_binding import KeyBindings

    kb = KeyBindings()

    @kb.add("enter")
    def _submit(event):
        event.current_buffer.validate_and_handle()

    # Newline insertion: Alt+Enter and Ctrl+J. Most terminals don't
    # distinguish Shift+Enter from Enter, so we use the portable
    # equivalents instead.
    @kb.add("escape", "enter")
    @kb.add("c-j")
    def _newline(event):
        event.current_buffer.insert_text("\n")

    return PromptSession(multiline=True, key_bindings=kb)


_session = None


def _read_text_block_tty() -> Optional[str]:
    global _session
    if _session is None:
        _session = _build_session()
    try:
        return _session.prompt("")
    except (EOFError, KeyboardInterrupt):
        return None


def _clipboard_image_snapshot() -> Optional[tuple[str, Image.Image]]:
    img = try_get_clipboard_image()
    if img is None:
        return None
    buf = io.BytesIO()
    img.convert("RGBA").save(buf, format="PNG")
    return hashlib.sha1(buf.getvalue()).hexdigest(), img


def _stdin_ready(timeout: float) -> bool:
    """True if sys.stdin has a line waiting. Falls back to True when stdin
    doesn't support select (e.g. StringIO in tests)."""
    try:
        ready, _, _ = select.select([sys.stdin], [], [], timeout)
        return bool(ready)
    except (OSError, ValueError, io.UnsupportedOperation):
        return True


def _save_clipboard_image_as_panel(img: Image.Image, panels: list[Panel]) -> None:
    tmp = tempfile.NamedTemporaryFile(prefix="codeimg-clip-", suffix=".png", delete=False)
    img.convert("RGBA").save(tmp.name, format="PNG")
    panels.append(Panel(code="", is_image=True, image_path=tmp.name))


def _check_clipboard_for_new_image(
    panels: list[Panel], last_image_hash: Optional[str]
) -> Optional[tuple[str, str, Optional[str]]]:
    snap = _clipboard_image_snapshot()
    if snap is None:
        return None
    h, img = snap
    if h == last_image_hash:
        return None
    _save_clipboard_image_as_panel(img, panels)
    print(f"[Image {len(panels)}]")
    return "image", panels[-1].image_path or "", h


def _read_block_or_image_tty(
    panels: list[Panel], last_image_hash: Optional[str]
) -> tuple[str, str, Optional[str]]:
    """TTY path: full multi-line editor via prompt_toolkit. Clipboard is
    checked before showing the prompt and again after submission if no
    text was typed — so a newly-copied image still becomes the next panel
    on the very next Enter, without the user needing a command."""
    pre = _check_clipboard_for_new_image(panels, last_image_hash)
    if pre is not None:
        return pre

    text = _read_text_block_tty()
    if text is None:
        return "cancel", "", last_image_hash
    if text.strip() == ":cancel":
        return "cancel", "", last_image_hash

    if not text.strip():
        post = _check_clipboard_for_new_image(panels, last_image_hash)
        if post is not None:
            return post

    return "text", text, last_image_hash


def _read_block_or_image_polling(
    panels: list[Panel], last_image_hash: Optional[str]
) -> tuple[str, str, Optional[str]]:
    """Non-TTY path (pipes, tests): line-based input with concurrent
    clipboard polling, two-blank-lines or EOF to submit."""
    lines: list[str] = []
    blank_run = 0

    while True:
        if not lines:
            result = _check_clipboard_for_new_image(panels, last_image_hash)
            if result is not None:
                return result

        if _stdin_ready(CLIPBOARD_POLL_SECONDS):
            line = sys.stdin.readline()
            if not line:  # EOF / Ctrl+D
                break
            line = line.rstrip("\n")
            if line.strip() == ":cancel":
                return "cancel", "", last_image_hash
            if line == "":
                blank_run += 1
                if blank_run >= 2:
                    break
                lines.append(line)
            else:
                blank_run = 0
                lines.append(line)
        # else: timeout — loop to re-poll clipboard

    while lines and lines[-1] == "":
        lines.pop()
    return "text", "\n".join(lines), last_image_hash


def _read_block_or_image(
    panels: list[Panel], last_image_hash: Optional[str]
) -> tuple[str, str, Optional[str]]:
    is_tty = False
    try:
        is_tty = sys.stdin.isatty()
    except (AttributeError, ValueError):
        is_tty = False
    if is_tty:
        return _read_block_or_image_tty(panels, last_image_hash)
    return _read_block_or_image_polling(panels, last_image_hash)


def _panel_summary(panels: list[Panel]) -> None:
    for idx, p in enumerate(panels):
        if p.is_image:
            print(f"  [{idx}] (image)")
            continue
        t = p.title or "(no title)"
        lang = p.lang or "auto"
        ln = len(p.code.splitlines()) or 1
        print(f"  [{idx}] {t}  ({lang}, {ln} line{'s' if ln != 1 else ''})")


def interactive_compose(args) -> None:
    print("Codeimg interactive mode")
    print("Paste code or markdown — ```lang fences set syntax, the line above is the title.")
    print("End a text block with two blank lines (or Ctrl+D).")
    print("Paste an image into your clipboard and it's added automatically as the next panel.")
    print("Type :cancel on its own line to abort.\n")

    panels: list[Panel] = []
    last_image_hash: Optional[str] = None
    action = ""

    while True:
        label = f"Block {len(panels) + 1}" if not panels else f"Add block {len(panels) + 1} (Enter empty to finish)"
        print(f"--- {label} ---")
        kind, payload, last_image_hash = _read_block_or_image(panels, last_image_hash)

        if kind == "cancel":
            print("Cancelled.")
            return
        if kind == "image":
            continue  # auto-advance, no action menu
        # kind == "text"
        if payload.strip():
            parsed = parse_markdown(payload)
            if parsed:
                panels.extend(parsed)
                print(f"\nAdded {len(parsed)} panel(s):")
                _panel_summary(panels)
        elif not panels:
            print("Empty input, exiting.")
            return

        while True:
            action = input("\n[a]dd / [d]one / [e]dit N / [r]emove N / [q]uit: ").strip().lower()
            if action in ("", "a", "add"):
                print()
                break
            if action in ("d", "done"):
                break
            if action in ("q", "quit", "cancel"):
                print("Cancelled.")
                return
            parts = action.split()
            if len(parts) == 2 and parts[0] in ("e", "edit", "r", "remove"):
                try:
                    idx = int(parts[1])
                except ValueError:
                    print("Invalid index.")
                    continue
                if not 0 <= idx < len(panels):
                    print("Out of range.")
                    continue
                if parts[0] in ("r", "remove"):
                    panels.pop(idx)
                    print(f"Removed [{idx}].")
                    _panel_summary(panels)
                    if not panels:
                        print("All panels removed, exiting.")
                        return
                    continue
                print(f"Re-enter content for panel [{idx}] (two blank lines to finish):")
                kind2, payload2, last_image_hash = _read_block_or_image(panels, last_image_hash)
                if kind2 != "text" or not payload2.strip():
                    print("Unchanged.")
                    continue
                new_parsed = parse_markdown(payload2)
                if not new_parsed:
                    print("Unchanged.")
                    continue
                panels[idx:idx + 1] = new_parsed
                _panel_summary(panels)
                continue
            print("Unknown command.")
        if action in ("d", "done"):
            break

    if not panels:
        print("No panels, nothing to render.")
        return

    max_w = getattr(args, "max_width", None) or []
    max_w = max_w[0] if max_w else 1200
    max_h = getattr(args, "max_height", 1200)

    items: list[tuple[Image.Image, Optional[str], bool]] = []
    for p in panels:
        if p.is_image and p.image_path:
            img = open_image(p.image_path).convert("RGBA")
            img = scale_image_to_max(img, max_w, max_h)
            items.append((img, p.title, True))
        else:
            img = render_code_image(p.code, p.lang, None)
            img = scale_image_to_max(img, max_w, max_h)
            items.append((img, p.title, False))

    final = compose_panels(items, no_inner_border=args.no_border, vertical=getattr(args, "vertical", False))
    out_path = expand_path(args.out)
    save_image(final, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
    if not getattr(args, "no_clip", False):
        copy_to_clipboard(final)
        print(f"\nSaved {out_path} and copied to clipboard.")
    else:
        print(f"\nSaved {out_path}.")
