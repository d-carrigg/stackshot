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


def read_block_input() -> Optional[str]:
    """Read multi-line input. Ends on two consecutive blank lines or Ctrl+D.
    Returns None if the user types ':cancel'."""
    lines: list[str] = []
    blank_run = 0
    while True:
        try:
            line = input()
        except EOFError:
            print()
            break
        if line.strip() == ":cancel":
            return None
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
    return "\n".join(lines)


def _panel_summary(panels: list[Panel]) -> None:
    for idx, p in enumerate(panels):
        t = p.title or "(no title)"
        lang = p.lang or "auto"
        ln = len(p.code.splitlines()) or 1
        print(f"  [{idx}] {t}  ({lang}, {ln} line{'s' if ln != 1 else ''})")


def _add_clipboard_image_panel(panels: list[Panel]) -> bool:
    """Attempt to add an image from the clipboard as a new panel.
    Returns True on success, False if no image is on the clipboard."""
    img = try_get_clipboard_image()
    if img is None:
        return False
    tmp = tempfile.NamedTemporaryFile(prefix="codeshot-clip-", suffix=".png", delete=False)
    img.convert("RGBA").save(tmp.name, format="PNG")
    panels.append(Panel(code="", is_image=True, image_path=tmp.name))
    print(f"[Image {len(panels)}] added from clipboard.")
    return True


def interactive_compose(args) -> None:
    print("Codeshot interactive mode")
    print("Paste code or markdown. Use ```lang fences to set syntax; the line above a fence becomes its title.")
    print("End each block with two blank lines (or Ctrl+D). Type 'i' at the action prompt to paste a clipboard image.")
    print("Type :cancel on its own line to abort.\n")

    panels: list[Panel] = []
    action = ""
    while True:
        label = f"Block {len(panels) + 1}" if not panels else f"Add block {len(panels) + 1} (Enter empty to finish)"
        print(f"--- {label} ---")
        text = read_block_input()
        if text is None:
            print("Cancelled.")
            return
        if text.strip():
            parsed = parse_markdown(text)
            if parsed:
                panels.extend(parsed)
                print(f"\nAdded {len(parsed)} panel(s):")
                _panel_summary(panels)
        elif not panels:
            print("Empty input, exiting.")
            return

        while True:
            action = input("\n[a]dd / [i]mage / [d]one / [e]dit N / [r]emove N / [q]uit: ").strip().lower()
            if action in ("", "a", "add"):
                print()
                break
            if action in ("i", "image", "img"):
                if _add_clipboard_image_panel(panels):
                    print()
                    break  # auto-advance to next block input
                print("Clipboard has no image. Copy an image and try again.")
                continue
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
                new_text = read_block_input()
                if not new_text or not new_text.strip():
                    print("Unchanged.")
                    continue
                new_parsed = parse_markdown(new_text)
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

    items: list[tuple[Image.Image, Optional[str], bool]] = []
    for p in panels:
        if p.is_image and p.image_path:
            img = open_image(p.image_path).convert("RGBA")
            img = scale_image_to_max(img, args.max_left_width, args.max_panel_height)
            items.append((img, p.title, True))
        else:
            img = render_code_image(p.code, p.lang, None)
            img = scale_image_to_max(img, args.max_left_width, args.max_panel_height)
            items.append((img, p.title, False))

    final = compose_panels(items, no_inner_border=args.no_border)
    out_path = expand_path(args.out)
    save_image(final, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
    copy_to_clipboard(final)
    print(f"\nSaved {out_path} and copied to clipboard.")
