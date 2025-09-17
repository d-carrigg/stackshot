#!/usr/bin/env python3
import argparse
import io
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional, Tuple

from PIL import Image, ImageDraw, ImageFont, ImageSequence
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
        except Exception:
            continue
    return ImageFont.load_default()


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


def compose_side_by_side(left_img: Image.Image, right_img: Image.Image, left_title: Optional[str], right_title: Optional[str]) -> Image.Image:
    gutter = 40
    margin = 70
    title_gap = 18
    title_font = load_font(24)

    draw_probe = Image.new("RGB", (10, 10))
    dp = ImageDraw.Draw(draw_probe)
    left_title_h = dp.textbbox((0, 0), left_title or "", font=title_font)[3] if left_title else 0
    right_title_h = dp.textbbox((0, 0), right_title or "", font=title_font)[3] if right_title else 0
    title_h = max(left_title_h, right_title_h)

    panel_pad = 24
    top_pad = margin + (title_h + title_gap if title_h else 0)
    bottom_pad = margin

    panel_h = max(left_img.height, right_img.height) + panel_pad * 2
    total_h = top_pad + panel_h + bottom_pad
    arrow_width = 90

    total_w = margin + left_img.width + panel_pad * 2 + gutter + arrow_width + gutter + right_img.width + panel_pad * 2 + margin

    canvas = Image.new("RGBA", (total_w, total_h), DEFAULT_BG + (255,))
    draw = ImageDraw.Draw(canvas)

    # Titles
    if left_title:
        draw.text((margin + panel_pad, margin), left_title, font=title_font, fill=TEXT)
    if right_title:
        right_title_x = margin + left_img.width + panel_pad * 2 + gutter + arrow_width + gutter + panel_pad
        draw.text((right_title_x, margin), right_title, font=title_font, fill=TEXT)

    # Panels
    left_panel_x = margin
    left_panel_y = top_pad
    left_panel_w = left_img.width + panel_pad * 2
    left_panel_h = panel_h

    right_panel_x = margin + left_panel_w + gutter + arrow_width + gutter
    right_panel_y = top_pad
    right_panel_w = right_img.width + panel_pad * 2
    right_panel_h = panel_h

    for x, y, w, h in [
        (left_panel_x, left_panel_y, left_panel_w, left_panel_h),
        (right_panel_x, right_panel_y, right_panel_w, right_panel_h),
    ]:
        draw.rounded_rectangle([x, y, x + w, y + h], radius=18, fill=PANEL_BG + (255,))

    # Paste code images centered vertically in their panels
    left_code_x = left_panel_x + panel_pad
    left_code_y = left_panel_y + (panel_h - left_img.height) // 2
    canvas.alpha_composite(left_img, (left_code_x, left_code_y))

    right_code_x = right_panel_x + panel_pad
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


def save_image(img: Image.Image, out_path: str) -> str:
    ext = os.path.splitext(out_path)[1].lower()
    fmt = "PNG" if ext not in (".webp",) else "WEBP"
    params = {}
    if fmt == "WEBP":
        params.update({"lossless": True, "method": 6, "quality": 100})
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


def copy_to_clipboard(img: Image.Image) -> None:
    # Try wl-copy (Wayland), then xclip (X11)
    if shutil.which("wl-copy"):
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        data = buf.getvalue()
        try:
            subprocess.run(["wl-copy", "--type", "image/png"], input=data, check=True)
            return
        except Exception:
            pass
    if shutil.which("xclip"):
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        data = buf.getvalue()
        try:
            subprocess.run(["xclip", "-selection", "clipboard", "-t", "image/png"], input=data, check=True)
            return
        except Exception:
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
    # Titles and output
    parser.add_argument("--left-title", help="Optional title above the left panel", default="Request")
    parser.add_argument("--right-title", help="Optional title above the right panel", default="Response")
    parser.add_argument("--out", help="Output image path (.png or .webp)", default="codeshot.png")

    args = parser.parse_args()

    # Prepare left side (image or rendered code) as frames
    if args.left_image:
        try:
            left_base = open_image(args.left_image)
        except Exception as e:
            raise SystemExit(f"Failed to open --left-image '{args.left_image}': {e}") from e
        left_frames, left_durations, left_anim = get_frames_and_durations(left_base)
    else:
        left_code = args.left or read_stdin_multiline("Paste LEFT code block:")
        left_img_static = render_code_image(left_code, args.left_lang, args.left_file)
        left_frames, left_durations, left_anim = [left_img_static], [100], False

    # Prepare right side (image or rendered code) as frames
    if args.right_image:
        try:
            right_base = open_image(args.right_image)
        except Exception as e:
            raise SystemExit(f"Failed to open --right-image '{args.right_image}': {e}") from e
        right_frames, right_durations, right_anim = get_frames_and_durations(right_base)
    else:
        right_code = args.right or read_stdin_multiline("Paste RIGHT code block:")
        right_img_static = render_code_image(right_code, args.right_lang, args.right_file)
        right_frames, right_durations, right_anim = [right_img_static], [100], False

    is_animated_output = left_anim or right_anim

    # Compose either a single image or animated frames
    if not is_animated_output:
        final_img = compose_side_by_side(left_frames[0], right_frames[0], args.left_title, args.right_title)
        out_path = expand_path(args.out)
        save_image(final_img, out_path)
        copy_to_clipboard(final_img)
        print(f"Saved {out_path} and copied to clipboard.")
        return

    # Animated: build frame sequence
    total_frames = max(len(left_frames), len(right_frames))
    composed_frames: list[Image.Image] = []
    composed_durations: list[int] = []
    for i in range(total_frames):
        lf = left_frames[i % len(left_frames)]
        rf = right_frames[i % len(right_frames)]
        frame = compose_side_by_side(lf, rf, args.left_title, args.right_title)
        composed_frames.append(frame)
        ld = left_durations[i % len(left_durations)] if left_durations else 100
        rd = right_durations[i % len(right_durations)] if right_durations else 100
        composed_durations.append(max(ld, rd))

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

    # Ensure .gif output
    out_path_req = expand_path(args.out)
    root, ext = os.path.splitext(out_path_req)
    out_path = out_path_req if ext.lower() == ".gif" else root + ".gif"
    save_animated_gif(normalized_frames, composed_durations, out_path)
    print(f"Saved animated GIF {out_path}.")


if __name__ == "__main__":
    build_from_args()


