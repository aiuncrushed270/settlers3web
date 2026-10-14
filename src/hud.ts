import Camera, { GROUND_Y } from "./camera.ts";
import World, { landscapeColor } from "./world.ts";
import type { MapInfo } from "./types.ts";

export const PANEL_WIDTH = 224;
const GOODS_NAMES: Record<string, string> = {LG: "Low goods", MG: "Medium goods", HG: "High goods"};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string): HTMLElementTagNameMap[K]
{
	const e = document.createElement(tag);
	if(cls) e.className = cls;
	if(text !== undefined) e.textContent = text;
	return e;
}

const TABS = [
	{id: "build", label: "Gebäude", glyph: "⌂"},
	{id: "goods", label: "Waren", glyph: "▣"},
	{id: "settlers", label: "Siedler", glyph: "☺"},
];

// Left-hand panel of the in-game screen: minimap, tab row, tab content and the bottom button bar
export default class Hud
{
	readonly root = el("div", "hud");
	private minimap = el("canvas", "minimap");
	private base: HTMLCanvasElement;
	private scale: number;
	private dragging = false;

	constructor(private world: World, private camera: Camera, info: MapInfo)
	{
		const data = world.data;
		this.root.style.width = PANEL_WIDTH + "px";

		const mm = el("div", "mm-frame");
		this.minimap.width = PANEL_WIDTH - 12;
		this.scale = this.minimap.width / (data.size * 1.5);
		this.minimap.height = Math.ceil(data.size * 0.866 * this.scale);
		mm.append(this.minimap);

		const tabs = el("div", "tabs");
		const content = el("div", "tab-content");
		const buttons = TABS.map(t => {
			const b = el("button", "tab");
			b.type = "button";
			b.title = t.label;
			b.append(el("span", "glyph", t.glyph), el("span", "tab-label", t.label));
			b.onclick = () => {
				buttons.forEach(o => o.classList.toggle("active", o === b));
				this.showTab(content, t.id, info);
			};
			return b;
		});
		tabs.append(...buttons);

		const bar = el("div", "bar");
		for(const [glyph, label] of [["⚔", "Militär"], ["≡", "Statistik"], ["✉", "Nachrichten"], ["☰", "Menü"]]) {
			const b = el("button", "bar-btn", glyph);
			b.type = "button";
			b.title = label;
			bar.append(b);
		}

		this.root.append(mm, tabs, content, bar);
		buttons[0].click();

		this.base = this.renderMinimapBase();
		this.bindMinimap();
	}

	private showTab(content: HTMLElement, id: string, info: MapInfo): void
	{
		const data = this.world.data;
		const rows: [string, string][] = id === "build" ? [
			["Map", info.n],
			["Author", info.a],
			["Size", `${data.size} × ${data.size}`],
			["Players", String(data.players.length || info.p)],
			["Goods", GOODS_NAMES[info.g] ?? info.g],
		] : [["Not available yet", "This tab opens once buildings and settlers are implemented."]];

		content.replaceChildren(...rows.map(([k, v]) => {
			const row = el("div", "row");
			row.append(el("span", "k", k), el("span", "v", v));
			return row;
		}));
	}

	private renderMinimapBase(): HTMLCanvasElement
	{
		const { size, landscape, height, object, players } = this.world.data;
		const full = document.createElement("canvas");
		full.width = full.height = size;
		const fc = full.getContext("2d")!;
		const img = fc.createImageData(size, size);
		const pal = Array.from({length: 256}, (_, i) => landscapeColor(i));

		for(let i = 0; i < size * size; i++) {
			const c = pal[landscape[i]];
			let shade = 0.85 + (height[i] / 255) * 0.5;
			let [r, g, b] = c;
			const o = object[i];
			if((o >= 68 && o <= 80) || o === 84) { r = 0.1; g = 0.3; b = 0.1; shade = 1; }
			img.data.set([Math.min(255, r * shade * 255), Math.min(255, g * shade * 255), Math.min(255, b * shade * 255), 255], i * 4);
		}
		fc.putImageData(img, 0, 0);

		const base = document.createElement("canvas");
		base.width = this.minimap.width;
		base.height = this.minimap.height;
		const c = base.getContext("2d")!;
		const s = this.scale;
		c.imageSmoothingEnabled = true;
		c.imageSmoothingQuality = "high";
		c.setTransform(s, 0, 0.5 * s, -0.866 * s, 0, base.height);
		c.drawImage(full, 0, 0);
		c.setTransform(1, 0, 0, 1, 0, 0);
		void players;
		return base;
	}

	private toMinimap(gx: number, gy: number): [number, number]
	{
		return [gx * this.scale, this.minimap.height - gy * this.scale];
	}

	private bindMinimap(): void
	{
		const jump = (e: PointerEvent) => {
			const r = this.minimap.getBoundingClientRect();
			const px = (e.clientX - r.left) * (this.minimap.width / r.width);
			const py = (e.clientY - r.top) * (this.minimap.height / r.height);
			this.focusGround(px / this.scale, (this.minimap.height - py) / this.scale);
		};
		this.minimap.addEventListener("pointerdown", e => { this.dragging = true; this.minimap.setPointerCapture(e.pointerId); jump(e); });
		this.minimap.addEventListener("pointermove", e => { if(this.dragging) jump(e); });
		this.minimap.addEventListener("pointerup", () => { this.dragging = false; });
	}

	focusGround(gx: number, gy: number): void
	{
		const [mx, my] = this.world.mapPosFromGround(gx, gy);
		const [x, y, z] = this.world.worldPos(mx, my);
		this.camera.center = [x, y, z];
	}

	update(): void
	{
		const c = this.minimap.getContext("2d")!;
		c.drawImage(this.base, 0, 0);

		for(const p of this.world.data.players) {
			const [gx, gy] = this.world.worldPos(p.x, p.y);
			const [px, py] = this.toMinimap(gx, gy);
			c.fillStyle = "#fff";
			c.fillRect(px - 1.5, py - 1.5, 3, 3);
		}

		const [vw, vh] = this.camera.visibleSize();
		const [cx, cy] = this.camera.center;
		const [x0, y0] = this.toMinimap(cx - vw / 2, cy + vh / 2);
		c.strokeStyle = "#fff";
		c.lineWidth = 1;
		c.strokeRect(x0, y0, vw * this.scale, vh * this.scale);
		void GROUND_Y;
	}
}
