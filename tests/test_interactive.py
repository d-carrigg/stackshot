import io
from pathlib import Path

from PIL import Image

from codeshot import interactive as interactive_mod
from codeshot.cli import main


def _set_clipboard(monkeypatch, sequence):
    """Patch try_get_clipboard_image to return values from `sequence`,
    one per call, then None forever."""
    it = iter(sequence)

    def _next():
        try:
            return next(it)
        except StopIteration:
            return None

    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", _next)


def _run(monkeypatch, argv, stdin):
    monkeypatch.setattr("sys.argv", ["codeshot", *argv])
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()


def test_clipboard_image_is_auto_added_and_advances(tmp_path: Path, monkeypatch, capsys):
    """An image in the clipboard at block-prompt time is added as a panel,
    '[Image 1]' is printed, and no action menu is shown for that block."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    _set_clipboard(monkeypatch, [img])

    stdin = (
        "code line\n"  # block 2: text
        "\n"
        "\n"
        "d\n"  # done
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert "[Image 1]" in output
    assert out.exists() and out.stat().st_size > 0


def test_same_clipboard_image_is_not_added_twice(tmp_path: Path, monkeypatch, capsys):
    """If the clipboard still holds the same image on the next block, it
    must not auto-add again — the user wanted one image, not many."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    # Returns the same image on every call
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: img.copy())

    stdin = (
        "a\n"      # block 2: action menu wants 'add' after the second block
        "code\n"   # block 2 content
        "\n"
        "\n"
        "d\n"      # done
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert output.count("[Image ") == 1, output


def test_text_only_path_unchanged_when_clipboard_empty(tmp_path: Path, monkeypatch, capsys):
    _set_clipboard(monkeypatch, [])
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
    and Alt+Enter insert a newline. Catches import / binding typos."""
    from prompt_toolkit.keys import Keys

    session = interactive_mod._build_session()
    bound = {tuple(b.keys) for b in session.key_bindings.bindings}
    assert (Keys.Enter,) in bound or (Keys.ControlM,) in bound
    assert (Keys.ControlJ,) in bound
    assert (Keys.Escape, Keys.Enter) in bound or (Keys.Escape, Keys.ControlM) in bound
