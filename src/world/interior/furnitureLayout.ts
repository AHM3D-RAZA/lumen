import { DEG, UPPER_Y } from './layout';

/**
 * Where the furniture stands (room frame, polar coordinates around the tower axis). Shared by the
 * renderer, which builds the models, and the collision set, so the two can never drift apart.
 * `alpha` is measured from the door (+z) towards +x; items have their back to the wall at `r`.
 */

export interface Placement {
  r: number;
  alpha: number;
}

const at = (r: number, deg: number): Placement => ({ r, alpha: deg * DEG });

export const LAYOUT = {
  desk: at(3.78, -60),
  chair: at(3.0, -60),
  bed: at(3.65, 98),
  nightstand: at(3.95, 76),
  bookshelf: at(3.95, -115),
  stove: at(3.55, -158),
  chest: at(3.85, 180),
  sideboard: at(3.9, 142),
  coatHooks: at(4.1, 26),
  boots: at(3.85, 22),
  rug: at(2.75, 0),
  chart: at(4.12, -88),
  lantern: { x: 0, y: 2.95, z: 2.3 },
  // Upper room
  telescope: at(2.45, -42),
  crate: at(2.55, 128),
  table: at(2.45, 42),
  hatch: at(2.5, 180),
  upperLantern: { x: 0, y: UPPER_Y + 3.0, z: 0 },
} as const;

export interface Footprint {
  placement: Placement;
  /** Half extent along the tangent (x) and radius (z) for boxes; circle radius for `circle`. */
  hx: number;
  hz: number;
  circle?: boolean;
  /** Collider only matters at this level. */
  level: 'ground' | 'upper';
}

export const FOOTPRINTS: Footprint[] = [
  { placement: LAYOUT.desk, hx: 0.65, hz: 0.35, level: 'ground' },
  { placement: LAYOUT.chair, hx: 0.3, hz: 0.3, circle: true, level: 'ground' },
  { placement: LAYOUT.bed, hx: 1.0, hz: 0.475, level: 'ground' },
  { placement: LAYOUT.nightstand, hx: 0.22, hz: 0.2, level: 'ground' },
  { placement: LAYOUT.bookshelf, hx: 0.65, hz: 0.18, level: 'ground' },
  { placement: LAYOUT.stove, hx: 0.42, hz: 0.42, circle: true, level: 'ground' },
  { placement: LAYOUT.chest, hx: 0.55, hz: 0.28, level: 'ground' },
  { placement: LAYOUT.sideboard, hx: 0.5, hz: 0.23, level: 'ground' },
  { placement: LAYOUT.telescope, hx: 0.32, hz: 0.32, circle: true, level: 'upper' },
  { placement: LAYOUT.crate, hx: 0.38, hz: 0.3, level: 'upper' },
  { placement: LAYOUT.table, hx: 0.38, hz: 0.38, circle: true, level: 'upper' },
];
