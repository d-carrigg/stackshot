from pathlib import Path

from PIL import Image

from stackshot.panel_input import resolve_panel


def test_literal_code_when_no_file_match():
    rp = resolve_panel("print('hi')")
    assert not rp.is_image
    assert rp.code == "print('hi')"
    assert rp.source_path is None


def test_code_file_path_reads_content(tmp_path: Path):
    f = tmp_path / "foo.py"
    f.write_text("def x():\n    return 1\n")
    rp = resolve_panel(str(f))
    assert not rp.is_image
    assert rp.code == "def x():\n    return 1"
    assert rp.filename_hint == "foo.py"
    assert rp.source_path == str(f)


def test_image_path_detected(tmp_path: Path):
    p = tmp_path / "pic.png"
    Image.new("RGB", (10, 10), "red").save(p)
    rp = resolve_panel(str(p))
    assert rp.is_image
    assert rp.image_path == str(p)


def test_line_range_dash(tmp_path: Path):
    f = tmp_path / "long.py"
    f.write_text("\n".join(f"L{i}" for i in range(1, 11)) + "\n")
    rp = resolve_panel(f"{f}:3-5")
    assert rp.code == "L3\nL4\nL5"
    assert rp.line_range == (3, 5)


def test_line_range_colon_syntax(tmp_path: Path):
    f = tmp_path / "long.py"
    f.write_text("\n".join(f"L{i}" for i in range(1, 11)) + "\n")
    rp = resolve_panel(f"{f}:2:4")
    assert rp.code == "L2\nL3\nL4"


def test_single_line_range(tmp_path: Path):
    f = tmp_path / "long.py"
    f.write_text("\n".join(f"L{i}" for i in range(1, 11)) + "\n")
    rp = resolve_panel(f"{f}:7")
    assert rp.code == "L7"
    assert rp.line_range == (7, 7)


def test_range_on_nonexistent_path_falls_back_to_literal():
    rp = resolve_panel("/no/such/file.py:5-10")
    assert not rp.is_image
    assert rp.code == "/no/such/file.py:5-10"
    assert rp.source_path is None


def test_code_with_colon_then_text_is_literal():
    """Strings like `key: value` shouldn't be misread as a path with a range."""
    rp = resolve_panel("key: value")
    assert not rp.is_image
    assert rp.code == "key: value"
