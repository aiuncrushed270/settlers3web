import Menu from "./menu.js";
import "./menu.css";
import "./hud.css";

const menu = new Menu(document.getElementById("ui"), async map => {
	document.getElementById("ui").hidden = true;
	const game = await import("./game.ts");
	game.default(map);
});
menu.showMain();
