import argparse
import os
import time
from typing import Optional

from PIL import Image, ImageColor, UnidentifiedImageError
from PIL import features as PIL_FEATURES

from .colors import DEFAULT_BG
from .compose import compose_panels, compose_side_by_side
from .highlight import render_code_image
from .interactive import interactive_compose
from .io_utils import (
    copy_to_clipboard,
    expand_path,
    get_frames_and_durations,
    open_image,
    print_progress,
    save_animated_gif,
    save_animated_webp,
    save_image,
    scale_frames_consistently,
    scale_image_to_max,
)
from .panel_input import ResolvedPanel, resolve_panel


DEFAULT_MAX_WIDTH = 1200
DEFAULT_MAX_HEIGHT = 1200


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codeimg",
        description="Generate side-by-side code/image panels with arrows between them.",
    )
    parser.add_argument(
        "panels", nargs="*",
        help="Panel inputs. Each is one of: image path, code file path, "
             "`path:N` or `path:N-M` for a line range, or literal code. "
             "Omit to enter interactive mode.",
    )
    parser.add_argument("--title", nargs="*", default=[], help="Per-panel titles (parallel list).")
    parser.add_argument("--lang", nargs="*", default=[], help="Per-panel language hints for code panels.")
    parser.add_argument("--file", nargs="*", default=[], help="Per-panel filename hints (for lexer guessing).")
    parser.add_argument(
        "--max-width", nargs="*", type=int, default=[],
        help=f"Per-panel max content width. Default {DEFAULT_MAX_WIDTH} each.",
    )
    parser.add_argument(
        "--max-height", type=int, default=DEFAULT_MAX_HEIGHT,
        help=f"Max content height applied to every panel. Default {DEFAULT_MAX_HEIGHT}.",
    )
    parser.add_argument("--no-border", action="store_true", help="Remove inner card borders when a panel is an image.")
    parser.add_argument("--vertical", action="store_true", help="Stack panels top-to-bottom with downward arrows.")
    parser.add_argument("--arrow-color", help="Arrow color: hex (#fff, #aabbcc) or named (e.g. white, cyan). Default white.")
    parser.add_argument("--out", default="codeimg.png", help="Output image path (.png, .webp, or .gif).")
    parser.add_argument("--no-clip", action="store_true", help="Skip copying the output to the clipboard.")
    parser.add_argument(
        "--sequential", action="store_true",
        help="(2-panel animated only) Animate left frames first, then right.",
    )
    parser.add_argument("--webp-quality", type=int, default=90, help="Animated/static WebP quality (0-100).")
    parser.add_argument("--webp-method", type=int, default=4, help="Animated/static WebP method (0=fast..6=best).")
    parser.add_argument("--ui", action="store_true", help="Launch the desktop UI.")
    return parser


def _zip_pad(items: list, fillvalue, name: str, n_panels: int):
    if len(items) > n_panels:
        raise SystemExit(
            f"--{name} got {len(items)} values but there are only {n_panels} panel(s)."
        )
    return list(items) + [fillvalue] * (n_panels - len(items))


def _parse_color(spec: Optional[str], flag: str) -> Optional[tuple[int, int, int]]:
    """Parse a hex (#fff, #aabbcc) or named color into an (r,g,b) tuple."""
    if not spec:
        return None
    try:
        rgb = ImageColor.getrgb(spec)
    except ValueError as e:
        raise SystemExit(f"--{flag}: invalid color '{spec}' ({e}).") from e
    return rgb[:3]


def _max_width_for(idx: int, widths: list[int]) -> int:
    if not widths:
        return DEFAULT_MAX_WIDTH
    if idx < len(widths):
        return widths[idx]
    return widths[-1]


def _resolve_all(specs: list[str]) -> list[ResolvedPanel]:
    out = []
    for s in specs:
        try:
            out.append(resolve_panel(s))
        except OSError as e:
            raise SystemExit(f"Failed to read panel input '{s}': {e}") from e
    return out


def _open_image_or_die(path: str, label: str) -> Image.Image:
    try:
        return open_image(path)
    except (FileNotFoundError, UnidentifiedImageError, OSError) as e:
        raise SystemExit(f"Failed to open {label} '{path}': {e}") from e


def _render_static_panel(
    rp: ResolvedPanel, lang: Optional[str], file_hint: Optional[str], max_w: int, max_h: int,
) -> Image.Image:
    if rp.is_image:
        img = _open_image_or_die(rp.image_path or "", "image")
        return scale_image_to_max(img.convert("RGBA"), max_w, max_h)
    img = render_code_image(rp.code, lang, file_hint or rp.filename_hint)
    return scale_image_to_max(img, max_w, max_h)


def _save_and_maybe_clip(img: Image.Image, args) -> str:
    out_path = expand_path(args.out)
    save_image(img, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
    if not args.no_clip:
        copy_to_clipboard(img)
        print(f"Saved {out_path} and copied to clipboard.")
    else:
        print(f"Saved {out_path}.")
    return out_path


def _has_animated_image(resolved: list[ResolvedPanel]) -> bool:
    for rp in resolved:
        if not rp.is_image or not rp.image_path:
            continue
        try:
            with Image.open(rp.image_path) as im:
                if getattr(im, "is_animated", False) and getattr(im, "n_frames", 1) > 1:
                    return True
        except (FileNotFoundError, UnidentifiedImageError, OSError):
            continue
    return False


def _run_static(args, resolved: list[ResolvedPanel]) -> None:
    n = len(resolved)
    titles = _zip_pad(args.title, None, "title", n)
    langs = _zip_pad(args.lang, None, "lang", n)
    files = _zip_pad(args.file, None, "file", n)
    if args.max_width:
        _zip_pad(args.max_width, None, "max-width", n)  # validate length only

    items: list[tuple[Image.Image, Optional[str], bool]] = []
    for i, rp in enumerate(resolved):
        img = _render_static_panel(rp, langs[i], files[i], _max_width_for(i, args.max_width), args.max_height)
        items.append((img, titles[i], rp.is_image))

    arrow_color = _parse_color(args.arrow_color, "arrow-color")
    final = compose_panels(items, no_inner_border=args.no_border, vertical=args.vertical, arrow_color=arrow_color)
    _save_and_maybe_clip(final, args)


def _run_animated_two_panel(args, resolved: list[ResolvedPanel]) -> None:
    if len(resolved) != 2:
        raise SystemExit(
            "Animated input is only supported with exactly 2 panels."
        )
    titles = _zip_pad(args.title, None, "title", 2)
    langs = _zip_pad(args.lang, None, "lang", 2)
    files = _zip_pad(args.file, None, "file", 2)
    left, right = resolved

    def _frames_for(rp: ResolvedPanel, lang, fhint, max_w):
        if rp.is_image:
            base = _open_image_or_die(rp.image_path or "", "image")
            frames, durs, anim = get_frames_and_durations(base)
            frames = scale_frames_consistently(frames, max_w, args.max_height)
            return frames, durs, anim
        img = render_code_image(rp.code, lang, fhint or rp.filename_hint)
        img = scale_image_to_max(img, max_w, args.max_height)
        return [img], [100], False

    left_frames, left_durs, left_anim = _frames_for(left, langs[0], files[0], _max_width_for(0, args.max_width))
    right_frames, right_durs, right_anim = _frames_for(right, langs[1], files[1], _max_width_for(1, args.max_width))

    arrow_color = _parse_color(args.arrow_color, "arrow-color")
    composed_frames: list[Image.Image] = []
    composed_durs: list[int] = []

    if args.sequential:
        right_freeze = right_frames[0]
        for i in range(len(left_frames)):
            print_progress(i + 1, len(left_frames), "Composing (left segment)")
            composed_frames.append(compose_side_by_side(
                left_frames[i], right_freeze, titles[0], titles[1],
                left_is_image=left.is_image, right_is_image=right.is_image,
                no_inner_border=args.no_border, arrow_color=arrow_color,
            ))
            composed_durs.append(left_durs[i] if i < len(left_durs) else 100)
        left_freeze = left_frames[-1]
        for i in range(len(right_frames)):
            print_progress(i + 1, len(right_frames), "Composing (right segment)")
            composed_frames.append(compose_side_by_side(
                left_freeze, right_frames[i], titles[0], titles[1],
                left_is_image=left.is_image, right_is_image=right.is_image,
                no_inner_border=args.no_border, arrow_color=arrow_color,
            ))
            composed_durs.append(right_durs[i] if i < len(right_durs) else 100)
    else:
        total = max(len(left_frames), len(right_frames))
        for i in range(total):
            print_progress(i + 1, total, "Composing")
            composed_frames.append(compose_side_by_side(
                left_frames[i % len(left_frames)],
                right_frames[i % len(right_frames)],
                titles[0], titles[1],
                left_is_image=left.is_image, right_is_image=right.is_image,
                no_inner_border=args.no_border, arrow_color=arrow_color,
            ))
            ld = left_durs[i % len(left_durs)] if left_durs else 100
            rd = right_durs[i % len(right_durs)] if right_durs else 100
            composed_durs.append(min(ld, rd))

    first_size = composed_frames[0].size
    normalized: list[Image.Image] = []
    for f in composed_frames:
        if f.size == first_size:
            normalized.append(f)
        else:
            canvas = Image.new("RGBA", first_size, DEFAULT_BG + (255,))
            canvas.alpha_composite(f, (0, 0))
            normalized.append(canvas)

    out_path_req = expand_path(args.out)
    root, ext = os.path.splitext(out_path_req)
    ext_lower = ext.lower()
    out_path = out_path_req if ext_lower in (".gif", ".webp") else root + ".webp"

    if out_path.lower().endswith(".gif"):
        print("Saving GIF... This may take a while for large outputs.")
        save_animated_gif(normalized, composed_durs, out_path)
        print("".ljust(100), end="\r")
        print(f"Saved animated GIF {out_path}.")
    else:
        webp_ok = bool(PIL_FEATURES.check("webp"))
        webp_anim_ok = bool(PIL_FEATURES.check("webp_anim"))
        if not webp_ok or not webp_anim_ok:
            fallback = os.path.splitext(out_path)[0] + ".gif"
            print("Animated WebP not supported by your Pillow/decoder; falling back to GIF...")
            print("Saving GIF... This may take a while for large outputs.")
            save_animated_gif(normalized, composed_durs, fallback)
            print("".ljust(100), end="\r")
            print(f"Saved animated GIF {fallback}.")
        else:
            print("Saving WebP... This may take a while for large outputs.")
            t0 = time.time()
            save_animated_webp(normalized, composed_durs, out_path,
                               webp_quality=args.webp_quality, webp_method=args.webp_method)
            elapsed = int(time.time() - t0)
            print("".ljust(100), end="\r")
            print(f"Saved animated WebP {out_path} in {elapsed}s.")


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    if args.ui:
        from .ui import launch_ui
        launch_ui()
        return

    if not args.panels:
        interactive_compose(args)
        return

    resolved = _resolve_all(args.panels)

    if _has_animated_image(resolved):
        _run_animated_two_panel(args, resolved)
        return

    _run_static(args, resolved)


if __name__ == "__main__":
    main()
