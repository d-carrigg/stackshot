import io
from pathlib import Path

import pytest

from codeimg.cli import main


def _run_main(monkeypatch, argv, stdin=None):
    monkeypatch.setattr("sys.argv", ["codeimg", *argv])
    if stdin is not None:
        monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()


def test_cli_help_exits_zero(monkeypatch, capsys):
    with pytest.raises(SystemExit) as exc:
        _run_main(monkeypatch, ["--help"])
    assert exc.value.code == 0
    assert "usage:" in capsys.readouterr().out.lower()


def test_cli_two_literal_panels_writes_png(tmp_path: Path, monkeypatch):
    out = tmp_path / "two.png"
    _run_main(monkeypatch, ["print('hi')", "hi", "--out", str(out), "--no-clip"])
    assert out.exists() and out.stat().st_size > 0


def test_cli_single_panel_writes_png(tmp_path: Path, monkeypatch):
    """One positional argument must render a single card (no arrow / no empty right card)."""
    out = tmp_path / "one.png"
    _run_main(monkeypatch, ["print('solo')", "--out", str(out), "--no-clip"])
    assert out.exists() and out.stat().st_size > 0


def test_cli_three_panels_with_titles(tmp_path: Path, monkeypatch):
    out = tmp_path / "three.png"
    _run_main(monkeypatch, [
        "a = 1", "b = 2", "c = 3",
        "--title", "A", "B", "C",
        "--lang", "python", "python", "python",
        "--out", str(out), "--no-clip",
    ])
    assert out.exists() and out.stat().st_size > 0


def test_cli_title_longer_than_panels_errors(tmp_path: Path, monkeypatch):
    out = tmp_path / "x.png"
    with pytest.raises(SystemExit) as exc:
        _run_main(monkeypatch, [
            "x = 1",
            "--title", "A", "B", "C",
            "--out", str(out), "--no-clip",
        ])
    assert "title" in str(exc.value).lower()


def test_cli_file_path_panel_reads_file(tmp_path: Path, monkeypatch):
    src = tmp_path / "snippet.py"
    src.write_text("def foo():\n    return 42\n")
    out = tmp_path / "out.png"
    _run_main(monkeypatch, [str(src), "--out", str(out), "--no-clip"])
    assert out.exists() and out.stat().st_size > 0


def test_cli_file_path_with_line_range(tmp_path: Path, monkeypatch):
    src = tmp_path / "many.py"
    src.write_text("\n".join(f"line_{i} = {i}" for i in range(1, 21)) + "\n")
    out = tmp_path / "range.png"
    _run_main(monkeypatch, [f"{src}:5-8", "--out", str(out), "--no-clip"])
    assert out.exists() and out.stat().st_size > 0


def test_cli_image_path_panel(tmp_path: Path, monkeypatch):
    from PIL import Image
    img = Image.new("RGB", (60, 40), (40, 80, 120))
    img_path = tmp_path / "pic.png"
    img.save(img_path)
    out = tmp_path / "with-img.png"
    _run_main(monkeypatch, [str(img_path), "print('hi')", "--out", str(out), "--no-clip"])
    assert out.exists() and out.stat().st_size > 0


def test_cli_no_clip_suppresses_clipboard(tmp_path: Path, monkeypatch, capsys):
    out = tmp_path / "x.png"
    called = []
    monkeypatch.setattr("codeimg.cli.copy_to_clipboard", lambda img: called.append(img))
    _run_main(monkeypatch, ["x = 1", "--out", str(out), "--no-clip"])
    assert called == []
    assert "clipboard" not in capsys.readouterr().out.lower()


def test_cli_default_copies_to_clipboard(tmp_path: Path, monkeypatch):
    out = tmp_path / "x.png"
    called = []
    monkeypatch.setattr("codeimg.cli.copy_to_clipboard", lambda img: called.append(img))
    _run_main(monkeypatch, ["x = 1", "--out", str(out)])
    assert len(called) == 1


def test_cli_interactive_markdown_via_stdin(tmp_path: Path, monkeypatch):
    """End-to-end: markdown-fenced stdin produces a multi-panel image."""
    out = tmp_path / "md.png"
    stdin = (
        "Request\n"
        "```pwsh\n"
        "Get-Process\n"
        "```\n"
        "\n"
        "\n"  # two blank lines end the block
        "d\n"  # done at the action prompt
    )
    monkeypatch.setattr("codeimg.interactive.copy_to_clipboard", lambda img: None)
    _run_main(monkeypatch, ["--out", str(out)], stdin=stdin)
    assert out.exists() and out.stat().st_size > 0
