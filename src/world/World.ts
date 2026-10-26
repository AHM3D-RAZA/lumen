import { Group, type Mesh } from 'three';
import { CollisionWorld } from '../core/collision';
import { disposeObject } from '../core/dispose';
import { mulberry32 } from '../core/math';
import { type GameServices } from '../core/services';
import { type Interactable } from '../interaction/Interactable';
import { createCollectibles, type Collectibles } from './Collectibles';
import { planCollectibles } from './collectiblePlan';
import { createDistantIslands } from './Distant';
import { FloorMap } from './Floors';
import { createLighthouse } from './Lighthouse';
import { createOcean } from './Ocean';
import { createPlaque } from './Plaque';
import { createProps } from './Props';
import { createRocks } from './Rocks';
import { createTerrain } from './TerrainMesh';
import { createVegetation } from './Vegetation';

export interface World {
  group: Group;
  collision: CollisionWorld;
  floors: FloorMap;
  interactables: Interactable[];
  /** Solid meshes that hide interactables behind them from the interaction ray. */
  blockers: Mesh[];
  collectibles: Collectibles;
  doorState(): { target: number; settled: boolean };
  update(time: number, dt: number, player: { x: number; z: number }): void;
  dispose(): void;
}

/** Builds the whole island scene: terrain, lighthouse and its interior, rocks, vegetation, props, collectibles, ocean and distant islands. */
export function createWorld(services: GameServices): World {
  const rng = mulberry32(1887);
  const group = new Group();
  const collision = new CollisionWorld();
  const blockers: Mesh[] = [];

  const terrain = createTerrain();
  group.add(terrain);
  blockers.push(terrain);

  const lighthouse = createLighthouse(collision, services);
  group.add(lighthouse.group);
  blockers.push(...lighthouse.blockers);

  const plaque = createPlaque(collision);
  group.add(plaque.group);

  group.add(createProps(collision));

  const rocks = createRocks(rng, collision);
  if (rocks) {
    group.add(rocks.mesh);
    blockers.push(rocks.mesh);
  }

  // Collectibles are planned first so grass and shrubs can leave them clear.
  const plan = planCollectibles(mulberry32(31415), rocks?.footprints ?? []);
  const clearings = plan.map((c) => ({ x: c.x, z: c.z, r: c.type === 'lens_shard' ? 2.2 : 1.3 }));
  const vegetation = createVegetation(rng, collision, clearings);
  group.add(vegetation.group);

  const collectibles = createCollectibles(plan, services);
  group.add(collectibles.group);

  group.add(createDistantIslands(rng));

  const ocean = createOcean(rocks?.footprints ?? []);
  group.add(ocean.mesh);

  return {
    group,
    collision,
    floors: new FloorMap(),
    interactables: [plaque.interactable, ...lighthouse.interactables, ...collectibles.interactables],
    blockers,
    collectibles,
    doorState: () => lighthouse.doorState(),
    update(time, dt, player) {
      ocean.update(time);
      vegetation.update(time);
      lighthouse.update(time, dt, player);
      collectibles.update(time, dt);
    },
    dispose() {
      ocean.dispose();
      disposeObject(group);
    },
  };
}
