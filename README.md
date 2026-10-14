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

legacy python version
---------------------
