/**
 * Headless sanity checks for the island layout (no browser needed):
 *   - the start position and the lighthouse door are standable,
 *   - a walkable route exists from the start to the door,
 *   - the walkable region is enclosed (a flood fill never reaches the map edge).
 * Run with `npm run check:world`.
 */
import { LIGHTHOUSE, PLAYER_START, TERRAIN_SIZE } from '../src/world/layout';
import { coastDistance, heightAt, isWalkableTerrain, slopeAt } from '../src/world/terrain';

const CELL = 0.5;
const half = TERRAIN_SIZE / 2;
const n = Math.round(TERRAIN_SIZE / CELL);
const idx = (i: number, j: number) => j * n + i;
const toWorld = (i: number) => -half + (i + 0.5) * CELL;
const toCell = (v: number) => Math.floor((v + half) / CELL);

const walkable = new Uint8Array(n * n);
let walkableCount = 0;
for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
    if (isWalkableTerrain(toWorld(i), toWorld(j))) {
      walkable[idx(i, j)] = 1;
      walkableCount++;
    }
  }
}

const door = {
  x: LIGHTHOUSE.x + LIGHTHOUSE.doorDir.x * 8,
  z: LIGHTHOUSE.z + LIGHTHOUSE.doorDir.z * 8,
};

let failures = 0;
const check = (ok: boolean, label: string, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' ' + extra : ''}`);
  if (!ok) failures++;
};

console.log(`Start   (${PLAYER_START.x}, ${PLAYER_START.z})  height ${heightAt(PLAYER_START.x, PLAYER_START.z).toFixed(2)}  slope ${slopeAt(PLAYER_START.x, PLAYER_START.z).toFixed(2)}  d ${coastDistance(PLAYER_START.x, PLAYER_START.z).toFixed(2)}`);
console.log(`Door    (${door.x.toFixed(1)}, ${door.z.toFixed(1)})  height ${heightAt(door.x, door.z).toFixed(2)}  slope ${slopeAt(door.x, door.z).toFixed(2)}`);
console.log(`Walkable area: ${(walkableCount * CELL * CELL).toFixed(0)} m^2`);

check(isWalkableTerrain(PLAYER_START.x, PLAYER_START.z), 'start position is walkable');
check(isWalkableTerrain(door.x, door.z), 'area in front of the door is walkable');

const seen = new Uint8Array(n * n);
const queue: number[] = [];
const s = idx(toCell(PLAYER_START.x), toCell(PLAYER_START.z));
queue.push(s);
seen[s] = 1;
let reachedDoor = false;
let touchesEdge = false;
const doorCell = idx(toCell(door.x), toCell(door.z));
let reached = 0;
for (let head = 0; head < queue.length; head++) {
  const c = queue[head]!;
  reached++;
  if (c === doorCell) reachedDoor = true;
  const i = c % n;
  const j = (c - i) / n;
  if (i === 0 || j === 0 || i === n - 1 || j === n - 1) touchesEdge = true;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
    const k = idx(ni, nj);
    if (walkable[k] && !seen[k]) {
      seen[k] = 1;
      queue.push(k);
    }
  }
}
console.log(`Reachable from start: ${(reached * CELL * CELL).toFixed(0)} m^2 (${((reached / walkableCount) * 100).toFixed(1)}% of walkable)`);
check(reachedDoor, 'a walkable route connects the start to the door');
check(!touchesEdge, 'walkable region is enclosed by the coast');
check(reached / walkableCount > 0.97, 'almost all walkable ground is reachable (no stranded pockets)');

if (failures > 0) {
  throw new Error(`${failures} check(s) failed`);
}

// ---------------------------------------------------------------------------------------------
// Lighthouse interior: doorway, walls, stair, upper floor, railings (uses the same movement code as the game)

import { CollisionWorld } from '../src/core/collision';
import { moveBody, type Body } from '../src/core/movement';
import { FloorMap } from '../src/world/Floors';
import { addLighthouseColliders, STAIR_END_ALPHA } from '../src/world/interior/colliders';
import { DOOR_ANGLE, DOOR_LEAF, FLOOR_Y, STAIR, UPPER_Y, localToWorld, polar, worldToLocal } from '../src/world/interior/layout';

const PAD = LIGHTHOUSE.padHeight;
const floors = new FloorMap();

function makeWorld(doorClosed: boolean): CollisionWorld {
  const c = new CollisionWorld();
  addLighthouseColliders(c);
  if (doorClosed) {
    const d = localToWorld(0, DOOR_LEAF.z);
    c.addBox(d.x, d.z, DOOR_LEAF.width / 2, 0.12, DOOR_ANGLE);
  }
  return c;
}

/** Walks `body` towards a local-frame target in small steps; returns the largest single-step change in height. */
function walkTo(body: Body, c: CollisionWorld, lx: number, lz: number, maxSteps = 400): number {
  let maxDy = 0;
  for (let i = 0; i < maxSteps; i++) {
    const here = worldToLocal(body.x, body.z);
    const dx = lx - here.lx;
    const dz = lz - here.lz;
    const d = Math.hypot(dx, dz);
    if (d < 0.06) break;
    const s = Math.min(0.05, d);
    const w = localToWorld(here.lx + (dx / d) * s, here.lz + (dz / d) * s);
    const before = body.y;
    moveBody(body, w.x - body.x, w.z - body.z, c, floors);
    maxDy = Math.max(maxDy, Math.abs(body.y - before));
  }
  return maxDy;
}

const spawn = (lx: number, lz: number, y: number = PAD): Body => {
  const w = localToWorld(lx, lz);
  return { x: w.x, y: floors.groundAt(w.x, w.z, y), z: w.z };
};

{
  // Door open: walk in from outside, stand in the room.
  const open = makeWorld(false);
  const b = spawn(0, 8);
  walkTo(b, open, 0, 2.6);
  const p = worldToLocal(b.x, b.z);
  check(Math.hypot(p.lx, p.lz) < 3.2 && Math.abs(b.y - (PAD + FLOOR_Y)) < 0.01, 'with the door open the player can walk in and stand on the floorboards', `(at r=${Math.hypot(p.lx, p.lz).toFixed(2)}, y=${(b.y - PAD).toFixed(2)})`);

  // Door closed: cannot pass.
  const closed = makeWorld(true);
  const c = spawn(0, 8);
  walkTo(c, closed, 0, 2.6);
  const q = worldToLocal(c.x, c.z);
  check(q.lz > 4.5, 'with the door closed the player cannot get in', `(stopped at z=${q.lz.toFixed(2)})`);
}

{
  // Walls: from inside, walk outward in many directions with the door closed.
  const closed = makeWorld(true);
  let maxR = 0;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2;
    const start = polar(2.6, a);
    const b = spawn(start.x, start.z);
    const out = polar(7, a);
    walkTo(b, closed, out.x, out.z, 300);
    const p = worldToLocal(b.x, b.z);
    maxR = Math.max(maxR, Math.hypot(p.lx, p.lz));
  }
  check(maxR < 4.2, 'the ground-floor walls hold in all directions (door closed)', `(farthest reach r=${maxR.toFixed(2)} m, wall inner face 4.15 m)`);
}

{
  // Stairs: climb the full spiral from the bottom and step off onto the upper floor.
  const c = makeWorld(true);
  const b = spawn(...(Object.values(polar(2.3, STAIR.startAlpha - 0.5)) as [number, number]));
  walkTo(b, c, ...(Object.values(polar(0.85, STAIR.startAlpha + 0.02)) as [number, number]), 200);
  let maxDy = 0;
  const total = STAIR.turns * Math.PI * 2;
  for (let u = 0.05; u <= total + 0.05; u += 0.04) {
    const t = polar(0.85, STAIR.startAlpha + u);
    maxDy = Math.max(maxDy, walkTo(b, c, t.x, t.z, 60));
  }
  const climbed = b.y - PAD;
  // Step off the top onto the upper floor, away from the well.
  const off = polar(2.1, STAIR_END_ALPHA);
  walkTo(b, c, off.x, off.z, 120);
  const onFloor = Math.abs(b.y - (PAD + UPPER_Y)) < 0.02;
  check(climbed > UPPER_Y - 0.25 && onFloor, 'the spiral stair can be climbed from the floor to the upper floor', `(reached y=${(b.y - PAD).toFixed(2)}, floor is ${UPPER_Y}; largest single step ${maxDy.toFixed(2)} m)`);
  check(maxDy < 0.4, 'climbing never snaps the player up or down by more than a stair step');

  // Walk back down the way we came.
  const topEdge = polar(0.85, STAIR_END_ALPHA - 0.02);
  walkTo(b, c, topEdge.x, topEdge.z, 120);
  let minY = b.y;
  for (let u = total; u >= 0; u -= 0.04) {
    const t = polar(0.85, STAIR.startAlpha + u);
    walkTo(b, c, t.x, t.z, 60);
    minY = Math.min(minY, b.y);
  }
  const exit = polar(2.4, STAIR.startAlpha - 0.5);
  walkTo(b, c, exit.x, exit.z, 120);
  check(Math.abs(b.y - (PAD + FLOOR_Y)) < 0.02, 'the stair can be descended back to the ground floor', `(ended at y=${(b.y - PAD).toFixed(2)})`);
}

{
  // Upper floor: walking at the stairwell from every direction never drops the player through it, except by the stair itself.
  const c = makeWorld(true);
  let worstDrop = 0;
  let fell = 0;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const s = polar(2.4, a);
    const b = spawn(s.x, s.z, PAD + UPPER_Y);
    b.y = PAD + UPPER_Y;
    const inward = polar(0.3, a);
    const dy = walkTo(b, c, inward.x, inward.z, 200);
    worstDrop = Math.max(worstDrop, dy);
    if (b.y < PAD + UPPER_Y - 1.4) fell++;
  }
  check(fell === 0 && worstDrop < 0.4, 'the railing keeps the player from dropping down the stairwell', `(largest height change while walking at the well: ${worstDrop.toFixed(2)} m)`);
}

// ---------------------------------------------------------------------------------------------
// Collectibles: every planned object is on walkable ground the player can actually reach

import { mulberry32 } from '../src/core/math';
import { planCollectibles } from '../src/world/collectiblePlan';

{
  const specs = planCollectibles(mulberry32(31415), []);
  const counts: Record<string, number> = {};
  let unreachable = 0;
  for (const s of specs) {
    counts[s.type] = (counts[s.type] ?? 0) + 1;
    if (!isWalkableTerrain(s.x, s.z) || !seen[idx(toCell(s.x), toCell(s.z))]) unreachable++;
  }
  console.log(`Collectibles planned (without rocks): ${Object.entries(counts).map(([t, n]) => `${t}×${n}`).join(', ')}`);
  check(unreachable === 0, 'every planned collectible is on walkable, reachable ground', `(${unreachable} unreachable of ${specs.length})`);
  check(new Set(specs.map((s) => s.id)).size === specs.length, 'collectible ids are unique');
  check(['driftwood', 'sea_glass', 'shell', 'lens_shard'].every((t) => (counts[t] ?? 0) > 0), 'all four collectible types are present');
}
