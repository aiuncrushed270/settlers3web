# yasc

This aims to be a web-based clone of the Settlers 3 and 4 games of the series. It is heavily under development at the moment.

web version
-----------

TypeScript + WebGL2, bundled with Vite. Needs Node 20+.

    npm install
    npm run dev        # http://localhost:8000
    npm run typecheck
    npm test           # map parser unit tests
    npm run build      # static site in dist/

Start menu -> "Multiplayer-Spiel Internet" -> choose a map from the settlers-united.com
catalogue (`src/maps.json` is a snapshot of the s3-maps index). The chosen `.map` file is
downloaded from raw.githubusercontent.com, parsed by `src/mapfile.ts` and drawn by `src/world.ts`.
Sprites are painted placeholders (`src/sprites.ts`); the original artwork is not redistributable.
Controls: drag to scroll, mouse wheel to zoom, arrow keys / WASD to scroll, click the minimap to jump.
Pick a building in the "Gebäude" tab and click a free spot in your territory to place it
(right click / Esc cancels). Placing spends planks and stones; construction is simplified (a timer, no builders yet).

Data and assets:
- `scripts/extract_buildings.py` generates `src/buildings.json` (costs, footprints, build menu categories) from the
  jsettlers/settlers-remake building definitions; start goods and settlers per start level in `src/state.ts` come from there too.
- `scripts/prep_sprites.py` turns the Blender renders in `gfx/` (tree, settler) into transparent sprites in `public/gfx/sprites/`.
  The `.blend` sources are not rendered by the build; re-render them with Blender and rerun the script to update the sprites.

legacy python version
---------------------
