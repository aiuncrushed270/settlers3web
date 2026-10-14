import type { MapData } from "./mapfile.ts";
import buildingData from "./buildings.json";

export interface BuildingDef
{
	id: string;
	name: string;
	cost: Record<string, number>;
	mine: boolean;
	blocked: number[][];
	territory: number;
}

export interface Category { id: string; label: string; buildings: BuildingDef[]; }

export const CATEGORIES: Category[] = buildingData.categories;
export const BUILDINGS = new Map<string, BuildingDef>(CATEGORIES.flatMap(c => c.buildings).map(b => [b.id, b]));

export type Goods = Record<string, number>;
export type StartLevel = "LG" | "MG" | "HG";

// Start goods and settlers per start-resource level, as laid out around the start tower
// in the original game (values as implemented by jsettlers/settlers-remake).
const STACKS: Record<StartLevel, [string, number][]> = {
	LG: [["plank", 6], ["plank", 6], ["stone", 6], ["stone", 6], ["blade", 5], ["hammer", 6], ["axe", 3], ["pick", 2], ["saw", 1]],
	MG: [["plank", 7], ["plank", 6], ["plank", 6], ["plank", 6], ["stone", 7], ["stone", 6], ["stone", 6], ["stone", 6],
		["coal", 8], ["coal", 7], ["ironore", 5], ["fish", 3], ["bread", 7], ["meat", 5], ["blade", 5], ["blade", 5],
		["hammer", 8], ["hammer", 7], ["axe", 6], ["pick", 4], ["saw", 2], ["scythe", 1], ["fishingrod", 1]],
	HG: [["plank", 8], ["plank", 8], ["plank", 7], ["plank", 7], ["stone", 8], ["stone", 8], ["stone", 8], ["stone", 7],
		["coal", 7], ["coal", 7], ["coal", 6], ["coal", 6], ["ironore", 6], ["ironore", 6], ["fish", 7], ["bread", 8], ["bread", 7],
		["meat", 8], ["blade", 8], ["blade", 7], ["hammer", 7], ["hammer", 6], ["hammer", 6], ["hammer", 6], ["axe", 8],
		["pick", 5], ["saw", 3], ["scythe", 3], ["fishingrod", 2]],
};

const SETTLERS: Record<StartLevel, Goods> = {
	LG: {bearer: 16, miner: 2, smith: 1, bowman: 1, pikeman: 1, swordsman: 6},
	MG: {bearer: 32, miner: 4, smith: 2, bowman: 2, pikeman: 2, swordsman: 10, donkey: 4},
	HG: {bearer: 50, miner: 6, smith: 3, bowman: 4, pikeman: 4, swordsman: 12, donkey: 6},
};

export const GOOD_NAMES: Record<string, string> = {
	plank: "Bretter", stone: "Steine", coal: "Kohle", ironore: "Eisenerz", fish: "Fisch", bread: "Brot", meat: "Fleisch",
	blade: "Schaufeln", hammer: "Hämmer", axe: "Äxte", pick: "Spitzhacken", saw: "Sägen", scythe: "Sensen", fishingrod: "Angeln",
};
export const SETTLER_NAMES: Record<string, string> = {
	bearer: "Träger", miner: "Bergleute", smith: "Schmiede", bowman: "Bogenschützen", pikeman: "Pikeniere",
	swordsman: "Schwertkämpfer", donkey: "Esel",
};

export interface PlacedBuilding
{
	def: BuildingDef;
	x: number;
	y: number;
	owner: number;
	progress: number;       // 0..1, 1 = finished
	buildSeconds: number;
}

export type PlaceResult = {ok: true} | {ok: false, reason: string};

const MOUNTAIN = new Set([0x11, 0x20, 0x21, 0x23]);
const MAX_SLOPE = 6;
// seconds of construction per material unit (simplified: no builders or carriers yet)
const BUILD_SECONDS_PER_MATERIAL = 4;

function isTree(o: number): boolean { return (o >= 68 && o <= 80) || o === 84; }

function footprint(def: BuildingDef): number
{
	return def.blocked.length >= 70 ? 2 : 1;
}

export default class GameState
{
	readonly stock: Goods = {};
	readonly settlers: Goods;
	readonly buildings: PlacedBuilding[] = [];
	readonly territory: Uint8Array;
	private occupied: Uint8Array;
	territoryDirty = true;

	constructor(private data: MapData, level: StartLevel, readonly player = 0)
	{
		for(const [good, n] of STACKS[level]) this.stock[good] = (this.stock[good] ?? 0) + n;
		this.settlers = {...SETTLERS[level]};
		this.territory = new Uint8Array(data.size * data.size);
		this.occupied = new Uint8Array(data.size * data.size);

		const start = data.players[player];
		if(start) {
			// the game starts with a finished tower that claims the first piece of land
			this.addBuilding(BUILDINGS.get("tower")!, start.x, start.y, 1);
		}
	}

	private idx(x: number, y: number): number { return y * this.data.size + x; }

	canAfford(def: BuildingDef): boolean
	{
		return Object.entries(def.cost).every(([g, n]) => (this.stock[g] ?? 0) >= n);
	}

	check(def: BuildingDef, x: number, y: number): PlaceResult
	{
		const { size, landscape, object, height } = this.data;
		const r = footprint(def);
		let lo = 255, hi = 0;

		for(let dy = -r; dy <= r; dy++) {
			for(let dx = -r; dx <= r; dx++) {
				const tx = x + dx, ty = y + dy;
				if(tx < 1 || ty < 1 || tx >= size - 1 || ty >= size - 1) return {ok: false, reason: "Außerhalb der Karte"};
				const i = this.idx(tx, ty);
				const land = landscape[i];
				const ok = def.mine ? MOUNTAIN.has(land) || land === 0x10 : land === 0x10;
				if(!ok) return {ok: false, reason: def.mine ? "Nur am Berg" : "Kein Bauland"};
				if(isTree(object[i]) || (object[i] >= 1 && object[i] <= 8)) return {ok: false, reason: "Im Weg"};
				if(this.occupied[i]) return {ok: false, reason: "Platz belegt"};
				lo = Math.min(lo, height[i]);
				hi = Math.max(hi, height[i]);
			}
		}
		if(hi - lo > MAX_SLOPE) return {ok: false, reason: "Zu steil"};
		if(!this.territory[this.idx(x, y)] && this.buildings.length > 0) return {ok: false, reason: "Nicht im eigenen Gebiet"};
		if(!this.canAfford(def)) return {ok: false, reason: "Zu wenig Material"};
		return {ok: true};
	}

	private addBuilding(def: BuildingDef, x: number, y: number, progress: number): PlacedBuilding
	{
		const material = Object.values(def.cost).reduce((a, b) => a + b, 0);
		const b: PlacedBuilding = {def, x, y, owner: this.player, progress, buildSeconds: material * BUILD_SECONDS_PER_MATERIAL};
		this.buildings.push(b);
		const r = footprint(def);
		for(let dy = -r; dy <= r; dy++) for(let dx = -r; dx <= r; dx++) this.occupied[this.idx(x + dx, y + dy)] = 1;
		if(progress >= 1) this.claim(b);
		return b;
	}

	private claim(b: PlacedBuilding): void
	{
		const R = b.def.territory;
		if(!R) return;
		const { size } = this.data;
		for(let dy = -R; dy <= R; dy++) {
			for(let dx = -R; dx <= R; dx++) {
				const gx = dx + dy * 0.5, gy = dy * 0.866;
				if(gx * gx + gy * gy > R * R) continue;
				const tx = b.x + dx, ty = b.y + dy;
				if(tx >= 0 && ty >= 0 && tx < size && ty < size) this.territory[this.idx(tx, ty)] = 1;
			}
		}
		this.territoryDirty = true;
	}

	place(def: BuildingDef, x: number, y: number): PlaceResult
	{
		const res = this.check(def, x, y);
		if(!res.ok) return res;
		for(const [g, n] of Object.entries(def.cost)) this.stock[g] -= n;
		this.addBuilding(def, x, y, 0);
		return {ok: true};
	}

	update(dt: number): void
	{
		for(const b of this.buildings) {
			if(b.progress >= 1) continue;
			b.progress = Math.min(1, b.progress + dt / b.buildSeconds);
			if(b.progress >= 1) this.claim(b);
		}
	}
}
