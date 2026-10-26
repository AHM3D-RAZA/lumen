import { type Rng, angleDiff } from '../core/math';
import { type ItemType } from '../inventory/Inventory';
import { PLAYER_START } from './layout';
import { type RockFootprint } from './rockGeometry';
import { PATH_POLYLINE, cliffFactor, coastRadius, distanceToPath, heightAt, isWalkableTerrain } from './terrain';

export interface CollectibleSpec {
  /** Stable id, e.g. "sea_glass-3". Saved games refer to it, so placement must stay deterministic. */
  id: string;
  type: ItemType;
  x: number;
  z: number;
  rotY: number;
  variant: number;
}


/** Where the two clifftop viewpoints are (the benches sit here). */
export function overlookPoint(theta: number): { x: number; z: number } {
  const r = coastRadius(theta) * 0.9;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
}
export const WEST_OVERLOOK = overlookPoint(Math.PI + 0.22);
export const NORTH_EAST_OVERLOOK = overlookPoint(-0.7);

/**
 * Chooses where to scatter the collectibles: driftwood on the sandy beaches, sea glass at the waterline and
 * around rocks, shells along the shore, the footpath and the viewpoints, and one lens shard on the quiet
 * north-east bluff. Pure and seeded, so a saved game's ids always mean the same objects.
 */
export function planCollectibles(rng: Rng, rocks: RockFootprint[]): CollectibleSpec[] {
  const specs: CollectibleSpec[] = [];
  const counts: Record<string, number> = {};
  const nearRock = (x: number, z: number, pad: number) => rocks.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + pad);
  const tooClose = (x: number, z: number, min: number, type?: ItemType) =>
    specs.some((s) => (type === undefined || s.type === type) && Math.hypot(s.x - x, s.z - z) < min);

  const add = (type: ItemType, x: number, z: number, variant = 0) => {
    const n = counts[type] ?? 0;
    counts[type] = n + 1;
    specs.push({ id: `${type}-${n}`, type, x, z, rotY: rng() * Math.PI * 2, variant });
  };

  const usable = (x: number, z: number, minH = 0.45, maxH = 1.6) => {
    const h = heightAt(x, z);
    return isWalkableTerrain(x, z) && h >= minH && h <= maxH && !nearRock(x, z, 0.8) && Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) > 2;
  };

  const beachSpot = (maxH: number): { x: number; z: number } | null => {
    for (let i = 0; i < 400; i++) {
      const theta = rng() * Math.PI * 2 - Math.PI;
      if (cliffFactor(theta) > 0.35) continue;
      const r = coastRadius(theta) * (0.9 + rng() * 0.09);
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      if (usable(x, z, 0.45, maxH)) return { x, z };
    }
    return null;
  };

  // Driftwood: long bleached branches high on the sand, well apart.
  for (let tries = 0; tries < 300 && (counts.driftwood ?? 0) < 6; tries++) {
    const p = beachSpot(1.0);
    if (p && !tooClose(p.x, p.z, 9, 'driftwood') && distanceToPath(p.x, p.z) > 2) add('driftwood', p.x, p.z, (counts.driftwood ?? 0) % 3);
  }

  // Sea glass: along the waterline, and tucked beside small rocks.
  for (let tries = 0; tries < 300 && (counts.sea_glass ?? 0) < 5; tries++) {
    const p = beachSpot(0.8);
    if (p && !tooClose(p.x, p.z, 4, 'sea_glass') && !tooClose(p.x, p.z, 2.5)) add('sea_glass', p.x, p.z, (counts.sea_glass ?? 0) % 4);
  }
  const smallRocks = rocks.filter((r) => r.top < 3 && r.top > 0.2 && heightAt(r.x, r.z) > -0.5 && heightAt(r.x, r.z) < 2);
  for (let tries = 0; tries < 400 && (counts.sea_glass ?? 0) < 9 && smallRocks.length > 0; tries++) {
    const rock = smallRocks[Math.floor(rng() * smallRocks.length)]!;
    const a = rng() * Math.PI * 2;
    const d = rock.radius + 0.9 + rng() * 0.7;
    const x = rock.x + Math.cos(a) * d;
    const z = rock.z + Math.sin(a) * d;
    if (usable(x, z, 0.4, 1.8) && !tooClose(x, z, 3)) add('sea_glass', x, z, (counts.sea_glass ?? 0) % 4);
  }

  // Shells: shore, footpath edges, and beside the viewpoints.
  for (let tries = 0; tries < 300 && (counts.shell ?? 0) < 6; tries++) {
    const p = beachSpot(0.9);
    if (p && !tooClose(p.x, p.z, 4, 'shell') && !tooClose(p.x, p.z, 1.5)) add('shell', p.x, p.z, (counts.shell ?? 0) % 3);
  }
  for (let tries = 0; tries < 300 && (counts.shell ?? 0) < 9; tries++) {
    const i = 4 + Math.floor(rng() * (PATH_POLYLINE.length - 12));
    const a = PATH_POLYLINE[i]!;
    const b = PATH_POLYLINE[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const side = rng() < 0.5 ? -1 : 1;
    const off = (1.7 + rng() * 0.8) * side;
    const x = a[0] + (-(b[1] - a[1]) / len) * off;
    const z = a[1] + ((b[0] - a[0]) / len) * off;
    if (usable(x, z, 1.0, 7.0) && distanceToPath(x, z) > 1.4 && !tooClose(x, z, 6, 'shell')) add('shell', x, z, (counts.shell ?? 0) % 3);
  }
  for (const spot of [WEST_OVERLOOK, NORTH_EAST_OVERLOOK]) {
    for (let tries = 0; tries < 60 && (counts.shell ?? 0) < 11; tries++) {
      const a = rng() * Math.PI * 2;
      const d = 1.6 + rng() * 1.2;
      const x = spot.x + Math.cos(a) * d;
      const z = spot.z + Math.sin(a) * d;
      if (usable(x, z, 0.8, 6) && !tooClose(x, z, 1.5)) {
        add('shell', x, z, (counts.shell ?? 0) % 3);
        break;
      }
    }
  }

  // The lens shard rests on a small cairn near the north-east viewpoint.
  for (let tries = 0; tries < 200 && !counts.lens_shard; tries++) {
    const a = angleDiff(-0.7, 0) + (rng() - 0.5) * 1.4;
    const d = 2.4 + rng() * 1.6;
    const x = NORTH_EAST_OVERLOOK.x + Math.cos(a + Math.PI) * d;
    const z = NORTH_EAST_OVERLOOK.z + Math.sin(a + Math.PI) * d;
    if (usable(x, z, 0.8, 6) && !tooClose(x, z, 1.2)) add('lens_shard', x, z, 0);
  }
  return specs;
}
