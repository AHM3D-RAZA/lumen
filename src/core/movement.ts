import { type CollisionWorld, type Point2 } from './collision';
import { PLAYER } from '../world/layout';
import { type FloorMap } from '../world/Floors';
import { isWalkableTerrain } from '../world/terrain';

export interface Body {
  x: number;
  y: number;
  z: number;
}

/**
 * The most the player can step down in one move. Stairs and the doorstep are under 0.2 m; anything bigger is a
 * void (the stairwell, a floor edge) and the move is refused instead of dropping the player to a lower floor.
 */
const MAX_STEP_DOWN = 0.45;

const scratch: Point2 = { x: 0, z: 0 };

/** Tries to stand at (x, z); on success moves `body` there (and to the floor height found). */
function tryStand(body: Body, x: number, z: number, collision: CollisionWorld, floors: FloorMap): boolean {
  scratch.x = x;
  scratch.z = z;
  collision.resolve(scratch, PLAYER.radius, body.y);
  if (!isWalkableTerrain(scratch.x, scratch.z)) return false;
  const y = floors.groundAt(scratch.x, scratch.z, body.y);
  if (y < body.y - MAX_STEP_DOWN) return false;
  body.y = y;
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
