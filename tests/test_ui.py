"""UI smoke tests.

These build the real UI tree on a Tk root and exercise the same code
paths the desktop app runs through, without entering mainloop. Skipped
when there's no display (e.g. headless CI without xvfb)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from PIL import Image

# Import the module; if tkinter itself isn't available, skip the file.
ui = pytest.importorskip("stackshot.ui")
tk = ui.tk
if tk is None:
    pytest.skip("tkinter not available", allow_module_level=True)


def _make_root():
    """Open a real Tk root, or skip if no display backend is reachable."""
    try:
        root = tk.Tk()
    except tk.TclError as e:
        pytest.skip(f"no display available: {e}")
    root.withdraw()
    return root


@pytest.fixture
def root():
    r = _make_root()
    try:
        yield r
    finally:
        r.destroy()


def test_dnd_path_parser_handles_braces_and_spaces():
    """tkdnd brace-quotes paths with spaces, leaves bare paths alone, and
    space-separates multiple drops. The parser must round-trip all three."""
    assert ui._parse_dnd_paths("/tmp/a.png") == ["/tmp/a.png"]
    assert ui._parse_dnd_paths("{/tmp/has space.png}") == ["/tmp/has space.png"]
    assert ui._parse_dnd_paths("/tmp/a.png {/tmp/b c.png} /tmp/d.png") == [
        "/tmp/a.png", "/tmp/b c.png", "/tmp/d.png",
    ]
    assert ui._parse_dnd_paths("") == []


def test_app_builds_with_two_default_panels(root):
    """Constructing the App should seed two panels and render a preview
    without raising — this catches widget-graph regressions and the
    'text widget never gridded' bug the old UI shipped with."""
    app = ui.build_ui(root)
    assert len(app.panels) == 2
    titles = [p.snapshot().title for p in app.panels]
    assert titles == ["Request", "Response"]
    # Force the debounced preview to actually run, then assert it produced something.
    root.update_idletasks()
    app._render_preview()
    assert app._preview_ref is not None, "preview image should have been generated"


def test_add_and_remove_panel(root):
    app = ui.build_ui(root)
    start = len(app.panels)
    app.add_panel(title="Extra", code="print('x')")
    assert len(app.panels) == start + 1
    # Indices should renumber when we remove from the middle.
    middle = app.panels[1]
    app._remove_panel(middle)
    assert len(app.panels) == start
    for i, p in enumerate(app.panels):
        assert p.index == i


def test_cannot_remove_last_panel(root):
    """Going below 1 panel would break compose_panels. The remove handler
    must refuse, and the UI must disable the button to communicate that."""
    app = ui.build_ui(root)
    while len(app.panels) > 1:
        app._remove_panel(app.panels[-1])
    last = app.panels[0]
    app._remove_panel(last)
    assert len(app.panels) == 1
    assert str(last.remove_btn["state"]) == "disabled"


def test_set_image_switches_panel_to_image_mode(tmp_path: Path, root):
    """Setting an image on a panel hides the code text area, enables the
    Clear button, and the snapshot reports the image path (not the code).
    Compose then takes the image-panel path."""
    img_path = tmp_path / "x.png"
    Image.new("RGB", (40, 30), (100, 150, 200)).save(img_path)

    app = ui.build_ui(root)
    panel = app.panels[0]
    panel.text.insert("1.0", "this code should be ignored once image is set")
    panel.set_image(str(img_path))

    snap = panel.snapshot()
    assert snap.image_path == str(img_path)
    assert str(panel.clear_btn["state"]) == "normal"

    app._render_preview()
    assert app._preview_ref is not None

    panel._clear_image()
    assert panel.snapshot().image_path is None
    assert str(panel.clear_btn["state"]) == "disabled"


def test_color_swatch_change_repaints_button(root):
    """ColorSwatch.set() must update the swatch's background so the user
    sees the picked color reflected. (Catches forgetting activebackground,
    which on some themes is what actually shows.)"""
    rgb_seen: list[tuple[int, int, int]] = []
    swatch = ui.ColorSwatch(root, (10, 20, 30), on_change=rgb_seen.append)
    swatch.pack()
    swatch.set((200, 100, 50))
    assert swatch.btn["bg"] == "#c86432"
    assert swatch.btn["activebackground"] == "#c86432"


def test_compose_honors_layout_and_colors(root):
    """Toggling vertical layout and picking a bg color must flow through
    to the composed image (different from defaults)."""
    app = ui.build_ui(root)
    app.layout_var.set("vertical")
    app.bg_rgb = (10, 10, 10)
    img_v = app._compose(scale=1.0)
    app.layout_var.set("horizontal")
    img_h = app._compose(scale=1.0)
    # Vertical stack is taller than wide for these short snippets; horizontal is wider.
    assert img_v.height > img_h.height
    assert img_h.width > img_v.width
    # bg color reaches a corner pixel
    assert img_v.getpixel((0, 0))[:3] == (10, 10, 10)


def test_scale_selector_affects_output_dimensions(root):
    """A 2× scale should produce a roughly 2× larger image than 1×.
    Allow some slop — fit_image's max-bound clamps can round."""
    app = ui.build_ui(root)
    small = app._compose(scale=1.0)
    big = app._compose(scale=2.0)
    assert big.width > int(small.width * 1.6)
    assert big.height > int(small.height * 1.6)


def test_current_scale_falls_back_on_garbage(root):
    app = ui.build_ui(root)
    app.scale_var.set("not-a-number")
    assert app._current_scale() == 2.0
    app.scale_var.set("0")
    assert app._current_scale() == 2.0
    app.scale_var.set("1.5")
    assert app._current_scale() == 1.5
