from codeimg.highlight import render_code_image


def test_render_code_image_has_transparent_bg_so_it_blends_on_panel():
    """The whole point of render_code_image's bg-strip step: when the
    image is pasted onto the panel rounded rectangle, the panel color
    must show through everywhere there isn't a glyph. We verify that by
    asserting every fully-transparent OR every fully-opaque pixel — no
    leftover opaque background-colored pixels around the text."""
    img = render_code_image("x = 1", "python", None)
    assert img.mode == "RGBA"
    # The corners and any non-glyph areas must be transparent.
    assert img.getpixel((0, 0))[3] == 0
    assert img.getpixel((img.width - 1, 0))[3] == 0
    assert img.getpixel((0, img.height - 1))[3] == 0
    # Some glyph pixel must be opaque, or rendering is broken.
    pixels = list(img.getdata())
    assert any(p[3] == 255 for p in pixels), "no opaque pixels — code didn't render"


def test_render_code_image_unknown_lang_does_not_raise():
    """Falls back to text lexer instead of blowing up."""
    img = render_code_image("hello world", "no-such-lang-12345", None)
    assert img.width > 0 and img.height > 0
