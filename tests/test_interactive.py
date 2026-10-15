import io
from pathlib import Path

from PIL import Image

from stackshot import interactive as interactive_mod
from stackshot import io_utils
from stackshot.cli import main


def _run(monkeypatch, argv, stdin):
    monkeypatch.setattr("sys.argv", ["stackshot", *argv])
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()


def test_no_startup_clipboard_grab(tmp_path: Path, monkeypatch, capsys):
    """An image in the clipboard at app launch must not be auto-inserted
    as a panel. Image insertion is only via an explicit paste gesture
    (TTY-only)."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: img.copy())

    stdin = (
        "print('hi')\n\n\n"
        "d\n"
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert "[Image" not in output, output
    assert out.exists() and out.stat().st_size > 0


def test_piped_stdin_does_not_grab_clipboard_on_empty_block(tmp_path: Path, monkeypatch, capsys):
    """Non-TTY mode is text-only — even an empty block with an image on
    the clipboard must not produce an image panel. (Regression: the
    previous behavior treated empty submissions as paste gestures.)"""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: img.copy())

    stdin = (
        "\n\n"          # block 1 empty — must NOT grab clipboard
        "code\n\n\n"    # block 2 text
        "d\n"
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert "[Image" not in output, output


def test_text_only_path_works_with_no_clipboard(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: None)
    stdin = (
        "print('hi')\n"
        "\n"
        "\n"
        "d\n"
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert "[Image" not in output
    assert out.exists() and out.stat().st_size > 0


def test_prompt_toolkit_session_builds():
    """Smoke-test the TTY editor's keybindings — Enter submits, Ctrl+J
    and Alt+Enter insert a newline, BracketedPaste is intercepted."""
    from prompt_toolkit.keys import Keys

    session = interactive_mod._build_session()
    bound = {tuple(b.keys) for b in session.key_bindings.bindings}
    assert (Keys.Enter,) in bound or (Keys.ControlM,) in bound
    assert (Keys.ControlJ,) in bound
    assert (Keys.Escape, Keys.Enter) in bound or (Keys.Escape, Keys.ControlM) in bound
    assert (Keys.BracketedPaste,) in bound


def test_paste_action_returns_image_when_clipboard_has_image():
    """When clipboard holds an image, pasting should produce an image
    panel regardless of the pasted text."""
    img = Image.new("RGB", (10, 10), (1, 2, 3))
    kind, payload = interactive_mod._paste_action("some pasted text", img)
    assert kind == "image"
    assert payload is img


def test_paste_action_returns_text_when_clipboard_has_no_image():
    """No image on clipboard means a normal text paste — the pasted
    text is forwarded to the buffer."""
    kind, payload = interactive_mod._paste_action("print('hi')", None)
    assert kind == "text"
    assert payload == "print('hi')"


def _patch_grabclipboard(monkeypatch, fn):
    monkeypatch.setattr(io_utils.ImageGrab, "grabclipboard", staticmethod(fn))


def test_try_get_clipboard_image_returns_image(monkeypatch):
    """When Pillow's ImageGrab returns an Image, pass it through."""
    img = Image.new("RGB", (5, 5), (10, 20, 30))
    _patch_grabclipboard(monkeypatch, lambda: img)
    assert io_utils.try_get_clipboard_image() is img


def test_try_get_clipboard_image_returns_none_on_text(monkeypatch):
    """When the clipboard is empty / text-only, ImageGrab returns None,
    and so should our wrapper."""
    _patch_grabclipboard(monkeypatch, lambda: None)
    assert io_utils.try_get_clipboard_image() is None


def test_try_get_clipboard_image_opens_file_list(tmp_path: Path, monkeypatch):
    """On Windows/macOS, ImageGrab.grabclipboard() may return a list of
    file paths instead of an Image (e.g., user copied a file in Finder).
    Open the first one."""
    img_path = tmp_path / "clip.png"
    Image.new("RGB", (3, 3), (1, 2, 3)).save(img_path)
    _patch_grabclipboard(monkeypatch, lambda: [str(img_path)])
    got = io_utils.try_get_clipboard_image()
    assert got is not None
    assert got.size == (3, 3)


def test_try_get_clipboard_image_swallows_platform_errors(monkeypatch):
    """On Linux with no wl-paste/xclip (and on stripped-down envs),
    ImageGrab may raise. The wrapper must degrade to None rather than
    crash the app."""
    def _raise():
        raise NotImplementedError("no clipboard backend")
    _patch_grabclipboard(monkeypatch, _raise)
    assert io_utils.try_get_clipboard_image() is None


def test_pasted_image_temp_file_removed_on_exit(tmp_path: Path, monkeypatch):
    """A pasted clipboard image is staged in a temp file for rendering;
    that file must not outlive the interactive session."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    staged: list[str] = []
    blocks = iter(["image", "text"])

    def fake_read(panels):
        if next(blocks) == "image":
            interactive_mod._save_clipboard_image_as_panel(img, panels)
            staged.append(panels[-1].image_path)
            assert Path(staged[0]).exists()
            return "image", staged[0]
        return "text", "print('hi')\n"

    monkeypatch.setattr(interactive_mod, "_read_block_or_image", fake_read)
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out), "--no-clip"], "d\n")
    assert out.exists() and out.stat().st_size > 0
    assert staged and not Path(staged[0]).exists()
