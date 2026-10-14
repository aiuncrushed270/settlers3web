import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMap, checksum } from "../src/mapfile.ts";

function encrypt(data: number[], seed: number): number[]
{
	let key = seed & 0xff;
	return data.map(plain => {
		const c = (plain ^ key) & 0xff;
		key = ((key << 1) ^ plain) & 0xff;
		return c;
	});
}

const le32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];

function part(type: number, body: number[]): number[]
{
	return [...le32(type), ...le32(body.length + 8), ...encrypt(body, type)];
}

test("parses a synthetic map and round-trips the cipher", () => {
	const size = 2;
	const name = [...Buffer.from("Alice")].concat(new Array(28).fill(0));
	const cells = [10, 0x10, 70, 0, 0, 0,  20, 0x00, 0, 0, 0, 0,  30, 0x20, 0, 0, 0, 0,  40, 0x30, 0, 0, 0, 0];
	const body = [
		...part(1, [...le32(0), ...le32(1), ...le32(2)]),
		...part(2, [...le32(0), ...le32(1), ...le32(0), ...name]),
		...part(6, [...le32(size), ...cells]),
		...le32(0), ...le32(8),
	];
	const file = new Uint8Array([0, 0, 0, 0, ...le32(0x0a), ...body]);
	file.set(le32(checksum(file)), 0);

	const m = parseMap(file);
	assert.equal(m.size, 2);
	assert.equal(m.checksumOk, true);
	assert.equal(m.singlePlayer, false);
	assert.deepEqual(m.players, [{nation: 0, x: 1, y: 0, name: "Alice"}]);
	assert.deepEqual([...m.height], [10, 20, 30, 40]);
	assert.deepEqual([...m.landscape], [0x10, 0, 0x20, 0x30]);
	assert.equal(m.object[0], 70);
});

test("rejects unknown versions", () => {
	assert.throws(() => parseMap(new Uint8Array(32)), /version/);
});
