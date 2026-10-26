import { LIGHTHOUSE } from './layout';
import { FLOOR_Y, R_IN, R_UP, STAIR, UPPER_Y, worldToLocal } from './interior/layout';
import { heightAt } from './terrain';

/** Largest step up the player can climb in one move. */
const STEP_UP = 0.55;
const TAU = Math.PI * 2;

const STAIR_RISE = (UPPER_Y - FLOOR_Y) / STAIR.steps;
const STAIR_STEP_ANGLE = (STAIR.turns * TAU) / STAIR.steps;

/** Height of the stair tread at plan position (r, alpha) for a given turn (0 = lowest), or null if there is none. */
function stairHeightAt(alpha: number, turn: number): number | null {
  let a = (alpha - STAIR.startAlpha) % TAU;
  if (a < 0) a += TAU;
  const u = a + turn * TAU;
  if (u > STAIR.turns * TAU) return null;
  const index = Math.min(STAIR.steps - 1, Math.floor(u / STAIR_STEP_ANGLE));
  return FLOOR_Y + (index + 1) * STAIR_RISE;
}

/** True when the plan position is inside the ground-floor room or on the upper floor. */
export function isInsideLighthouse(x: number, z: number): boolean {
  const { lx, lz } = worldToLocal(x, z);
  return Math.hypot(lx, lz) < R_IN - 0.15;
}

/**
 * Where the player stands. The terrain is the default; the lighthouse adds the doorstep, the interior
 * floor, a spiral stair and the upper floor. Surfaces are chosen by the player's current height, so
 * walking under the upper floor or off the end of a stair behaves sensibly.
 */
export class FloorMap {
  groundAt(x: number, z: number, currentY: number): number {
    let best = heightAt(x, z);
    const { lx, lz } = worldToLocal(x, z);
    const r = Math.hypot(lx, lz);
    const pad = LIGHTHOUSE.padHeight;
    const reach = currentY + STEP_UP;
    const consider = (h: number) => {
      if (h > best && h <= reach) best = h;
    };

    if (r < R_IN) consider(pad + FLOOR_Y);
    // Doorstep and threshold in front of the entrance.
    if (Math.abs(lx) <= 1.45 && lz >= 3.9 && lz <= 6.2) consider(pad + FLOOR_Y);

    if (r >= STAIR.rInner && r <= STAIR.well) {
      const alpha = Math.atan2(lx, lz);
      for (let turn = 0; turn < 2; turn++) {
        const h = stairHeightAt(alpha, turn);
        if (h !== null) consider(pad + h);
      }
    }
    if (r > STAIR.well && r <= R_UP + 1.15) consider(pad + UPPER_Y);
    return best;
  }
}

