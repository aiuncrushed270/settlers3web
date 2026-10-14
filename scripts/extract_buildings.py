#!/usr/bin/env python3
"""Generates src/buildings.json from the building definitions of jsettlers/settlers-remake.

usage: extract_buildings.py <path to .../jsettlers/common/buildings>
Costs, footprints and ground types are taken from there; categories follow its build menu.
"""
import glob, json, re, sys
import xml.etree.ElementTree as ET

CATEGORIES = [
	("normal", "Rohstoffe", ["lumberjack", "sawmill", "stonecutter", "forester", "ironmine", "ironmelt", "goldmine", "goldmelt", "coalmine", "toolsmith", "charcoal_burner"]),
	("food", "Nahrung", ["fisher", "farm", "pig_farm", "mill", "slaughterhouse", "baker", "waterworks", "donkey_farm", "winegrower"]),
	("military", "Militär", ["tower", "big_tower", "castle", "lookout_tower", "weaponsmith", "barrack", "dockyard", "hospital"]),
	("social", "Soziales", ["small_livinghouse", "medium_livinghouse", "big_livinghouse", "stock", "market_place", "harbor", "temple", "big_temple"]),
]
NAMES = {
	"lumberjack": "Holzfäller", "sawmill": "Sägewerk", "stonecutter": "Steinmetz", "forester": "Förster",
	"ironmine": "Eisenmine", "ironmelt": "Eisenschmelze", "goldmine": "Goldmine", "goldmelt": "Goldschmelze",
	"coalmine": "Kohlemine", "toolsmith": "Werkzeugschmied", "charcoal_burner": "Köhler",
	"fisher": "Fischer", "farm": "Bauernhof", "pig_farm": "Schweinezucht", "mill": "Mühle",
	"slaughterhouse": "Schlachter", "baker": "Bäcker", "waterworks": "Wasserwerk", "donkey_farm": "Eselzucht",
	"winegrower": "Winzer", "tower": "Kleiner Turm", "big_tower": "Großer Turm", "castle": "Burg",
	"lookout_tower": "Aussichtsturm", "weaponsmith": "Waffenschmied", "barrack": "Kaserne", "dockyard": "Werft",
	"hospital": "Krankenhaus", "small_livinghouse": "Kleines Wohnhaus", "medium_livinghouse": "Mittleres Wohnhaus",
	"big_livinghouse": "Großes Wohnhaus", "stock": "Lagerhaus", "market_place": "Marktplatz", "harbor": "Hafen",
	"temple": "Tempel", "big_temple": "Großer Tempel",
}
# military buildings and the radius (in tiles) of ground they claim; values are simplified estimates
TERRITORY = {"tower": 18, "big_tower": 22, "castle": 28, "lookout_tower": 0}

src = sys.argv[1]
by_id = {}
for f in glob.glob(src + "/*.xml"):
	name = f.split("/")[-1][:-4]
	text = re.sub(r'^<\?xml[^>]*\?>', '', open(f).read().replace('<!DOCTYPE building SYSTEM "building.dtd">', '').strip())
	root = ET.fromstring(text)
	cost = {}
	for c in root.iter("constructionStack"):
		cost[c.get("material").lower()] = int(c.get("buildrequired"))
	by_id[name] = {
		"worker": (root.get("worker") or "").lower() or None,
		"cost": cost,
		"ground": [g.get("groundtype") for g in root.iter("ground")],
		"blocked": [[int(b.get("dx")), int(b.get("dy"))] for b in root.iter("blocked") if b.get("block") == "true"],
		"door": [int(d.get("dx")) for d in root.iter("door")][:1] + [int(d.get("dy")) for d in root.iter("door")][:1],
	}

out = {"categories": []}
for cid, label, ids in CATEGORIES:
	items = []
	for i in ids:
		b = by_id[i]
		items.append({"id": i, "name": NAMES[i], "cost": b["cost"], "mine": "MOUNTAIN" in b["ground"],
			"blocked": b["blocked"], "territory": TERRITORY.get(i, 0)})
	out["categories"].append({"id": cid, "label": label, "buildings": items})

json.dump(out, open("src/buildings.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(sum(len(c["buildings"]) for c in out["categories"]), "buildings")
