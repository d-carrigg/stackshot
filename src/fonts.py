from PIL import Image, ImageFont

TITLE_FONT_NAME_CANDIDATES = [
    "Inter-SemiBold.ttf",
    "Inter-Medium.ttf",
    "DejaVuSans.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for name in TITLE_FONT_NAME_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


try:
    from PIL.Image import Resampling as _Resampling
except ImportError:
    _Resampling = None

if _Resampling is not None:
    RESAMPLE_LANCZOS = _Resampling.LANCZOS
else:
    RESAMPLE_LANCZOS = (
        getattr(Image, "LANCZOS", None)
        or getattr(Image, "ANTIALIAS", None)
        or getattr(Image, "NEAREST", 0)
    )
