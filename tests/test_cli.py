import io
from pathlib import Path

import pytest

from codeshot.cli import main


def _run_main(monkeypatch, argv, stdin=None):
    monkeypatch.setattr("sys.argv", ["codeshot", *argv])
    if stdin is not None:
        monkeypatch.setattr("sys.stdin", io.StringIO(stdin))
    main()


def test_cli_help_exits_zero(monkeypatch, capsys):
    with pytest.raises(SystemExit) as exc:
        _run_main(monkeypatch, ["--help"])
    assert exc.value.code == 0
    assert "usage:" in capsys.readouterr().out.lower()


def test_cli_two_panel_writes_png(tmp_path: Path, monkeypatch):
    out = tmp_path / "two.png"
    _run_main(monkeypatch, ["--left", "print('hi')", "--right", "hi", "--out", str(out)])
    assert out.exists() and out.stat().st_size > 0


def test_cli_single_panel_writes_png(tmp_path: Path, monkeypatch):
    """Only --left provided: must render a single card, no arrow/empty response."""
    out = tmp_path / "one.png"
    _run_main(monkeypatch, ["--left", "print('solo')", "--out", str(out)])
    assert out.exists() and out.stat().st_size > 0


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
    _run_main(monkeypatch, ["--out", str(out)], stdin=stdin)
    assert out.exists() and out.stat().st_size > 0
