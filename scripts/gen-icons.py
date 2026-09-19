"""
Generates the PWA app icons from the site's existing "Moto ID" brand mark
(the QR-style finder-pattern mark used throughout marketing.ts as
MOTO_MARK_SVG), rendered directly with Pillow rather than rasterizing SVG
(no SVG rasterizer with delegate support is available in this sandbox).

Produces, into public/media/icons/:
  icon-512.png            - maskable + any, 512x512, solid background
  icon-192.png            - maskable + any, 192x192, solid background
  apple-touch-icon.png    - 180x180, solid background, no transparency
  favicon-32.png          - 32x32, solid background
  favicon.ico             - multi-size (16/32/48), for legacy browser tabs

Colors match the site's existing CSS custom properties (BASE_CSS in
src/lib/styles.ts): --ink: oklch(14% 0 0) for the background, --bg:
oklch(99% 0 0) for the mark itself (computed to sRGB by hand since no OKLCH
conversion library is available offline).
"""

from PIL import Image, ImageDraw

INK_HEX = (10, 10, 10)      # oklch(14% 0 0) -> ~#0a0a0a
PAPER_HEX = (252, 252, 252)  # oklch(99% 0 0) -> ~#fcfcfc

# Corner "finder" squares: (x, y) of the 7x7 outer square's top-left corner,
# in the mark's original 25x25 viewBox units. Each has a 1.3-unit-wide
# border and a filled 3x3 center square inset by 2 units.
CORNERS = [(0, 0), (18, 0), (0, 18)]

# Scattered 1x1 data dots, copied verbatim from MOTO_MARK_SVG in
# src/routes/marketing.ts so the app icon matches the mark used on the site.
DOTS = [
    (9, 2), (11, 2), (13, 2), (15, 3),
    (9, 5), (12, 5), (16, 5),
    (19, 9), (21, 9), (23, 9),
    (9, 9), (11, 9), (13, 9), (15, 9), (17, 9),
    (19, 11), (9, 11), (13, 11),
    (21, 13), (11, 13), (15, 13), (23, 13),
    (9, 15), (13, 15), (17, 15), (19, 15),
    (21, 16),
]

GRID = 25  # viewBox is 0 0 25 25


def draw_mark(draw: ImageDraw.ImageDraw, ox: float, oy: float, unit: float, color):
    stroke_w = max(1.0, unit * 1.3 / 25 * GRID / GRID)  # unit already = px per grid cell
    stroke_w = unit * (1.3)  # 1.3 units thick, matches the SVG's stroke-width
    for (cx, cy) in CORNERS:
        x0, y0 = ox + cx * unit, oy + cy * unit
        x1, y1 = x0 + 7 * unit, y0 + 7 * unit
        draw.rectangle([x0, y0, x1, y1], outline=color, width=max(1, round(stroke_w)))
        ix0, iy0 = ox + (cx + 2) * unit, oy + (cy + 2) * unit
        ix1, iy1 = ix0 + 3 * unit, iy0 + 3 * unit
        draw.rectangle([ix0, iy0, ix1, iy1], fill=color)
    for (dx, dy) in DOTS:
        x0, y0 = ox + dx * unit, oy + dy * unit
        x1, y1 = x0 + unit, y0 + unit
        draw.rectangle([x0, y0, x1, y1], fill=color)


def render_icon(size: int, supersample: int = 4) -> Image.Image:
    big = size * supersample
    img = Image.new("RGB", (big, big), INK_HEX)
    draw = ImageDraw.Draw(img)

    # Mark occupies ~56% of the canvas width, centered - generous padding so
    # it survives being cropped to a circle/rounded-square by the OS
    # (Android maskable icons, iOS auto-rounding).
    mark_px = big * 0.56
    unit = mark_px / GRID
    offset = (big - mark_px) / 2
    draw_mark(draw, offset, offset, unit, PAPER_HEX)

    return img.resize((size, size), Image.LANCZOS)


def main():
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "media", "icons")
    os.makedirs(out_dir, exist_ok=True)

    icon_512 = render_icon(512)
    icon_512.save(os.path.join(out_dir, "icon-512.png"))

    icon_192 = render_icon(192)
    icon_192.save(os.path.join(out_dir, "icon-192.png"))

    apple = render_icon(180)
    apple.save(os.path.join(out_dir, "apple-touch-icon.png"))

    fav32 = render_icon(32)
    fav32.save(os.path.join(out_dir, "favicon-32.png"))

    # Multi-resolution .ico for legacy browser tab icons
    icon_16 = render_icon(16)
    icon_48 = render_icon(48)
    icon_16.save(
        os.path.join(out_dir, "..", "..", "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[fav32, icon_48],
    )

    print("Icons written to", out_dir)


if __name__ == "__main__":
    main()
