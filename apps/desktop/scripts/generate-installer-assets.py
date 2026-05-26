from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CD_ROOT = ROOT.parents[1] / "lastbrowser_sidekick_cd_mappe_final" / "assets"
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
    accent = Image.new("RGBA", HEADER_SIZE, (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accent)
    accent_draw.rounded_rectangle((0, 0, 149, 56), radius=10, outline=(0, 217, 255, 80), width=1)
    accent_draw.line((0, 41, 149, 41), fill=(53, 123, 255, 40), width=1)
    accent_draw.line((0, 42, 149, 42), fill=(255, 47, 178, 22), width=1)
    canvas.alpha_composite(accent)

    add_glow(canvas, (7, 7, 51, 50), CYAN, radius=18, intensity=80)
    add_glow(canvas, (44, 10, 92, 46), PINK, radius=16, intensity=54)

    icon_small = fit_contain(icon, (28, 28))
    canvas.alpha_composite(icon_small, (10, 15))

    logo_small = fit_contain(logo, (104, 22))
    canvas.alpha_composite(logo_small, (39, 11))

    draw = ImageDraw.Draw(canvas)
    font = load_font(8, bold=True)
    subfont = load_font(6, bold=False)
    draw.text((40, 31), "AI-native browser runtime", fill=(159, 183, 214, 255), font=subfont)
    draw.text((104, 39), "Sidekick ready", fill=(123, 239, 173, 255), font=font)

    pill = Image.new("RGBA", HEADER_SIZE, (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pill)
    pdraw.rounded_rectangle((99, 34, 142, 51), radius=8, fill=(12, 23, 41, 255), outline=(0, 217, 255, 72), width=1)
    canvas.alpha_composite(pill)
    draw.text((108, 36), "ready", fill=WHITE, font=font)

    return canvas.convert("RGB")


def make_sidebar() -> Image.Image:
    logo = load_rgba(CD_ROOT / "logos" / "lastbrowser-logo-transparent.png")
    icon = load_rgba(CD_ROOT / "app-icons" / "lastbrowser-app-icon-512.png")
    sidekick = load_rgba(CD_ROOT / "sidebar-icons" / "png-512" / "30-sidekick-modern-popart.png")

    canvas = gradient_bg(SIDEBAR_SIZE, MIDNIGHT, DEEP)
    add_glow(canvas, (0, 0, 96, 102), BLUE, radius=30, intensity=60)
    add_glow(canvas, (64, 18, 163, 120), PINK, radius=28, intensity=34)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((8, 8, 155, 304), radius=18, outline=(0, 217, 255, 70), width=1)
    draw.rounded_rectangle((10, 10, 153, 302), radius=16, fill=(8, 13, 25, 118))

    icon_small = fit_contain(icon, (36, 36))
    canvas.alpha_composite(icon_small, (15, 18))

    logo_small = fit_contain(logo, (110, 28))
    canvas.alpha_composite(logo_small, (15, 59))

    sidekick_small = fit_contain(sidekick, (54, 54))
    canvas.alpha_composite(sidekick_small, (17, 98))

    header_font = load_font(11, bold=True)
    body_font = load_font(7, bold=False)
    tiny_font = load_font(6, bold=True)

    draw.text((82, 102), "Installation", fill=WHITE, font=header_font)
    draw.text((82, 116), "Lastbrowser 0.1.8", fill=(171, 190, 212, 255), font=body_font)
    draw.text((82, 131), "Browser first.", fill=(0, 217, 255, 255), font=tiny_font)
    draw.text((82, 143), "Sidekick in the background.", fill=(171, 190, 212, 255), font=body_font)

    features_y = 180
    bullet_font = load_font(6, bold=True)
    bullets = [
        ("Tabs + bookmarks", CYAN),
        ("Cloud setup later", BLUE),
        ("Native browser shell", PINK),
    ]
    for idx, (label, color) in enumerate(bullets):
        y = features_y + idx * 24
        draw.rounded_rectangle((17, y, 147, y + 16), radius=8, fill=(12, 22, 40, 220), outline=(*color, 110), width=1)
        draw.ellipse((24, y + 4, y + 10, y + 10), fill=(*color, 255))
        draw.text((34, y + 4), label, fill=WHITE, font=bullet_font)

    draw.rounded_rectangle((17, 270, 147, 290), radius=10, fill=(0, 217, 255, 34), outline=(0, 217, 255, 84), width=1)
    draw.text((25, 275), "Corporate design", fill=WHITE, font=body_font)
    draw.text((25, 283), "Ready for the browser UI", fill=(171, 190, 212, 255), font=body_font)

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
