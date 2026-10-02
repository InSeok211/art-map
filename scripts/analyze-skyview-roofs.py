"""Classify visible roof colours from locally supplied Kakao Skyview L1 tiles.

The output contains categories, never source imagery. Tiles are only an analysis
input and are not shipped with the map. Requires Pillow and pyproj.
"""

import argparse
import colorsys
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw
from pyproj import Transformer


TILE_SIZE = 256
METERS_PER_PIXEL = 0.25  # Kakao WTM tile level L1
FALSE_X = 30000
FALSE_Y = 60000


def inside(x, y, polygon):
    result = False
    previous = polygon[-1]
    for point in polygon:
        ax, ay = previous
        bx, by = point
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            result = not result
        previous = point
    return result


def edge_distance(x, y, polygon):
    best = math.inf
    for index, (ax, ay) in enumerate(polygon):
        bx, by = polygon[(index + 1) % len(polygon)]
        length_sq = (bx - ax) ** 2 + (by - ay) ** 2
        if length_sq == 0:
            continue
        t = max(0, min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length_sq))
        best = min(best, math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)))
    return best


def roof_category(red, green, blue):
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    hue *= 360
    if value < 0.14:
        return None  # shadows, not roof paint
    if saturation < 0.12:
        return "white" if value > 0.68 else "gray"
    if hue < 42 or hue >= 345:
        return "red"
    if hue < 78:
        return "brown"
    if hue < 166:
        return "green"
    if hue < 191:
        return "teal"
    if hue < 257:
        return "blue"
    return "gray"


def display_color(pixels, kind):
    red, green, blue = [median(pixel[channel] for pixel in pixels) for channel in range(3)]
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    if kind in {"gray", "white"}:
        saturation = min(saturation, 0.09)
        value = max(0.65 if kind == "gray" else 0.8, min(0.87, value * 1.24))
    else:
        saturation = max(0.22, min(0.48, saturation * 0.78))
        value = max(0.63, min(0.86, value * 1.28))
    return "#%02x%02x%02x" % tuple(round(channel * 255) for channel in colorsys.hsv_to_rgb(hue, saturation, value))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tile_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--level", type=int, default=1, choices=range(1, 6))
    parser.add_argument("--merge", action="store_true", help="Preserve earlier, higher resolution classifications")
    args = parser.parse_args()
    global METERS_PER_PIXEL
    METERS_PER_PIXEL = 0.25 * 2 ** (args.level - 1)
    tiles = {}
    for path in args.tile_dir.glob("*.jpg"):
        try:
            row, column = map(int, path.stem.split("_"))
        except ValueError:
            continue
        tiles[row, column] = Image.open(path).convert("RGB")
    if not tiles:
        raise SystemExit("No Skyview tiles found")

    transformer = Transformer.from_crs(4326, 5181, always_xy=True)
    buildings = json.loads(Path("src/gamcheon-buildings.json").read_text(encoding="utf-8"))["features"]
    output = {}
    preview_polygons = []
    for feature in buildings:
        if feature["geometry"]["type"] != "Polygon":
            continue
        lon_lat = feature["geometry"]["coordinates"][0][:-1]
        if len(lon_lat) < 3:
            continue
        polygon = [transformer.transform(lon, lat) for lon, lat in lon_lat]
        min_x, max_x = min(p[0] for p in polygon), max(p[0] for p in polygon)
        min_y, max_y = min(p[1] for p in polygon), max(p[1] for p in polygon)
        # One metre spacing inside the roof; exclude the outer 0.75m where
        # shadows, parapets and footprint registration can bias the colour.
        counts = Counter()
        pixels_by_kind = defaultdict(list)
        total = 0
        for wtm_y in range(math.ceil(min_y), math.floor(max_y) + 1):
            for wtm_x in range(math.ceil(min_x), math.floor(max_x) + 1):
                if not inside(wtm_x, wtm_y, polygon) or edge_distance(wtm_x, wtm_y, polygon) < 0.75:
                    continue
                column = math.floor((wtm_x + FALSE_X) / (TILE_SIZE * METERS_PER_PIXEL))
                row = math.floor((wtm_y + FALSE_Y) / (TILE_SIZE * METERS_PER_PIXEL))
                tile = tiles.get((row, column))
                if tile is None:
                    continue
                px = round((wtm_x + FALSE_X - column * TILE_SIZE * METERS_PER_PIXEL) / METERS_PER_PIXEL)
                py = round(((row + 1) * TILE_SIZE * METERS_PER_PIXEL - FALSE_Y - wtm_y) / METERS_PER_PIXEL)
                if not 0 <= px < TILE_SIZE or not 0 <= py < TILE_SIZE:
                    continue
                rgb = tile.getpixel((px, py))
                category = roof_category(*rgb)
                if category:
                    counts[category] += 1
                    pixels_by_kind[category].append(rgb)
                    total += 1
        if total < 4:
            continue
        category, count = counts.most_common(1)[0]
        share = count / total
        output[str(feature["properties"]["id"])] = {
            "kind": category,
            "confidence": "high" if total >= 20 and share >= 0.64 else "medium" if total >= 10 and share >= 0.48 else "low",
            "samples": total,
            "share": round(share, 3),
            "color": display_color(pixels_by_kind[category], category),
        }
        preview_polygons.append((polygon, output[str(feature["properties"]["id"])]))

    if args.merge and args.output.exists():
        output.update(json.loads(args.output.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        west, south = transformer.transform(129.0081, 35.0938)
        east, north = transformer.transform(129.00975, 35.09595)
        width, height = 1000, 1500
        canvas = Image.new("RGB", (width, height), "#f4f3ec")
        draw = ImageDraw.Draw(canvas)
        for polygon, record in preview_polygons:
            points = [((x - west) / (east - west) * width, (north - y) / (north - south) * height)
                      for x, y in polygon]
            if not any(0 <= x < width and 0 <= y < height for x, y in points):
                continue
            color = record["color"] if record["confidence"] != "low" else "#d4d3ce"
            draw.polygon(points, fill=color, outline="#7f8e8c", width=1)
        canvas.save(args.preview)
    print(f"Classified {len(output)} footprints: {dict(Counter(item['kind'] for item in output.values()))}")
    print(f"Confidence: {dict(Counter(item['confidence'] for item in output.values()))}")


if __name__ == "__main__":
    main()
