"""Contract test for the --scale knob: doubling scale must double the
output dimensions (within rounding) and the layout must remain
proportional. Renders are done in-process via the public flow."""
import pytest
from PIL import Image

from stackshot import compose_panels, compose_side_by_side, render_code_image
from stackshot.cli import main


CODE = "def hello():\n    print('world')\n"


def _render(scale: float, vertical: bool = False) -> Image.Image:
    img = render_code_image(CODE, "python", None, scale=scale)
    return compose_panels([(img, "Title", False)], scale=scale, vertical=vertical)


def _render_pair(scale: float) -> Image.Image:
    left = render_code_image(CODE, "python", None, scale=scale)
    right = render_code_image("y = 2\n", "python", None, scale=scale)
    return compose_side_by_side(left, right, "L", "R", scale=scale)


def test_scale_doubles_output_dimensions():
    one = _render(1.0)
    two = _render(2.0)
    # Allow a small rounding window — every constant goes through round().
    assert abs(two.width - one.width * 2) <= 4, (one.size, two.size)
    assert abs(two.height - one.height * 2) <= 4, (one.size, two.size)


def test_scale_doubles_vertical_layout():
    one = _render(1.0, vertical=True)
    two = _render(2.0, vertical=True)
    assert abs(two.width - one.width * 2) <= 4, (one.size, two.size)
    assert abs(two.height - one.height * 2) <= 4, (one.size, two.size)


def test_scale_doubles_side_by_side():
    one = _render_pair(1.0)
    two = _render_pair(2.0)
    # Side-by-side stacks more rounded constants than the single-panel
    # path (margin + top_pad + arrow_width + 2×panel_pad), so the
    # rounding window is a little wider.
    assert abs(two.width - one.width * 2) <= 8, (one.size, two.size)
    assert abs(two.height - one.height * 2) <= 8, (one.size, two.size)


def test_scale_one_is_compact():
    """scale=1.0 preserves the pre-0.3.0 sizing — catches accidental
    drift in the layout constants."""
    img = _render(1.0)
    assert img.width > 0 and img.height > 0
    big = _render(3.0)
    assert big.width > img.width
    assert big.height > img.height


def test_scale_renders_without_error_at_fractional():
    """Fractional scales (e.g. 1.5) must work — they're just float
    multipliers, no enum constraint."""
    img = _render(1.5)
    assert img.width > 0 and img.height > 0


@pytest.mark.parametrize("bad", ["0", "-1", "nan", "-0.5"])
def test_cli_rejects_nonpositive_scale(bad, monkeypatch, tmp_path):
    """--scale 0, negatives, and NaN must be rejected before any
    rendering happens — otherwise a malformed value silently degrades to
    a 1-pixel canvas. `not (x > 0)` in cli.main catches NaN where
    `x <= 0` would let it through."""
    monkeypatch.setattr(
        "sys.argv",
        ["stackshot", "x = 1", "--scale", bad, "--out", str(tmp_path / "o.png"), "--no-clip"],
    )
    with pytest.raises(SystemExit):
        main()
