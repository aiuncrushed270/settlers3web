import Display from "./display.js";
import Camera from "./camera.ts";
import World, { type WorldDisplay } from "./world.ts";
import Hud, { PANEL_WIDTH } from "./hud.ts";
import GameState, { type BuildingDef, type StartLevel } from "./state.ts";
import { makeAtlas, Sprite } from "./sprites.ts";
import { parseMap, type MapData } from "./mapfile.ts";
import type { MapInfo } from "./types.ts";

const MAP_BASE = "https://raw.githubusercontent.com/settlers-united/s3-maps/main/";
const KEY_PAN_SPEED = 900; // pixels per second at any zoom

function overlay(text: string): { set(t: string, pct?: number): void; fail(t: string): void; remove(): void }
{
	const root = document.getElementById("ui")!;
	const wrap = document.createElement("div");
	wrap.className = "screen";
	const box = document.createElement("div");
	box.className = "menu loading";
	const label = document.createElement("p");
	const bar = document.createElement("progress");
	bar.max = 100;
	box.append(label, bar);
	wrap.append(box);
	root.hidden = false;
	root.replaceChildren(wrap);
	label.textContent = text;

	return {
		set(t, pct) { label.textContent = t; if(pct === undefined) bar.removeAttribute("value"); else bar.value = pct; },
		fail(t) {
			label.textContent = t;
			bar.remove();
			const back = document.createElement("button");
			back.className = "btn";
			back.textContent = "Zurück";
			back.onclick = () => location.reload();
			box.append(back);
		},
		remove() { root.hidden = true; root.replaceChildren(); },
	};
}

async function download(url: string, onProgress: (pct?: number) => void): Promise<Uint8Array>
{
	const res = await fetch(url);
	if(!res.ok) throw new Error(`HTTP ${res.status}`);
	const total = Number(res.headers.get("content-length")) || 0;
	if(!res.body) return new Uint8Array(await res.arrayBuffer());

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let got = 0;
	for(;;) {
		const { done, value } = await reader.read();
		if(done) break;
		chunks.push(value);
		got += value.length;
		onProgress(total ? Math.round(got / total * 100) : undefined);
	}
	const out = new Uint8Array(got);
	let o = 0;
	for(const c of chunks) { out.set(c, o); o += c.length; }
	return out;
}

// the remote index is the primary source; a copy shipped with the page is the fallback
async function fetchMap(info: MapInfo, onProgress: (pct?: number) => void): Promise<MapData>
{
	const file = info.u.split("/").pop()!;
	const local = (name: string) => new URL(`maps/${name}`, document.baseURI).href;
	// the base64 variant exists for hosts that only serve text files
	const sources = [MAP_BASE + info.u, local(file), local(file + ".b64.json")];
	let lastError: unknown;

	for(const url of sources) {
		try {
			const bytes = await download(url, onProgress);
			if(url.endsWith(".b64.json")) {
				const bin = atob(JSON.parse(new TextDecoder().decode(bytes)));
				return parseMap(Uint8Array.from(bin, c => c.charCodeAt(0)));
			}
			return parseMap(bytes);
		} catch(e) {
			lastError = e;
		}
	}
	throw lastError;
}

export default async function startGame(info: MapInfo): Promise<void>
{
	const ui = overlay(`Karte „${info.n}“ wird geladen…`);

	let data: MapData;
	try {
		data = await fetchMap(info, pct => ui.set(`Karte „${info.n}“ wird geladen…`, pct));
	} catch(e) {
		ui.fail(`Die Karte konnte nicht geladen werden (${e instanceof Error ? e.message : e}).`);
		return;
	}
	ui.remove();

	const display = new Display();
	if(!display.gl) {
		display.canvas.remove();
		overlay("").fail("This browser does not support WebGL 2.");
		return;
	}
	const camera = new Camera(display);
	const atlas = await makeAtlas();
	const world = new World(display as unknown as WorldDisplay, data, atlas);
	const state = new GameState(data, (["LG", "MG", "HG"].includes(info.g) ? info.g : "HG") as StartLevel);

	let building: BuildingDef | null = null;
	const hud = new Hud(world, camera, info, state, def => { building = def; hud.setMessage(def ? `${def.name}: Ort wählen (Rechtsklick/Esc bricht ab)` : ""); });
	document.body.append(hud.root);
	camera.offsetLeft = PANEL_WIDTH;
	camera.scale = 32;

	const start = data.players[0] ?? {x: data.size / 2, y: data.size / 2};
	const [sx, sy, sz] = world.worldPos(start.x, start.y);
	camera.center = [sx, sy, sz];

	// idle bearers wandering around the start tower
	const wanderers = Array.from({length: Math.min(state.settlers.bearer ?? 0, 20)}, (_, i) => {
		const w = {x: start.x + 3 + (i % 5), y: start.y - 3 - Math.floor(i / 5), tx: 0, ty: 0, wait: Math.random() * 3, seed: i * 37};
		w.tx = w.x; w.ty = w.y;
		return w;
	});
	const walkable = (x: number, y: number) => {
		const i = Math.round(y) * data.size + Math.round(x);
		const o = data.object[i];
		return data.landscape[i] === 0x10 && !((o >= 68 && o <= 80) || o === 84 || (o >= 1 && o <= 8));
	};

	// input: drag to pan, click to place a building, wheel to zoom, arrow keys / WASD to scroll
	const canvas = display.canvas as HTMLCanvasElement;
	let drag: {x: number, y: number, moved: boolean} | null = null;
	let pointer: {x: number, y: number} | null = null;
	const cancelBuild = () => hud.deselect();

	canvas.addEventListener("contextmenu", e => { e.preventDefault(); if(building) cancelBuild(); });
	canvas.addEventListener("pointerdown", e => { drag = {x: e.clientX, y: e.clientY, moved: false}; canvas.setPointerCapture(e.pointerId); });
	canvas.addEventListener("pointermove", e => {
		pointer = {x: e.clientX, y: e.clientY};
		if(!drag) return;
		if(Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
		if(drag.moved) {
			camera.pan(e.movementX, e.movementY);
		}
	});
	canvas.addEventListener("pointerleave", () => { pointer = null; });
	canvas.addEventListener("pointerup", e => {
		const wasClick = drag && !drag.moved && e.button === 0;
		drag = null;
		if(wasClick && building) {
			const tile = world.pick(camera, e.clientX, e.clientY);
			if(!tile) return;
			const res = state.place(building, Math.round(tile[0]), Math.round(tile[1]));
			hud.setMessage(res.ok ? `${building.name} wird gebaut` : res.reason);
			if(res.ok && !state.canAfford(building)) cancelBuild();
		}
	});
	canvas.addEventListener("wheel", e => {
		e.preventDefault();
		camera.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
	}, {passive: false});

	const keys = new Set<string>();
	window.addEventListener("keydown", e => {
		if(e.key === "Escape" && building) cancelBuild();
		keys.add(e.key.toLowerCase());
	});
	window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

	const spriteFor = (def: BuildingDef): {sprite: Sprite, scale: number} => {
		if(def.territory > 0 || def.id === "lookout_tower") return {sprite: Sprite.Tower, scale: def.id === "castle" ? 1.7 : def.id === "big_tower" ? 1.3 : def.id === "lookout_tower" ? 0.85 : 1};
		if(def.mine) return {sprite: Sprite.Mine, scale: 1};
		return {sprite: Sprite.House, scale: def.blocked.length >= 90 ? 2 : def.blocked.length >= 60 ? 1.5 : 1.2};
	};

	let last = performance.now();
	display.frame = () => {
		const now = performance.now();
		const dt = Math.min(0.1, (now - last) / 1000);
		last = now;

		const step = KEY_PAN_SPEED * dt;
		const dx = (keys.has("arrowleft") || keys.has("a") ? 1 : 0) - (keys.has("arrowright") || keys.has("d") ? 1 : 0);
		const dy = (keys.has("arrowup") || keys.has("w") ? 1 : 0) - (keys.has("arrowdown") || keys.has("s") ? 1 : 0);
		if(dx || dy) camera.pan(dx * step, dy * step);

		// keep the focus point on the terrain surface
		const [mx, my] = world.mapPosFromGround(camera.center[0], camera.center[1]);
		camera.center[2] = world.worldPos(mx, my)[2];

		state.update(dt);
		if(state.territoryDirty) { world.setTerritory(state.territory); state.territoryDirty = false; }

		for(const w of wanderers) {
			const dx = w.tx - w.x, dy = w.ty - w.y, dist = Math.hypot(dx, dy);
			if(dist < 0.05) {
				w.wait -= dt;
				if(w.wait <= 0) {
					const nx = start.x + (Math.random() - 0.5) * 14, ny = start.y + (Math.random() - 0.5) * 14;
					if(walkable(nx, ny)) { w.tx = nx; w.ty = ny; }
					w.wait = 1 + Math.random() * 4;
				}
			}
			else {
				const step = Math.min(dist, 0.9 * dt);
				w.x += dx / dist * step;
				w.y += dy / dist * step;
			}
		}

		const dyn: number[] = [];
		for(const b of state.buildings) {
			const { sprite, scale } = spriteFor(b.def);
			dyn.push(b.x, b.y, sprite, 0, b.owner, 1, b.progress, scale);
		}
		for(const w of wanderers) dyn.push(w.x, w.y, Sprite.Settler, w.seed, state.player, 1, 1, 1);

		if(building && pointer) {
			const rect = canvas.getBoundingClientRect();
			const tile = world.pick(camera, pointer.x - rect.left, pointer.y - rect.top);
			if(tile) {
				const tx = Math.round(tile[0]), ty = Math.round(tile[1]);
				const { sprite, scale } = spriteFor(building);
				dyn.push(tx, ty, sprite, 0, state.player, 0.65, 1, scale);
				world.ghostTint = state.check(building, tx, ty).ok ? [0.3, 1, 0.3] : [1, 0.25, 0.25];
			}
		}
		world.setDynamic(dyn);

		camera.update();
		world.draw(camera);
		hud.update();
	};
}
