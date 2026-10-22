/**
 * Shared world constants. Coordinates: +x east, +z south, +y up. Sea level is y = 0.
 * Kept free of any three.js types so pure terrain code can be run in Node scripts.
 */

export const SEA_LEVEL = 0;

/** Square area (centred on the origin) covered by the terrain mesh and the shore-depth map. */
export const TERRAIN_SIZE = 200;

export const LIGHTHOUSE = {
  x: 11,
  z: -13,
  /** Height of the levelled pad the lighthouse stands on. */
  padHeight: 7.6,
  padInnerRadius: 8.5,
  padOuterRadius: 19,
  /** Direction (from tower centre) the entrance door faces. */
  doorDir: { x: -0.35, z: 0.937 },
} as const;

/** Where the player begins, on the southern beach. */
export const PLAYER_START = { x: -4, z: 35 } as const;

/** Direction towards the low sun (unit-ish vector pointing from the scene to the sun). */
export const SUN_DIRECTION = { x: -0.78, y: 0.3, z: 0.45 } as const;

export const PLAYER = {
  eyeHeight: 1.7,
  radius: 0.4,
  walkSpeed: 3.6,
  sprintSpeed: 5.6,
} as const;
