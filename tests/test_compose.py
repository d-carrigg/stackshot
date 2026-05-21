import pytest
from PIL import Image

from stackshot.compose import compose_panels, compose_side_by_side


def _solid(w, h, color=(50, 60, 70, 255)):
    return Image.new("RGBA", (w, h), color)


def test_compose_panels_rejects_empty():
    with pytest.raises(ValueError):
        compose_panels([])


def test_compose_panels_single_panel_has_no_arrow_extra_width():
    """The single-panel bug fix: one panel must not allocate arrow gutter
    space for a second panel that doesn't exist."""
    img = _solid(100, 40)
    single = compose_panels([(img, None, False)])
    pair = compose_panels([(img, None, False), (img, None, False)])
    # Arrow gutter is gutter(40)+arrow_width(90)+gutter(40) = 170; the pair
    # must be at least one panel + 170 wider than the single.
    assert pair.width >= single.width + 100 + 170


def test_compose_panels_grows_with_panel_count():
    img = _solid(80, 30)
    for n in (1, 2, 3):
        out = compose_panels([(img, None, False)] * n)
        assert out.mode == "RGBA"
        assert out.width >= n * img.width


def test_compose_side_by_side_produces_image_wider_than_inputs():
    left = _solid(80, 30)
    right = _solid(60, 30)
    out = compose_side_by_side(left, right, "L", "R")
    assert out.width > left.width + right.width


def test_compose_panels_vertical_is_taller_and_narrower_than_horizontal():
    a = _solid(120, 40)
    b = _solid(100, 30)
    items = [(a, "A", False), (b, "B", False)]
    horiz = compose_panels(items, vertical=False)
    vert = compose_panels(items, vertical=True)
    assert vert.height > horiz.height
    assert vert.width < horiz.width


def test_compose_panels_centers_unequal_heights(monkeypatch):
    """Horizontal layout: when panels differ in height, each panel's
    card must be vertically centered within the row, not top-aligned.
    The shorter panel should sit roughly mid-row."""
    from stackshot.colors import DEFAULT_BG

    short = Image.new("RGBA", (100, 40), (10, 200, 10, 255))
    tall = Image.new("RGBA", (100, 200), (200, 10, 10, 255))
    out = compose_panels([(short, None, False), (tall, None, False)])

    # margin=40, base_panel_pad=24 — column inside short panel's card.
    col = 40 + 24
    px = out.load()
    panel_rows = [y for y in range(out.height) if px[col, y][:3] != DEFAULT_BG]
    assert panel_rows, "short panel not rendered at expected x column"

    panel_top, panel_bottom = panel_rows[0], panel_rows[-1]
    # No titles -> top_pad = bottom_pad = margin = 40.
    content_top = 40
    content_bottom = out.height - 40
    row_center = (content_top + content_bottom) // 2
    panel_center = (panel_top + panel_bottom) // 2

    # If centering works, panel_center should be near row_center. If
    # the old top-aligned code is back, panel_center would be much
    # closer to top_pad than to row_center.
    assert abs(panel_center - row_center) <= 4, (
        f"panel center {panel_center} not within 4px of row center {row_center}"
    )


def test_compose_side_by_side_centers_unequal_heights():
    """Same centering invariant for the per-frame side-by-side compose
    used in the animated code path."""
    from stackshot.colors import DEFAULT_BG

    short = Image.new("RGBA", (100, 40), (10, 200, 10, 255))
    tall = Image.new("RGBA", (100, 200), (200, 10, 10, 255))
    out = compose_side_by_side(short, tall, None, None)

    col = 40 + 24
    px = out.load()
    panel_rows = [y for y in range(out.height) if px[col, y][:3] != DEFAULT_BG]
    assert panel_rows
    panel_center = (panel_rows[0] + panel_rows[-1]) // 2
    row_center = (40 + (out.height - 40)) // 2
    assert abs(panel_center - row_center) <= 4
