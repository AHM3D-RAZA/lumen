import { Group } from 'three';
import { CollisionWorld } from '../core/collision';
import { disposeObject } from '../core/dispose';
import { mulberry32 } from '../core/math';
import { type Interactable } from '../interaction/Interactable';
import { createDistantIslands } from './Distant';
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
  interactables: Interactable[];
  update(time: number): void;
  dispose(): void;
}

/** Builds the whole island scene: terrain, lighthouse, rocks, vegetation, props, ocean and distant islands. */
export function createWorld(): World {
  const rng = mulberry32(1887);
  const group = new Group();
  const collision = new CollisionWorld();

  group.add(createTerrain());

  const lighthouse = createLighthouse();
  lighthouse.addColliders(collision);
  group.add(lighthouse.group);

  const plaque = createPlaque(collision);
  group.add(plaque.group);

  group.add(createProps(collision));

  const rocks = createRocks(rng, collision);
  if (rocks) group.add(rocks);

  const vegetation = createVegetation(rng, collision);
  group.add(vegetation.group);

  group.add(createDistantIslands(rng));

  const ocean = createOcean();
  group.add(ocean.mesh);

  return {
    group,
    collision,
    interactables: [plaque.interactable],
    update(time) {
      ocean.update(time);
      vegetation.update(time);
      lighthouse.update(time);
    },
    dispose() {
      ocean.dispose();
      disposeObject(group);
    },
  };
}
