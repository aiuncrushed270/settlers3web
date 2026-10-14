const PAGE_SIZE = 12;
const MAP_BASE = "https://raw.githubusercontent.com/settlers-united/s3-maps/main/";
const GOODS = {LG: "Low goods", MG: "Medium goods", HG: "High goods"};

function el(tag, cls, text)
{
	const e = document.createElement(tag);
	if(cls) e.className = cls;
	if(text !== undefined) e.textContent = text;
	return e;
}

function button(label, onclick)
{
	const b = el("button", "btn", label);
	b.type = "button";
	b.onclick = onclick;
	return b;
}

// map list is a snapshot of settlers-united.com/en/maps (index.json of the s3-maps repository)
export default class Menu
{
	constructor(root, onStart)
	{
		this.root = root;
		this.onStart = onStart;
		this.maps = null;
	}

	show(...children)
	{
		const screen = el("div", "screen");
		this.root.replaceChildren(screen);
		screen.append(...children);
		return screen;
	}

	title()
	{
		const t = el("div", "title");
		t.append(el("div", "small", "DIE SIEDLER"), el("div", "big", "III"), el("div", "sub", "YASC · WEB EDITION"));
		return t;
	}

	showMain()
	{
		const menu = el("div", "menu");
		menu.append(
			button("Multiplayer-Spiel Internet", () => this.showMaps()),
			el("div", "gap"),
			button("Credits", () => this.showCredits()),
			button("Spiel verlassen", () => { try { window.close(); } catch(e) {} this.showMain(); })
		);
		this.show(this.title(), menu, el("div", "version", "Version 0.1"));
	}

	showCredits()
	{
		const menu = el("div", "menu");
		menu.append(
			el("p", "", "A web-based clone of Settlers 3. Map list courtesy of settlers-united.com."),
			button("Zurück", () => this.showMain())
		);
		this.show(this.title(), menu);
	}

	async loadMaps()
	{
		if(!this.maps) this.maps = await (await fetch(new URL("./maps.json", import.meta.url))).json();
		return this.maps;
	}

	async showMaps()
	{
		const state = {q: "", players: "", goods: "", sort: "new", page: 0, sel: null};

		const panel = el("div", "panel");
		const filters = el("div", "filters");
		const q = el("input"); q.type = "search"; q.placeholder = "Search maps or authors"; q.id = "q";
		const players = el("select"); players.id = "players";
		const goods = el("select"); goods.id = "goods";
		const sort = el("select"); sort.id = "sort";
		players.add(new Option("Any number of players", ""));
		goods.add(new Option("Any goods", ""));
		for(const g in GOODS) goods.add(new Option(GOODS[g], g));
		sort.add(new Option("Newest first", "new"));
		sort.add(new Option("Name A–Z", "name"));
		sort.add(new Option("Most players", "players"));
		filters.append(q, players, goods, sort);

		const grid = el("div", "grid");
		const pager = el("div", "pager");
		const start = button("Spiel starten", () => this.onStart(state.sel));
		start.disabled = true;
		const actions = el("div", "actions");
		actions.append(button("Zurück", () => this.showMain()), start);
		panel.append(el("h2", "", "Karte wählen"), filters, grid, pager, actions);
		this.show(this.title(), panel);
		grid.append(el("div", "empty", "Loading maps…"));

		let maps;
		try { maps = await this.loadMaps(); }
		catch(e) { grid.replaceChildren(el("div", "empty", "Could not load the map list.")); return; }

		const counts = [...new Set(maps.map(m => m.p))].sort((a, b) => a - b);
		for(const c of counts) players.add(new Option(c + " players", String(c)));

		const render = () => {
			const term = state.q.trim().toLowerCase();
			let list = maps.filter(m =>
				(!state.players || m.p === +state.players) &&
				(!state.goods || m.g === state.goods) &&
				(!term || m.n.toLowerCase().includes(term) || m.a.toLowerCase().includes(term)));
			if(state.sort === "name") list = [...list].sort((a, b) => a.n.localeCompare(b.n));
			if(state.sort === "players") list = [...list].sort((a, b) => b.p - a.p);
			const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
			state.page = Math.min(state.page, pages - 1);
			const rows = list.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);

			grid.replaceChildren(...rows.map(m => {
				const c = el("button", "btn card" + (state.sel === m ? " sel" : ""));
				c.type = "button";
				const img = el("img", "thumb");
				img.loading = "lazy"; img.alt = ""; img.width = img.height = 210;
				img.src = MAP_BASE + m.u.replace(/[^/]*$/, "preview.png");
				img.onerror = () => img.remove();
				const meta = el("div", "meta");
				meta.append(el("span", "", m.p + " players"), el("span", "", m.g), el("span", "", m.d));
				c.append(img, el("div", "name", m.n), el("div", "", "by " + m.a), meta);
				c.onclick = () => { state.sel = m; start.disabled = false; render(); };
				return c;
			}));
			if(!rows.length) grid.append(el("div", "empty", "No maps match."));

			const prev = button("‹", () => { state.page--; render(); });
			const next = button("›", () => { state.page++; render(); });
			prev.disabled = state.page === 0;
			next.disabled = state.page >= pages - 1;
			pager.replaceChildren(prev, el("span", "", `Page ${state.page + 1} / ${pages} · ${list.length} maps`), next);
		};

		const bind = (input, key, ev) => input.addEventListener(ev, () => { state[key] = input.value; state.page = 0; render(); });
		bind(q, "q", "input"); bind(players, "players", "change"); bind(goods, "goods", "change"); bind(sort, "sort", "change");
		render();
	}
}
