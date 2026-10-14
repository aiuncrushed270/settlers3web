import Display from "./display.js";
import Camera from "./camera.ts";
import World, { type WorldDisplay } from "./world.ts";
import Hud, { PANEL_WIDTH } from "./hud.ts";
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
	const world = new World(display as unknown as WorldDisplay, data);
	const hud = new Hud(world, camera, info);
	document.body.append(hud.root);
	camera.offsetLeft = PANEL_WIDTH;
	camera.scale = 32;

	const start = data.players[0] ?? {x: data.size / 2, y: data.size / 2};
	const [sx, sy, sz] = world.worldPos(start.x, start.y);
	camera.center = [sx, sy, sz];

	// input: drag with any button to pan, wheel to zoom, arrow keys / WASD to scroll
	const canvas = display.canvas as HTMLCanvasElement;
	let drag: {x: number, y: number} | null = null;
	canvas.addEventListener("contextmenu", e => e.preventDefault());
	canvas.addEventListener("pointerdown", e => { drag = {x: e.clientX, y: e.clientY}; canvas.setPointerCapture(e.pointerId); });
	canvas.addEventListener("pointermove", e => {
		if(!drag) return;
		camera.pan(e.clientX - drag.x, e.clientY - drag.y);
		drag = {x: e.clientX, y: e.clientY};
	});
	canvas.addEventListener("pointerup", () => { drag = null; });
	canvas.addEventListener("wheel", e => {
		e.preventDefault();
		camera.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
	}, {passive: false});

	const keys = new Set<string>();
	window.addEventListener("keydown", e => keys.add(e.key.toLowerCase()));
	window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

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

		camera.update();
		world.draw(camera);
		hud.update();
	};
}
