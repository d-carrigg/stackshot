"""Desktop UI for codeimg.

Layout: a row of panel editor cards above a large live preview, with a
toolbar that controls layout/colors/scale/output. Each panel card has a
title, a code text area, and (optionally) an image — drag a file onto
the card to convert it to an image panel, or click Browse. Saves via
Save As and also copies to clipboard.

Tkinter-only. Drag-and-drop uses tkinterdnd2 when installed; without
it, the Browse button still works on every platform.
"""

from dataclasses import dataclass
from typing import Callable, Optional

from PIL import Image

try:
    from PIL import ImageTk
except (ImportError, RuntimeError):
    ImageTk = None

try:
    import tkinter as tk
    from tkinter import colorchooser, filedialog, messagebox, ttk
except (ImportError, RuntimeError):
    tk = None
    ttk = None

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    _DND_OK = True
except ImportError:
    _DND_OK = False
    TkinterDnD = None
    DND_FILES = None

from .colors import ARROW, DEFAULT_BG, PANEL_BG, SUBTLE, TEXT
from .compose import compose_panels
from .highlight import render_code_image
from .io_utils import (
    copy_to_clipboard,
    expand_path,
    fit_image,
    open_image,
    save_image,
    scale_image_to_max,
)


# UI palette mirrors the output palette so the editor and rendered image
# read as one product. Hex strings because tk accepts those everywhere.
UI_BG = "#%02x%02x%02x" % DEFAULT_BG
UI_PANEL = "#%02x%02x%02x" % PANEL_BG
UI_PANEL_ALT = "#3b3d54"
UI_TEXT = "#%02x%02x%02x" % TEXT
UI_SUBTLE = "#%02x%02x%02x" % SUBTLE
UI_BORDER = "#45475a"
UI_ACCENT = "#89b4fa"

PREVIEW_MAX_W = 1400
PREVIEW_MAX_H = 480
PANEL_THUMB_W = 360
PANEL_THUMB_H = 160
PREVIEW_DEBOUNCE_MS = 200


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % rgb


def _parse_dnd_paths(data: str) -> list[str]:
    """tkdnd encodes a drop as a space-separated list, braces around any
    path that contains spaces. Parse that into a Python list."""
    paths: list[str] = []
    s = data.strip()
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "{":
            j = s.find("}", i + 1)
            if j == -1:
                break
            paths.append(s[i + 1:j])
            i = j + 1
        elif ch.isspace():
            i += 1
        else:
            j = i
            while j < len(s) and not s[j].isspace():
                j += 1
            paths.append(s[i:j])
            i = j
    return paths


@dataclass
class PanelSnapshot:
    title: str
    code: str
    image_path: Optional[str]


class PanelEditor:
    """One panel's worth of UI: title entry, code/text area, optional
    image thumbnail, browse/clear/remove buttons. Notifies the App via
    `on_change` when any field changes so the preview can refresh."""

    def __init__(
        self,
        parent: "tk.Misc",
        index: int,
        on_change: Callable[[], None],
        on_remove: Callable[["PanelEditor"], None],
        initial_title: str = "",
        initial_code: str = "",
    ) -> None:
        self.index = index
        self.on_change = on_change
        self.on_remove_cb = on_remove
        self.image_path: Optional[str] = None
        self._thumb_ref = None
        self._modified_pending = False

        self.frame = ttk.Frame(parent, style="Card.TFrame", padding=10)

        header = ttk.Frame(self.frame, style="Card.TFrame")
        header.pack(fill="x")
        self.index_label = ttk.Label(header, text=f"#{index + 1}", style="CardIndex.TLabel", width=3)
        self.index_label.pack(side="left")
        self.title_var = tk.StringVar(value=initial_title or f"Panel {index + 1}")
        title_entry = ttk.Entry(header, textvariable=self.title_var, style="Card.TEntry")
        title_entry.pack(side="left", fill="x", expand=True, padx=(6, 6))
        self.remove_btn = ttk.Button(header, text="✕", width=2, style="Ghost.TButton", command=self._remove)
        self.remove_btn.pack(side="right")

        body = ttk.Frame(self.frame, style="Card.TFrame")
        body.pack(fill="both", expand=True, pady=(8, 6))
        self._body = body

        self.text = tk.Text(
            body, height=8, wrap="none",
            bg=UI_BG, fg=UI_TEXT, insertbackground=UI_TEXT,
            relief="flat", borderwidth=0, highlightthickness=1,
            highlightbackground=UI_BORDER, highlightcolor=UI_ACCENT,
            padx=8, pady=6, font=("TkFixedFont", 10),
            undo=True,
        )
        if initial_code:
            self.text.insert("1.0", initial_code)
        self.text.pack(fill="both", expand=True)

        self.thumb_label = ttk.Label(body, style="Thumb.TLabel", anchor="center")
        # not packed initially — appears when image is set

        footer = ttk.Frame(self.frame, style="Card.TFrame")
        footer.pack(fill="x")
        ttk.Button(footer, text="Browse…", style="Ghost.TButton", command=self._browse).pack(side="left")
        self.clear_btn = ttk.Button(
            footer, text="Clear image", style="Ghost.TButton",
            command=self._clear_image, state="disabled",
        )
        self.clear_btn.pack(side="left", padx=(6, 0))
        hint_text = "or drop" if _DND_OK else ""
        if hint_text:
            self.hint_label = ttk.Label(footer, text=hint_text, style="Hint.TLabel")
            self.hint_label.pack(side="right")

        if _DND_OK:
            for w in (self.frame, body, self.text):
                try:
                    w.drop_target_register(DND_FILES)
                    w.dnd_bind("<<Drop>>", self._on_drop)
                except (AttributeError, tk.TclError):
                    pass

        self.title_var.trace_add("write", lambda *_: self.on_change())
        self.text.bind("<<Modified>>", self._on_text_modified)

    def _on_text_modified(self, _evt) -> None:
        self.text.edit_modified(False)
        self.on_change()

    def _browse(self) -> None:
        path = filedialog.askopenfilename(
            title="Select image",
            filetypes=[
                ("Images", ".png .jpg .jpeg .gif .webp .bmp"),
                ("All files", "*.*"),
            ],
        )
        if path:
            self.set_image(path)

    def _clear_image(self) -> None:
        self.image_path = None
        self._thumb_ref = None
        self.thumb_label.pack_forget()
        self.text.pack(fill="both", expand=True)
        self.clear_btn.configure(state="disabled")
        self.on_change()

    def set_image(self, path: str) -> None:
        try:
            img = open_image(path)
            img.load()
        except (OSError, FileNotFoundError) as e:
            messagebox.showerror("Codeimg", f"Could not open image:\n{e}")
            return
        self.image_path = path
        if ImageTk is not None:
            thumb = img.copy()
            thumb.thumbnail((PANEL_THUMB_W, PANEL_THUMB_H))
            self._thumb_ref = ImageTk.PhotoImage(thumb)
            self.thumb_label.configure(image=self._thumb_ref, text="")
        else:
            self.thumb_label.configure(text=path)
        self.text.pack_forget()
        self.thumb_label.pack(fill="both", expand=True)
        self.clear_btn.configure(state="normal")
        self.on_change()

    def _on_drop(self, event) -> str:
        paths = _parse_dnd_paths(event.data or "")
        if paths:
            self.set_image(paths[0])
        return "break"

    def _remove(self) -> None:
        self.on_remove_cb(self)

    def set_index(self, index: int) -> None:
        self.index = index
        self.index_label.configure(text=f"#{index + 1}")

    def snapshot(self) -> PanelSnapshot:
        code = self.text.get("1.0", "end").rstrip("\n")
        return PanelSnapshot(title=self.title_var.get(), code=code, image_path=self.image_path)

    def destroy(self) -> None:
        self.frame.destroy()


class ColorSwatch:
    """Small clickable button that shows the current color and opens a
    color picker on click. Used for background + arrow color."""

    def __init__(self, parent: "tk.Misc", initial: tuple[int, int, int], on_change: Callable[[tuple[int, int, int]], None]) -> None:
        self.rgb = initial
        self.on_change = on_change
        self.btn = tk.Button(
            parent, text="", width=3, relief="flat",
            bg=_rgb_to_hex(initial), activebackground=_rgb_to_hex(initial),
            highlightthickness=1, highlightbackground=UI_BORDER, bd=0,
            command=self._pick, cursor="hand2",
        )

    def pack(self, **kw) -> None:
        self.btn.pack(**kw)

    def set(self, rgb: tuple[int, int, int]) -> None:
        self.rgb = rgb
        hexcolor = _rgb_to_hex(rgb)
        self.btn.configure(bg=hexcolor, activebackground=hexcolor)

    def _pick(self) -> None:
        result = colorchooser.askcolor(color=_rgb_to_hex(self.rgb), title="Pick color")
        if result and result[0]:
            r, g, b = (int(v) for v in result[0])
            self.set((r, g, b))
            self.on_change((r, g, b))


class App:
    def __init__(self, root: "tk.Misc") -> None:
        self.root = root
        root.title("codeimg")
        root.configure(bg=UI_BG)
        root.geometry("1280x880")
        root.minsize(900, 640)

        self._apply_theme()

        self.panels: list[PanelEditor] = []
        self.layout_var = tk.StringVar(value="horizontal")
        self.no_border_var = tk.BooleanVar(value=True)
        self.bg_rgb: tuple[int, int, int] = DEFAULT_BG
        self.arrow_rgb: tuple[int, int, int] = ARROW
        self.scale_var = tk.StringVar(value="2.0")
        self.out_path = "codeimg.png"
        self._preview_ref = None
        self._preview_after = None
        self._panels_container: Optional[ttk.Frame] = None

        self._build_layout()
        # Seed with two panels matching the CLI's classic "Request → Response" demo.
        self.add_panel(title="Request", code="def request(payload):\n    return api.send(payload)")
        self.add_panel(title="Response", code='{\n  "status": "ok",\n  "data": [1, 2, 3]\n}')
        self._schedule_preview()

    # ---- theme & layout ----
    def _apply_theme(self) -> None:
        style = ttk.Style(self.root)
        # 'clam' is the most customizable bundled theme — required to make
        # colors stick on Linux. Default themes ignore most overrides.
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure(".", background=UI_BG, foreground=UI_TEXT, font=("TkDefaultFont", 10))
        style.configure("TFrame", background=UI_BG)
        style.configure("TLabel", background=UI_BG, foreground=UI_TEXT)
        style.configure("Toolbar.TFrame", background=UI_BG)
        style.configure("Hint.TLabel", background=UI_PANEL, foreground=UI_SUBTLE, font=("TkDefaultFont", 9))
        style.configure("CardIndex.TLabel", background=UI_PANEL, foreground=UI_SUBTLE, font=("TkDefaultFont", 10, "bold"))
        style.configure("Section.TLabel", background=UI_BG, foreground=UI_SUBTLE, font=("TkDefaultFont", 9))

        style.configure("Card.TFrame", background=UI_PANEL, borderwidth=0, relief="flat")
        style.configure("Card.TLabel", background=UI_PANEL, foreground=UI_TEXT)
        style.configure("Thumb.TLabel", background=UI_BG, foreground=UI_SUBTLE,
                        borderwidth=1, relief="solid")

        # Buttons
        style.configure(
            "TButton",
            background=UI_PANEL, foreground=UI_TEXT,
            borderwidth=0, focusthickness=0, padding=(10, 6),
        )
        style.map(
            "TButton",
            background=[("active", UI_PANEL_ALT), ("pressed", UI_PANEL_ALT)],
            foreground=[("disabled", UI_SUBTLE)],
        )
        style.configure(
            "Primary.TButton",
            background=UI_ACCENT, foreground="#1e1e2e",
            borderwidth=0, padding=(14, 8), font=("TkDefaultFont", 10, "bold"),
        )
        style.map(
            "Primary.TButton",
            background=[("active", "#a5c4fb"), ("pressed", "#a5c4fb")],
            foreground=[("disabled", UI_SUBTLE)],
        )
        style.configure(
            "Ghost.TButton",
            background=UI_PANEL, foreground=UI_SUBTLE,
            borderwidth=0, padding=(8, 4),
        )
        style.map(
            "Ghost.TButton",
            background=[("active", UI_PANEL_ALT), ("pressed", UI_PANEL_ALT)],
            foreground=[("active", UI_TEXT), ("pressed", UI_TEXT), ("disabled", UI_BORDER)],
        )

        # Entry
        style.configure(
            "TEntry",
            fieldbackground=UI_BG, foreground=UI_TEXT,
            insertcolor=UI_TEXT, borderwidth=0, padding=6,
        )
        style.configure(
            "Card.TEntry",
            fieldbackground=UI_BG, foreground=UI_TEXT,
            insertcolor=UI_TEXT, borderwidth=0, padding=6,
        )
        style.map(
            "Card.TEntry",
            fieldbackground=[("focus", UI_BG)],
        )

        # Checkbutton / Radiobutton
        for name in ("TCheckbutton", "TRadiobutton"):
            style.configure(name, background=UI_BG, foreground=UI_TEXT, focuscolor=UI_BG)
            style.map(
                name,
                background=[("active", UI_BG)],
                foreground=[("disabled", UI_SUBTLE)],
            )

        # Combobox (used for scale picker)
        style.configure(
            "TCombobox",
            fieldbackground=UI_BG, background=UI_PANEL, foreground=UI_TEXT,
            arrowcolor=UI_TEXT, borderwidth=0, padding=4,
        )
        # 'readonly' state has its own colors that ignore the base configure;
        # set them explicitly so the picked scale doesn't render greyed-out.
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", UI_BG), ("disabled", UI_BG)],
            foreground=[("readonly", UI_TEXT), ("disabled", UI_SUBTLE)],
            selectbackground=[("readonly", UI_BG)],
            selectforeground=[("readonly", UI_TEXT)],
        )
        self.root.option_add("*TCombobox*Listbox.background", UI_PANEL)
        self.root.option_add("*TCombobox*Listbox.foreground", UI_TEXT)
        self.root.option_add("*TCombobox*Listbox.selectBackground", UI_ACCENT)
        self.root.option_add("*TCombobox*Listbox.selectForeground", UI_BG)

    def _build_layout(self) -> None:
        outer = ttk.Frame(self.root, padding=14)
        outer.pack(fill="both", expand=True)

        # Top toolbar
        toolbar = ttk.Frame(outer, style="Toolbar.TFrame")
        toolbar.pack(fill="x", pady=(0, 12))

        ttk.Label(toolbar, text="codeimg", font=("TkDefaultFont", 16, "bold")).pack(side="left")
        ttk.Label(toolbar, text=("drag-and-drop" if _DND_OK else "tkinterdnd2 not installed"),
                  style="Section.TLabel").pack(side="left", padx=(10, 0))

        ttk.Button(toolbar, text="Generate", style="Primary.TButton", command=self._generate).pack(side="right")
        ttk.Button(toolbar, text="Save As…", command=self._save_as).pack(side="right", padx=(0, 8))

        # Panel cards row
        cards_wrap = ttk.Frame(outer)
        cards_wrap.pack(fill="x")

        cards_header = ttk.Frame(cards_wrap)
        cards_header.pack(fill="x", pady=(0, 6))
        ttk.Label(cards_header, text="Panels", style="Section.TLabel").pack(side="left")
        ttk.Button(cards_header, text="+ Add panel", style="Ghost.TButton", command=lambda: self.add_panel()).pack(side="right")

        # Scrollable horizontal strip for panel cards.
        canvas = tk.Canvas(cards_wrap, bg=UI_BG, highlightthickness=0, height=320)
        canvas.pack(side="top", fill="x", expand=False)
        scrollbar = ttk.Scrollbar(cards_wrap, orient="horizontal", command=canvas.xview)
        scrollbar.pack(side="top", fill="x")
        canvas.configure(xscrollcommand=scrollbar.set)
        panels_frame = ttk.Frame(canvas)
        canvas.create_window((0, 0), window=panels_frame, anchor="nw")

        def _on_panels_configure(_evt):
            canvas.configure(scrollregion=canvas.bbox("all"))
            # Match canvas height to panels so we don't leave dead space.
            panels_frame.update_idletasks()
            h = panels_frame.winfo_reqheight()
            if h > 0:
                canvas.configure(height=h)
        panels_frame.bind("<Configure>", _on_panels_configure)
        self._panels_container = panels_frame

        # Controls row: layout, no-border, colors, scale
        controls = ttk.Frame(outer)
        controls.pack(fill="x", pady=(12, 8))

        ttk.Label(controls, text="Layout", style="Section.TLabel").pack(side="left")
        ttk.Radiobutton(controls, text="Horizontal", value="horizontal",
                        variable=self.layout_var, command=self._schedule_preview).pack(side="left", padx=(8, 0))
        ttk.Radiobutton(controls, text="Vertical", value="vertical",
                        variable=self.layout_var, command=self._schedule_preview).pack(side="left", padx=(6, 12))

        ttk.Checkbutton(controls, text="No inner border for images", variable=self.no_border_var,
                        command=self._schedule_preview).pack(side="left", padx=(6, 16))

        ttk.Label(controls, text="Background", style="Section.TLabel").pack(side="left")
        self.bg_swatch = ColorSwatch(controls, self.bg_rgb, self._on_bg_change)
        self.bg_swatch.pack(side="left", padx=(6, 14))

        ttk.Label(controls, text="Arrow", style="Section.TLabel").pack(side="left")
        self.arrow_swatch = ColorSwatch(controls, self.arrow_rgb, self._on_arrow_change)
        self.arrow_swatch.pack(side="left", padx=(6, 14))

        ttk.Label(controls, text="Scale", style="Section.TLabel").pack(side="left")
        scale_combo = ttk.Combobox(controls, textvariable=self.scale_var, width=5,
                                   values=("1.0", "1.5", "2.0", "2.5", "3.0"), state="readonly")
        scale_combo.pack(side="left", padx=(6, 0))
        scale_combo.bind("<<ComboboxSelected>>", lambda _e: self._schedule_preview())

        # Preview area
        preview_wrap = ttk.Frame(outer)
        preview_wrap.pack(fill="both", expand=True, pady=(10, 0))
        ttk.Label(preview_wrap, text="Preview", style="Section.TLabel").pack(anchor="w", pady=(0, 6))
        self.preview_label = ttk.Label(preview_wrap, anchor="center", background=UI_BG)
        self.preview_label.pack(fill="both", expand=True)

        self.status_var = tk.StringVar(value="Ready.")
        ttk.Label(outer, textvariable=self.status_var, style="Section.TLabel").pack(anchor="w", pady=(8, 0))

    # ---- panel management ----
    def add_panel(self, title: str = "", code: str = "") -> PanelEditor:
        assert self._panels_container is not None
        editor = PanelEditor(
            self._panels_container,
            index=len(self.panels),
            on_change=self._schedule_preview,
            on_remove=self._remove_panel,
            initial_title=title,
            initial_code=code,
        )
        editor.frame.configure(width=380)
        editor.frame.pack(side="left", padx=(0, 12), pady=2, anchor="n", ipadx=0)
        editor.frame.pack_propagate(False)
        editor.frame.configure(height=300)
        self.panels.append(editor)
        self._refresh_remove_buttons()
        self._schedule_preview()
        return editor

    def _remove_panel(self, editor: PanelEditor) -> None:
        if len(self.panels) <= 1:
            return
        editor.destroy()
        self.panels.remove(editor)
        for i, p in enumerate(self.panels):
            p.set_index(i)
        self._refresh_remove_buttons()
        self._schedule_preview()

    def _refresh_remove_buttons(self) -> None:
        # Hide the remove button when there's only one panel — you can't go below 1.
        only_one = len(self.panels) <= 1
        for p in self.panels:
            p.remove_btn.configure(state=("disabled" if only_one else "normal"))

    # ---- color callbacks ----
    def _on_bg_change(self, rgb: tuple[int, int, int]) -> None:
        self.bg_rgb = rgb
        self._schedule_preview()

    def _on_arrow_change(self, rgb: tuple[int, int, int]) -> None:
        self.arrow_rgb = rgb
        self._schedule_preview()

    # ---- preview ----
    def _schedule_preview(self) -> None:
        if self._preview_after is not None:
            try:
                self.root.after_cancel(self._preview_after)
            except (ValueError, tk.TclError):
                pass
        self._preview_after = self.root.after(PREVIEW_DEBOUNCE_MS, self._render_preview)

    def _render_preview(self) -> None:
        self._preview_after = None
        if ImageTk is None:
            self.status_var.set("Preview disabled: Pillow ImageTk not available.")
            return
        try:
            img = self._compose(scale=1.0)
            disp = scale_image_to_max(img, PREVIEW_MAX_W, PREVIEW_MAX_H)
            tk_img = ImageTk.PhotoImage(disp)
            self._preview_ref = tk_img
            self.preview_label.configure(image=tk_img)
            self.status_var.set(f"Preview {img.width}×{img.height}. Generate uses scale {self.scale_var.get()}.")
        except (OSError, ValueError, RuntimeError) as e:
            self.status_var.set(f"Preview error: {e}")

    def _compose(self, scale: float) -> Image.Image:
        items: list[tuple[Image.Image, Optional[str], bool]] = []
        max_w = 1200
        max_h = 1200
        for p in self.panels:
            snap = p.snapshot()
            if snap.image_path:
                img = open_image(snap.image_path).convert("RGBA")
                img = fit_image(img, max_w, max_h, scale, upscale=True)
                items.append((img, snap.title or None, True))
            else:
                img = render_code_image(snap.code, None, None, scale=scale)
                img = fit_image(img, max_w, max_h, scale)
                items.append((img, snap.title or None, False))

        return compose_panels(
            items,
            no_inner_border=self.no_border_var.get(),
            vertical=(self.layout_var.get() == "vertical"),
            background=self.bg_rgb,
            arrow_color=self.arrow_rgb,
            scale=scale,
        )

    # ---- output ----
    def _current_scale(self) -> float:
        try:
            v = float(self.scale_var.get())
        except (TypeError, ValueError):
            return 2.0
        return v if v > 0 else 2.0

    def _save_as(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Save image as",
            defaultextension=".png",
            initialfile=self.out_path,
            filetypes=[("PNG", ".png"), ("WebP", ".webp"), ("All", "*.*")],
        )
        if path:
            self.out_path = path
            self._generate()

    def _generate(self) -> None:
        try:
            img = self._compose(scale=self._current_scale())
            out = expand_path(self.out_path)
            save_image(img, out)
            try:
                copy_to_clipboard(img)
                self.status_var.set(f"Saved {out} (copied to clipboard).")
            except (OSError, RuntimeError):
                self.status_var.set(f"Saved {out}.")
        except (OSError, ValueError, RuntimeError) as e:
            messagebox.showerror("Codeimg", str(e))


def build_ui(root: "tk.Misc") -> App:
    """Construct the UI tree on `root` and return the App. Separate from
    `launch_ui` so tests can build the tree without entering mainloop."""
    return App(root)


def launch_ui() -> None:
    if tk is None:
        print("UI dependencies not available. Tkinter is required.")
        return
    try:
        root = TkinterDnD.Tk() if _DND_OK else tk.Tk()
    except tk.TclError as e:
        print(f"Could not open display: {e}")
        return
    build_ui(root)
    root.mainloop()
