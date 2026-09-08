#!/usr/bin/env python3
"""Create exact-size Steam capsules from the approved Crystal Front key art."""

from pathlib import Path
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "steam" / "source" / "crystal-front-key-art.png"
OUTPUT = ROOT / "steam" / "store-assets"
def first_font(*candidates):
    for candidate in candidates:
        if Path(candidate).exists(): return candidate
    raise FileNotFoundError("No Cyrillic serif font found")


SERIF = first_font(
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", "georgia.ttf"),
)
SERIF_BOLD = first_font(
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts", "georgiab.ttf"),
)
SPRITES = {
    "spark": (89, 41, 262, 346),
    "blade": (477, 45, 341, 349),
    "bulwark": (905, 40, 305, 347),
    "mortar": (422, 495, 407, 266),
    "wing": (856, 453, 376, 296),
    "titan": (60, 822, 317, 390),
}


def unit(atlas, kind, height, enemy=False):
    x, y, width, source_height = SPRITES[kind]
    image = atlas.crop((x, y, x + width, y + source_height))
    image = image.resize((round(height * width / source_height), height), Image.Resampling.LANCZOS)
    if enemy:
        rgb = image.convert("RGB").convert("HSV")
        hue, saturation, value = rgb.split()
        hue = hue.point(lambda _: 2)
        saturation = saturation.point(lambda level: max(level, 155) if level > 55 else level)
        red = Image.merge("HSV", (hue, saturation, value)).convert("RGB")
        red.putalpha(image.getchannel("A"))
        image = red.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return image


def make_source():
    battlefield = Image.open(ROOT / "assets" / "frontier.webp").convert("RGB")
    atlas = Image.open(ROOT / "assets" / "frontier-units.webp").convert("RGBA")
    source = Image.new("RGB", (1920, 1080), "#071d26")
    sky = Image.new("RGB", source.size)
    pixels = sky.load()
    for y in range(sky.height):
        t = y / sky.height
        color = (round(7 + 10 * t), round(25 + 35 * t), round(34 + 30 * t))
        for x in range(sky.width): pixels[x, y] = color
    source.paste(sky)
    bridge = battlefield.resize((1920, 674), Image.Resampling.LANCZOS)
    source.paste(bridge, (0, 250))
    glow = Image.new("RGBA", source.size)
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-320, 120, 860, 1220), fill=(21, 237, 211, 82))
    glow_draw.ellipse((1120, 120, 2240, 1220), fill=(238, 52, 65, 74))
    glow = glow.filter(ImageFilter.GaussianBlur(115))
    source = Image.alpha_composite(source.convert("RGBA"), glow)
    placements = [
        ("blade", 595, 120, 420, False),
        ("spark", 525, 545, 470, False),
        ("bulwark", 470, 805, 455, False),
        ("mortar", 310, 930, 670, False),
        ("wing", 270, 1010, 285, False),
        ("titan", 330, 1505, 510, True),
        ("spark", 300, 1400, 625, True),
        ("blade", 270, 1680, 555, True),
    ]
    for kind, height, x, y, enemy in placements:
        sprite = unit(atlas, kind, height, enemy)
        source.alpha_composite(sprite, (x, y))
    vignette = Image.new("RGBA", source.size)
    mask = Image.new("L", source.size)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((-180, -150, 2100, 1230), fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(120))
    vignette.putalpha(mask.point(lambda value: min(175, value)))
    source = Image.alpha_composite(source, vignette)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    source.convert("RGB").save(SOURCE, quality=96)


def cover(image: Image.Image, size: tuple[int, int], focus=(0.5, 0.53)) -> Image.Image:
    target_ratio = size[0] / size[1]
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = round((image.width - crop_width) * focus[0])
        box = (left, 0, left + crop_width, image.height)
    else:
        crop_height = round(image.width / target_ratio)
        top = round((image.height - crop_height) * focus[1])
        box = (0, top, image.width, top + crop_height)
    return image.crop(box).resize(size, Image.Resampling.LANCZOS)


def fit_font(text: str, maximum_width: int, initial: int, path=SERIF_BOLD) -> ImageFont.FreeTypeFont:
    size = initial
    while size > 12:
        font = ImageFont.truetype(path, size)
        if font.getlength(text) <= maximum_width:
            return font
        size -= 1
    return ImageFont.truetype(path, size)


def add_logo(image: Image.Image, scale=1.0, top=0.07) -> Image.Image:
    layer = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(layer)
    title = "КРИСТАЛЬНЫЙ ФРОНТ"
    font = fit_font(title, int(image.width * 0.84), max(18, int(image.width * 0.066 * scale)))
    bbox = draw.textbbox((0, 0), title, font=font, stroke_width=max(1, int(font.size * 0.025)))
    x = (image.width - (bbox[2] - bbox[0])) / 2
    y = image.height * top
    stroke = max(1, int(font.size * 0.035))
    shadow = Image.new("RGBA", image.size)
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.text((x, y + stroke * 2), title, font=font, fill=(0, 0, 0, 235), stroke_width=stroke * 2, stroke_fill=(0, 0, 0, 210))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(2, int(font.size * 0.09))))
    layer.alpha_composite(shadow)
    draw = ImageDraw.Draw(layer)
    draw.text((x, y), title, font=font, fill=(246, 230, 190, 255), stroke_width=stroke, stroke_fill=(72, 48, 25, 230))
    line_y = y + bbox[3] + max(3, int(font.size * 0.08))
    draw.line((image.width * .30, line_y, image.width * .70, line_y), fill=(92, 235, 218, 210), width=max(1, int(font.size * .025)))
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def capsule(source, filename, size, focus=(0.5, 0.53), logo_scale=1.0, top=0.07):
    image = cover(source, size, focus)
    shade = Image.new("RGBA", size)
    pixels = shade.load()
    for y in range(size[1]):
        edge = max(0.0, 1 - min(y, size[1] - 1 - y) / (size[1] * .38))
        alpha = int(130 * edge)
        for x in range(size[0]):
            pixels[x, y] = (3, 13, 18, alpha)
    image = Image.alpha_composite(image.convert("RGBA"), shade).convert("RGB")
    add_logo(image, logo_scale, top).save(OUTPUT / filename, quality=94, subsampling=0)


def make_logo():
    size = (1280, 720)
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    font = fit_font("КРИСТАЛЬНЫЙ ФРОНТ", 1120, 100)
    text = "КРИСТАЛЬНЫЙ ФРОНТ"
    x = (size[0] - draw.textlength(text, font=font)) / 2
    y = 280
    draw.text((x, y), text, font=font, fill=(247, 230, 188, 255), stroke_width=3, stroke_fill=(43, 29, 17, 235))
    draw.line((300, 405, 980, 405), fill=(74, 228, 211, 230), width=4)
    image.save(OUTPUT / "library_logo.png")


def make_icon():
    size = 512
    image = Image.new("RGB", (size, size), "#071b22")
    draw = ImageDraw.Draw(image)
    draw.ellipse((24, 24, 488, 488), fill="#0a333b", outline="#a98a53", width=8)
    outer = [(256, 60), (425, 220), (256, 457), (87, 220)]
    left = [(256, 60), (187, 220), (256, 457), (87, 220)]
    right = [(256, 60), (425, 220), (256, 457), (325, 220)]
    draw.polygon(outer, fill="#24cdbb", outline="#f3d99c")
    draw.polygon(left, fill="#dfffcf")
    draw.polygon(right, fill="#0b8f8b")
    draw.line((87, 220, 425, 220), fill="#ffe4a9", width=8)
    draw.line((256, 60, 187, 220, 256, 457, 325, 220, 256, 60), fill="#f7e5b3", width=6)
    image.resize((256, 256), Image.Resampling.LANCZOS).save(OUTPUT / "shortcut_icon.png")
    image.resize((184, 184), Image.Resampling.LANCZOS).save(OUTPUT / "app_icon.jpg", quality=95)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists():
        make_source()
    source = Image.open(SOURCE).convert("RGB")
    capsule(source, "header_capsule.jpg", (920, 430), logo_scale=.88, top=.045)
    capsule(source, "small_capsule.jpg", (462, 174), logo_scale=.88, top=.025)
    capsule(source, "main_capsule.jpg", (1232, 706), top=.055)
    capsule(source, "vertical_capsule.jpg", (748, 896), focus=(.28, .5), logo_scale=.88, top=.055)
    capsule(source, "library_capsule.jpg", (600, 900), focus=(.27, .5), logo_scale=.86, top=.055)
    capsule(source, "library_header.jpg", (920, 430), logo_scale=.88, top=.045)
    cover(source, (3840, 1240), focus=(.5, .48)).save(OUTPUT / "library_hero.png", optimize=True)
    make_logo()
    make_icon()


if __name__ == "__main__":
    main()
