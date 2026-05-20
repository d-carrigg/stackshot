import io
from pathlib import Path

from PIL import Image

from codeimg import interactive as interactive_mod
from codeimg.cli import main


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
    monkeypatch.setattr("sys.argv", ["codeimg", *argv])
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()


def test_clipboard_image_only_added_on_empty_submission(tmp_path: Path, monkeypatch, capsys):
    """A clipboard image must NOT auto-add on startup. It's only grabbed
    when the user explicitly submits an empty block (the paste gesture)."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: img.copy())

    # Block 1: empty submission → triggers clipboard grab → image added.
    # Block 2: 'code' text. Then 'd' done.
    stdin = (
        "\n\n"      # block 1: empty submission grabs clipboard
        "code\n\n\n"  # block 2: text
        "d\n"       # done
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert "[Image 1]" in output
    assert out.exists() and out.stat().st_size > 0


def test_no_startup_clipboard_grab(tmp_path: Path, monkeypatch, capsys):
    """Regression: an image in the clipboard at app launch must NOT be
    auto-inserted as the first panel. The user has to ask for it."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: img.copy())

    # Block 1: just text, no empty submission. Image must not appear.
    stdin = (
        "print('hi')\n\n\n"
        "d\n"
    )
    out = tmp_path / "x.png"
    _run(monkeypatch, ["--out", str(out)], stdin)
    output = capsys.readouterr().out
    assert "[Image" not in output, output
    assert out.exists() and out.stat().st_size > 0


def test_same_clipboard_image_is_not_added_twice(tmp_path: Path, monkeypatch, capsys):
    """If the user submits two empty blocks with the same image still in
    clipboard, dedup prevents double-add."""
    img = Image.new("RGB", (40, 30), (200, 100, 50))
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: img.copy())

    stdin = (
        "\n\n"        # block 1: empty → clipboard image added
        "a\n"         # action: add another
        "\n\n"        # block 2: empty → clipboard checked, same image, no re-add
        "a\n"         # action: add another
        "code\n\n\n"  # block 3: text (so we have something to render)
        "d\n"         # done
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
