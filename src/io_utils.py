import io
import os
import shutil
import subprocess
from typing import Optional, Tuple

from PIL import Image, ImageSequence, UnidentifiedImageError

from .colors import DEFAULT_BG
from .fonts import RESAMPLE_LANCZOS


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
    frames_rgba = [f.convert("RGBA") for f in frames]
    first, rest = frames_rgba[0], frames_rgba[1:]
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


def save_animated_webp(
    frames: list[Image.Image],
    durations_ms: list[int],
    out_path: str,
    webp_quality: int = 90,
    webp_method: int = 4,
) -> str:
    if not frames:
        raise ValueError("No frames to save for WebP")

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


def expand_path(path: str) -> str:
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))


def open_image(path: str) -> Image.Image:
    return Image.open(expand_path(path))


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
    pct = int((current / total) * 100) if total else 100
    bar_len = 24
    filled = int(bar_len * pct / 100)
    bar = "#" * filled + "-" * (bar_len - filled)
    print(f"{label} [{bar}] {pct}% ({current}/{total})", end="\r", flush=True)


def try_get_clipboard_image() -> Optional[Image.Image]:
    """Best-effort fetch of an image from the system clipboard.
    Returns None if no image is present or no clipboard tool is available."""
    candidates = []
    if shutil.which("wl-paste"):
        candidates.append(["wl-paste", "--type", "image/png"])
    if shutil.which("xclip"):
        candidates.append(["xclip", "-selection", "clipboard", "-t", "image/png", "-o"])
    for cmd in candidates:
        try:
            result = subprocess.run(cmd, capture_output=True, check=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            continue
        if not result.stdout:
            continue
        try:
            return Image.open(io.BytesIO(result.stdout))
        except (UnidentifiedImageError, OSError):
            continue
    return None


def copy_to_clipboard(img: Image.Image) -> None:
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
