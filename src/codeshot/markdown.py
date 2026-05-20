from dataclasses import dataclass
from typing import Optional


@dataclass
class Panel:
    code: str
    title: Optional[str] = None
    lang: Optional[str] = None
    is_image: bool = False
    image_path: Optional[str] = None


def parse_markdown(text: str) -> list[Panel]:
    """Parse markdown-ish input into panels.

    Fenced ```lang ... ``` blocks become code panels with that lang.
    The non-empty line(s) immediately preceding a fence become its title.
    Plain text outside fences becomes an auto-detected code panel.
    """
    lines = text.split("\n")
    panels: list[Panel] = []
    plain: list[str] = []
    i = 0

    def flush_plain_as_panel():
        nonlocal plain
        body = "\n".join(plain).strip("\n")
        if body.strip():
            panels.append(Panel(code=body.rstrip(), title=None, lang=None))
        plain = []

    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            while plain and plain[-1].strip() == "":
                plain.pop()
            title_lines: list[str] = []
            while plain and plain[-1].strip():
                title_lines.insert(0, plain.pop())
            if plain:
                flush_plain_as_panel()
            title = "\n".join(title_lines).strip() or None
            lang = line.lstrip()[3:].strip() or None
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            panels.append(Panel(
                code="\n".join(code_lines).rstrip("\n"),
                title=title,
                lang=lang,
            ))
        else:
            plain.append(line)
            i += 1
    flush_plain_as_panel()
    return panels
