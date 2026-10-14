// Reader for the original Settlers 3 .map format (versions 0x0A and 0x0B, Amazons).
// Layout and cipher follow the community documentation as implemented in jsettlers/settlers-remake.

export interface PlayerStart
{
	nation: number;
	x: number;
	y: number;
	name: string;
}

export interface MapData
{
	size: number;
	singlePlayer: boolean;
	startResources: number;
	players: PlayerStart[];
	height: Uint8Array;
	landscape: Uint8Array;
	object: Uint8Array;
	accessible: Uint8Array;
	checksumOk: boolean;
}

const PART_INFO = 1;
const PART_PLAYERS = 2;
const PART_AREA = 6;

const FILE_VERSIONS = [0x0a, 0x0b];
const PLAYER_STRIDE = 45;

function u32(d: Uint8Array, o: number): number
{
	return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
}

export function checksum(d: Uint8Array): number
{
	const count = d.length & ~3;
	let sum = 0;

	for(let i = 8; i < count; i += 4) {
		sum = ((sum >>> 31) | ((sum << 1) ^ u32(d, i))) | 0;
	}

	return sum >>> 0;
}

// each part is encrypted separately with a running key seeded by the part type
function decrypt(d: Uint8Array, offset: number, size: number, seed: number): void
{
	let key = seed & 0xff;

	for(let i = offset, end = offset + size; i < end; i++) {
		const plain = (d[i] ^ key) & 0xff;
		key = ((key << 1) ^ plain) & 0xff;
		d[i] = plain;
	}
}

function cstring(d: Uint8Array, offset: number, max: number): string
{
	let end = offset;
	while(end < offset + max && d[end] !== 0) end++;
	let s = "";
	for(let i = offset; i < end; i++) s += String.fromCharCode(d[i]);
	return s;
}

export function parseMap(input: ArrayBuffer | Uint8Array): MapData
{
	const d = new Uint8Array(input instanceof Uint8Array ? input.slice() : input.slice(0));

	if(d.length < 16) throw new Error("Map file is too short");

	const version = u32(d, 4);
	if(!FILE_VERSIONS.includes(version)) throw new Error(`Unknown map file version ${version}`);

	const checksumOk = checksum(d) === u32(d, 0);
	const parts = new Map<number, {offset: number, size: number}>();

	let pos = 8;
	let type: number;
	do {
		type = u32(d, pos) & 0xffff;
		const len = u32(d, pos + 4);
		if(type !== 0 && len >= 8 && pos + len <= d.length) {
			const offset = pos + 8;
			const size = len - 8;
			decrypt(d, offset, size, type);
			parts.set(type, {offset, size});
		}
		pos += len;
	} while(type !== 0 && pos + 8 <= d.length);

	const info = parts.get(PART_INFO);
	const area = parts.get(PART_AREA);
	if(!info || !area) throw new Error("Map file has no info or area part");

	const singlePlayer = u32(d, info.offset) === 1;
	const playerCount = u32(d, info.offset + 4);
	const startResources = u32(d, info.offset + 8);

	const players: PlayerStart[] = [];
	const pl = parts.get(PART_PLAYERS);
	if(pl) {
		for(let i = 0; i < playerCount && (i + 1) * PLAYER_STRIDE <= pl.size; i++) {
			const o = pl.offset + i * PLAYER_STRIDE;
			players.push({nation: u32(d, o), x: u32(d, o + 4), y: u32(d, o + 8), name: cstring(d, o + 12, 33)});
		}
	}

	const size = u32(d, area.offset);
	const count = size * size;
	if(size === 0 || size > 4096 || 4 + count * 6 > area.size) throw new Error("Map area part is malformed");

	const height = new Uint8Array(count);
	const landscape = new Uint8Array(count);
	const object = new Uint8Array(count);
	const accessible = new Uint8Array(count);

	for(let i = 0, p = area.offset + 4; i < count; i++, p += 6) {
		height[i] = d[p];
		landscape[i] = d[p + 1];
		object[i] = d[p + 2];
		accessible[i] = d[p + 4];
	}

	return {size, singlePlayer, startResources, players, height, landscape, object, accessible, checksumOk};
}
