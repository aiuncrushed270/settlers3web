import * as mat4 from "./glmatrix/mat4.js";

// Settlers 3 style oblique view: ground squashed by cos(tilt), height scaled by sin(tilt)
export const TILT = Math.acos(1 / Math.sqrt(3));
export const GROUND_Y = Math.cos(TILT);
export const TRI_HEIGHT = Math.sqrt(3) / 2;

interface DisplayLike { width: number; height: number; }

export default class Camera
{
	mat = mat4.create();
	// world position (ground x, ground y, height) that is shown at the centre of the free viewport
	center: [number, number, number] = [0, 0, 0];
	// pixels per tile; zoom factor of the whole view
	scale = 32;
	// pixels at the left of the canvas covered by the HUD panel
	offsetLeft = 0;

	constructor(private display: DisplayLike) {}

	update(): void
	{
		const d = this.display;
		const m = this.mat;
		mat4.identity(m);
		// shift the centre into the visible area right of the HUD panel
		mat4.translate(m, m, [this.offsetLeft / d.width, 0, 0]);
		mat4.scale(m, m, [this.scale * 2 / d.width, this.scale * 2 / d.height, -1 / 256]);
		mat4.rotateX(m, m, -TILT);
		mat4.translate(m, m, [-this.center[0], -this.center[1], -this.center[2]]);
	}

	// size of the visible ground area in ground units
	visibleSize(): [number, number]
	{
		const d = this.display;
		return [(d.width - this.offsetLeft) / this.scale, d.height / (this.scale * GROUND_Y)];
	}

	pan(dxPixels: number, dyPixels: number): void
	{
		this.center[0] -= dxPixels / this.scale;
		this.center[1] += dyPixels / (this.scale * GROUND_Y);
	}

	zoom(factor: number): void
	{
		this.scale = Math.min(96, Math.max(8, this.scale * factor));
	}
}
