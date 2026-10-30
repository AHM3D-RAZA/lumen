import { type CollisionWorld } from '../../core/collision';
import { LIGHTHOUSE } from '../layout';
import { DOOR_ANGLE, DOOR_OPENING, FLOOR_Y, STAIR, UPPER_Y, localToWorld, polar } from './layout';
import { FOOTPRINTS } from './furnitureLayout';

const TAU = Math.PI * 2;
const PAD = LIGHTHOUSE.padHeight;

/** Alpha of the top step, where the stair arrives on the upper floor. */
export const STAIR_END_ALPHA = STAIR.startAlpha + STAIR.turns * TAU;

/**
 * Opening in the railing around the stairwell, measured in radians from the top step: it covers the approach
 * to the stair, never beyond the top step. The player (radius 0.4) needs about 1 m between posts to pass,
 * so it must be wide; 1.15 rad is roughly 1.5 m of arc at the railing.
 */
export const STAIRWELL_GAP = { before: 1.15, after: 0 } as const;

/** True if `alpha` lies in the opening of the stairwell railing. */
export function inStairwellGap(alpha: number): boolean {
  let d = (alpha - STAIR_END_ALPHA) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d >= -STAIRWELL_GAP.before && d <= STAIRWELL_GAP.after;
}

/** Radius of the invisible railing posts along the outer edge of the stair, and how far out they stand. */
const STAIR_POST = { r: 0.1, at: 1.62 } as const;

/**
 * Everything solid inside and around the lighthouse that is not the door: the wall ring (with the doorway
 * left open), the upper-floor wall, the stair pole and railings, the railing around the stairwell, and the
 * furniture. The door adds its own collider when it is built.
 */
export function addLighthouseColliders(collision: CollisionWorld): void {
  const groundMax = PAD + 3.25;
  const upperMin = PAD + 3.3;

  // Thick wall around the ground floor, open at the door.
  const hw = DOOR_OPENING.halfAngle;
  const segs = 56;
  const step = (TAU - 2 * hw) / segs;
  for (let i = 0; i < segs; i++) {
    const a = hw + (i + 0.5) * step;
    const c = polar(4.65, a);
    const w = localToWorld(c.x, c.z);
    collision.addBox(w.x, w.z, 4.65 * Math.tan(step / 2) + 0.03, 0.5, DOOR_ANGLE + a, { yMax: groundMax });
  }
  // The tower wall above the ground floor, seen from the upper floor.
  const upperSegs = 44;
  const upperStep = TAU / upperSegs;
  for (let i = 0; i < upperSegs; i++) {
    const a = (i + 0.5) * upperStep;
    const c = polar(3.6, a);
    const w = localToWorld(c.x, c.z);
    collision.addBox(w.x, w.z, 3.6 * Math.tan(upperStep / 2) + 0.03, 0.6, DOOR_ANGLE + a, { yMin: upperMin });
  }

  // Stair pole.
  const origin = localToWorld(0, 0);
  collision.addCircle(origin.x, origin.z, STAIR.rInner + 0.02);

  // Outer stair railing: one post per quarter step, each only active at the height of its own tread, so
  // the stair cannot be left sideways but the floor under a high tread stays open.
  const rise = (UPPER_Y - FLOOR_Y) / STAIR.steps;
  const total = STAIR.turns * TAU;
  const posts = STAIR.steps * 4;
  for (let i = 0; i < posts; i++) {
    const u = ((i + 0.5) / posts) * total;
    const stepIndex = Math.min(STAIR.steps - 1, Math.floor((u / total) * STAIR.steps));
    const h = FLOOR_Y + (stepIndex + 1) * rise;
    if (u < 0.55 || h > 3.1) continue; // open at the bottom (you step on here) and flush with the floor at the top
    const p = polar(STAIR_POST.at, STAIR.startAlpha + u);
    const w = localToWorld(p.x, p.z);
    collision.addCircle(w.x, w.z, STAIR_POST.r, { yMin: PAD + h - 1.2, yMax: PAD + h + 0.5 });
  }

  // Railing around the stairwell on the upper floor, open where the stair arrives. It hugs the edge of the
  // hole so the walkway around it stays as wide as possible, and its posts are offset by half a spacing so
  // none sits on the boundary of the opening (a post there pins a player between two posts).
  const ringPosts = 40;
  for (let i = 0; i < ringPosts; i++) {
    const a = ((i + 0.5) / ringPosts) * TAU;
    if (inStairwellGap(a)) continue;
    const p = polar(STAIR.well + 0.04, a);
    const w = localToWorld(p.x, p.z);
    collision.addCircle(w.x, w.z, 0.06, { yMin: PAD + UPPER_Y - 0.6 });
  }

  // Furniture.
  for (const f of FOOTPRINTS) {
    const c = polar(f.placement.r, f.placement.alpha);
    const w = localToWorld(c.x, c.z);
    const opts = f.level === 'ground' ? { yMax: groundMax } : { yMin: upperMin };
    if (f.circle) collision.addCircle(w.x, w.z, f.hx, opts);
    else collision.addBox(w.x, w.z, f.hx, f.hz, DOOR_ANGLE + f.placement.alpha, opts);
  }
}
