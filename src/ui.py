from dataclasses import dataclass
from typing import Optional

from PIL import Image

try:
    from PIL import ImageTk
except (ImportError, RuntimeError):
    ImageTk = None

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
except (ImportError, RuntimeError):
    tk = None

from .compose import compose_side_by_side
from .highlight import render_code_image
from .io_utils import (
    expand_path,
    get_frames_and_durations,
    open_image,
    save_image,
    scale_frames_consistently,
    scale_image_to_max,
)


def _generate_static(args) -> None:
    if args.left_image:
        left_base = open_image(args.left_image)
        left_frames, _, _ = get_frames_and_durations(left_base)
        left_frames = scale_frames_consistently(left_frames, args.max_left_width, args.max_panel_height)
        left_img = left_frames[0]
    else:
        left_img = render_code_image(args.left or "", args.left_lang, args.left_file)
        left_img = scale_image_to_max(left_img, args.max_left_width, args.max_panel_height)

    if args.right_image:
        right_base = open_image(args.right_image)
        right_frames, _, _ = get_frames_and_durations(right_base)
        right_frames = scale_frames_consistently(right_frames, args.max_right_width, args.max_panel_height)
        right_img = right_frames[0]
    else:
        right_img = render_code_image(args.right or "", args.right_lang, args.right_file)
        right_img = scale_image_to_max(right_img, args.max_right_width, args.max_panel_height)

    final = compose_side_by_side(
        left_img, right_img, args.left_title, args.right_title,
        left_is_image=bool(args.left_image), right_is_image=bool(args.right_image),
        no_inner_border=args.no_border,
    )
    save_image(final, expand_path(args.out), webp_quality=args.webp_quality, webp_method=args.webp_method)


def launch_ui() -> None:
    if tk is None:
        print("UI dependencies not available. Tkinter is required.")
        return

    root = tk.Tk()
    root.title("Codeimg")

    left_image_path = tk.StringVar()
    right_image_path = tk.StringVar()
    left_title = tk.StringVar(value="Request")
    right_title = tk.StringVar(value="Response")
    out_path = tk.StringVar(value="codeimg.png")
    no_border = tk.BooleanVar(value=False)
    sequential = tk.BooleanVar(value=False)
    webp_quality = tk.IntVar(value=90)
    webp_method = tk.IntVar(value=4)

    def choose_out():
        path = filedialog.asksaveasfilename(title="Save as", defaultextension=".png", filetypes=[
            ("PNG", ".png"), ("WebP", ".webp"), ("GIF", ".gif"), ("All", ".*"),
        ])
        if path:
            out_path.set(path)

    frm = ttk.Frame(root, padding=10)
    frm.grid(row=0, column=0, sticky="nsew")
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)

    bar = ttk.Frame(frm)
    bar.grid(row=0, column=0, columnspan=3, sticky="ew")
    ttk.Button(bar, text="Save As...", command=choose_out).pack(side="left")
    ttk.Checkbutton(bar, text="No inner border for images", variable=no_border).pack(side="left", padx=8)
    ttk.Checkbutton(bar, text="Sequential", variable=sequential).pack(side="left", padx=8)
    ttk.Label(bar, text="WebP q").pack(side="left")
    ttk.Scale(bar, from_=0, to=100, orient="horizontal", variable=webp_quality, length=120).pack(side="left")
    ttk.Label(bar, text="m").pack(side="left")
    ttk.Scale(bar, from_=0, to=6, orient="horizontal", variable=webp_method, length=80).pack(side="left")
    ttk.Button(bar, text="Generate", command=lambda: do_generate()).pack(side="right")

    preview_lbl = ttk.Label(frm)
    preview_lbl.grid(row=1, column=0, columnspan=3, sticky="nsew")
    frm.rowconfigure(1, weight=1)

    left_txt = tk.Text(frm, height=6, width=50)
    right_txt = tk.Text(frm, height=6, width=50)

    _preview_img_ref = {"img": None}

    def current_args():
        @dataclass
        class UIArgs:
            left: Optional[str]
            right: Optional[str]
            left_lang: Optional[str]
            right_lang: Optional[str]
            left_file: Optional[str]
            right_file: Optional[str]
            left_image: Optional[str]
            right_image: Optional[str]
            left_title: str
            right_title: str
            out: str
            sequential: bool
            max_left_width: int
            max_right_width: int
            max_panel_height: int
            webp_quality: int
            webp_method: int
            no_border: bool

        return UIArgs(
            left=left_txt.get("1.0", tk.END).rstrip("\n") if not left_image_path.get() else None,
            right=right_txt.get("1.0", tk.END).rstrip("\n") if not right_image_path.get() else None,
            left_lang=None, right_lang=None, left_file=None, right_file=None,
            left_image=left_image_path.get() or None,
            right_image=right_image_path.get() or None,
            left_title=left_title.get(), right_title=right_title.get(),
            out=out_path.get(),
            sequential=sequential.get(),
            max_left_width=1200, max_right_width=1200, max_panel_height=900,
            webp_quality=int(webp_quality.get()),
            webp_method=int(webp_method.get()),
            no_border=no_border.get(),
        )

    def render_preview_img(args_obj) -> Image.Image:
        if args_obj.left_image:
            left_base = open_image(args_obj.left_image)
            left_frames, _, _ = get_frames_and_durations(left_base)
            left_frames = scale_frames_consistently(left_frames, args_obj.max_left_width, args_obj.max_panel_height)
            left_img_use = left_frames[0]
        else:
            left_img_use = render_code_image(args_obj.left or "", args_obj.left_lang, args_obj.left_file)
            left_img_use = scale_image_to_max(left_img_use, args_obj.max_left_width, args_obj.max_panel_height)

        if args_obj.right_image:
            right_base = open_image(args_obj.right_image)
            right_frames, _, _ = get_frames_and_durations(right_base)
            right_frames = scale_frames_consistently(right_frames, args_obj.max_right_width, args_obj.max_panel_height)
            right_img_use = right_frames[0]
        else:
            right_img_use = render_code_image(args_obj.right or "", args_obj.right_lang, args_obj.right_file)
            right_img_use = scale_image_to_max(right_img_use, args_obj.max_right_width, args_obj.max_panel_height)

        return compose_side_by_side(
            left_img_use, right_img_use, args_obj.left_title, args_obj.right_title,
            left_is_image=bool(args_obj.left_image), right_is_image=bool(args_obj.right_image),
            no_inner_border=args_obj.no_border,
        )

    def update_preview(*_):
        if ImageTk is None:
            return
        try:
            img = render_preview_img(current_args())
            img_disp = scale_image_to_max(img, 1200, 700)
            tk_img = ImageTk.PhotoImage(img_disp)
            _preview_img_ref["img"] = tk_img
            preview_lbl.configure(image=tk_img)
        except (OSError, ValueError, RuntimeError):
            pass

    def do_generate():
        a = current_args()
        try:
            _generate_static(a)
            messagebox.showinfo("Codeimg", f"Saved {expand_path(a.out)}")
        except (OSError, ValueError, RuntimeError) as e:
            messagebox.showerror("Codeimg", str(e))

    ttk.Button(frm, text="Generate", command=do_generate).grid(row=11, column=0, pady=8)
    ttk.Button(frm, text="Close", command=root.destroy).grid(row=11, column=2, pady=8, sticky="e")

    left_title.trace_add("write", lambda *_: update_preview())
    right_title.trace_add("write", lambda *_: update_preview())
    left_image_path.trace_add("write", lambda *_: update_preview())
    right_image_path.trace_add("write", lambda *_: update_preview())
    no_border.trace_add("write", lambda *_: update_preview())
    for widget in (left_txt, right_txt):
        widget.bind("<KeyRelease>", update_preview)

    update_preview()
    root.mainloop()
