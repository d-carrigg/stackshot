import io
from pathlib import Path

from PIL import Image

from codeshot import interactive as interactive_mod
from codeshot.cli import main


def _fake_args_for(tmp_path: Path):
    class A:
        out = str(tmp_path / "out.png")
        max_left_width = 1200
        max_panel_height = 900
        webp_quality = 90
        webp_method = 4
        no_border = False
    return A()


def test_image_action_pulls_clipboard_image(tmp_path: Path, monkeypatch):
    """Typing 'i' at the action prompt grabs the clipboard image, adds it
    as a panel with is_image=True, and continues to the next block."""
    fake_img = Image.new("RGB", (40, 30), (200, 100, 50))
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: fake_img)

    stdin = (
        "first block of code\n"
        "\n"
        "\n"          # end first block
        "i\n"         # paste image
        "\n"          # empty next block -> nothing added; finish
        "\n"
        "d\n"
    )
    monkeypatch.setattr("sys.argv", ["codeshot", "--out", str(tmp_path / "x.png")])
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()
    assert (tmp_path / "x.png").exists()


def test_image_action_with_empty_clipboard_keeps_prompting(monkeypatch, capsys, tmp_path: Path):
    monkeypatch.setattr(interactive_mod, "try_get_clipboard_image", lambda: None)
    stdin = (
        "code line\n"
        "\n"
        "\n"
        "i\n"   # no image -> message + reprompt
        "d\n"   # then done
    )
    monkeypatch.setattr("sys.argv", ["codeshot", "--out", str(tmp_path / "x.png")])
    monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()
    out = capsys.readouterr().out
    assert "Clipboard has no image" in out
