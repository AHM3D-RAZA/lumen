import { type CollisionWorld, type Point2 } from './collision';
import { PLAYER } from '../world/layout';
import { type FloorMap } from '../world/Floors';
import { isWalkableTerrain } from '../world/terrain';

export interface Body {
  x: number;
  y: number;
  z: number;
}

const scratch: Point2 = { x: 0, z: 0 };

/** Tries to stand at (x, z); on success moves `body` there (and to the floor height found). */
function tryStand(body: Body, x: number, z: number, collision: CollisionWorld, floors: FloorMap): boolean {
  scratch.x = x;
  scratch.z = z;
  collision.resolve(scratch, PLAYER.radius, body.y);
  if (!isWalkableTerrain(scratch.x, scratch.z)) return false;
  body.y = floors.groundAt(scratch.x, scratch.z, body.y);
  body.x = scratch.x;
  body.z = scratch.z;
  return true;
}

/**
 * Moves the player's feet by (dx, dz): pushed out of solid colliders, kept on walkable ground, set to the
 * floor height at the new spot, sliding along obstacles by trying each axis on its own.
 */
export function moveBody(body: Body, dx: number, dz: number, collision: CollisionWorld, floors: FloorMap): void {
  const { x, z } = body;
  if (tryStand(body, x + dx, z + dz, collision, floors)) return;
  if (!tryStand(body, x + dx, z, collision, floors)) tryStand(body, x, z + dz, collision, floors);
}
