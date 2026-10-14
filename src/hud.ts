import Camera, { GROUND_Y } from "./camera.ts";
import World, { landscapeColor } from "./world.ts";
import type { MapInfo } from "./types.ts";
import GameState, { CATEGORIES, GOOD_NAMES, SETTLER_NAMES, type BuildingDef } from "./state.ts";

export const PANEL_WIDTH = 224;

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

	private tab = "build";
	private category = 0;
	private selected: BuildingDef | null = null;
	private content = el("div", "tab-content");
	private info: MapInfo;
	private lastRefresh = 0;
	private signature = "";
	private message = el("div", "message");

	constructor(private world: World, private camera: Camera, info: MapInfo, private state: GameState,
		private onSelect: (def: BuildingDef | null) => void)
	{
		this.info = info;
		const data = world.data;
		this.root.style.width = PANEL_WIDTH + "px";

		const mm = el("div", "mm-frame");
		this.minimap.width = PANEL_WIDTH - 12;
		this.scale = this.minimap.width / (data.size * 1.5);
		this.minimap.height = Math.ceil(data.size * 0.866 * this.scale);
		mm.append(this.minimap);

		const tabs = el("div", "tabs");
		const content = this.content;
		const buttons = TABS.map(t => {
			const b = el("button", "tab");
			b.type = "button";
			b.title = t.label;
			b.append(el("span", "glyph", t.glyph), el("span", "tab-label", t.label));
			b.onclick = () => {
				buttons.forEach(o => o.classList.toggle("active", o === b));
				this.tab = t.id;
				this.refresh();
			};
			return b;
		});
		tabs.append(...buttons);

		const bar = el("div", "bar");
		const barActions: [string, string, () => void][] = [
			["⚔", "Militär (noch nicht verfügbar)", () => {}],
			["≡", "Karteninfo", () => { this.tab = "info"; buttons.forEach(o => o.classList.remove("active")); this.refresh(); }],
			["✉", "Nachrichten (noch nicht verfügbar)", () => {}],
			["☰", "Spiel verlassen", () => location.reload()],
		];
		for(const [glyph, label, action] of barActions) {
			const b = el("button", "bar-btn", glyph);
			b.type = "button";
			b.title = label;
			b.onclick = action;
			bar.append(b);
		}

		this.root.append(mm, tabs, content, this.message, bar);
		buttons[0].click();

		this.base = this.renderMinimapBase();
		this.bindMinimap();
	}

	setMessage(text: string): void
	{
		this.message.textContent = text;
	}

	deselect(): void
	{
		this.selected = null;
		this.onSelect(null);
		this.refresh();
	}

	// rebuilds the tab content; cheap enough to call a few times per second
	refresh(): void
	{
		const rows = (list: [string, string][]) => list.map(([k, v]) => {
			const row = el("div", "row");
			row.append(el("span", "k", k), el("span", "v", v));
			return row;
		});
		// rebuilding the DOM swallows clicks that are in flight, so only do it when something changed
		const sig = JSON.stringify([this.tab, this.category, this.selected?.id, this.state.stock, this.state.settlers, this.info.n]);
		if(sig === this.signature) return;
		this.signature = sig;

		const content = this.content;
		const scroll = content.scrollTop;

		if(this.tab === "build") {
			const cats = el("div", "cats");
			CATEGORIES.forEach((c, i) => {
				const b = el("button", "cat" + (i === this.category ? " active" : ""), c.label);
				b.type = "button";
				b.onclick = () => { this.category = i; this.refresh(); };
				cats.append(b);
			});
			const list = el("div", "blist");
			for(const def of CATEGORIES[this.category].buildings) {
				const b = el("button", "bitem" + (this.state.canAfford(def) ? "" : " poor") + (this.selected === def ? " sel" : ""));
				b.type = "button";
				const cost = Object.entries(def.cost).map(([g, n]) => `${n} ${GOOD_NAMES[g] ?? g}`).join(" · ");
				b.append(el("span", "bname", def.name), el("span", "bcost", cost));
				b.onclick = () => {
					this.selected = this.selected === def ? null : def;
					this.onSelect(this.selected);
					this.refresh();
				};
				list.append(b);
			}
			content.replaceChildren(cats, list);
		}
		else if(this.tab === "goods") {
			content.replaceChildren(...rows(Object.entries(GOOD_NAMES).filter(([g]) => this.state.stock[g] !== undefined)
				.map(([g, name]) => [name, String(this.state.stock[g])])));
		}
		else if(this.tab === "settlers") {
			content.replaceChildren(...rows(Object.entries(SETTLER_NAMES).filter(([g]) => this.state.settlers[g] !== undefined)
				.map(([g, name]) => [name, String(this.state.settlers[g])])));
		}
		else {
			const data = this.world.data;
			content.replaceChildren(...rows([
				["Karte", this.info.n], ["Autor", this.info.a], ["Größe", `${data.size} × ${data.size}`],
				["Spieler", String(data.players.length || this.info.p)], ["Startwaren", {LG: "Wenig", MG: "Mittel", HG: "Viel"}[this.info.g] ?? this.info.g],
			]));
		}
		content.scrollTop = scroll;
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
		const now = performance.now();
		if(now - this.lastRefresh > 400 && this.tab !== "info") {
			this.lastRefresh = now;
			this.refresh();
		}

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
