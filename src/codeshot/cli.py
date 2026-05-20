import argparse
import os
import time

from PIL import Image, UnidentifiedImageError
from PIL import features as PIL_FEATURES

from .colors import DEFAULT_BG
from .compose import compose_panels, compose_side_by_side
from .highlight import render_code_image
from .interactive import interactive_compose
from .io_utils import (
    copy_to_clipboard,
    expand_path,
    get_frames_and_durations,
    open_image,
    print_progress,
    save_animated_gif,
    save_animated_webp,
    save_image,
    scale_frames_consistently,
    scale_image_to_max,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a side-by-side image: code → code, image → image, or mix")
    parser.add_argument("--left", help="Left code block string. If omitted and no --left-image, you'll be prompted.")
    parser.add_argument("--right", help="Right code block string. If omitted and no --right-image, you'll be prompted.")
    parser.add_argument("--left-lang", help="Hint language for left code (e.g., python, http, json)")
    parser.add_argument("--right-lang", help="Hint language for right code")
    parser.add_argument("--left-file", help="Filename hint for left code (for lexer guess)")
    parser.add_argument("--right-file", help="Filename hint for right code")
    parser.add_argument("--left-image", help="Path to an image file for the left panel")
    parser.add_argument("--right-image", help="Path to an image file for the right panel")
    parser.add_argument("--no-border", action="store_true", help="Remove inner card borders when a side is an image")
    parser.add_argument("--left-title", help="Optional title above the left panel", default="Request")
    parser.add_argument("--right-title", help="Optional title above the right panel", default="Response")
    parser.add_argument("--out", help="Output image path (.png, .webp, or .gif)", default="codeshot.png")
    parser.add_argument("--sequential", action="store_true", help="Animate left frames first (right frozen), then right frames (left frozen)")
    parser.add_argument("--max-left-width", type=int, default=1200, help="Max width for left panel content (per frame)")
    parser.add_argument("--max-right-width", type=int, default=1200, help="Max width for right panel content (per frame)")
    parser.add_argument("--max-panel-height", type=int, default=1200, help="Max height for each panel content (per frame)")
    parser.add_argument("--webp-quality", type=int, default=90, help="Animated/static WebP quality (0-100)")
    parser.add_argument("--webp-method", type=int, default=4, help="Animated/static WebP method (0=fast..6=best)")
    parser.add_argument("--ui", action="store_true", help="Launch a simple UI for interactive use")

    args = parser.parse_args()

    if args.ui:
        from .ui import launch_ui
        launch_ui()
        return

    has_any_input = any([args.left, args.right, args.left_image, args.right_image])
    if not has_any_input:
        interactive_compose(args)
        return

    if args.left_image:
        try:
            left_base = open_image(args.left_image)
        except (FileNotFoundError, UnidentifiedImageError, OSError) as e:
            raise SystemExit(f"Failed to open --left-image '{args.left_image}': {e}") from e
        left_frames, left_durations, left_anim = get_frames_and_durations(left_base)
        left_frames = scale_frames_consistently(left_frames, args.max_left_width, args.max_panel_height)
    else:
        left_code = args.left or ""
        left_img_static = render_code_image(left_code, args.left_lang, args.left_file)
        left_img_static = scale_image_to_max(left_img_static, args.max_left_width, args.max_panel_height)
        left_frames, left_durations, left_anim = [left_img_static], [100], False

    if args.right_image:
        try:
            right_base = open_image(args.right_image)
        except (FileNotFoundError, UnidentifiedImageError, OSError) as e:
            raise SystemExit(f"Failed to open --right-image '{args.right_image}': {e}") from e
        right_frames, right_durations, right_anim = get_frames_and_durations(right_base)
        right_frames = scale_frames_consistently(right_frames, args.max_right_width, args.max_panel_height)
    elif args.right is not None:
        right_img_static = render_code_image(args.right, args.right_lang, args.right_file)
        right_img_static = scale_image_to_max(right_img_static, args.max_right_width, args.max_panel_height)
        right_frames, right_durations, right_anim = [right_img_static], [100], False
    else:
        items = [(left_frames[0], args.left_title, bool(args.left_image))]
        final_img = compose_panels(items, no_inner_border=args.no_border)
        out_path = expand_path(args.out)
        save_image(final_img, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
        copy_to_clipboard(final_img)
        print(f"Saved {out_path} and copied to clipboard.")
        return

    is_animated_output = left_anim or right_anim

    if not is_animated_output:
        final_img = compose_side_by_side(
            left_frames[0], right_frames[0],
            args.left_title, args.right_title,
            left_is_image=bool(args.left_image), right_is_image=bool(args.right_image),
            no_inner_border=args.no_border,
        )
        out_path = expand_path(args.out)
        save_image(final_img, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
        copy_to_clipboard(final_img)
        print(f"Saved {out_path} and copied to clipboard.")
        return

    composed_frames: list[Image.Image] = []
    composed_durations: list[int] = []
    if args.sequential:
        right_freeze = right_frames[0]
        for i in range(len(left_frames)):
            print_progress(i + 1, len(left_frames), "Composing (left segment)")
            frame = compose_side_by_side(
                left_frames[i], right_freeze, args.left_title, args.right_title,
                left_is_image=bool(args.left_image), right_is_image=bool(args.right_image),
                no_inner_border=args.no_border,
            )
            composed_frames.append(frame)
            composed_durations.append(left_durations[i] if i < len(left_durations) else 100)
        left_freeze = left_frames[-1]
        for i in range(len(right_frames)):
            print_progress(i + 1, len(right_frames), "Composing (right segment)")
            frame = compose_side_by_side(
                left_freeze, right_frames[i], args.left_title, args.right_title,
                left_is_image=bool(args.left_image), right_is_image=bool(args.right_image),
                no_inner_border=args.no_border,
            )
            composed_frames.append(frame)
            composed_durations.append(right_durations[i] if i < len(right_durations) else 100)
    else:
        total_frames = max(len(left_frames), len(right_frames))
        for i in range(total_frames):
            print_progress(i + 1, total_frames, "Composing")
            frame = compose_side_by_side(
                left_frames[i % len(left_frames)],
                right_frames[i % len(right_frames)],
                args.left_title, args.right_title,
                left_is_image=bool(args.left_image), right_is_image=bool(args.right_image),
                no_inner_border=args.no_border,
            )
            composed_frames.append(frame)
            ld = left_durations[i % len(left_durations)] if left_durations else 100
            rd = right_durations[i % len(right_durations)] if right_durations else 100
            composed_durations.append(min(ld, rd))

    first_size = composed_frames[0].size
    normalized_frames: list[Image.Image] = []
    for f in composed_frames:
        if f.size == first_size:
            normalized_frames.append(f)
        else:
            canvas = Image.new("RGBA", first_size, DEFAULT_BG + (255,))
            canvas.alpha_composite(f, (0, 0))
            normalized_frames.append(canvas)

    out_path_req = expand_path(args.out)
    root, ext = os.path.splitext(out_path_req)
    ext_lower = ext.lower()
    if ext_lower in (".gif", ".webp"):
        out_path = out_path_req
    else:
        out_path = root + ".webp"

    if out_path.lower().endswith(".gif"):
        print("Saving GIF... This may take a while for large outputs.")
        save_animated_gif(normalized_frames, composed_durations, out_path)
        print("".ljust(100), end="\r")
        print(f"Saved animated GIF {out_path}.")
    else:
        webp_ok = bool(PIL_FEATURES.check("webp"))
        webp_anim_ok = bool(PIL_FEATURES.check("webp_anim"))
        if not webp_ok or not webp_anim_ok:
            fallback = os.path.splitext(out_path)[0] + ".gif"
            print("Animated WebP not supported by your Pillow/decoder; falling back to GIF...")
            print("Saving GIF... This may take a while for large outputs.")
            save_animated_gif(normalized_frames, composed_durations, fallback)
            print("".ljust(100), end="\r")
            print(f"Saved animated GIF {fallback}.")
        else:
            print("Saving WebP... This may take a while for large outputs.")
            t0 = time.time()
            save_animated_webp(normalized_frames, composed_durations, out_path, webp_quality=args.webp_quality, webp_method=args.webp_method)
            elapsed = int(time.time() - t0)
            print("".ljust(100), end="\r")
            print(f"Saved animated WebP {out_path} in {elapsed}s.")


if __name__ == "__main__":
    main()
