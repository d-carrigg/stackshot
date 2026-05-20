import io
from typing import Optional, Tuple

from PIL import Image
from pygments import highlight
from pygments.formatters.img import ImageFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer, guess_lexer_for_filename
from pygments.styles.monokai import MonokaiStyle
from pygments.util import ClassNotFound

from .colors import PANEL_BG_HEX


class _PanelMonokai(MonokaiStyle):
    """Monokai token colors on the panel background so antialiased glyph
    edges blend cleanly against the panel — no Monokai-tinted fringe."""
    background_color = PANEL_BG_HEX
    highlight_color = PANEL_BG_HEX


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
    """Render `code` to an RGBA image with the same background as the
    surrounding panel, so antialiased glyph edges blend cleanly when
    composited (no Monokai-tinted fringe)."""
    _, lexer = detect_lexer(code, lang, filename_hint)
    formatter = ImageFormatter(
        style=_PanelMonokai,
        font_name="DejaVu Sans Mono",
        font_size=18,
        line_numbers=False,
        image_format="PNG",
        image_pad=12,
    )
    buf = io.BytesIO()
    highlight(code, lexer, formatter, outfile=buf)
    buf.seek(0)
    return Image.open(buf).convert("RGBA")
