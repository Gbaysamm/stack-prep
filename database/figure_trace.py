#!/usr/bin/env python3
"""Draw a figure over the original, so the SVG matches the exam drawing.

A drawing made from memory gets the proportions wrong, and a wrong leg or fin can turn one
animal into another. So every figure of an organism is drawn over the printed one: the scan
sits underneath as a guide, at its own size, and the outlines are placed on top of it.

    # 1. The guide: the printed drawing, cut out and enlarged, with a coordinate grid.
    uv run --no-project --with pillow --with opencv-python-headless --with numpy \\
        python database/figure_trace.py ref SOURCE.png OUT_DIR [--box x0 y0 x1 y1] [--scale 3]

    # 2. A starting outline: the drawing's main contours as smoothed SVG paths, in the guide's
    #    coordinates. Rough on a blurred scan; for proportions and placement, not to ship as is.
    uv run ... python database/figure_trace.py contours OUT_DIR/ref.png OUT_DIR/contours.svg

    # 3. The check: your SVG drawn in red over the faded guide, and the two side by side.
    uv run --no-project --with pillow --with resvg-py \\
        python database/figure_trace.py overlay DRAWING.svg OUT_DIR/ref.png OUT_DIR

SOURCE is an image extracted from the past-questions PDF (figures/raw/img-PPP-NNN.png, made
with `pdfimages -png -p`) or a page rendered with `pdftoppm -r 300 -png`. The SVG you draw
must use the guide's size as its viewBox (ref.png is W x H pixels -> viewBox "0 0 W H"); scale
it down with width/height when it goes into the question.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path


def make_ref(source: Path, out: Path, box: list[int] | None, scale: int) -> None:
    from PIL import Image, ImageDraw, ImageFilter, ImageOps

    out.mkdir(parents=True, exist_ok=True)
    image = Image.open(source).convert("L")
    if box:
        image = image.crop(tuple(box))
    image = image.resize((image.width * scale, image.height * scale), Image.LANCZOS)
    # Lift a grey, blurred scan: stretch its contrast and sharpen the edges a little.
    image = ImageOps.autocontrast(image, cutoff=1).filter(ImageFilter.UnsharpMask(3, 120, 2))
    image.save(out / "ref.png")
    grid = image.convert("RGB")
    draw = ImageDraw.Draw(grid)
    step = 50
    for x in range(0, grid.width, step):
        draw.line([(x, 0), (x, grid.height)], fill=(120, 170, 255) if x % 250 else (40, 90, 230))
        if x % 100 == 0:
            draw.text((x + 2, 2), str(x), fill=(40, 90, 230))
    for y in range(0, grid.height, step):
        draw.line([(0, y), (grid.width, y)], fill=(120, 170, 255) if y % 250 else (40, 90, 230))
        if y % 100 == 0:
            draw.text((2, y + 2), str(y), fill=(40, 90, 230))
    grid.save(out / "ref-grid.png")
    w, h = image.width, image.height
    print(f'{out / "ref.png"}: {w}x{h} -> viewBox "0 0 {w} {h}"')
    print(f"{out / 'ref-grid.png'}: the same with a 50 px grid, for reading coordinates")


def contours(ref: Path, out: Path, min_area: float) -> None:
    import cv2
    import numpy as np

    image = cv2.imread(str(ref), cv2.IMREAD_GRAYSCALE)
    blurred = cv2.GaussianBlur(image, (0, 0), 2.0)
    ink = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 12
    )
    # Join the broken strokes of a faint scan into whole shapes.
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=2)
    found, _ = cv2.findContours(ink, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    paths = []
    for contour in found:
        if cv2.contourArea(contour) < min_area and cv2.arcLength(contour, True) < 120:
            continue
        points = cv2.approxPolyDP(contour, 1.5, True).reshape(-1, 2)
        if len(points) < 3:
            continue
        d = f"M{points[0][0]} {points[0][1]} " + " ".join(f"L{x} {y}" for x, y in points[1:]) + " Z"
        paths.append(f'  <path d="{d}"/>')
    h, w = image.shape
    out.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
        f'<g fill="none" stroke="#1a1a1f" stroke-width="2">\n'
        + "\n".join(paths)
        + "\n</g>\n</svg>\n",
        encoding="utf-8",
    )
    print(f"{out}: {len(paths)} contours, in the guide's coordinates")


def overlay(drawing: Path, ref: Path, out: Path) -> None:
    import resvg_py
    from PIL import Image

    out.mkdir(parents=True, exist_ok=True)
    guide = Image.open(ref).convert("RGB")
    w, h = guide.size
    svg = drawing.read_text(encoding="utf-8")
    if "xmlns=" not in svg:
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    drawn = Image.open(
        io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=w, height=h)))
    ).convert("RGBA")
    drawn = drawn.resize((w, h))
    # Your lines in red over the guide faded to a third, so every miss shows.
    faded = Image.blend(Image.new("RGB", (w, h), "white"), guide, 0.35).convert("RGBA")
    red = Image.new("RGBA", (w, h), (215, 25, 32, 255))
    # Ink is wherever the drawing is opaque and dark; a white fill is not a line.
    dark = Image.eval(drawn.convert("L"), lambda p: 255 - p)
    mask = Image.composite(dark, Image.new("L", (w, h), 0), drawn.getchannel("A"))
    faded.paste(red, (0, 0), mask)
    faded.convert("RGB").save(out / "overlay.png")
    side = Image.new("RGB", (w * 2 + 20, h), "white")
    side.paste(guide, (0, 0))
    plain = Image.new("RGB", (w, h), "white")
    plain.paste(drawn, (0, 0), drawn)
    side.paste(plain, (w + 20, 0))
    side.save(out / "side-by-side.png")
    print(f"{out / 'overlay.png'}: your drawing (red) over the original")
    print(f"{out / 'side-by-side.png'}: the original, then yours")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("ref")
    r.add_argument("source", type=Path)
    r.add_argument("out", type=Path)
    r.add_argument("--box", type=int, nargs=4)
    r.add_argument("--scale", type=int, default=3)
    c = sub.add_parser("contours")
    c.add_argument("ref", type=Path)
    c.add_argument("out", type=Path)
    c.add_argument("--min-area", type=float, default=300.0)
    o = sub.add_parser("overlay")
    o.add_argument("drawing", type=Path)
    o.add_argument("ref", type=Path)
    o.add_argument("out", type=Path)
    args = parser.parse_args()
    if args.cmd == "ref":
        make_ref(args.source, args.out, args.box, args.scale)
    elif args.cmd == "contours":
        contours(args.ref, args.out, args.min_area)
    else:
        overlay(args.drawing, args.ref, args.out)


if __name__ == "__main__":
    sys.exit(main())
