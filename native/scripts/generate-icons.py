"""
Generate Hermes Desktop icon PNG/ICO using only Pillow.
"""
import io, os, struct
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets')
os.makedirs(OUT_DIR, exist_ok=True)


def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 512

    # Background
    margin = int(8 * s)
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=int(24 * s),
        fill=(13, 13, 26, 255),
    )

    gold1 = (245, 197, 66)
    gold2 = (212, 150, 28)
    cx, cy = size // 2, size // 2

    # Stem
    sw = max(1, int(20 * s))
    sh = int(300 * s)
    d.rectangle([
        cx - sw // 2, int(cy - sh * 0.4),
        cx + sw // 2, int(cy + sh * 0.5)
    ], fill=gold2)

    # Flame
    d.polygon([
        (cx, int(cy - sh * 0.5 - 40 * s)),
        (int(cx - 40 * s), int(cy - sh * 0.35)),
        (cx, int(cy - sh * 0.2)),
        (int(cx + 40 * s), int(cy - sh * 0.35)),
    ], fill=gold1)

    # Wings
    for _, sign in [('l', -1), ('r', 1)]:
        for dy, w in [(80, 60), (120, 50), (160, 40)]:
            y = int(cy + dy * s)
            xe = int(cx + sign * w * s)
            d.line([(cx, y), (xe, y)], fill=gold2, width=max(1, int(4 * s)))

    return img


def make_ico(images, sizes):
    """Build a proper Windows .ico file with multiple sizes."""
    # Each icon entry: 16 bytes header per image
    # ICO header: 6 bytes
    buf = io.BytesIO()
    buf.write(struct.pack('<HHH', 0, 1, len(sizes)))  # reserved, type=1(ico), count

    # Collect PNG data for each size
    png_datas = []
    offsets = []
    data_start = 6 + len(sizes) * 16

    for img, size in zip(images, sizes):
        # Save as PNG in memory
        png_buf = io.BytesIO()
        img.save(png_buf, 'PNG')
        png_data = png_buf.getvalue()
        png_datas.append(png_data)

    offset = data_start
    for img, size, png_data in zip(images, sizes, png_datas):
        w = size if size < 256 else 0
        h = size if size < 256 else 0
        colors = 0  # 32bpp
        buf.write(struct.pack('<BBBBHHII',
                              w, h, colors, 0,  # reserved
                              1, 32,  # planes=1, bpp=32
                              len(png_data), offset))
        offset += len(png_data)

    for png_data in png_datas:
        buf.write(png_data)

    return buf.getvalue()


def main():
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [create_icon(s) for s in sizes]

    # PNG
    png_path = os.path.join(OUT_DIR, 'icon.png')
    images[-1].save(png_path, 'PNG')
    print(f"PNG: {png_path} ({os.path.getsize(png_path)} bytes)")

    # ICO
    ico_path = os.path.join(OUT_DIR, 'icon.ico')
    ico_data = make_ico(images, sizes)
    with open(ico_path, 'wb') as f:
        f.write(ico_data)
    print(f"ICO: {ico_path} ({len(ico_data)} bytes, {len(sizes)} sizes)")

    print("Done!")


if __name__ == '__main__':
    main()
