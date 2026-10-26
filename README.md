# LUMEN — The Lighthouse at the End of the World

A first-person, cinematic, relaxing 3D browser game about keeping a lonely lighthouse on a small island.
Built with TypeScript, Vite and plain Three.js. No external assets, services or API keys: every texture, mesh
and sound is generated procedurally at startup.

Current state: **Phase 1** (island, lighthouse exterior, ocean, controls, interaction) plus the ocean polish pass
and **Phase 2** (lighthouse interior, working door, collectibles, collection screen, save data).

## Run it

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
npm run dev          # development server (http://localhost:5173)
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build locally
npm run typecheck    # TypeScript only
npm run check:world  # headless checks: island walkability, doorway, walls, stair, railing, collectible placement
```

A browser with WebGL 2 and hardware acceleration is needed. If the game cannot start, a message explains why.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock; starts after you press **Start Exploring**) |
| Shift | Sprint |
| E | Interact: open or close the door, read the plaque / logbook / chart, switch the lamp, pick things up |
| Tab | Open or close the collection (releases the mouse while open, restores it on close) |
| Esc | Release the mouse and show the pause/help overlay (also closes the collection) |

## What is in the game

- **Island:** beaches, cliffs, terraced rock, a footpath, wind-swept grass, shrubs, boulders, two clifftop
  viewpoints and a shed. An animated ocean with swells, sun glitter and shoreline foam, a low-sun sky and
  distant islands.
- **Lighthouse:** coursed-stone drum and banded tower with real openings for the door and windows.
  The front door is hinged and swings away from whoever opens it; it will not close on you.
- **Interior:** a keeper's room (bed, desk with logbook and chart, bookshelf, stove, chest, sideboard, rug,
  lamps) lit warmly against the cool outdoors, a cast-iron spiral stair, and an upper room with a telescope
  and a sealed hatch. Interior objects can be read or used with E.
- **Collectibles:** driftwood, sea glass, seashells and one lens shard on a cairn. Picking one up removes it
  from the world and adds it to the collection (Tab).
- **Save data:** collected quantities and the ids of collected objects are stored in `localStorage`
  (`lumen.collection.v1`). Unreadable or outdated data is ignored, and collected objects never reappear.

Not included on purpose (later phases): lantern restoration, day/night cycle, weather, crafting or trading.

## Project structure

```
index.html
src/
  main.ts                    entry point, error fallback
  style.css                  title / pause / HUD / collection styling
  core/
    Game.ts                  renderer, loop, state machine (title, intro, playing, paused, inventory)
    Input.ts, math.ts, dispose.ts, services.ts
    collision.ts             2D circles / oriented boxes with enable flags and height ranges
    movement.ts              pure player step (collision, walkable ground, floor height); shared with check:world
  player/PlayerController.ts pointer-lock look, WASD, sprint
  interaction/               Interactable interface, raycast system (with occlusion and unregister)
  inventory/Inventory.ts     collection data model + validated persistence
  audio/AudioFeedback.ts     small synthesised sounds, started after a user gesture
  ui/UI.ts                   DOM wrapper: overlays, prompt, info panel, collection, toast
  world/
    layout.ts, terrain.ts, Floors.ts   constants, height field, floor surfaces (step, stair, upper floor)
    World.ts                 assembles everything
    Lighthouse.ts, Door.ts, wallGeometry.ts
    interior/                layout, furnitureLayout, colliders (pure data), Interior, Furniture, Stairs, materials, textures
    collectiblePlan.ts, collectibleModels.ts, Collectibles.ts
    TerrainMesh.ts, Rocks.ts, Vegetation.ts, Props.ts, Plaque.ts, Distant.ts
    Ocean.ts, Sky.ts, atmosphere.ts, Lighting.ts, textures.ts, rockGeometry.ts
scripts/check-world.ts       headless checks
```

## Known limitations

- Performance on real integrated GPUs has not been measured. Heavier parts: the 2048 shadow map, the ocean
  shader, about 20k alpha-tested grass cards, and four point lights.
- Browser tests were run in headless Chromium with software WebGL (roughly 0.3 to 1 fps), which says nothing about
  real frame rate. Audio was never heard in testing; only its code path is exercised.
- The hatch above the ladder is sealed (it sets up a later phase).
- Collected objects are tracked by id: changing how collectibles are placed would change what saved ids mean.
