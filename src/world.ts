import Shader from "./shader.js";
import Camera, { TRI_HEIGHT } from "./camera.ts";
import type { MapData } from "./mapfile.ts";
import * as mat4 from "./glmatrix/mat4.js";
import { ATLAS_COLS, ATLAS_ROWS, SPRITE_COUNT, Sprite, type SpriteInfo } from "./sprites.ts";

export const HEIGHT_SCALE = 0.1;
export const PLAYER_COLORS = [
	[0.25, 0.45, 1.0], [1.0, 0.2, 0.2], [0.2, 0.85, 0.3], [1.0, 0.9, 0.2],
	[0.9, 0.4, 1.0], [0.2, 0.9, 0.9], [1.0, 0.6, 0.15], [0.95, 0.95, 0.95],
	[0.55, 0.3, 0.15], [0.6, 0.9, 0.2], [0.2, 0.3, 0.6], [0.8, 0.2, 0.5],
	[0.4, 0.7, 0.7], [0.7, 0.7, 0.3], [0.5, 0.5, 0.5], [0.3, 0.1, 0.4],
	[0.9, 0.7, 0.7], [0.1, 0.5, 0.2], [0.7, 0.4, 0.2], [0.3, 0.3, 0.9],
];

// colour of a landscape code, derived from the original type table (high nibble = family)
export function landscapeColor(code: number): [number, number, number]
{
	const mix = (a: number[], b: number[], t: number): [number, number, number] =>
		[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
	const grass = [0.33, 0.52, 0.17], rock = [0.50, 0.46, 0.40], sand = [0.80, 0.72, 0.47];
	const desert = [0.78, 0.62, 0.33], moor = [0.30, 0.36, 0.18], mud = [0.40, 0.30, 0.20], snow = [0.93, 0.95, 0.97];
	const shallow = [0.22, 0.52, 0.72], deep = [0.07, 0.22, 0.45], river = [0.20, 0.46, 0.70];

	const family = code >> 4;
	const sub = code & 15;
	switch(family) {
		case 0: return mix(shallow, deep, Math.min(sub, 7) / 7);
		case 1: return sub === 1 ? mix(grass, rock, 0.5) : sub === 4 ? mix(grass, sand, 0.5) : sub === 5 ? mix(grass, moor, 0.5) : sub === 7 ? mix(grass, mud, 0.5) : [...grass] as [number, number, number];
		case 2: return sub === 0 ? [...rock] as [number, number, number] : sub === 3 ? mix(rock, snow, 0.5) : mix(grass, rock, 0.7);
		case 3: return [...sand] as [number, number, number];
		case 4: return sub === 0 ? [...desert] as [number, number, number] : mix(desert, sand, 0.5);
		case 5: return sub === 0 ? mix(moor, [0.2, 0.25, 0.12], 0.5) : [...moor] as [number, number, number];
		case 6: return [...river] as [number, number, number];
		case 8: return sub === 0 ? mix(rock, snow, 0.7) : [...snow] as [number, number, number];
		case 9: return sub === 0 ? mix(mud, [0.3, 0.22, 0.15], 0.5) : [...mud] as [number, number, number];
		default: return [...grass] as [number, number, number];
	}
}

function isTree(o: number): boolean { return (o >= 68 && o <= 80) || o === 84; }

function treeSprite(o: number): Sprite
{
	if(o === 68 || o === 69) return Sprite.Birch;
	if(o === 70 || o === 71) return Sprite.Elm;
	if(o === 78 || o === 79) return Sprite.Palm;
	if(o === 84) return Sprite.Sapling;
	return Sprite.Oak;
}

const terrainVert = `
uniform float mapsize;
uniform float heightScale;
uniform mat4 mat;
uniform sampler2D maptex;
uniform sampler2D palette;
out vec2 uv;
out vec3 tint;
out float light;
out float territory;

ivec2 clampCoord(ivec2 c) { int m = int(mapsize) - 1; return ivec2(clamp(c.x, 0, m), clamp(c.y, 0, m)); }

vec3 vertPos(ivec2 c)
{
	c = clampCoord(c);
	vec2 f = vec2(c);
	float h = texelFetch(maptex, c, 0).r * 255.0 * heightScale;
	return vec3(f.x + f.y * 0.5, f.y * ${TRI_HEIGHT}, h);
}

vec3 normalAt(ivec2 c)
{
	vec3 v = vertPos(c);
	vec3 r = vertPos(c + ivec2(1, 0)) - v;
	vec3 ru = vertPos(c + ivec2(0, 1)) - v;
	vec3 lu = vertPos(c + ivec2(-1, 1)) - v;
	vec3 l = vertPos(c + ivec2(-1, 0)) - v;
	vec3 ld = vertPos(c + ivec2(0, -1)) - v;
	vec3 rd = vertPos(c + ivec2(1, -1)) - v;
	return normalize(cross(r, ru) + cross(ru, lu) + cross(lu, l) + cross(l, ld) + cross(ld, rd) + cross(rd, r));
}

void main()
{
	int size = int(mapsize);
	ivec2 c = ivec2(gl_VertexID % size, gl_VertexID / size);
	vec3 p = vertPos(c);
	gl_Position = mat * vec4(p, 1.0);

	vec4 texel = texelFetch(maptex, c, 0);
	int land = int(texel.g * 255.0 + 0.5);
	tint = texelFetch(palette, ivec2(land, 0), 0).rgb;

	vec3 sun = normalize(vec3(-0.8, -0.6, 1.1));
	float level = sun.z;
	light = clamp(1.0 + 3.0 * (dot(normalAt(c), sun) - level), 0.45, 1.6);
	if(land < 16 || (land >> 4) == 6) light = 1.0;
	territory = texel.a < 0.99 ? 1.0 : 0.0;
	uv = p.xy;
}
`;

const terrainFrag = `
uniform sampler2D detail;
in vec2 uv;
in vec3 tint;
in float light;
in float territory;
out vec4 color;

void main()
{
	float d = dot(texture(detail, uv / 6.0).rgb, vec3(0.30, 0.59, 0.11));
	float grain = 0.7 + 0.9 * d;
	vec3 c = tint * grain * light;
	c = mix(c, c * vec3(0.9, 1.0, 1.15) + vec3(0.0, 0.02, 0.05), territory * 0.7);
	color = vec4(c, 1.0);
}
`;

const spriteVert = `
uniform float mapsize;
uniform float heightScale;
uniform mat4 mat;
uniform vec2 pixelScale;     // 2/width, 2/height
uniform float zoom;          // pixels per tile
uniform sampler2D maptex;
uniform vec4 spriteBox[${SPRITE_COUNT}];   // quad size in tiles, anchor
uniform vec3 spriteTint[${SPRITE_COUNT}];
uniform vec3 playerColors[20];
in vec4 instA;               // map x, map y, sprite, seed
in vec4 instB;               // player, alpha, progress, scale
in vec2 corner;
out vec2 uv;
out vec3 tint;
out float alpha;
out float up;
out float progress;
out float isSettler;
out vec3 playerColor;

float heightAt(ivec2 c)
{
	int m = int(mapsize) - 1;
	return texelFetch(maptex, ivec2(clamp(c.x, 0, m), clamp(c.y, 0, m)), 0).r * 255.0 * heightScale;
}

void main()
{
	vec2 m = instA.xy;
	ivec2 c0 = ivec2(floor(m));
	vec2 f = m - vec2(c0);
	float h = mix(mix(heightAt(c0), heightAt(c0 + ivec2(1, 0)), f.x), mix(heightAt(c0 + ivec2(0, 1)), heightAt(c0 + ivec2(1, 1)), f.x), f.y);
	vec3 p = vec3(m.x + m.y * 0.5, m.y * ${TRI_HEIGHT}, h);

	int sprite = int(instA.z);
	vec4 box = spriteBox[sprite];
	float seed = fract(instA.w * 0.6180339);
	float k = instB.w > 0.0 ? instB.w : 0.88 + 0.24 * seed;

	vec4 clip = mat * vec4(p, 1.0);
	vec2 off = (corner - box.zw) * box.xy * k;
	clip.xy += off * zoom * pixelScale;
	clip.z -= 0.02;
	gl_Position = clip;

	float col = float(sprite % ${ATLAS_COLS});
	float row = float(sprite / ${ATLAS_COLS});
	uv = vec2((col + corner.x) / ${ATLAS_COLS}.0, (row + 1.0 - corner.y) / ${ATLAS_ROWS}.0);
	tint = spriteTint[sprite];
	vec3 pc = playerColors[int(instB.x) % 20];
	alpha = instB.y;
	up = corner.y;
	progress = instB.z;
	isSettler = float(sprite == ${Sprite.Settler});
	playerColor = pc;
}
`;

const spriteFrag = `
uniform sampler2D atlas;
uniform vec3 ghostTint;
in vec2 uv;
in vec3 tint;
in vec3 playerColor;
in float alpha;
in float up;
in float progress;
in float isSettler;
out vec4 color;

void main()
{
	vec4 t = texture(atlas, uv);
	if(t.a < 0.5 || up > progress) discard;
	vec3 rgb = t.rgb * tint;
	// pure magenta marks the player-colour area of a painted sprite
	float key = step(0.9, t.r) * step(t.g, 0.1) * step(0.9, t.b);
	rgb = mix(rgb, playerColor, key);
	// blue shirt of the rendered settler
	float shirt = isSettler * smoothstep(0.22, 0.4, t.b - t.r);
	rgb = mix(rgb, playerColor * (0.35 + 0.9 * dot(t.rgb, vec3(0.3, 0.59, 0.11))), shirt);
	if(ghostTint.r >= 0.0 && alpha < 0.99) rgb = mix(rgb, ghostTint, 0.7);
	color = vec4(rgb, t.a * alpha);
}
`;

export interface WorldDisplay { gl: WebGL2RenderingContext; canvas: HTMLCanvasElement; width: number; height: number; }

export const FLOATS_PER_INSTANCE = 8;

export default class World
{
	readonly size: number;
	private gl: WebGL2RenderingContext;
	private terrain: Shader;
	private spriteShader: Shader;
	private indexBuf: WebGLBuffer;
	private indexCount: number;
	private mapTex: WebGLTexture;
	private texels: Uint8Array;
	private paletteTex: WebGLTexture;
	private detailTex: WebGLTexture;
	private atlasTex: WebGLTexture;
	private cornerBuf: WebGLBuffer;
	private staticBuf: WebGLBuffer;
	private dynamicBuf: WebGLBuffer;
	private staticCount = 0;
	private dynamicCount = 0;
	private spriteBox: Float32Array;
	private spriteTint: Float32Array;
	ghostTint: [number, number, number] = [-1, 0, 0];

	constructor(private display: WorldDisplay, readonly data: MapData, atlas: {canvas: HTMLCanvasElement, info: SpriteInfo[]})
	{
		const gl = this.gl = display.gl;
		const n = this.size = data.size;

		this.terrain = new Shader(display, terrainVert, terrainFrag);
		this.spriteShader = new Shader(display, spriteVert, spriteFrag);

		// triangle strip over the whole grid, rows stitched with degenerate triangles
		const idx = new Uint32Array((n - 1) * (n * 2 + 2));
		let k = 0;
		for(let y = 0, i = 0; y < n - 1; y++) {
			idx[k++] = i;
			for(let x = 0; x < n; x++, i++) {
				idx[k++] = i;
				idx[k++] = i + n;
			}
			idx[k++] = i + n - 1;
		}
		this.indexCount = k;
		this.indexBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, k), gl.STATIC_DRAW);

		// R = height, G = landscape code, B = object, A = 254 inside the player's territory
		this.texels = new Uint8Array(n * n * 4);
		for(let i = 0; i < n * n; i++) {
			this.texels[i * 4] = data.height[i];
			this.texels[i * 4 + 1] = data.landscape[i];
			this.texels[i * 4 + 2] = data.object[i];
			this.texels[i * 4 + 3] = 255;
		}
		this.mapTex = this.makeTexture(n, n, this.texels, false);

		const pal = new Uint8Array(256 * 4);
		for(let c = 0; c < 256; c++) {
			const col = landscapeColor(c);
			pal.set([col[0] * 255, col[1] * 255, col[2] * 255, 255], c * 4);
		}
		this.paletteTex = this.makeTexture(256, 1, pal, true);

		this.detailTex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([160, 160, 160, 255]));
		const img = new Image();
		img.onload = () => {
			gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.generateMipmap(gl.TEXTURE_2D);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		};
		img.src = new URL("gfx/grass2.png", document.baseURI).href;

		this.atlasTex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		this.spriteBox = new Float32Array(SPRITE_COUNT * 4);
		this.spriteTint = new Float32Array(SPRITE_COUNT * 3);
		atlas.info.forEach((si, i) => {
			this.spriteBox.set([si.w, si.h, si.ax, si.ay], i * 4);
			this.spriteTint.set(si.tint, i * 3);
		});

		this.cornerBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

		this.staticBuf = gl.createBuffer()!;
		this.dynamicBuf = gl.createBuffer()!;
		this.buildStaticInstances();
	}

	private makeTexture(w: number, h: number, data: Uint8Array, linear: boolean): WebGLTexture
	{
		const gl = this.gl;
		const t = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, t);
		const filter = linear ? gl.LINEAR : gl.NEAREST;
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
		return t;
	}

	// trees and stones from the map file; the start towers are regular buildings now
	private buildStaticInstances(): void
	{
		const gl = this.gl;
		const { size, object } = this.data;
		const list: number[] = [];

		for(let y = 0; y < size; y++) {
			for(let x = 0; x < size; x++) {
				const o = object[y * size + x];
				if(isTree(o)) list.push(x, y, treeSprite(o), (x * 7 + y * 13) & 255, 0, 1, 1, 0);
				else if(o >= 1 && o <= 8) list.push(x, y, Sprite.Stone, (x * 5 + y * 11) & 255, 0, 1, 1, 0);
			}
		}

		this.staticCount = list.length / FLOATS_PER_INSTANCE;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.STATIC_DRAW);
	}

	// buildings, settlers and the placement ghost; set once per frame
	setDynamic(list: number[]): void
	{
		const gl = this.gl;
		this.dynamicCount = list.length / FLOATS_PER_INSTANCE;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.DYNAMIC_DRAW);
	}

	// mark map tiles as belonging to the player (affects terrain shading)
	setTerritory(mask: Uint8Array): void
	{
		const gl = this.gl;
		for(let i = 0; i < mask.length; i++) this.texels[i * 4 + 3] = mask[i] ? 254 : 255;
		gl.bindTexture(gl.TEXTURE_2D, this.mapTex);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size, this.size, gl.RGBA, gl.UNSIGNED_BYTE, this.texels);
	}

	heightAt(x: number, y: number): number
	{
		const n = this.size;
		const cx = Math.min(n - 1.001, Math.max(0, x));
		const cy = Math.min(n - 1.001, Math.max(0, y));
		const x0 = Math.floor(cx), y0 = Math.floor(cy);
		const fx = cx - x0, fy = cy - y0;
		const h = this.data.height;
		const a = h[y0 * n + x0] * (1 - fx) + h[y0 * n + x0 + 1] * fx;
		const b = h[(y0 + 1) * n + x0] * (1 - fx) + h[(y0 + 1) * n + x0 + 1] * fx;
		return (a * (1 - fy) + b * fy) * HEIGHT_SCALE;
	}

	// world position (ground x, ground y, height) of a map position
	worldPos(x: number, y: number): [number, number, number]
	{
		return [x + y * 0.5, y * TRI_HEIGHT, this.heightAt(x, y)];
	}

	// inverse of the ground projection, ignoring height
	mapPosFromGround(gx: number, gy: number): [number, number]
	{
		const y = gy / TRI_HEIGHT;
		return [gx - y * 0.5, y];
	}

	// map position under a canvas pixel, found by marching the view ray down to the terrain surface
	pick(camera: Camera, px: number, py: number): [number, number] | null
	{
		const d = this.display;
		const inv = mat4.create();
		if(!mat4.invert(inv, camera.mat)) return null;
		const nx = px / d.width * 2 - 1;
		const ny = 1 - py / d.height * 2;
		const unproject = (z: number): number[] => {
			const v = [nx, ny, z, 1];
			const r = [0, 0, 0, 0];
			for(let i = 0; i < 4; i++) r[i] = inv[i] * v[0] + inv[4 + i] * v[1] + inv[8 + i] * v[2] + inv[12 + i] * v[3];
			return [r[0] / r[3], r[1] / r[3], r[2] / r[3]];
		};
		const a = unproject(-1), b = unproject(1);
		const at = (t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
		const above = (t: number): boolean => {
			const [gx, gy, z] = at(t);
			const [mx, my] = this.mapPosFromGround(gx, gy);
			return z >= this.heightAt(mx, my);
		};

		let t0 = 0;
		let found = false;
		const steps = 400;
		for(let i = 1; i <= steps; i++) {
			if(!above(i / steps)) { found = true; break; }
			t0 = i / steps;
		}
		if(!found) return null;
		let lo = t0, hi = t0 + 1 / steps;
		for(let i = 0; i < 20; i++) {
			const mid = (lo + hi) / 2;
			if(above(mid)) lo = mid; else hi = mid;
		}
		const [gx, gy] = at(lo);
		const [mx, my] = this.mapPosFromGround(gx, gy);
		if(mx < 0 || my < 0 || mx > this.size - 1 || my > this.size - 1) return null;
		return [mx, my];
	}

	draw(camera: Camera): void
	{
		const gl = this.gl;
		const d = this.display;
		const t = this.terrain;

		gl.clearColor(0.03, 0.05, 0.1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);

		t.use();
		const prog = t.prog;
		t.setFloat("mapsize", this.size);
		t.setFloat("heightScale", HEIGHT_SCALE);
		t.setCamera(camera);
		this.bindTex(prog, "maptex", this.mapTex, 0);
		this.bindTex(prog, "palette", this.paletteTex, 1);
		this.bindTex(prog, "detail", this.detailTex, 2);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuf);
		gl.drawElements(gl.TRIANGLE_STRIP, this.indexCount, gl.UNSIGNED_INT, 0);

		const s = this.spriteShader;
		s.use();
		const sp = s.prog;
		s.setFloat("mapsize", this.size);
		s.setFloat("heightScale", HEIGHT_SCALE);
		s.setFloat("zoom", camera.scale);
		s.setVec2("pixelScale", [2 / d.width, 2 / d.height]);
		s.setCamera(camera);
		gl.uniform3fv(gl.getUniformLocation(sp, "playerColors"), new Float32Array(PLAYER_COLORS.flat()));
		gl.uniform4fv(gl.getUniformLocation(sp, "spriteBox"), this.spriteBox);
		gl.uniform3fv(gl.getUniformLocation(sp, "spriteTint"), this.spriteTint);
		gl.uniform3f(gl.getUniformLocation(sp, "ghostTint"), -1, 0, 0);
		this.bindTex(sp, "maptex", this.mapTex, 0);
		this.bindTex(sp, "atlas", this.atlasTex, 1);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		this.drawInstances(sp, this.staticBuf, this.staticCount);
		gl.uniform3f(gl.getUniformLocation(sp, "ghostTint"), ...this.ghostTint);
		this.drawInstances(sp, this.dynamicBuf, this.dynamicCount);
		gl.disable(gl.BLEND);
	}

	private drawInstances(prog: WebGLProgram, buf: WebGLBuffer, count: number): void
	{
		if(!count) return;
		const gl = this.gl;
		const stride = FLOATS_PER_INSTANCE * 4;
		const bind = (name: string, size: number, offset: number, buffer: WebGLBuffer, divisor: number, strideBytes: number) => {
			const loc = gl.getAttribLocation(prog, name);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, strideBytes, offset);
			gl.vertexAttribDivisor(loc, divisor);
		};
		bind("instA", 4, 0, buf, 1, stride);
		bind("instB", 4, 16, buf, 1, stride);
		bind("corner", 2, 0, this.cornerBuf, 0, 0);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
	}

	private bindTex(prog: WebGLProgram, name: string, tex: WebGLTexture, unit: number): void
	{
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.uniform1i(gl.getUniformLocation(prog, name), unit);
	}
}
