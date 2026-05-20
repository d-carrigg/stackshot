from codeimg.colors import PANEL_BG
from codeimg.highlight import render_code_image


def test_render_code_image_uses_panel_bg_so_no_fringe():
    """Code images are rendered directly on the panel background color
    so antialiased glyph edges blend cleanly when composited. Verify by
    asserting the corner pixel matches PANEL_BG exactly — if a different
    bg color crept in, we'd reintroduce the Monokai-vs-panel fringe."""
    img = render_code_image("x = 1", "python", None)
    assert img.mode == "RGBA"
    corner = img.getpixel((0, 0))
    assert corner[:3] == PANEL_BG, f"corner {corner[:3]} should be PANEL_BG {PANEL_BG}"
    assert corner[3] == 255


def test_render_code_image_unknown_lang_does_not_raise():
    """Falls back to text lexer instead of blowing up."""
    img = render_code_image("hello world", "no-such-lang-12345", None)
    assert img.width > 0 and img.height > 0
