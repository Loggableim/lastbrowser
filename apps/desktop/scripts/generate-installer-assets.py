from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CD_ROOT = ROOT.parents[1] / "sidekick_cd_mappe_final" / "assets"
BUILD_DIR = ROOT / "build"
NOVA_PATH = ROOT.parents[1] / "brand" / "assets" / "installer" / "nova-sidekick.png"
NOVA_INSTALLER_PATH = BUILD_DIR / "installerNova.bmp"


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
    icon = load_rgba(NOVA_PATH)

    canvas = gradient_bg(HEADER_SIZE, MIDNIGHT, DEEP)
    add_glow(canvas, (4, 8, 52, 52), CYAN, radius=20, intensity=52)
    canvas.alpha_composite(fit_contain(icon, (31, 31)), (10, 13))
    canvas.alpha_composite(fit_contain(logo, (92, 25)), (47, 14))
    return canvas.convert("RGB")


def make_sidebar() -> Image.Image:
    logo = load_rgba(CD_ROOT / "logos" / "lastbrowser-logo-transparent.png")
    icon = load_rgba(NOVA_PATH)

    canvas = gradient_bg(SIDEBAR_SIZE, MIDNIGHT, DEEP)
    add_glow(canvas, (0, 12, 164, 194), BLUE, radius=38, intensity=62)
    add_glow(canvas, (48, 102, 165, 254), CYAN, radius=34, intensity=30)
    draw = ImageDraw.Draw(canvas)

    nova = fit_contain(icon, (94, 94))
    canvas.alpha_composite(nova, ((SIDEBAR_SIZE[0] - nova.width) // 2, 24))
    draw_gradient_bar(draw, (22, 138, 142, 140), [CYAN, BLUE, (147, 78, 255), PINK])
    canvas.alpha_composite(fit_contain(logo, (122, 31)), (21, 155))
    header_font = load_font(13, bold=True)
    body_font = load_font(10, bold=False)
    draw.text((22, 211), "Sidekick ist dabei.", fill=WHITE, font=header_font)
    draw.text((22, 231), "Lokal auf deinem", fill=(190, 203, 221, 255), font=body_font)
    draw.text((22, 246), "Rechner. Privat.", fill=(190, 203, 221, 255), font=body_font)
    draw.line((22, 270, 142, 270), fill=(77, 105, 142, 180), width=1)
    draw.text((22, 282), "KI spaeter verbinden.", fill=(104, 214, 255, 255), font=body_font)
    return canvas.convert("RGB")


def make_installer_nova() -> Image.Image:
    icon = load_rgba(NOVA_PATH)
    size = (72, 72)
    canvas = Image.new("RGBA", size, (247, 250, 255, 255))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((3, 3, 69, 69), fill=(231, 247, 255, 255), outline=(203, 226, 244, 255), width=1)
    nova = fit_contain(icon, (62, 62))
    canvas.alpha_composite(nova, ((size[0] - nova.width) // 2, (size[1] - nova.height) // 2))
    return canvas.convert("RGB")


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    header = make_header()
    sidebar = make_sidebar()
    nova = make_installer_nova()
    header.save(BUILD_DIR / "installerHeader.bmp")
    sidebar.save(BUILD_DIR / "installerSidebar.bmp")
    nova.save(NOVA_INSTALLER_PATH)
    print(f"Wrote {BUILD_DIR / 'installerHeader.bmp'}")
    print(f"Wrote {BUILD_DIR / 'installerSidebar.bmp'}")
    print(f"Wrote {NOVA_INSTALLER_PATH}")


if __name__ == "__main__":
    main()
