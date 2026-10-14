import { test, expect } from "vitest";
import GameState, { BUILDINGS } from "../src/state.ts";
import type { MapData } from "../src/mapfile.ts";

function flatMap(size: number): MapData
{
	const n = size * size;
	return {
		size, singlePlayer: false, startResources: 1, checksumOk: true,
		players: [{nation: 0, x: 20, y: 20, name: ""}],
		height: new Uint8Array(n).fill(10), landscape: new Uint8Array(n).fill(0x10),
		object: new Uint8Array(n), accessible: new Uint8Array(n),
	};
}

test("start goods follow the start level", () => {
	const low = new GameState(flatMap(48), "LG");
	expect(low.stock.plank).toBe(12);
	expect(low.settlers.bearer).toBe(16);
	const high = new GameState(flatMap(48), "HG");
	expect(high.stock.plank).toBe(30);
	expect(high.settlers.bearer).toBe(50);
});

test("placing consumes materials and needs own territory", () => {
	const s = new GameState(flatMap(48), "LG");
	const lumberjack = BUILDINGS.get("lumberjack")!;
	expect(s.check(lumberjack, 2, 2)).toEqual({ok: false, reason: "Nicht im eigenen Gebiet"});
	expect(s.check(lumberjack, 26, 20).ok).toBeTruthy();
	s.place(lumberjack, 26, 20);
	expect(s.stock.plank).toBe(12 - lumberjack.cost.plank);
	expect(s.check(lumberjack, 26, 20).ok).toBe(false);
});

test("construction finishes and a military building claims land", () => {
	const s = new GameState(flatMap(80), "HG");
	const tower = BUILDINGS.get("tower")!;
	const before = s.territory.reduce((a, b) => a + b, 0);
	expect(s.place(tower, 34, 20).ok).toBeTruthy();
	s.update(1000);
	expect(s.buildings.at(-1)!.progress).toBe(1);
	expect(s.territory.reduce((a, b) => a + b, 0) > before).toBeTruthy();
});

test("mines need mountains and slopes are rejected", () => {
	const map = flatMap(48);
	const s = new GameState(map, "HG");
	expect(s.check(BUILDINGS.get("coalmine")!, 26, 20).ok).toBe(true); // grass is allowed next to mountains
	map.landscape[20 * 48 + 26] = 0x00;
	expect(s.check(BUILDINGS.get("lumberjack")!, 26, 20).ok).toBe(false);
	map.landscape[20 * 48 + 26] = 0x10;
	map.height[20 * 48 + 27] = 100;
	expect(s.check(BUILDINGS.get("lumberjack")!, 26, 20)).toEqual({ok: false, reason: "Zu steil"});
});
