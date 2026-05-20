import pytest
from PIL import Image

from codeshot.compose import compose_panels, compose_side_by_side


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
