from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CD_ROOT = ROOT.parents[1] / "sidekick_cd_mappe_final" / "assets"
BUILD_DIR = ROOT / "build"


HEADER_SIZE = (150, 57)
SIDEBAR_SIZE = (164, 314)

MIDNIGHT = (7, 17, 31)
DEEP = (10, 20, 38)
CYAN = (0, 217, 255)
BLUE = (53, 123, 255)
PINK = (255, 47, 178)
ORANGE = (255, 159, 28)
WHITE = (245, 248, 255)
MUTED = (187, 197, 214)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def load_rgba(path: Path, size: tuple[int, int] | None = None) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if size:
        image.thumbnail(size, Image.Resampling.LANCZOS)
    return image


def gradient_bg(size: tuple[int, int], left: tuple[int, int, int], right: tuple[int, int, int]) -> Image.Image:
    width, height = size
    base = Image.new("RGBA", size, left + (255,))
    overlay = Image.new("RGBA", size, right + (255,))
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    for x in range(width):
        alpha = int(255 * x / max(1, width - 1))
        draw.line((x, 0, x, height), fill=alpha)
    return Image.composite(overlay, base, mask)


def add_glow(image: Image.Image, bbox: tuple[int, int, int, int], color: tuple[int, int, int], radius: int, intensity: int) -> None:
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.rounded_rectangle(bbox, radius=radius, fill=color + (intensity,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=radius // 2))
    image.alpha_composite(glow)


def draw_gradient_bar(draw: ImageDraw.ImageDraw, bbox: tuple[int, int, int, int], colors: list[tuple[int, int, int]]) -> None:
    x1, y1, x2, y2 = bbox
    width = max(1, x2 - x1)
    for i in range(width):
        t = i / max(1, width - 1)
        if t < 0.33:
            local = t / 0.33
            color = tuple(int(colors[0][j] + (colors[1][j] - colors[0][j]) * local) for j in range(3))
        elif t < 0.66:
            local = (t - 0.33) / 0.33
            color = tuple(int(colors[1][j] + (colors[2][j] - colors[1][j]) * local) for j in range(3))
        else:
            local = (t - 0.66) / 0.34
            color = tuple(int(colors[2][j] + (colors[3][j] - colors[2][j]) * local) for j in range(3))
        draw.line((x1 + i, y1, x1 + i, y2), fill=color)


def fit_contain(image: Image.Image, target: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(target, Image.Resampling.LANCZOS)
    return copy


def make_header() -> Image.Image:
    logo = load_rgba(CD_ROOT / "logos" / "lastbrowser-logo-transparent.png")
    icon = load_rgba(CD_ROOT / "app-icons" / "lastbrowser-app-icon-512.png")

    canvas = gradient_bg(HEADER_SIZE, MIDNIGHT, DEEP)
    add_glow(canvas, (4, 8, 52, 52), CYAN, radius=20, intensity=52)
    canvas.alpha_composite(fit_contain(icon, (31, 31)), (10, 13))
    canvas.alpha_composite(fit_contain(logo, (92, 25)), (47, 14))
    return canvas.convert("RGB")


def make_sidebar() -> Image.Image:
    logo = load_rgba(CD_ROOT / "logos" / "lastbrowser-logo-transparent.png")
    icon = load_rgba(CD_ROOT / "app-icons" / "lastbrowser-app-icon-512.png")

    canvas = gradient_bg(SIDEBAR_SIZE, MIDNIGHT, DEEP)
    add_glow(canvas, (0, 12, 164, 194), BLUE, radius=38, intensity=62)
    add_glow(canvas, (48, 102, 165, 254), CYAN, radius=34, intensity=30)
    draw = ImageDraw.Draw(canvas)

    # One quiet browser illustration reads clearly at the narrow NSIS sidebar size.
    draw.rounded_rectangle((18, 22, 146, 132), radius=14, fill=(11, 24, 43, 244), outline=(80, 132, 190, 150), width=1)
    draw.rounded_rectangle((19, 23, 145, 43), radius=13, fill=(20, 37, 60, 255))
    draw.rectangle((19, 34, 145, 43), fill=(20, 37, 60, 255))
    for x, color in ((30, CYAN), (39, BLUE), (48, (119, 137, 164))):
        draw.ellipse((x, 30, x + 5, 35), fill=(*color, 255))
    draw.rounded_rectangle((27, 53, 137, 62), radius=4, fill=(27, 46, 69, 255))
    draw.rounded_rectangle((27, 70, 68, 120), radius=6, fill=(16, 31, 51, 255))
    draw.rounded_rectangle((75, 70, 137, 120), radius=6, fill=(14, 27, 46, 255))
    draw.rounded_rectangle((34, 81, 61, 85), radius=2, fill=(40, 83, 121, 255))
    draw.rounded_rectangle((34, 91, 57, 95), radius=2, fill=(35, 62, 91, 255))
    draw.rounded_rectangle((82, 80, 127, 85), radius=2, fill=(39, 76, 111, 255))
    draw.rounded_rectangle((82, 91, 119, 96), radius=2, fill=(32, 56, 82, 255))
    draw.rounded_rectangle((82, 102, 124, 107), radius=2, fill=(32, 56, 82, 255))

    canvas.alpha_composite(fit_contain(logo, (122, 31)), (21, 163))
    header_font = load_font(14, bold=True)
    body_font = load_font(10, bold=False)
    draw.text((22, 215), "Dein Browser.", fill=WHITE, font=header_font)
    draw.text((22, 234), "Bereit fuer mehr.", fill=(104, 214, 255, 255), font=header_font)
    draw.line((22, 263, 142, 263), fill=(77, 105, 142, 180), width=1)
    draw.text((22, 276), "KI spaeter einrichten.", fill=(190, 203, 221, 255), font=body_font)
    return canvas.convert("RGB")


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    header = make_header()
    sidebar = make_sidebar()
    header.save(BUILD_DIR / "installerHeader.bmp")
    sidebar.save(BUILD_DIR / "installerSidebar.bmp")
    print(f"Wrote {BUILD_DIR / 'installerHeader.bmp'}")
    print(f"Wrote {BUILD_DIR / 'installerSidebar.bmp'}")


if __name__ == "__main__":
    main()
