"""
Frames real browser screenshots of the live product (the Tom Whitmore /
Dodge Charger R/T demo account, see deployment-status.md) in a simple
monochrome browser-chrome mockup, for the homepage's "See it in action"
video (public/media/portal-demo.mp4).

Input screenshots (captured directly from the live signed-in app, at
1568x726) are expected at /home/claude/portal-video/<name>.jpg, one per
scene listed in `scenes` below. Output frames are written to
/home/claude/portal-video/frame-NN.png and were then compiled into the
final video with ffmpeg's xfade filter for a simple crossfade between
scenes (see the deployment-status.md entry for the exact command used).

Re-run this if the demo account's screens ever need to be refreshed for
a new video.
"""

from PIL import Image, ImageDraw, ImageFont

W, H_CONTENT = 1280, 592
CHROME_H = 48
CANVAS_H = CHROME_H + H_CONTENT  # 640

CHROME_BG = (245, 245, 245)      # ~ --bg-panel
DOT_COLOR = (179, 179, 179)      # ~ --hairline-strong
BORDER_COLOR = (222, 222, 222)   # ~ --hairline
URL_TEXT_COLOR = (90, 90, 90)    # ~ --ink-muted
URL_PILL_BG = (255, 255, 255)

mono = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 15)

scenes = [
    ("01-vehicle.jpg", "digitalvehicleid.com/dashboard"),
    ("02-photos.jpg", "digitalvehicleid.com/.../folder/photo"),
    ("03-service.jpg", "digitalvehicleid.com/.../folder/service"),
    ("04-verify.jpg", "digitalvehicleid.com/verify/787159"),
]

for i, (fname, url) in enumerate(scenes, start=1):
    shot = Image.open(f"/home/claude/portal-video/{fname}").convert("RGB")
    shot = shot.resize((W, H_CONTENT), Image.LANCZOS)

    canvas = Image.new("RGB", (W, CANVAS_H), CHROME_BG)
    draw = ImageDraw.Draw(canvas)

    # Traffic-light dots (monochrome, on-brand)
    dot_y = CHROME_H // 2
    for k, dx in enumerate([24, 44, 64]):
        r = 5
        draw.ellipse([dx - r, dot_y - r, dx + r, dot_y + r], fill=DOT_COLOR)

    # Address pill
    pill_w, pill_h = 420, 26
    pill_x0 = (W - pill_w) // 2
    pill_y0 = (CHROME_H - pill_h) // 2
    pill_x1, pill_y1 = pill_x0 + pill_w, pill_y0 + pill_h
    draw.rounded_rectangle([pill_x0, pill_y0, pill_x1, pill_y1], radius=13, fill=URL_PILL_BG, outline=BORDER_COLOR, width=1)
    bbox = draw.textbbox((0, 0), url, font=mono)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text((pill_x0 + (pill_w - text_w) / 2, pill_y0 + (pill_h - text_h) / 2 - bbox[1]), url, font=mono, fill=URL_TEXT_COLOR)

    # Paste the screenshot content
    canvas.paste(shot, (0, CHROME_H))

    # Thin border + separator line under chrome bar
    draw.line([(0, CHROME_H - 1), (W, CHROME_H - 1)], fill=BORDER_COLOR, width=1)
    draw.rectangle([0, 0, W - 1, CANVAS_H - 1], outline=BORDER_COLOR, width=1)

    out_path = f"/home/claude/portal-video/frame-{i:02d}.png"
    canvas.save(out_path)
    print("wrote", out_path, canvas.size)
