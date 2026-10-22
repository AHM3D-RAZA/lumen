import { angleDiff, clamp, fbm2, lerp, noise2, smoothstep } from '../core/math';
import { LIGHTHOUSE, PLAYER_START } from './layout';

/**
 * Pure terrain functions: the island is an analytic height field, so the render mesh, the
 * shore-depth map, vegetation placement and player ground-following all share one source of truth.
 */

export const MIN_WALK_HEIGHT = 0.4;
export const MAX_WALK_SLOPE = 1.0;
const FLOOR_HEIGHT = -14;

const lighthouseDir = (() => {
  const { x, z } = LIGHTHOUSE.doorDir;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
})();

/** Radius of the coastline at a given angle (atan2(z, x)). Elliptical base, lobes and coves. */
export function coastRadius(theta: number): number {
  const a = 50;
  const b = 41;
  const ellipse = (a * b) / Math.hypot(b * Math.cos(theta), a * Math.sin(theta));
  const wobble =
    1 +
    0.1 * Math.sin(2 * theta + 1.1) +
    0.08 * Math.sin(3 * theta + 2.3) +
    0.05 * Math.sin(5 * theta + 0.4) +
    0.025 * Math.sin(8 * theta + 4);
  const lobe = (centre: number, width: number, size: number) =>
    size * Math.exp(-Math.pow(angleDiff(theta, centre) / width, 2));
  return ellipse * wobble + lobe(-0.7, 0.3, 9) + lobe(Math.PI, 0.32, 7) - lobe(Math.PI / 2 + 0.3, 0.35, 5);
}

/** 0 = gentle sandy shore, 1 = rocky cliffs. North-west is cliffy, south and east are beaches. */
export function cliffFactor(theta: number): number {
  const c = Math.cos(theta + 2.2);
  return clamp(smoothstep(-0.35, 0.65, c) + 0.18 * (noise2(theta * 3.1, 4.7) - 0.5), 0, 1);
}

function terrace(h: number, step: number, weight: number): number {
  const s = h / step;
  const f = s - Math.floor(s);
  const stepped = (Math.floor(s) + smoothstep(0.35, 0.65, f)) * step;
  return lerp(h, stepped, weight);
}

export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const R = coastRadius(theta);
  const cliff = cliffFactor(theta);
  const edge = 0.55 + cliff * 3.3 + (noise2(x * 0.08, z * 0.08) - 0.5) * 0.5 * cliff;

  let h: number;
  if (r <= R) {
    const t = 1 - r / R;
    h = edge + (5.4 - edge) * smoothstep(0, 0.85, t);

    const dx = x - LIGHTHOUSE.x;
    const dz = z - LIGHTHOUSE.z;
    h += 2.4 * Math.exp(-(dx * dx + dz * dz) / (2 * 15 * 15));

    const mound = smoothstep(0.08, 0.4, t);
    h += (fbm2(x * 0.04 + 11, z * 0.04 - 5) - 0.45) * 3.0 * mound;
    h += (noise2(x * 0.17, z * 0.17) - 0.5) * 0.35 * mound;

    const ledge = (0.18 + 0.3 * cliff * (1 - smoothstep(0, 0.5, t))) * smoothstep(0, 0.12, t);
    h = terrace(h, 1.25, ledge);
  } else {
    h = edge - (r - R) * lerp(0.2, 1.7, cliff);
  }

  const pd = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  const pad = 1 - smoothstep(LIGHTHOUSE.padInnerRadius, LIGHTHOUSE.padOuterRadius, pd);
  h = lerp(h, LIGHTHOUSE.padHeight, pad);

  return Math.max(h, FLOOR_HEIGHT);
}

/** Normalised distance from the island centre: < 1 inland, 1 at the coastline. */
export function coastDistance(x: number, z: number): number {
  return Math.hypot(x, z) / coastRadius(Math.atan2(z, x));
}

/** Gradient magnitude (rise over run) of the terrain. */
export function slopeAt(x: number, z: number): number {
  const e = 0.35;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** True where the player may stand, ignoring solid objects. */
export function isWalkableTerrain(x: number, z: number): boolean {
  return coastDistance(x, z) < 0.985 && heightAt(x, z) >= MIN_WALK_HEIGHT && slopeAt(x, z) <= MAX_WALK_SLOPE;
}

// ---------------------------------------------------------------------------------------------
// Footpath from the beach to the lighthouse door

const PATH_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [PLAYER_START.x, PLAYER_START.z + 2.5],
  [PLAYER_START.x + 0.5, PLAYER_START.z - 3],
  [-8, 26],
  [-9, 17],
  [-3, 9],
  [3, 1],
  [LIGHTHOUSE.x + lighthouseDir.x * 11, LIGHTHOUSE.z + lighthouseDir.z * 11],
  [LIGHTHOUSE.x + lighthouseDir.x * 6.8, LIGHTHOUSE.z + lighthouseDir.z * 6.8],
];

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export const PATH_POLYLINE: ReadonlyArray<readonly [number, number]> = (() => {
  const pts: Array<readonly [number, number]> = [];
  const c = PATH_CONTROL;
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)]!;
    const p1 = c[i]!;
    const p2 = c[i + 1]!;
    const p3 = c[Math.min(c.length - 1, i + 2)]!;
    for (let s = 0; s < 12; s++) {
      const t = s / 12;
      pts.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  pts.push(c[c.length - 1]!);
  return pts;
})();

/** Distance from (x, z) to the footpath centre line. */
export function distanceToPath(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < PATH_POLYLINE.length - 1; i++) {
    const a = PATH_POLYLINE[i]!;
    const b = PATH_POLYLINE[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const t = clamp(((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz), 0, 1);
    const d = Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t));
    if (d < best) best = d;
  }
  return best;
}
