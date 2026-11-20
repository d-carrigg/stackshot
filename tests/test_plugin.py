"""Claude Code plugin packaging: manifests stay in sync with the package
and the skill only documents flags the CLI actually accepts."""
import json
import re
import tomllib
from pathlib import Path

from stackshot.cli import _build_parser

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text())
MARKETPLACE = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text())
PYPROJECT = tomllib.loads((ROOT / "pyproject.toml").read_text())
SKILL = (ROOT / "skills" / "stackshot" / "SKILL.md").read_text()


def test_plugin_versions_match_pyproject():
    """Release bumps pyproject; the plugin must report the same version
    or `/plugin update` won't see the new release."""
    version = PYPROJECT["project"]["version"]
    assert PLUGIN["version"] == version
    entries = {p["name"]: p for p in MARKETPLACE["plugins"]}
    assert entries[PLUGIN["name"]]["version"] == version


def test_marketplace_points_at_repo_root():
    """The repo is both the marketplace and the plugin, so the entry's
    source must be the root and the CLI source ships with the plugin."""
    entry = next(p for p in MARKETPLACE["plugins"] if p["name"] == PLUGIN["name"])
    assert entry["source"] == "./"
    assert (ROOT / "pyproject.toml").is_file()


def test_skill_frontmatter():
    m = re.match(r"^---\n(.*?)\n---\n", SKILL, re.DOTALL)
    assert m, "SKILL.md needs YAML frontmatter"
    fields = dict(
        line.split(":", 1) for line in m.group(1).splitlines() if ":" in line
    )
    assert fields["name"].strip() == "stackshot"
    assert fields["description"].strip()


def test_skill_only_documents_real_flags():
    """Every `--flag` the skill tells Claude to pass must exist in the
    CLI parser (uv's own flags excluded)."""
    known = {
        opt for action in _build_parser()._actions for opt in action.option_strings
    }
    uv_flags = {"--project", "--no-dev", "--frozen"}
    documented = set(re.findall(r"(?<![\w-])--[a-z][a-z-]*", SKILL)) - uv_flags
    assert documented, "expected the skill to document CLI flags"
    assert documented <= known, f"unknown flags in SKILL.md: {documented - known}"
