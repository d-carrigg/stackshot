from stackshot.markdown import Panel, parse_markdown


def test_plain_text_becomes_single_panel():
    panels = parse_markdown("just some text\nmore text")
    assert len(panels) == 1
    assert panels[0].title is None
    assert panels[0].lang is None
    assert panels[0].code == "just some text\nmore text"


def test_fenced_block_with_lang():
    panels = parse_markdown("```python\nprint('hi')\n```")
    assert len(panels) == 1
    assert panels[0].lang == "python"
    assert panels[0].title is None
    assert panels[0].code == "print('hi')"


def test_title_above_fence():
    text = "this is a title\n```pwsh\nGet-Process\n```"
    panels = parse_markdown(text)
    assert len(panels) == 1
    assert panels[0].title == "this is a title"
    assert panels[0].lang == "pwsh"
    assert panels[0].code == "Get-Process"


def test_multiple_blocks_with_titles():
    text = (
        "Request\n"
        "```pwsh\nGet-Process\n```\n"
        "\n"
        "Response\n"
        "```\nok\n```\n"
    )
    panels = parse_markdown(text)
    assert len(panels) == 2
    assert panels[0].title == "Request"
    assert panels[0].lang == "pwsh"
    assert panels[1].title == "Response"
    assert panels[1].lang is None


def test_empty_input_returns_no_panels():
    assert parse_markdown("") == []
    assert parse_markdown("\n\n") == []


def test_plain_text_before_fence_kept_as_its_own_panel():
    text = (
        "some intro text\n"
        "\n"
        "title\n"
        "```py\nx = 1\n```\n"
    )
    panels = parse_markdown(text)
    assert [p.title for p in panels] == [None, "title"]
    assert panels[0].code == "some intro text"
    assert panels[1].code == "x = 1"


def test_panel_dataclass_defaults():
    p = Panel(code="x")
    assert p.title is None
    assert p.lang is None
    assert p.is_image is False
    assert p.image_path is None
