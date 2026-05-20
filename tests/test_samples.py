"""Generate the example PNGs embedded in README.md by driving the same
public flow library users do: parse_markdown -> render_code_image ->
compose_panels. Acts as an integration check at the same time.

The outputs are committed (docs/img/), so re-running these tests after
a visual change refreshes the README screenshots.
"""
from pathlib import Path

import pytest
from PIL import Image

from codeshot import compose_panels, parse_markdown, render_code_image
from codeshot.io_utils import open_image, save_image, scale_image_to_max


DOCS_IMG = Path(__file__).resolve().parents[1] / "docs" / "img"


@pytest.fixture(scope="module")
def docs_img():
    DOCS_IMG.mkdir(parents=True, exist_ok=True)
    return DOCS_IMG


def render_markdown(md: str, vertical: bool = False) -> Image.Image:
    """Public-API render: parse markdown -> render each panel -> compose."""
    items = []
    for p in parse_markdown(md):
        img = render_code_image(p.code, p.lang, None)
        img = scale_image_to_max(img, 1200, 900)
        items.append((img, p.title, False))
    return compose_panels(items, vertical=vertical)


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
    """Markdown input on the left, what codeshot rendered from it on the
    right. The inner render also goes through the public flow so a
    regression in parse_markdown or compose_panels shows up in BOTH the
    Output side and the test result."""
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

    inner_rendered = render_markdown(inner_md)
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
    ])
    save_image(out, str(docs_img / "markdown-demo.png"))
    tmp.unlink(missing_ok=True)
