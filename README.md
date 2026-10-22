# LUMEN — The Lighthouse at the End of the World

A first-person, cinematic, relaxing 3D browser game about keeping a lonely lighthouse on a small island.
This repository currently contains **Phase 1: the playable 3D foundation**.

Built with TypeScript, Vite and plain Three.js. No external assets, services or API keys: every texture and
mesh is generated procedurally at startup.

## Run it

Requires Node.js 20.19+ (or 22.12+).

```bash
npm install
npm run dev        # development server (http://localhost:5173)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm run typecheck  # TypeScript only
npm run check:world  # headless check that the island is walkable and enclosed
```

A browser with WebGL 2 and hardware acceleration is needed. If the game cannot start, a message explains why.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock; starts after you press **Start Exploring**) |
| Shift | Sprint |
| E | Interact (read the brass plaque beside the lighthouse door; press E again to close) |
| Esc | Release the mouse and show the pause/help overlay |

## What is in Phase 1

- A compact island with beaches, cliffs, terraced rock, a levelled lighthouse pad, a footpath, shrubs,
  wind-swept grass, boulders, two clifftop viewpoints (bench and railing) and a small shed.
- A 3D lighthouse: stone drum, tapered banded tower, gallery with railing, glazed lantern room with a glowing
  lamp, verdigris roof, amber windows and an arched entrance with a step.
- An animated ocean (vertex waves plus shader-detailed normals, shoreline foam, sun glitter, haze), a gradient sky
  with drifting clouds and a low sun, and distant hazy island silhouettes.
- First-person movement with terrain following, slope and coast limits, and circle/box collisions.
- A reusable interaction system (`src/interaction/`) driven by a centre-screen raycast with contextual prompts.

Not included on purpose (later phases): interior, day/night cycle, lighthouse beam, tasks, audio, save data.

## Project structure

```
index.html
src/
  main.ts                    entry point, error fallback
  style.css                  title / pause / HUD styling
  core/
    Game.ts                  renderer, loop, state machine (title, intro, playing, paused), cleanup
    Input.ts                 keyboard state and one-shot key callbacks
    collision.ts             2D circle / oriented-box collision with push-out
    math.ts                  seeded RNG, noise, helpers
    dispose.ts               GPU resource cleanup
  player/PlayerController.ts pointer-lock look, WASD, sprint, ground following
  interaction/
    Interactable.ts          interface future objects implement
    InteractionSystem.ts     raycast, range check, prompt events
  ui/UI.ts                   DOM wrapper for overlays, prompt and info panel
  world/
    layout.ts, terrain.ts    shared constants and the analytic height field (pure, testable)
    World.ts                 assembles everything
    TerrainMesh.ts, Rocks.ts, Vegetation.ts, Props.ts, Lighthouse.ts, Plaque.ts, Distant.ts
    Ocean.ts, Sky.ts, atmosphere.ts, Lighting.ts, textures.ts, rockGeometry.ts
scripts/check-world.ts       walkability and enclosure checks
```

## Known limitations

- Performance on real integrated GPUs has not been measured. The heaviest parts are the 2048 shadow map, the
  ocean mesh (about 60k vertices) and roughly 20k alpha-tested grass cards.
- The lighthouse door is solid and decorative; there is no interior yet.
- Automated browser checks were run in headless Chromium with software WebGL, which is far slower than a
  real GPU and says nothing about frame rate.
