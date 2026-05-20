from typing import Optional

from PIL import Image, ImageDraw

from .colors import ARROW, DEFAULT_BG, PANEL_BG, PANEL_RADIUS, TEXT
from .fonts import load_font


def apply_rounded_corners(img: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return img.convert("RGBA")
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, img.size[0], img.size[1]], radius=radius, fill=255
    )
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def compose_panels(
    items: list[tuple[Image.Image, Optional[str], bool]],
    no_inner_border: bool = False,
    vertical: bool = False,
    background: Optional[tuple[int, int, int]] = None,
) -> Image.Image:
    """Compose 1+ panels with arrows between them.
    `vertical=True` stacks them top-to-bottom with downward arrows.
    `background` overrides the default canvas color."""
    bg = background if background is not None else DEFAULT_BG
    if not items:
        raise ValueError("compose_panels requires at least one panel")
    if vertical:
        return _compose_panels_vertical(items, no_inner_border, bg)

    gutter = 32
    margin = 40
    title_gap = 12
    arrow_width = 90
    base_panel_pad = 24
    title_font = load_font(24)

    pads = [0 if (no_inner_border and is_img) else base_panel_pad for (_, _, is_img) in items]

    dp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    title_h = max(
        (dp.textbbox((0, 0), t, font=title_font)[3] if t else 0)
        for (_, t, _) in items
    )
    top_pad = margin + (title_h + title_gap if title_h else 0)
    bottom_pad = margin

    panel_widths = [img.width + 2 * pad for (img, _, _), pad in zip(items, pads)]
    panel_heights = [img.height + 2 * pad for (img, _, _), pad in zip(items, pads)]
    max_panel_h = max(panel_heights)

    n = len(items)
    arrow_span = (n - 1) * (gutter + arrow_width + gutter)
    total_w = margin * 2 + sum(panel_widths) + arrow_span
    total_h = top_pad + max_panel_h + bottom_pad

    canvas = Image.new("RGBA", (total_w, total_h), bg + (255,))
    draw = ImageDraw.Draw(canvas)

    x = margin
    for i, ((img, title, is_image), pad, pw, ph) in enumerate(zip(items, pads, panel_widths, panel_heights)):
        panel_x = x
        panel_y = top_pad
        draw_bg = not (no_inner_border and is_image)
        if draw_bg:
            draw.rounded_rectangle(
                [panel_x, panel_y, panel_x + pw, panel_y + ph],
                radius=PANEL_RADIUS,
                fill=PANEL_BG + (255,),
            )
        if title:
            draw.text((panel_x + pad, margin), title, font=title_font, fill=TEXT)
        code_x = panel_x + pad
        code_y = panel_y + pad
        img_to_paste = img.convert("RGBA")
        if no_inner_border and is_image:
            img_to_paste = apply_rounded_corners(img_to_paste, PANEL_RADIUS)
        canvas.alpha_composite(img_to_paste, (code_x, code_y))

        x += pw
        if i < n - 1:
            ax1 = x + gutter
            ax2 = x + gutter + arrow_width
            shaft_y = top_pad + max_panel_h // 2
            draw.line([(ax1, shaft_y), (ax2, shaft_y)], fill=ARROW + (255,), width=6)
            head = 16
            draw.polygon([
                (ax2 - head, shaft_y - head),
                (ax2, shaft_y),
                (ax2 - head, shaft_y + head),
            ], fill=ARROW + (255,))
            x += gutter + arrow_width + gutter

    return canvas


def _compose_panels_vertical(
    items: list[tuple[Image.Image, Optional[str], bool]],
    no_inner_border: bool,
    bg: tuple[int, int, int],
) -> Image.Image:
    margin = 40
    gutter = 16
    title_gap = 10
    arrow_height = 56
    base_panel_pad = 24
    title_font = load_font(24)

    pads = [0 if (no_inner_border and is_img) else base_panel_pad for (_, _, is_img) in items]
    panel_widths = [img.width + 2 * pad for (img, _, _), pad in zip(items, pads)]
    panel_heights = [img.height + 2 * pad for (img, _, _), pad in zip(items, pads)]
    max_panel_w = max(panel_widths)

    dp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    title_heights = [
        (dp.textbbox((0, 0), t, font=title_font)[3] + title_gap if t else 0)
        for (_, t, _) in items
    ]

    n = len(items)
    arrow_block = gutter + arrow_height + gutter
    total_h = margin + sum(title_heights) + sum(panel_heights) + (n - 1) * arrow_block + margin
    total_w = margin * 2 + max_panel_w

    canvas = Image.new("RGBA", (total_w, total_h), bg + (255,))
    draw = ImageDraw.Draw(canvas)

    y = margin
    for i, ((img, title, is_image), pad, ph, th) in enumerate(
        zip(items, pads, panel_heights, title_heights)
    ):
        if title:
            draw.text((margin, y), title, font=title_font, fill=TEXT)
            y += th
        draw_bg = not (no_inner_border and is_image)
        if draw_bg:
            draw.rounded_rectangle(
                [margin, y, margin + max_panel_w, y + ph],
                radius=PANEL_RADIUS,
                fill=PANEL_BG + (255,),
            )
        img_to_paste = img.convert("RGBA")
        if no_inner_border and is_image:
            img_to_paste = apply_rounded_corners(img_to_paste, PANEL_RADIUS)
        canvas.alpha_composite(img_to_paste, (margin + pad, y + pad))
        y += ph
        if i < n - 1:
            y += gutter
            shaft_x = margin + max_panel_w // 2
            arrow_y1 = y
            arrow_y2 = y + arrow_height
            draw.line([(shaft_x, arrow_y1), (shaft_x, arrow_y2)], fill=ARROW + (255,), width=6)
            head = 16
            draw.polygon([
                (shaft_x - head, arrow_y2 - head),
                (shaft_x, arrow_y2),
                (shaft_x + head, arrow_y2 - head),
            ], fill=ARROW + (255,))
            y += arrow_height + gutter

    return canvas


def compose_side_by_side(
    left_img: Image.Image,
    right_img: Image.Image,
    left_title: Optional[str],
    right_title: Optional[str],
    left_is_image: bool = False,
    right_is_image: bool = False,
    no_inner_border: bool = False,
) -> Image.Image:
    gutter = 32
    margin = 40
    title_gap = 12
    title_font = load_font(24)

    draw_probe = Image.new("RGB", (10, 10))
    dp = ImageDraw.Draw(draw_probe)
    left_title_h = dp.textbbox((0, 0), left_title or "", font=title_font)[3] if left_title else 0
    right_title_h = dp.textbbox((0, 0), right_title or "", font=title_font)[3] if right_title else 0
    title_h = max(left_title_h, right_title_h)

    base_panel_pad = 24
    left_panel_pad = 0 if (no_inner_border and left_is_image) else base_panel_pad
    right_panel_pad = 0 if (no_inner_border and right_is_image) else base_panel_pad
    top_pad = margin + (title_h + title_gap if title_h else 0)
    bottom_pad = margin

    left_inner_h = left_img.height + left_panel_pad * 2
    right_inner_h = right_img.height + right_panel_pad * 2
    max_panel_h = max(left_inner_h, right_inner_h)
    total_h = top_pad + max_panel_h + bottom_pad
    arrow_width = 90

    total_w = (
        margin
        + left_img.width + left_panel_pad * 2
        + gutter + arrow_width + gutter
        + right_img.width + right_panel_pad * 2
        + margin
    )

    canvas = Image.new("RGBA", (total_w, total_h), DEFAULT_BG + (255,))
    draw = ImageDraw.Draw(canvas)

    if left_title:
        draw.text((margin + left_panel_pad, margin), left_title, font=title_font, fill=TEXT)
    if right_title:
        right_title_x = margin + left_img.width + left_panel_pad * 2 + gutter + arrow_width + gutter + right_panel_pad
        draw.text((right_title_x, margin), right_title, font=title_font, fill=TEXT)

    left_panel_x = margin
    left_panel_y = top_pad
    left_panel_w = left_img.width + left_panel_pad * 2
    left_panel_h = left_inner_h

    right_panel_x = margin + left_panel_w + gutter + arrow_width + gutter
    right_panel_y = top_pad
    right_panel_w = right_img.width + right_panel_pad * 2
    right_panel_h = right_inner_h

    draw_left_bg = not (no_inner_border and left_is_image)
    draw_right_bg = not (no_inner_border and right_is_image)
    if draw_left_bg:
        draw.rounded_rectangle(
            [left_panel_x, left_panel_y, left_panel_x + left_panel_w, left_panel_y + left_panel_h],
            radius=PANEL_RADIUS, fill=PANEL_BG + (255,),
        )
    if draw_right_bg:
        draw.rounded_rectangle(
            [right_panel_x, right_panel_y, right_panel_x + right_panel_w, right_panel_y + right_panel_h],
            radius=PANEL_RADIUS, fill=PANEL_BG + (255,),
        )

    left_code_x = left_panel_x + left_panel_pad
    left_code_y = left_panel_y + left_panel_pad
    canvas.alpha_composite(left_img, (left_code_x, left_code_y))

    right_code_x = right_panel_x + right_panel_pad
    right_code_y = right_panel_y + right_panel_pad
    canvas.alpha_composite(right_img, (right_code_x, right_code_y))

    arrow_center_y = top_pad + max_panel_h // 2
    arrow_x1 = left_panel_x + left_panel_w + gutter
    arrow_x2 = right_panel_x - gutter
    shaft_y = arrow_center_y
    draw.line([(arrow_x1, shaft_y), (arrow_x2, shaft_y)], fill=ARROW + (255,), width=6)
    head_size = 16
    draw.polygon([
        (arrow_x2 - head_size, shaft_y - head_size),
        (arrow_x2, shaft_y),
        (arrow_x2 - head_size, shaft_y + head_size),
    ], fill=ARROW + (255,))

    return canvas


def compute_layout(
    left_img: Image.Image,
    right_img: Image.Image,
    left_title: Optional[str],
    right_title: Optional[str],
    left_is_image: bool,
    right_is_image: bool,
    no_inner_border: bool,
):
    gutter = 32
    margin = 40
    title_gap = 12
    title_font = load_font(24)

    draw_probe = Image.new("RGB", (10, 10))
    dp = ImageDraw.Draw(draw_probe)
    left_title_h = dp.textbbox((0, 0), left_title or "", font=title_font)[3] if left_title else 0
    right_title_h = dp.textbbox((0, 0), right_title or "", font=title_font)[3] if right_title else 0
    title_h = max(left_title_h, right_title_h)

    base_panel_pad = 24
    left_panel_pad = 0 if (no_inner_border and left_is_image) else base_panel_pad
    right_panel_pad = 0 if (no_inner_border and right_is_image) else base_panel_pad
    top_pad = margin + (title_h + title_gap if title_h else 0)
    bottom_pad = margin

    left_inner_h = left_img.height + left_panel_pad * 2
    right_inner_h = right_img.height + right_panel_pad * 2
    panel_h = max(left_inner_h, right_inner_h)
    total_h = top_pad + panel_h + bottom_pad
    arrow_width = 90

    total_w = (
        margin
        + left_img.width + left_panel_pad * 2
        + gutter + arrow_width + gutter
        + right_img.width + right_panel_pad * 2
        + margin
    )

    left_panel_x = margin
    left_panel_y = top_pad
    left_panel_w = left_img.width + left_panel_pad * 2
    left_panel_h = panel_h

    right_panel_x = margin + left_panel_w + gutter + arrow_width + gutter
    right_panel_y = top_pad
    right_panel_w = right_img.width + right_panel_pad * 2
    right_panel_h = panel_h

    left_title_xy = (margin + left_panel_pad, margin)
    right_title_x = margin + left_img.width + left_panel_pad * 2 + gutter + arrow_width + gutter + right_panel_pad
    right_title_xy = (right_title_x, margin)

    return {
        "total_size": (total_w, total_h),
        "left_panel": (left_panel_x, left_panel_y, left_panel_w, left_panel_h, left_panel_pad),
        "right_panel": (right_panel_x, right_panel_y, right_panel_w, right_panel_h, right_panel_pad),
        "left_title_xy": left_title_xy,
        "right_title_xy": right_title_xy,
    }
