"""Generates sample output PNGs into tests/samples/ for manual eyeball
review. The output dir is gitignored. Re-run with:

    uv run pytest tests/test_samples.py -s
"""
import shutil
import subprocess
from pathlib import Path

import pytest

from codeshot.compose import compose_panels
from codeshot.highlight import render_code_image
from codeshot.io_utils import open_image, save_image, scale_image_to_max


SAMPLES_DIR = Path(__file__).parent / "samples"
SVG = """<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'>
  <rect width='320' height='180' fill='#1e1e2e'/>
  <circle cx='80'  cy='90' r='40' fill='#cba6f7'/>
  <circle cx='160' cy='90' r='40' fill='#89b4fa'/>
  <circle cx='240' cy='90' r='40' fill='#a6e3a1'/>
  <text x='160' y='160' font-family='monospace' font-size='18' fill='#cdd6f4' text-anchor='middle'>sample image</text>
</svg>
"""


@pytest.fixture(scope="module")
def samples_dir():
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    return SAMPLES_DIR


def _render_code(code, lang=None):
    img = render_code_image(code, lang, None)
    return scale_image_to_max(img, 1200, 900)


def test_sample_single_code_block(samples_dir):
    img = _render_code("def add(a, b):\n    return a + b", "python")
    out = compose_panels([(img, "Function", False)])
    save_image(out, str(samples_dir / "single-code.png"))


def test_sample_two_code_blocks(samples_dir):
    left = _render_code(
        "New-BinWips -ScriptBlock {\n"
        "    $name = Read-Host \"What is your name?\"\n"
        "    echo \"Hello $name!\"\n"
        "}",
        "powershell",
    )
    right = _render_code(
        "$ ./PSBinary\n"
        "What is your name?: BinWips\n"
        "Hello BinWips!",
        None,
    )
    out = compose_panels([
        (left, "Request", False),
        (right, "Response", False),
    ])
    save_image(out, str(samples_dir / "two-code.png"))


def test_sample_code_plus_image(samples_dir):
    if shutil.which("convert") is None:
        pytest.skip("ImageMagick `convert` not available")
    svg_path = samples_dir / "_input.svg"
    png_path = samples_dir / "_input.png"
    svg_path.write_text(SVG)
    subprocess.run(["convert", str(svg_path), str(png_path)], check=True)

    code_img = _render_code('img = Image.open("sample.png")', "python")
    image_img = scale_image_to_max(open_image(str(png_path)).convert("RGBA"), 1200, 900)
    out = compose_panels([
        (code_img, "Code", False),
        (image_img, "Result", True),
    ])
    save_image(out, str(samples_dir / "code-plus-image.png"))
