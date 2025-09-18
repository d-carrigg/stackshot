#!/usr/bin/env python3
import argparse
import io
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Optional, Tuple

from PIL import Image, ImageDraw, ImageFont, ImageSequence, UnidentifiedImageError
from PIL import features as PIL_FEATURES
from pygments import highlight
from pygments.formatters.img import ImageFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer, guess_lexer_for_filename
from pygments.util import ClassNotFound


# -----------------------------
# Rendering helpers
# -----------------------------

DEFAULT_BG = (18, 18, 20)
PANEL_BG = (32, 33, 36)
TEXT = (235, 235, 245)
SUBTLE = (160, 160, 175)
ARROW = (130, 130, 255)

TITLE_FONT_NAME_CANDIDATES = [
    "Inter-SemiBold.ttf",
    "Inter-Medium.ttf",
    "DejaVuSans.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for name in TITLE_FONT_NAME_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


# Pillow version compatibility for high-quality resizing
try:  # Pillow >=9 uses Resampling enum
    from PIL.Image import Resampling as _Resampling  # type: ignore
except ImportError:  # Pillow <9
    _Resampling = None  # type: ignore

if _Resampling is not None:
    RESAMPLE_LANCZOS = _Resampling.LANCZOS
else:
    # Avoid referencing unavailable attributes directly to satisfy type checkers
    RESAMPLE_LANCZOS = (
        getattr(Image, "LANCZOS", None)
        or getattr(Image, "ANTIALIAS", None)
        or getattr(Image, "NEAREST", 0)
    )


def detect_lexer(code: str, lang: Optional[str], filename: Optional[str]) -> Tuple[str, object]:
    if lang:
        try:
            return lang, get_lexer_by_name(lang)
        except ClassNotFound:
            pass
    if filename:
        try:
            return filename, guess_lexer_for_filename(filename, code)
        except ClassNotFound:
            pass
    try:
        return "text", guess_lexer(code)
    except ClassNotFound:
        return "text", get_lexer_by_name("text")


def render_code_image(code: str, lang: Optional[str], filename_hint: Optional[str]) -> Image.Image:
    _, lexer = detect_lexer(code, lang, filename_hint)
    formatter = ImageFormatter(
        style="monokai",
        font_name="DejaVu Sans Mono",
        font_size=18,
        line_numbers=False,
        image_format="PNG",
        line_number_bg=DEFAULT_BG,
        background_color="#202124",
        line_number_fg="#888",
        hl_color="#2a2e34",
    )
    buf = io.BytesIO()
    highlight(code, lexer, formatter, outfile=buf)
    buf.seek(0)
    return Image.open(buf).convert("RGBA")


@dataclass
class BlockSpec:
    code: str
    title: Optional[str]
    lang: Optional[str]
    filename: Optional[str]


def compose_side_by_side(
    left_img: Image.Image,
    right_img: Image.Image,
    left_title: Optional[str],
    right_title: Optional[str],
    left_is_image: bool = False,
    right_is_image: bool = False,
    no_inner_border: bool = False,
) -> Image.Image:
    gutter = 40
    margin = 70
    title_gap = 18
    title_font = load_font(24)

    draw_probe = Image.new("RGB", (10, 10))
    dp = ImageDraw.Draw(draw_probe)
    left_title_h = dp.textbbox((0, 0), left_title or "", font=title_font)[3] if left_title else 0
    right_title_h = dp.textbbox((0, 0), right_title or "", font=title_font)[3] if right_title else 0
    title_h = max(left_title_h, right_title_h)

    # Per-side padding to show inner card borders. If no_inner_border and side is an image, drop padding.
    base_panel_pad = 24
    left_panel_pad = 0 if (no_inner_border and left_is_image) else base_panel_pad
    right_panel_pad = 0 if (no_inner_border and right_is_image) else base_panel_pad
    top_pad = margin + (title_h + title_gap if title_h else 0)
    bottom_pad = margin

    left_inner_h = left_img.height + left_panel_pad * 2
    right_inner_h = right_img.height + right_panel_pad * 2
    panel_h = max(left_inner_h, right_inner_h)
    total_h = top_pad + panel_h + bottom_pad
    arrow_width = 90

    total_w = (
        margin
        + left_img.width + left_panel_pad * 2
        + gutter + arrow_width + gutter
        + right_img.width + right_panel_pad * 2
        + margin
    )

    canvas = Image.new("RGBA", (total_w, total_h), DEFAULT_BG + (255,))
    draw = ImageDraw.Draw(canvas)

    # Titles
    if left_title:
        draw.text((margin + left_panel_pad, margin), left_title, font=title_font, fill=TEXT)
    if right_title:
        right_title_x = margin + left_img.width + left_panel_pad * 2 + gutter + arrow_width + gutter + right_panel_pad
        draw.text((right_title_x, margin), right_title, font=title_font, fill=TEXT)

    # Panels
    left_panel_x = margin
    left_panel_y = top_pad
    left_panel_w = left_img.width + left_panel_pad * 2
    left_panel_h = panel_h

    right_panel_x = margin + left_panel_w + gutter + arrow_width + gutter
    right_panel_y = top_pad
    right_panel_w = right_img.width + right_panel_pad * 2
    right_panel_h = panel_h

    draw_left_bg = not (no_inner_border and left_is_image)
    draw_right_bg = not (no_inner_border and right_is_image)
    if draw_left_bg:
        draw.rounded_rectangle([left_panel_x, left_panel_y, left_panel_x + left_panel_w, left_panel_y + left_panel_h], radius=18, fill=PANEL_BG + (255,))
    if draw_right_bg:
        draw.rounded_rectangle([right_panel_x, right_panel_y, right_panel_x + right_panel_w, right_panel_y + right_panel_h], radius=18, fill=PANEL_BG + (255,))

    # Paste code images centered vertically in their panels
    left_code_x = left_panel_x + left_panel_pad
    left_code_y = left_panel_y + (panel_h - left_img.height) // 2
    canvas.alpha_composite(left_img, (left_code_x, left_code_y))

    right_code_x = right_panel_x + right_panel_pad
    right_code_y = right_panel_y + (panel_h - right_img.height) // 2
    canvas.alpha_composite(right_img, (right_code_x, right_code_y))

    # Arrow between panels
    arrow_center_y = top_pad + panel_h // 2
    arrow_x1 = left_panel_x + left_panel_w + gutter
    arrow_x2 = right_panel_x - gutter
    shaft_y = arrow_center_y
    draw.line([(arrow_x1, shaft_y), (arrow_x2, shaft_y)], fill=ARROW + (255,), width=6)
    # Arrow head
    head_size = 16
    draw.polygon([
        (arrow_x2 - head_size, shaft_y - head_size),
        (arrow_x2, shaft_y),
        (arrow_x2 - head_size, shaft_y + head_size),
    ], fill=ARROW + (255,))

    # Soft outer glow
    glow = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_margin = 40
    glow_draw.rounded_rectangle(
        [glow_margin, glow_margin, total_w - glow_margin, total_h - glow_margin],
        radius=24,
        fill=(180, 120, 255, 18),
    )
    canvas = Image.alpha_composite(canvas, glow)

    return canvas


def save_image(img: Image.Image, out_path: str, webp_quality: int = 100, webp_method: int = 6) -> str:
    ext = os.path.splitext(out_path)[1].lower()
    fmt = "PNG" if ext not in (".webp",) else "WEBP"
    params = {}
    if fmt == "WEBP":
        params.update({"lossless": False, "method": int(webp_method), "quality": int(webp_quality)})
    img.save(out_path, format=fmt, **params)
    return out_path


def save_animated_gif(frames: list[Image.Image], durations_ms: list[int], out_path: str) -> str:
    if not frames:
        raise ValueError("No frames to save for GIF")
    # Ensure all frames are in a compatible mode
    frames_rgba = [f.convert("RGBA") for f in frames]
    first, rest = frames_rgba[0], frames_rgba[1:]
    # Pillow handles palette conversion internally for GIF
    first.save(
        out_path,
        format="GIF",
        save_all=True,
        append_images=rest,
        duration=durations_ms,
        loop=0,
        disposal=2,
    )
    return out_path


def save_animated_webp(frames: list[Image.Image], durations_ms: list[int], out_path: str, webp_quality: int = 90, webp_method: int = 4) -> str:
    if not frames:
        raise ValueError("No frames to save for WebP")
    # Flatten to RGB over our DEFAULT_BG for more robust WebP encoding
    def _flatten_to_rgb(img: Image.Image) -> Image.Image:
        if img.mode == "RGB":
            return img
        rgb = Image.new("RGB", img.size, DEFAULT_BG)
        if img.mode == "RGBA":
            rgb.paste(img, mask=img.split()[3])
        else:
            rgba = img.convert("RGBA")
            rgb.paste(rgba, mask=rgba.split()[3])
        return rgb

    frames_rgb = [_flatten_to_rgb(f) for f in frames]
    first, rest = frames_rgb[0], frames_rgb[1:]
    first.save(
        out_path,
        format="WEBP",
        save_all=True,
        append_images=rest,
        duration=durations_ms,
        loop=0,
        lossless=False,
        method=int(webp_method),
        quality=int(webp_quality),
    )
    return out_path


def human_readable_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    unit_idx = 0
    while size >= 1024.0 and unit_idx < len(units) - 1:
        size /= 1024.0
        unit_idx += 1
    if unit_idx <= 1:
        return f"{int(size)} {units[unit_idx]}"
    return f"{size:.1f} {units[unit_idx]}"


## Removed streaming saver per user request; saving now writes directly via Pillow


def expand_path(path: str) -> str:
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))


def open_image(path: str) -> Image.Image:
    resolved = expand_path(path)
    return Image.open(resolved)


def get_frames_and_durations(img: Image.Image) -> Tuple[list[Image.Image], list[int], bool]:
    is_anim = getattr(img, "is_animated", False) and getattr(img, "n_frames", 1) > 1
    if not is_anim:
        return [img.convert("RGBA")], [100], False
    frames: list[Image.Image] = []
    durations: list[int] = []
    for frame in ImageSequence.Iterator(img):
        frames.append(frame.convert("RGBA"))
        dur = frame.info.get("duration", img.info.get("duration", 100))
        if not isinstance(dur, int) or dur <= 0:
            dur = 100
        durations.append(dur)
    if not frames:
        return [img.convert("RGBA")], [100], False
    return frames, durations, True


def scale_image_to_max(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    if max_w <= 0 and max_h <= 0:
        return img
    w, h = img.width, img.height
    scale_w = max_w / w if max_w and w > max_w else 1.0
    scale_h = max_h / h if max_h and h > max_h else 1.0
    scale = min(scale_w, scale_h)
    if scale >= 1.0:
        return img
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    return img.resize((new_w, new_h), resample=RESAMPLE_LANCZOS)


def scale_frames_consistently(frames: list[Image.Image], max_w: int, max_h: int) -> list[Image.Image]:
    if not frames:
        return frames
    # Determine scale based on the first frame; apply same scale to all frames
    base = frames[0]
    w, h = base.width, base.height
    scale_w = max_w / w if max_w and w > max_w else 1.0
    scale_h = max_h / h if max_h and h > max_h else 1.0
    scale = min(scale_w, scale_h)
    if scale >= 1.0:
        return [f for f in frames]
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    return [f.resize((new_w, new_h), resample=RESAMPLE_LANCZOS) for f in frames]


def print_progress(current: int, total: int, label: str) -> None:
    # Simple inline progress output without external deps
    pct = int((current / total) * 100) if total else 100
    bar_len = 24
    filled = int(bar_len * pct / 100)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"{label} [{bar}] {pct}% ({current}/{total})", end="\r", flush=True)


def copy_to_clipboard(img: Image.Image) -> None:
    # Try wl-copy (Wayland), then xclip (X11)
    if shutil.which("wl-copy"):
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        data = buf.getvalue()
        try:
            subprocess.run(["wl-copy", "--type", "image/png"], input=data, check=True)
            return
        except subprocess.SubprocessError:
            pass
    if shutil.which("xclip"):
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        data = buf.getvalue()
        try:
            subprocess.run(["xclip", "-selection", "clipboard", "-t", "image/png"], input=data, check=True)
            return
        except subprocess.SubprocessError:
            pass
    print("Note: Could not find wl-copy or xclip to copy image to clipboard.")


def read_stdin_multiline(prompt: str) -> str:
    print(prompt)
    print("Finish input with a single line containing only EOF (Ctrl+D won't be captured here).")
    print("Type EOF on its own line and press Enter:")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "EOF":
            break
        lines.append(line)
    return "\n".join(lines).rstrip("\n")


def build_from_args() -> None:
    parser = argparse.ArgumentParser(description="Generate a side-by-side image: code → code, image → image, or mix")
    # Code inputs
    parser.add_argument("--left", help="Left code block string. If omitted and no --left-image, you'll be prompted.")
    parser.add_argument("--right", help="Right code block string. If omitted and no --right-image, you'll be prompted.")
    parser.add_argument("--left-lang", help="Hint language for left code (e.g., python, http, json)")
    parser.add_argument("--right-lang", help="Hint language for right code")
    parser.add_argument("--left-file", help="Filename hint for left code (for lexer guess)")
    parser.add_argument("--right-file", help="Filename hint for right code")
    # Image inputs
    parser.add_argument("--left-image", help="Path to an image file for the left panel")
    parser.add_argument("--right-image", help="Path to an image file for the right panel")
    parser.add_argument("--no-border", action="store_true", help="Remove inner card borders when a side is an image")
    # Titles and output
    parser.add_argument("--left-title", help="Optional title above the left panel", default="Request")
    parser.add_argument("--right-title", help="Optional title above the right panel", default="Response")
    parser.add_argument("--out", help="Output image path (.png, .webp, or .gif)", default="codeshot.png")
    parser.add_argument("--sequential", action="store_true", help="Animate left frames first (right frozen), then right frames (left frozen)")
    # Scaling options
    parser.add_argument("--max-left-width", type=int, default=1200, help="Max width for left panel content (per frame)")
    parser.add_argument("--max-right-width", type=int, default=1200, help="Max width for right panel content (per frame)")
    parser.add_argument("--max-panel-height", type=int, default=1200, help="Max height for each panel content (per frame)")
    # Encoding tuning
    parser.add_argument("--webp-quality", type=int, default=90, help="Animated/static WebP quality (0-100)")
    parser.add_argument("--webp-method", type=int, default=4, help="Animated/static WebP method (0=fast..6=best)")

    args = parser.parse_args()

    # Prepare left side (image or rendered code) as frames
    if args.left_image:
        try:
            left_base = open_image(args.left_image)
        except (FileNotFoundError, UnidentifiedImageError, OSError) as e:
            raise SystemExit(f"Failed to open --left-image '{args.left_image}': {e}") from e
        left_frames, left_durations, left_anim = get_frames_and_durations(left_base)
        left_frames = scale_frames_consistently(left_frames, args.max_left_width, args.max_panel_height)
    else:
        left_code = args.left or read_stdin_multiline("Paste LEFT code block:")
        left_img_static = render_code_image(left_code, args.left_lang, args.left_file)
        left_img_static = scale_image_to_max(left_img_static, args.max_left_width, args.max_panel_height)
        left_frames, left_durations, left_anim = [left_img_static], [100], False

    # Prepare right side (image or rendered code) as frames
    if args.right_image:
        try:
            right_base = open_image(args.right_image)
        except (FileNotFoundError, UnidentifiedImageError, OSError) as e:
            raise SystemExit(f"Failed to open --right-image '{args.right_image}': {e}") from e
        right_frames, right_durations, right_anim = get_frames_and_durations(right_base)
        right_frames = scale_frames_consistently(right_frames, args.max_right_width, args.max_panel_height)
    else:
        right_code = args.right or read_stdin_multiline("Paste RIGHT code block:")
        right_img_static = render_code_image(right_code, args.right_lang, args.right_file)
        right_img_static = scale_image_to_max(right_img_static, args.max_right_width, args.max_panel_height)
        right_frames, right_durations, right_anim = [right_img_static], [100], False

    is_animated_output = left_anim or right_anim

    # Compose either a single image or animated frames
    if not is_animated_output:
        final_img = compose_side_by_side(
            left_frames[0],
            right_frames[0],
            args.left_title,
            args.right_title,
            left_is_image=bool(args.left_image),
            right_is_image=bool(args.right_image),
            no_inner_border=args.no_border,
        )
        out_path = expand_path(args.out)
        save_image(final_img, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
        copy_to_clipboard(final_img)
        print(f"Saved {out_path} and copied to clipboard.")
        return

    # Animated: build frame sequence
    composed_frames: list[Image.Image] = []
    composed_durations: list[int] = []
    if args.sequential:
        # Left segment: animate left, freeze right at its first frame
        right_freeze = right_frames[0]
        for i in range(len(left_frames)):
            print_progress(i + 1, len(left_frames), "Composing (left segment)")
            lf = left_frames[i]
            frame = compose_side_by_side(
                lf,
                right_freeze,
                args.left_title,
                args.right_title,
                left_is_image=bool(args.left_image),
                right_is_image=bool(args.right_image),
                no_inner_border=args.no_border,
            )
            composed_frames.append(frame)
            dur = left_durations[i] if i < len(left_durations) else 100
            composed_durations.append(dur)
        # Right segment: animate right, freeze left at its last frame
        left_freeze = left_frames[-1]
        for i in range(len(right_frames)):
            print_progress(i + 1, len(right_frames), "Composing (right segment)")
            rf = right_frames[i]
            frame = compose_side_by_side(
                left_freeze,
                rf,
                args.left_title,
                args.right_title,
                left_is_image=bool(args.left_image),
                right_is_image=bool(args.right_image),
                no_inner_border=args.no_border,
            )
            composed_frames.append(frame)
            dur = right_durations[i] if i < len(right_durations) else 100
            composed_durations.append(dur)
    else:
        total_frames = max(len(left_frames), len(right_frames))
        for i in range(total_frames):
            print_progress(i + 1, total_frames, "Composing")
            lf = left_frames[i % len(left_frames)]
            rf = right_frames[i % len(right_frames)]
            frame = compose_side_by_side(
                lf,
                rf,
                args.left_title,
                args.right_title,
                left_is_image=bool(args.left_image),
                right_is_image=bool(args.right_image),
                no_inner_border=args.no_border,
            )
            composed_frames.append(frame)
            # Preserve perceived speed by taking the MIN (faster) frame duration
            ld = left_durations[i % len(left_durations)] if left_durations else 100
            rd = right_durations[i % len(right_durations)] if right_durations else 100
            composed_durations.append(min(ld, rd))

    # Normalize all frames to first frame size for GIF consistency
    first_size = composed_frames[0].size
    normalized_frames: list[Image.Image] = []
    for f in composed_frames:
        if f.size == first_size:
            normalized_frames.append(f)
        else:
            canvas = Image.new("RGBA", first_size, DEFAULT_BG + (255,))
            canvas.alpha_composite(f, (0, 0))
            normalized_frames.append(canvas)

    # Select animated output format based on extension (default to .webp)
    out_path_req = expand_path(args.out)
    root, ext = os.path.splitext(out_path_req)
    ext_lower = ext.lower()
    if ext_lower in (".gif", ".webp"):
        out_path = out_path_req
    else:
        out_path = root + ".webp"

    if out_path.lower().endswith(".gif"):
        print("Saving GIF... This may take a while for large outputs.")
        save_animated_gif(normalized_frames, composed_durations, out_path)
        print("".ljust(100), end="\r")
        print(f"Saved animated GIF {out_path}.")
    else:
        # Check WebP and animated support
        webp_ok = bool(PIL_FEATURES.check("webp"))
        webp_anim_ok = bool(PIL_FEATURES.check("webp_anim"))
        if not webp_ok or not webp_anim_ok:
            fallback = os.path.splitext(out_path)[0] + ".gif"
            print("Animated WebP not supported by your Pillow/decoder; falling back to GIF...")
            print("Saving GIF... This may take a while for large outputs.")
            save_animated_gif(normalized_frames, composed_durations, fallback)
            print("".ljust(100), end="\r")
            print(f"Saved animated GIF {fallback}.")
        else:
            # Save directly using Pillow; print elapsed time after
            print("Saving WebP... This may take a while for large outputs.")
            t0 = time.time()
            save_animated_webp(normalized_frames, composed_durations, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
            elapsed = int(time.time() - t0)
            print("".ljust(100), end="\r")
            print(f"Saved animated WebP {out_path} in {elapsed}s.")


if __name__ == "__main__":
    build_from_args()


