import { LIGHTHOUSE } from '../layout';

/**
 * Geometry of the lighthouse interior. Everything is expressed in a "room frame" whose origin is the
 * tower axis, +z points out through the front door and +x is to the right when looking out of the door.
 * Heights are relative to the lighthouse pad. Angles (alpha) are measured from +z towards +x.
 * Pure numbers only, so Node scripts can use them.
 */

export const DOOR_ANGLE = Math.atan2(LIGHTHOUSE.doorDir.x, LIGHTHOUSE.doorDir.z);

export const FLOOR_Y = 0.18; // ground-floor boards, level with the doorstep
export const CEIL_Y = 3.45; // underside of the upper floor
export const UPPER_Y = 3.7; // top of the upper floor
export const UPPER_CEIL_Y = 7.3;
export const R_IN = 4.15; // inner radius of the ground-floor room
export const R_UP = 3.0; // inner radius of the room inside the tower above
export const R_FOUNDATION_BOTTOM = 5.0;
export const R_FOUNDATION_TOP = 4.76;

export const STAIR = {
  rInner: 0.25,
  rOuter: 1.15,
  /** Radius of the hole in the upper floor around the stair. */
  well: 1.22,
  steps: 19,
  turns: 1.5,
  /** Angle at which the lowest step sits; the stair climbs towards increasing alpha. */
  startAlpha: 0.75 * Math.PI,
} as const;

export const DEG = Math.PI / 180;

/** Wall opening: angles in the room frame, heights relative to the pad. */
export interface WallOpening {
  alpha: number;
  halfAngle: number;
  y0: number;
  y1: number;
}

export const DOOR_OPENING: WallOpening = { alpha: 0, halfAngle: 0.2025, y0: FLOOR_Y, y1: 2.8 };
export const GROUND_WINDOWS: WallOpening[] = [-60 * DEG, 60 * DEG, 180 * DEG].map((alpha) => ({
  alpha,
  halfAngle: 0.112,
  y0: FLOOR_Y + 0.95,
  y1: FLOOR_Y + 2.35,
}));
export const UPPER_WINDOW: WallOpening = { alpha: 0, halfAngle: 0.13, y0: UPPER_Y + 1.0, y1: UPPER_Y + 2.5 };

/** Where the front door leaf is hinged (room frame). */
export const DOOR_LEAF = { hingeX: -0.86, z: 4.38, width: 1.72, y0: FLOOR_Y + 0.02, height: 2.58 } as const;

export function foundationRadius(y: number): number {
  const t = Math.min(1, Math.max(0, y / 3.0));
  return R_FOUNDATION_BOTTOM + (R_FOUNDATION_TOP - R_FOUNDATION_BOTTOM) * t;
}

export function polar(r: number, alpha: number): { x: number; z: number } {
  return { x: r * Math.sin(alpha), z: r * Math.cos(alpha) };
}

export function localToWorld(lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(DOOR_ANGLE);
  const s = Math.sin(DOOR_ANGLE);
  return { x: LIGHTHOUSE.x + lx * c + lz * s, z: LIGHTHOUSE.z - lx * s + lz * c };
}

export function worldToLocal(x: number, z: number): { lx: number; lz: number } {
  const dx = x - LIGHTHOUSE.x;
  const dz = z - LIGHTHOUSE.z;
  const c = Math.cos(DOOR_ANGLE);
  const s = Math.sin(DOOR_ANGLE);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
