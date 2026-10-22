import { type BufferGeometry, Mesh, MeshStandardMaterial } from 'three';
import { type CollisionWorld } from '../core/collision';
import { type Rng, angleDiff } from '../core/math';
import { LIGHTHOUSE, PLAYER_START } from './layout';
import { createRockTemplate, mergeRocks, placeRock } from './rockGeometry';
import { cliffFactor, coastDistance, coastRadius, distanceToPath, heightAt, slopeAt } from './terrain';

const SOUTH = Math.PI / 2 + 0.1; // the sandy cove the player starts in is kept clear

/** Shoreline boulders, cliff formations, outcrops and offshore stacks, baked into one mesh. */
export function createRocks(rng: Rng, collision: CollisionWorld): Mesh | null {
  const templates = Array.from({ length: 6 }, () => createRockTemplate(rng));
  const parts: BufferGeometry[] = [];

  const addRock = (x: number, z: number, size: number, opts: { squash?: number; sink?: number; y?: number } = {}) => {
    const { squash = 1, sink = 0.25 } = opts;
    const t = templates[Math.floor(rng() * templates.length)]!;
    const sx = size * (0.85 + rng() * 0.4);
    const sz = size * (0.85 + rng() * 0.4);
    const sy = size * squash * (0.8 + rng() * 0.4);
    const ground = heightAt(x, z);
    parts.push(placeRock(t, x, opts.y ?? ground - sy * sink, z, sx, sy, sz, rng() * Math.PI * 2));
    if (opts.y === undefined && size >= 1.1 && ground > 0.2) collision.addCircle(x, z, Math.max(sx, sz) * 0.8);
  };

  const farFromStart = (x: number, z: number, r: number) => Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) > r;

  // Shoreline clusters, partly submerged.
  const clusters = 24;
  for (let k = 0; k < clusters; k++) {
    const theta = (k / clusters) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    if (Math.abs(angleDiff(theta, SOUTH)) < 0.5 || rng() < 0.2) continue;
    const r = coastRadius(theta) * (0.99 + rng() * 0.09);
    const cx = Math.cos(theta) * r;
    const cz = Math.sin(theta) * r;
    const h = heightAt(cx, cz);
    if (h < -1.6 || h > 1.6) continue;
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) addRock(cx + (rng() - 0.5) * 5, cz + (rng() - 0.5) * 5, 0.5 + rng() * 1.2);
  }

  // Large layered formations along the cliffs.
  let giants = 0;
  for (let i = 0; i < 80 && giants < 9; i++) {
    const theta = rng() * Math.PI * 2 - Math.PI;
    if (cliffFactor(theta) < 0.6) continue;
    const r = coastRadius(theta) * (0.88 + rng() * 0.16);
    addRock(Math.cos(theta) * r, Math.sin(theta) * r, 2.2 + rng() * 2.6, { squash: 1.1, sink: 0.35 });
    giants++;
  }

  // Boulders settled around the lighthouse base, leaving the doorway clear.
  const doorTheta = Math.atan2(LIGHTHOUSE.doorDir.z, LIGHTHOUSE.doorDir.x);
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2;
    if (Math.abs(angleDiff(a, doorTheta)) < 0.9) continue;
    const r = 6.9 + rng() * 1.3;
    addRock(LIGHTHOUSE.x + Math.cos(a) * r, LIGHTHOUSE.z + Math.sin(a) * r, 0.45 + rng() * 0.55, { sink: 0.3 });
  }

  // Inland outcrops.
  let outcrops = 0;
  for (let i = 0; i < 400 && outcrops < 11; i++) {
    const x = (rng() - 0.5) * 110;
    const z = (rng() - 0.5) * 100;
    if (coastDistance(x, z) > 0.82 || heightAt(x, z) < 1.2 || slopeAt(x, z) > 0.55) continue;
    if (distanceToPath(x, z) < 3.5 || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 12 || !farFromStart(x, z, 10)) continue;
    addRock(x, z, 0.9 + rng() * 1.1, { squash: 0.9 });
    outcrops++;
  }

  // Sea stacks just offshore.
  for (let i = 0; i < 9; i++) {
    const theta = rng() * Math.PI * 2;
    if (Math.abs(angleDiff(theta, SOUTH)) < 0.6) continue;
    const r = coastRadius(theta) * (1.14 + rng() * 0.45);
    addRock(Math.cos(theta) * r, Math.sin(theta) * r, 2.4 + rng() * 3, { squash: 2.2, y: -2.2 });
  }

  const merged = mergeRocks(parts);
  templates.forEach((t) => t.dispose());
  if (!merged) return null;
  const mesh = new Mesh(merged, new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
