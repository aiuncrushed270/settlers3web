import Menu from "./menu.js";

const menu = new Menu(document.getElementById("ui"), async map => {
	document.getElementById("ui").hidden = true;
	const game = await import("./game.js");
	game.default(map);
});
menu.showMain();
