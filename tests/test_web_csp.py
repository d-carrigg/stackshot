"""CSP must allow blob: media so dropped video can be decoded in-browser."""
from pathlib import Path
import json

CONFIG = Path(__file__).resolve().parents[1] / "src/web/public/staticwebapp.config.json"


def test_csp_allows_blob_media():
    cfg = json.loads(CONFIG.read_text())
    csp = cfg["globalHeaders"]["Content-Security-Policy"]
    assert "media-src" in csp
    assert "blob:" in csp.split("media-src")[1].split(";")[0]
