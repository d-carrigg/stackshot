"""Generate the example PNGs embedded in README.md.

The outputs are committed (docs/img/), so re-running these tests after a
visual change refreshes the README screenshots.
"""
from pathlib import Path

import pytest

from codeshot.compose import compose_panels
from codeshot.highlight import render_code_image
from codeshot.io_utils import open_image, save_image, scale_image_to_max


DOCS_IMG = Path(__file__).resolve().parents[1] / "docs" / "img"


@pytest.fixture(scope="module")
def docs_img():
    DOCS_IMG.mkdir(parents=True, exist_ok=True)
    return DOCS_IMG


def _render(code: str, lang: str | None = None):
    img = render_code_image(code, lang, None)
    return scale_image_to_max(img, 1200, 900)


def test_sample_single_panel(docs_img):
    code = (
        "def parse_markdown(text: str) -> list[Panel]:\n"
        "    \"\"\"Fenced ```lang blocks become code panels;\n"
        "    the line above a fence becomes its title.\"\"\"\n"
        "    ..."
    )
    out = compose_panels([(_render(code, "python"), "parse_markdown", False)])
    save_image(out, str(docs_img / "single-panel.png"))


def test_sample_two_panels(docs_img):
    left = _render(
        "New-BinWips -ScriptBlock {\n"
        "    $name = Read-Host \"What is your name?\"\n"
        "    echo \"Hello $name!\"\n"
        "}",
        "powershell",
    )
    right = _render(
        "$ ./PSBinary\n"
        "What is your name?: BinWips\n"
        "Hello BinWips!",
    )
    out = compose_panels([
        (left, "Request", False),
        (right, "Response", False),
    ])
    save_image(out, str(docs_img / "two-panels.png"))


def test_sample_markdown_to_rendered(docs_img):
    """Self-referential: the left panel shows the markdown input syntax,
    the right panel shows what codeshot produced from it."""
    md_input = (
        "Request\n"
        "```pwsh\n"
        "Get-Process | Select-Object -First 3\n"
        "```\n"
        "\n"
        "Response\n"
        "```\n"
        "Handles  NPM(K)  PM(K)  WS(K)  CPU(s)\n"
        "    442      27   8324  14216    1.23\n"
        "```\n"
    )

    # First render: what codeshot produces from the markdown above.
    rendered = compose_panels([
        (_render("Get-Process | Select-Object -First 3", "powershell"), "Request", False),
        (_render(
            "Handles  NPM(K)  PM(K)  WS(K)  CPU(s)\n"
            "    442      27   8324  14216    1.23",
        ), "Response", False),
    ])
    rendered_path = docs_img / "_rendered-tmp.png"
    save_image(rendered, str(rendered_path))

    # Outer composition: markdown input on the left, the rendered image on the right.
    md_img = _render(md_input, "markdown")
    out_img = scale_image_to_max(open_image(str(rendered_path)).convert("RGBA"), 1200, 900)
    out = compose_panels([
        (md_img, "Input (markdown)", False),
        (out_img, "Output", True),
    ])
    save_image(out, str(docs_img / "markdown-demo.png"))
    rendered_path.unlink(missing_ok=True)
