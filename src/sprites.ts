// Procedurally painted placeholder sprites (the original artwork is not redistributable).
// Magenta (#ff00ff) marks the area that is recoloured with the owning player's colour.

export enum Sprite { Birch, Elm, Oak, Palm, Sapling, Stone, Tower }

export const SPRITE_CELL_W = 64;
export const SPRITE_CELL_H = 96;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

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

const painters: Record<Sprite, (c: Ctx) => void> = {
	[Sprite.Birch]: c => {
		shadow(c, 14);
		trunk(c, 40, "#e6e0cf", 3.5);
		blob(c, 26, 36, 14, "#b9e36a", "#5c9a2a");
		blob(c, 40, 32, 13, "#a8d95a", "#4f8e26");
		blob(c, 32, 20, 13, "#c4ee78", "#63a432");
	},
	[Sprite.Elm]: c => {
		shadow(c, 18);
		trunk(c, 44, "#6b4a2a", 5);
		blob(c, 22, 42, 15, "#7fc243", "#2f6e1c");
		blob(c, 44, 40, 15, "#74b83c", "#2a6619");
		blob(c, 33, 24, 17, "#8dd04c", "#357a20");
	},
	[Sprite.Oak]: c => {
		shadow(c, 20);
		trunk(c, 46, "#5a3b20", 6);
		blob(c, 20, 44, 14, "#5fa636", "#235a15");
		blob(c, 46, 44, 14, "#58a032", "#1f5412");
		blob(c, 32, 30, 19, "#6cb83c", "#285f17");
		blob(c, 32, 16, 12, "#7bc649", "#2e6c1b");
	},
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

export function makeAtlas(): HTMLCanvasElement
{
	const canvas = document.createElement("canvas");
	canvas.width = SPRITE_CELL_W * ATLAS_COLS;
	canvas.height = SPRITE_CELL_H * ATLAS_ROWS;
	const c = canvas.getContext("2d")!;

	for(const key of Object.keys(painters)) {
		const id = Number(key) as Sprite;
		c.save();
		c.translate((id % ATLAS_COLS) * SPRITE_CELL_W, Math.floor(id / ATLAS_COLS) * SPRITE_CELL_H);
		c.beginPath();
		c.rect(0, 0, SPRITE_CELL_W, SPRITE_CELL_H);
		c.clip();
		painters[id](c);
		c.restore();
	}
	return canvas;
}
