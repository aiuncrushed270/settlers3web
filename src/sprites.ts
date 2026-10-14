// Procedurally painted placeholder sprites (the original artwork is not redistributable).
// Magenta (#ff00ff) marks the area that is recoloured with the owning player's colour.

export enum Sprite { Birch, Elm, Oak, Palm, Sapling, Stone, Tower, House, Mine, Settler }
export const SPRITE_COUNT = 10;

// the tree and settler sprites are Blender renders from the repository (see scripts/prep_sprites.py)
const IMAGE_SPRITES: {sprite: Sprite, name: string, tilesHigh: number, tint: [number, number, number]}[] = [
	{sprite: Sprite.Birch, name: "tree", tilesHigh: 3.0, tint: [1.12, 1.12, 0.85]},
	{sprite: Sprite.Elm, name: "tree", tilesHigh: 3.4, tint: [1.0, 1.0, 1.0]},
	{sprite: Sprite.Oak, name: "tree", tilesHigh: 3.8, tint: [0.82, 0.9, 0.8]},
	{sprite: Sprite.Settler, name: "settler", tilesHigh: 1.5, tint: [1, 1, 1]},
];

export const CELL = 128;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

export interface SpriteInfo
{
	w: number;      // quad size in tiles
	h: number;
	ax: number;     // anchor (point standing on the tile) as fraction of the quad, y from the bottom
	ay: number;
	tint: [number, number, number];
}

type Ctx = CanvasRenderingContext2D;

function shadow(c: Ctx, w: number): void
{
	c.fillStyle = "rgba(0,0,0,0.28)";
	c.beginPath();
	c.ellipse(34, 90, w, w * 0.32, 0, 0, Math.PI * 2);
	c.fill();
}

function blob(c: Ctx, x: number, y: number, r: number, light: string, dark: string): void
{
	const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
	g.addColorStop(0, light);
	g.addColorStop(1, dark);
	c.fillStyle = g;
	c.beginPath();
	c.arc(x, y, r, 0, Math.PI * 2);
	c.fill();
}

function trunk(c: Ctx, top: number, color: string, width = 5): void
{
	c.fillStyle = color;
	c.beginPath();
	c.moveTo(32 - width, 90);
	c.lineTo(32 - width * 0.5, top);
	c.lineTo(32 + width * 0.5, top);
	c.lineTo(32 + width, 90);
	c.fill();
}

const painters: Partial<Record<Sprite, (c: Ctx) => void>> = {
	[Sprite.Palm]: c => {
		shadow(c, 14);
		c.strokeStyle = "#8a6a3a";
		c.lineWidth = 5;
		c.beginPath();
		c.moveTo(32, 90);
		c.quadraticCurveTo(38, 60, 33, 26);
		c.stroke();
		c.strokeStyle = "#4da83a";
		c.lineWidth = 4;
		for(let a = -2; a <= 2; a++) {
			c.beginPath();
			c.moveTo(33, 26);
			c.quadraticCurveTo(33 + a * 10, 12 - Math.abs(a) * 1, 33 + a * 14, 28 + Math.abs(a) * 6);
			c.stroke();
		}
	},
	[Sprite.Sapling]: c => {
		shadow(c, 8);
		trunk(c, 72, "#6b4a2a", 2);
		blob(c, 32, 66, 9, "#8fd052", "#3f8a22");
	},
	[Sprite.Stone]: c => {
		shadow(c, 16);
		const g = c.createLinearGradient(14, 60, 50, 90);
		g.addColorStop(0, "#cfcbc2");
		g.addColorStop(1, "#6f6b64");
		c.fillStyle = g;
		c.beginPath();
		c.moveTo(14, 88);
		c.lineTo(20, 66);
		c.lineTo(34, 58);
		c.lineTo(48, 68);
		c.lineTo(54, 88);
		c.closePath();
		c.fill();
		c.strokeStyle = "rgba(0,0,0,0.25)";
		c.stroke();
	},
	[Sprite.House]: c => {
		shadow(c, 24);
		const wall = c.createLinearGradient(12, 0, 52, 0);
		wall.addColorStop(0, "#e2cf9d");
		wall.addColorStop(1, "#a88e56");
		c.fillStyle = wall;
		c.fillRect(10, 52, 44, 38);
		c.fillStyle = "#8e3b27";
		c.beginPath();
		c.moveTo(4, 54);
		c.lineTo(32, 22);
		c.lineTo(60, 54);
		c.closePath();
		c.fill();
		c.fillStyle = "#5e2517";
		c.fillRect(6, 52, 52, 4);
		c.fillStyle = "#3a2a10";
		c.fillRect(27, 68, 10, 22);
		c.fillStyle = "#ff00ff";
		c.fillRect(44, 58, 6, 10);
	},
	[Sprite.Mine]: c => {
		shadow(c, 24);
		c.fillStyle = "#8a8378";
		c.beginPath();
		c.moveTo(4, 90);
		c.lineTo(18, 46);
		c.lineTo(46, 46);
		c.lineTo(60, 90);
		c.closePath();
		c.fill();
		c.fillStyle = "#1a1208";
		c.fillRect(24, 64, 16, 26);
		c.fillStyle = "#6a4a22";
		c.fillRect(22, 60, 20, 5);
		c.fillStyle = "#ff00ff";
		c.fillRect(44, 56, 6, 10);
	},
	[Sprite.Tower]: c => {
		shadow(c, 24);
		const g = c.createLinearGradient(12, 0, 52, 0);
		g.addColorStop(0, "#d8b45a");
		g.addColorStop(1, "#8f6a26");
		c.fillStyle = g;
		c.fillRect(14, 36, 36, 54);
		c.fillStyle = "#6e4f1c";
		for(let i = 0; i < 4; i++) c.fillRect(14 + i * 10, 28, 7, 10);
		c.fillStyle = "#3a2a10";
		c.fillRect(27, 66, 10, 24);
		c.fillRect(29, 46, 6, 10);
		c.fillStyle = "#ff00ff";
		c.beginPath();
		c.moveTo(32, 4);
		c.lineTo(32, 30);
		c.lineTo(48, 17);
		c.closePath();
		c.fill();
		c.fillStyle = "#e8e0c8";
		c.fillRect(31, 2, 2, 30);
	},
};

function loadImage(url: string): Promise<HTMLImageElement>
{
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`cannot load ${url}`));
		img.src = url;
	});
}

export async function makeAtlas(): Promise<{canvas: HTMLCanvasElement, info: SpriteInfo[]}>
{
	const canvas = document.createElement("canvas");
	canvas.width = CELL * ATLAS_COLS;
	canvas.height = CELL * ATLAS_ROWS;
	const c = canvas.getContext("2d")!;
	const info: SpriteInfo[] = [];
	const cellOrigin = (id: number) => [(id % ATLAS_COLS) * CELL, Math.floor(id / ATLAS_COLS) * CELL];

	// painted sprites: 64x96 design space, 32 design pixels per tile, scaled into a 3x3 tile cell
	const k = CELL / 96;
	for(const key of Object.keys(painters)) {
		const id = Number(key) as Sprite;
		const [ox, oy] = cellOrigin(id);
		c.save();
		c.beginPath();
		c.rect(ox, oy, CELL, CELL);
		c.clip();
		c.translate(ox + (CELL - 64 * k) / 2, oy);
		c.scale(k, k);
		painters[id]!(c);
		c.restore();
		info[id] = {w: 3, h: 3, ax: 0.5, ay: 1 - 90 * k / CELL, tint: [1, 1, 1]};
	}

	// rendered sprites
	const meta = await (await fetch(new URL("gfx/sprites/sprites.json", document.baseURI))).json();
	const images = new Map<string, HTMLImageElement>();
	for(const spec of IMAGE_SPRITES) {
		if(!images.has(spec.name)) images.set(spec.name, await loadImage(new URL(`gfx/sprites/${spec.name}.png`, document.baseURI).href));
		const img = images.get(spec.name)!;
		const m = meta[spec.name];
		const s = Math.min(CELL / img.width, CELL / img.height);
		const dw = img.width * s, dh = img.height * s;
		const [ox, oy] = cellOrigin(spec.sprite);
		c.drawImage(img, ox, oy + CELL - dh, dw, dh);
		const tiles = spec.tilesHigh * CELL / dh;
		info[spec.sprite] = {w: tiles, h: tiles, ax: m.ax * dw / CELL, ay: 1 - (CELL - dh + m.ay * dh) / CELL, tint: spec.tint};
	}
	return {canvas, info};
}
