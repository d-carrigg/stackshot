import os
import sys
import tempfile
from typing import Optional

from PIL import Image

from .compose import compose_panels
from .highlight import render_code_image
from .io_utils import (
    copy_to_clipboard,
    expand_path,
    fit_image,
    open_image,
    save_image,
    try_get_clipboard_image,
)
from .markdown import Panel, parse_markdown


class _PastedImage:
    """Sentinel returned from the prompt when the user pastes while an
    image is on the clipboard. Carries the PIL Image back to the caller."""
    def __init__(self, img: Image.Image):
        self.img = img


def _paste_action(pasted_text: str, clipboard_image: Optional[Image.Image]):
    """Decide what a paste event should do. If the clipboard holds an
    image, the paste becomes an image panel; otherwise the pasted text
    is inserted into the buffer."""
    if clipboard_image is not None:
        return ("image", clipboard_image)
    return ("text", pasted_text)


def _build_session():
    """Lazy-import prompt_toolkit so test/non-TTY paths don't pay the cost."""
    from prompt_toolkit import PromptSession
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.keys import Keys

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

    @kb.add(Keys.BracketedPaste)
    def _paste(event):
        kind, payload = _paste_action(event.data, try_get_clipboard_image())
        if kind == "image":
            event.app.exit(result=_PastedImage(payload))
            return
        event.current_buffer.insert_text(payload)

    return PromptSession(multiline=True, key_bindings=kb)


_session = None


def _read_text_block_tty():
    """Returns str (text submitted), _PastedImage (image pasted), or None
    (cancelled)."""
    global _session
    if _session is None:
        _session = _build_session()
    try:
        return _session.prompt("")
    except (EOFError, KeyboardInterrupt):
        return None


# Temp files holding pasted clipboard images; removed when interactive
# mode exits so pasted screenshots don't pile up in the temp dir.
_clip_files: list[str] = []


def _save_clipboard_image_as_panel(img: Image.Image, panels: list[Panel]) -> None:
    with tempfile.NamedTemporaryFile(prefix="stackshot-clip-", suffix=".png", delete=False) as tmp:
        img.convert("RGBA").save(tmp, format="PNG")
    _clip_files.append(tmp.name)
    panels.append(Panel(code="", is_image=True, image_path=tmp.name))


def _remove_clip_files() -> None:
    while _clip_files:
        try:
            os.unlink(_clip_files.pop())
        except OSError:
            pass


def _read_block_or_image_tty(panels: list[Panel]) -> tuple[str, str]:
    """TTY path: full multi-line editor via prompt_toolkit. Pasting while
    an image is on the clipboard immediately adds it as the next panel
    and advances; pasting text stays in the editor."""
    result = _read_text_block_tty()
    if result is None:
        return "cancel", ""
    if isinstance(result, _PastedImage):
        _save_clipboard_image_as_panel(result.img, panels)
        print(f"[Image {len(panels)}]")
        return "image", panels[-1].image_path or ""
    return "text", result


def _read_block_or_image_polling() -> tuple[str, str]:
    """Non-TTY path (pipes, tests): line-based input, two-blank-lines or
    EOF to submit. Text-only — clipboard image insertion is paste-driven
    and isn't reachable from a piped stdin."""
    lines: list[str] = []
    blank_run = 0

    while True:
        line = sys.stdin.readline()
        if not line:  # EOF / Ctrl+D
            break
        line = line.rstrip("\n")
        if line == "":
            blank_run += 1
            if blank_run >= 2:
                break
            lines.append(line)
        else:
            blank_run = 0
            lines.append(line)

    while lines and lines[-1] == "":
        lines.pop()
    return "text", "\n".join(lines)


def _read_block_or_image(panels: list[Panel]) -> tuple[str, str]:
    is_tty = False
    try:
        is_tty = sys.stdin.isatty()
    except (AttributeError, ValueError):
        is_tty = False
    if is_tty:
        return _read_block_or_image_tty(panels)
    return _read_block_or_image_polling()


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
    try:
        _interactive_compose(args)
    finally:
        _remove_clip_files()


def _interactive_compose(args) -> None:
    print("Codeimg interactive mode")
    print("Paste code or markdown — ```lang fences set syntax, the line above is the title.")
    print("End a text block with two blank lines (or Ctrl+D).")
    print("Paste an image to add it as a panel (image pastes auto-advance to the next block).")
    print("Ctrl+C to abort.\n")

    panels: list[Panel] = []
    action = ""

    while True:
        label = f"Block {len(panels) + 1}" if not panels else f"Add block {len(panels) + 1} (Enter empty to finish)"
        print(f"--- {label} ---")
        kind, payload = _read_block_or_image(panels)

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
                kind2, payload2 = _read_block_or_image(panels)
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
    scale = getattr(args, "scale", 1.0)

    items: list[tuple[Image.Image, Optional[str], bool]] = []
    for p in panels:
        if p.is_image and p.image_path:
            img = open_image(p.image_path).convert("RGBA")
            img = fit_image(img, max_w, max_h, scale, upscale=True)
            items.append((img, p.title, True))
        else:
            img = render_code_image(p.code, p.lang, None, scale=scale)
            img = fit_image(img, max_w, max_h, scale)
            items.append((img, p.title, False))

    final = compose_panels(
        items, no_inner_border=args.no_border,
        vertical=getattr(args, "vertical", False), scale=scale,
    )
    out_path = expand_path(args.out)
    save_image(final, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
    if not getattr(args, "no_clip", False):
        copy_to_clipboard(final)
        print(f"\nSaved {out_path} and copied to clipboard.")
    else:
        print(f"\nSaved {out_path}.")
