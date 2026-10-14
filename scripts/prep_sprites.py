#!/usr/bin/env python3
"""Turns the Blender renders in gfx/ into web sprites.

The renders carry an opaque light-grey reference tile under the object. This removes it,
crops to the remaining content and writes public/gfx/sprites/<name>.png plus sprites.json
with the anchor (the point of the sprite that stands on the map tile) as fractions of the image.
"""
import json
from PIL import Image

TILE = (220, 218, 211)
SOURCES = {
	"tree": {"file": "gfx/tree.png", "anchor": (98, 232)},
	"settler": {"file": "gfx/settler.png", "anchor": (128, 222)},
}


def strip_tile(im):
	px = im.load()
	w, h = im.size
	for y in range(h):
		for x in range(w):
			r, g, b, a = px[x, y]
			if a != 255 or max(r, g, b) - min(r, g, b) > 14:
				continue
			# neutral grey and opaque: the reference tile, or the object's shadow cast onto it.
			# Turn it into a black overlay whose opacity matches how much the tile is darkened.
			lum = (r + g + b) / 3
			shade = max(0.0, 1 - lum / sum(TILE) * 3)
			px[x, y] = (0, 0, 0, round(255 * shade) if shade > 0.04 else 0)
	return im


info = {}
for name, src in SOURCES.items():
	im = strip_tile(Image.open(src["file"]).convert("RGBA"))
	left, top, right, bottom = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
	ax, ay = src["anchor"]
	bottom = max(bottom, ay + 2)
	im = im.crop((left, top, right, bottom))
	im.save(f"public/gfx/sprites/{name}.png", optimize=True)
	info[name] = {"w": im.width, "h": im.height, "ax": (ax - left) / im.width, "ay": (ay - top) / im.height}
	print(name, info[name])

json.dump(info, open("public/gfx/sprites/sprites.json", "w"), indent="\t")
