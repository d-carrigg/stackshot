import io
from typing import Optional, Tuple

from PIL import Image
from pygments import highlight
from pygments.formatters.img import ImageFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer, guess_lexer_for_filename
from pygments.util import ClassNotFound

from .colors import PANEL_BG_HEX


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


def _strip_bg(img: Image.Image) -> Image.Image:
    """Make a flat-colored image background transparent.
    Samples the corner pixel as the bg color."""
    img = img.convert("RGBA")
    bg = img.getpixel((0, 0))
    if not isinstance(bg, tuple) or len(bg) < 3:
        return img
    br, bg_, bb = bg[0], bg[1], bg[2]
    pixels = list(img.getdata())
    new_pixels = [
        (r, g, b, 0) if (r == br and g == bg_ and b == bb) else (r, g, b, a)
        for (r, g, b, a) in pixels
    ]
    img.putdata(new_pixels)
    return img


def render_code_image(code: str, lang: Optional[str], filename_hint: Optional[str]) -> Image.Image:
    _, lexer = detect_lexer(code, lang, filename_hint)
    formatter = ImageFormatter(
        style="monokai",
        font_name="DejaVu Sans Mono",
        font_size=18,
        line_numbers=False,
        image_format="PNG",
        image_pad=0,
        background_color=PANEL_BG_HEX,
        hl_color=PANEL_BG_HEX,
    )
    buf = io.BytesIO()
    highlight(code, lexer, formatter, outfile=buf)
    buf.seek(0)
    return _strip_bg(Image.open(buf))
