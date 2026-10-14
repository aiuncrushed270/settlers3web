import Shader from "./shader.js";
import Camera, { TRI_HEIGHT } from "./camera.ts";
import type { MapData } from "./mapfile.ts";
import { makeAtlas, SPRITE_CELL_W, SPRITE_CELL_H, ATLAS_COLS, ATLAS_ROWS, Sprite } from "./sprites.ts";

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
	uv = p.xy;
}
`;

const terrainFrag = `
uniform sampler2D detail;
in vec2 uv;
in vec3 tint;
in float light;
out vec4 color;

void main()
{
	float d = dot(texture(detail, uv / 6.0).rgb, vec3(0.30, 0.59, 0.11));
	float grain = 0.7 + 0.9 * d;
	color = vec4(tint * grain * light, 1.0);
}
`;

const spriteVert = `
uniform float mapsize;
uniform float heightScale;
uniform mat4 mat;
uniform vec2 pixelScale;     // 2/width, 2/height
uniform float zoom;          // pixels per tile
uniform sampler2D maptex;
uniform vec3 playerColors[20];
in vec4 inst;                // map x, map y, sprite, seed/player
in vec2 corner;
out vec2 uv;
out vec3 tint;

void main()
{
	ivec2 c = ivec2(int(inst.x), int(inst.y));
	float h = texelFetch(maptex, c, 0).r * 255.0 * heightScale;
	vec3 p = vec3(float(c.x) + float(c.y) * 0.5, float(c.y) * ${TRI_HEIGHT}, h);
	int sprite = int(inst.z);
	float seed = fract(inst.w * 0.6180339);
	bool tower = sprite == ${Sprite.Tower};
	float k = tower ? 1.0 : 0.85 + 0.3 * seed;
	vec2 size = vec2(${SPRITE_CELL_W / 32}, ${SPRITE_CELL_H / 32}) * k;
	if(tower) size *= 1.6;

	vec4 clip = mat * vec4(p, 1.0);
	clip.xy += vec2(corner.x - 0.5, corner.y) * size * zoom * pixelScale;
	clip.z -= 0.02;
	gl_Position = clip;

	float col = float(sprite % ${ATLAS_COLS});
	float row = float(sprite / ${ATLAS_COLS});
	uv = vec2((col + corner.x) / ${ATLAS_COLS}.0, (row + 1.0 - corner.y) / ${ATLAS_ROWS}.0);
	tint = tower ? playerColors[int(inst.w) % 20] : vec3(1.0);
}
`;

const spriteFrag = `
uniform sampler2D atlas;
in vec2 uv;
in vec3 tint;
out vec4 color;

void main()
{
	vec4 t = texture(atlas, uv);
	if(t.a < 0.5) discard;
	// pure magenta marks the player-colour area of a sprite
	float key = step(0.9, t.r) * step(t.g, 0.1) * step(0.9, t.b);
	color = vec4(mix(t.rgb, tint, key), 1.0);
}
`;

export interface WorldDisplay { gl: WebGL2RenderingContext; canvas: HTMLCanvasElement; width: number; height: number; }

export default class World
{
	readonly size: number;
	private gl: WebGL2RenderingContext;
	private terrain: Shader;
	private spriteShader: Shader;
	private indexBuf: WebGLBuffer;
	private indexCount: number;
	private mapTex: WebGLTexture;
	private paletteTex: WebGLTexture;
	private detailTex: WebGLTexture;
	private atlasTex: WebGLTexture;
	private instBuf: WebGLBuffer;
	private cornerBuf: WebGLBuffer;
	private vao: WebGLVertexArrayObject;
	private instCount = 0;

	constructor(private display: WorldDisplay, readonly data: MapData)
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

		// R = height, G = landscape code
		const texels = new Uint8Array(n * n * 4);
		for(let i = 0; i < n * n; i++) {
			texels[i * 4] = data.height[i];
			texels[i * 4 + 1] = data.landscape[i];
			texels[i * 4 + 2] = data.object[i];
			texels[i * 4 + 3] = 255;
		}
		this.mapTex = this.makeTexture(n, n, texels, false);

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
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		this.cornerBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

		this.instBuf = gl.createBuffer()!;
		this.vao = gl.createVertexArray()!;
		this.buildInstances();
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

	private buildInstances(): void
	{
		const gl = this.gl;
		const { size, object } = this.data;
		const list: number[] = [];

		for(let y = 0; y < size; y++) {
			for(let x = 0; x < size; x++) {
				const o = object[y * size + x];
				if(isTree(o)) list.push(x, y, treeSprite(o), (x * 7 + y * 13) & 255);
				else if(o >= 1 && o <= 8) list.push(x, y, Sprite.Stone, (x * 5 + y * 11) & 255);
			}
		}
		this.data.players.forEach((p, i) => {
			if(p.x < size && p.y < size) list.push(p.x, p.y, Sprite.Tower, i);
		});

		this.instCount = list.length / 4;
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.STATIC_DRAW);
		gl.bindVertexArray(null);
	}

	// world position (ground x, ground y, height) of a map tile
	worldPos(x: number, y: number): [number, number, number]
	{
		const xi = Math.min(this.size - 1, Math.max(0, Math.round(x)));
		const yi = Math.min(this.size - 1, Math.max(0, Math.round(y)));
		return [x + y * 0.5, y * TRI_HEIGHT, this.data.height[yi * this.size + xi] * HEIGHT_SCALE];
	}

	// inverse of the ground projection, ignoring height
	mapPosFromGround(gx: number, gy: number): [number, number]
	{
		const y = gy / TRI_HEIGHT;
		return [gx - y * 0.5, y];
	}

	draw(camera: Camera): void
	{
		const gl = this.gl;
		const d = this.display;
		const t = this.terrain;

		gl.clearColor(0.03, 0.05, 0.1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.DEPTH_TEST);

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
		this.bindTex(sp, "maptex", this.mapTex, 0);
		this.bindTex(sp, "atlas", this.atlasTex, 1);

		gl.bindVertexArray(this.vao);
		const instLoc = gl.getAttribLocation(sp, "inst");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
		gl.enableVertexAttribArray(instLoc);
		gl.vertexAttribPointer(instLoc, 4, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(instLoc, 1);
		const cornerLoc = gl.getAttribLocation(sp, "corner");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
		gl.enableVertexAttribArray(cornerLoc);
		gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(cornerLoc, 0);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instCount);
		gl.bindVertexArray(null);
	}

	private bindTex(prog: WebGLProgram, name: string, tex: WebGLTexture, unit: number): void
	{
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.uniform1i(gl.getUniformLocation(prog, name), unit);
	}
}
