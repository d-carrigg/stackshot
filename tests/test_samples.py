"""Generate the example PNGs embedded in README.md by driving the same
public flow library users do: parse_markdown -> render_code_image ->
compose_panels. Acts as an integration check at the same time.

The outputs are committed (docs/img/), so re-running these tests after
a visual change refreshes the README screenshots.
"""
from pathlib import Path

import pytest
from PIL import Image

from codeimg import compose_panels, parse_markdown, render_code_image
from codeimg.cli import main
from codeimg.io_utils import open_image, save_image, scale_image_to_max


REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS_IMG = REPO_ROOT / "docs" / "img"
DOCS_EXAMPLES = REPO_ROOT / "docs" / "examples"


@pytest.fixture(scope="module")
def docs_img():
    DOCS_IMG.mkdir(parents=True, exist_ok=True)
    return DOCS_IMG


def render_markdown(md: str, vertical: bool = False, background=None) -> Image.Image:
    """Public-API render: parse markdown -> render each panel -> compose."""
    items = []
    for p in parse_markdown(md):
        img = render_code_image(p.code, p.lang, None)
        img = scale_image_to_max(img, 1200, 900)
        items.append((img, p.title, False))
    return compose_panels(items, vertical=vertical, background=background)


def test_sample_single_panel(docs_img):
    md = (
        "parse_markdown\n"
        "```python\n"
        "def parse_markdown(text: str) -> list[Panel]:\n"
        '    """Fenced ```lang blocks become code panels;\n'
        '    the line above a fence becomes its title."""\n'
        "    ...\n"
        "```\n"
    )
    save_image(render_markdown(md), str(docs_img / "single-panel.png"))


def test_sample_two_panels(docs_img):
    md = (
        "Request\n"
        "```powershell\n"
        "New-BinWips -ScriptBlock {\n"
        '    $name = Read-Host "What is your name?"\n'
        '    echo "Hello $name!"\n'
        "}\n"
        "```\n"
        "\n"
        "Response\n"
        "```\n"
        "$ ./PSBinary\n"
        "What is your name?: BinWips\n"
        "Hello BinWips!\n"
        "```\n"
    )
    save_image(render_markdown(md), str(docs_img / "two-panels.png"))


def test_sample_vertical(docs_img):
    md = (
        "Creates PSBinary\n"
        "```powershell\n"
        "New-BinWips -ScriptBlock {\n"
        '    $name = Read-Host "What is your name?"\n'
        '    echo "Hello $name!"\n'
        "} -OutFile MyApp\n"
        "```\n"
        "\n"
        "```bash\n"
        "$ ./MyApp\n"
        "What is your name?: BinWips\n"
        "Hello BinWips!\n"
        "```\n"
    )
    save_image(render_markdown(md, vertical=True), str(docs_img / "vertical.png"))


def test_sample_markdown_to_rendered(docs_img):
    """Markdown input on top, what codeimg rendered from it below. The
    inner Output panel stays horizontal (it's the original Request →
    Response demo). The inner render also goes through the public flow
    so a regression in parse_markdown or compose_panels shows up in
    BOTH the Output side and the test result."""
    inner_md = (
        "Request\n"
        "```powershell\n"
        "Get-Process | Select-Object -First 3\n"
        "```\n"
        "\n"
        "Response\n"
        "```\n"
        "Handles  NPM(K)  PM(K)  WS(K)  CPU(s)\n"
        "    442      27   8324  14216    1.23\n"
        "```\n"
    )

    # Render inner with a slightly darker canvas so the inner image
    # reads as a distinct region against the outer demo's default bg
    # without going full-black.
    inner_rendered = render_markdown(inner_md, background=(22, 22, 33))
    tmp = docs_img / "_rendered-tmp.png"
    save_image(inner_rendered, str(tmp))

    # The literal markdown can't itself be parsed (it contains the
    # fences we want to display), so render the raw text directly with
    # the markdown lexer, then compose alongside the rendered image.
    md_img = scale_image_to_max(
        render_code_image(inner_md, "markdown", None), 1200, 900
    )
    output_img = scale_image_to_max(
        open_image(str(tmp)).convert("RGBA"), 1200, 900
    )
    out = compose_panels([
        (md_img, "Input (markdown)", False),
        (output_img, "Output", True),
    ], vertical=True, no_inner_border=True)
    save_image(out, str(docs_img / "markdown-demo.png"))
    tmp.unlink(missing_ok=True)


def test_sample_code_to_gif(docs_img, monkeypatch):
    """Compose the print_loop.py example with a user-recorded terminal
    GIF into an animated code -> output sample. Skips when the recording
    isn't checked in yet — drop the GIF at docs/img/print_loop.gif and
    re-run to refresh docs/img/code-to-gif.gif."""
    code_src = DOCS_EXAMPLES / "print_loop.py"
    recording = docs_img / "print_loop.gif"
    if not recording.exists():
        pytest.skip(
            f"Record the terminal output to {recording} (running "
            f"{code_src.relative_to(REPO_ROOT)}) to refresh this sample."
        )

    out_path = docs_img / "code-to-gif.gif"
    argv = [
        "codeimg",
        str(code_src),
        str(recording),
        "--title", "Code", "Output",
        "--out", str(out_path),
        "--no-clip",
    ]
    monkeypatch.setattr("sys.argv", argv)
    main()
    assert out_path.exists() and out_path.stat().st_size > 0
