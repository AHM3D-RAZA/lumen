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

// ---------------------------------------------------------------------------------------------
// Stair navigation regressions (the upper floor used to be split into pockets by furniture, and the opening
// onto the stair was too narrow for the player, so coming down could get stuck)

import { STAIRWELL_GAP } from '../src/world/interior/colliders';
import { PLAYER } from '../src/world/layout';

{
  const TAU = Math.PI * 2;
  const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
  const col = makeWorld(false);
  const FLOOR_WORLD = PAD + FLOOR_Y;
  const UPPER_WORLD = PAD + UPPER_Y;

  // 1. Flood fill each floor: every spot the player can stand must be connected to the stair.
  const CELL = 0.08;
  const standable = (lx: number, lz: number, y: number, onUpper: boolean): boolean => {
    const r = Math.hypot(lx, lz);
    if (r > (onUpper ? 3.0 : 4.1)) return false;
    const w = localToWorld(lx, lz);
    const p = { x: w.x, z: w.z };
    col.resolve(p, PLAYER.radius, y);
    if (Math.hypot(p.x - w.x, p.z - w.z) > 1e-4) return false;
    const g = floors.groundAt(w.x, w.z, y);
    return onUpper ? g >= UPPER_WORLD - 0.3 : Math.abs(g - FLOOR_WORLD) < 0.02;
  };
  const flood = (startLx: number, startLz: number, y: number, onUpper: boolean) => {
    const half = onUpper ? 3.1 : 4.3;
    const n = Math.round((2 * half) / CELL);
    const ok = new Uint8Array(n * n);
    let total = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (standable(-half + i * CELL, -half + j * CELL, y, onUpper)) { ok[j * n + i] = 1; total++; }
    const si = Math.round((startLx + half) / CELL), sj = Math.round((startLz + half) / CELL);
    const seen = new Uint8Array(n * n);
    const q = [sj * n + si];
    seen[q[0]!] = 1;
    let reached = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h]!;
      reached++;
      const i = c % n, j = (c - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const k = nj * n + ni;
        if (ok[k] && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    return { total, reached, startOk: ok[sj * n + si] === 1 };
  };
  const top = polar(0.95, STAIR_END_ALPHA - 0.3);
  const up = flood(top.x, top.z, UPPER_WORLD, true);
  check(up.startOk && up.reached / up.total > 0.995, 'upper floor: every standable spot connects to the top of the stair (furniture does not split the room)', `(${up.reached} of ${up.total} cells)`);
  const door = flood(0, 3.4, FLOOR_WORLD, false);
  check(door.startOk && door.reached / door.total > 0.995, 'ground floor: every standable spot connects to the doorway (furniture does not split the room)', `(${door.reached} of ${door.total} cells)`);

  // 2. The opening in the stairwell railing must be wide enough for the player to walk through.
  const ringR = STAIR.well + 0.04;
  check(STAIRWELL_GAP.before * ringR >= 2 * (PLAYER.radius + 0.06), 'the stairwell opening is wide enough for the player to pass between the railing posts', `(${(STAIRWELL_GAP.before * ringR).toFixed(2)} m of arc)`);

  // 3. Steered ascents and descents from random start points, with wobble; the player slides along the rail when blocked.
  const run = (dir: 1 | -1, r0: number, seed: number, wobble: number): boolean => {
    const rng = mulberry32(seed);
    const startA = dir === 1 ? STAIR.startAlpha - 2.5 + rng() * 5 : STAIR_END_ALPHA + 0.3 + rng() * 5.4;
    const sp = dir === 1 ? polar(2.2 + rng() * 1.2, startA) : polar(1.9 + rng() * 0.7, startA);
    const b = spawn(sp.x, sp.z, dir === 1 ? PAD : UPPER_WORLD);
    if (dir === -1) b.y = UPPER_WORLD;
    const speed = PLAYER.walkSpeed / 60;
    let head = 0, blocked = 0, slideFor = 0, slideSign = 1;
    for (let step = 0; step < 60 * 45; step++) {
      const l = worldToLocal(b.x, b.z);
      const r = Math.hypot(l.lx, l.lz), a = Math.atan2(l.lx, l.lz);
      let tr = r0, ta = a + dir * 0.5;
      if (dir === 1 && b.y < PAD + FLOOR_Y + 0.3 && r >= 1.3) ta = STAIR.startAlpha + 0.1;
      if (dir === -1 && b.y > UPPER_WORLD - 0.1 && r > 1.4) ta = STAIR_END_ALPHA - 0.25;
      let t = polar(tr, ta);
      if (slideFor > 0) { slideFor--; t = polar(Math.max(r, 1.7), a + slideSign * 0.4); }
      const dx = t.x - l.lx, dz = t.z - l.lz, d = Math.hypot(dx, dz) || 1;
      head = (head + (rng() - 0.5) * wobble) * 0.9;
      const cs = Math.cos(head), sn = Math.sin(head);
      const w = localToWorld(l.lx + ((dx / d) * cs - (dz / d) * sn) * speed, l.lz + ((dx / d) * sn + (dz / d) * cs) * speed);
      const px = b.x, pz = b.z;
      moveBody(b, w.x - b.x, w.z - b.z, col, floors);
      blocked = Math.hypot(b.x - px, b.z - pz) < speed * 0.3 ? blocked + 1 : 0;
      if (blocked > 6 && slideFor === 0 && dir === -1) {
        slideFor = 40;
        blocked = 0;
        let da = wrap(a - (STAIR_END_ALPHA - 0.6));
        if (da > Math.PI) da -= TAU;
        slideSign = da > 0 ? -1 : 1;
      }
      if (dir === 1 && b.y >= UPPER_WORLD - 0.02) return true;
      if (dir === -1 && b.y <= FLOOR_WORLD + 0.02) return true;
    }
    return false;
  };
  for (const dir of [1, -1] as const) {
    let ok = 0, total = 0;
    for (const r0 of [0.7, 0.85, 1.0, 1.1]) for (let seed = 1; seed <= 10; seed++) for (const wob of [0, 0.5]) { total++; if (run(dir, r0, seed * 7 + (wob > 0 ? 3 : 0), wob)) ok++; }
    check(ok === total, dir === 1 ? 'steered ascents from random start points all reach the upper floor' : 'steered descents from random points on the upper floor all reach the ground floor', `(${ok}/${total})`);
  }
}

// ---------------------------------------------------------------------------------------------
// No sudden drops: walking past the end of the stair, or anywhere else, never moves the player down by more
// than a step (past the top tread there is a void inside the stair; the player used to fall through it to a lower floor)

{
  const TAU = Math.PI * 2;
  const col = makeWorld(false);
  const UPPER_WORLD = PAD + UPPER_Y;

  // 1. Climb the spiral and keep walking along it past the last step, at several steering radii.
  let worst = 0;
  let reachedTop = 0;
  const radii = [0.5, 0.7, 0.9, 1.1];
  for (const r0 of radii) {
    const s = polar(2.2, STAIR.startAlpha - 0.8);
    const b = spawn(s.x, s.z);
    for (let t = 0; t < 60 * 40; t++) {
      const l = worldToLocal(b.x, b.z);
      const r = Math.hypot(l.lx, l.lz), a = Math.atan2(l.lx, l.lz);
      let ta = a + 0.5;
      if (b.y < PAD + 0.5 && r >= 1.3) ta = STAIR.startAlpha + 0.1;
      const tg = polar(r0, ta);
      const dx = tg.x - l.lx, dz = tg.z - l.lz, d = Math.hypot(dx, dz) || 1;
      const w = localToWorld(l.lx + (dx / d) * 0.06, l.lz + (dz / d) * 0.06);
      const y0 = b.y;
      moveBody(b, w.x - b.x, w.z - b.z, col, floors);
      worst = Math.max(worst, y0 - b.y);
    }
    if (b.y >= UPPER_WORLD - 0.02) reachedTop++;
  }
  check(worst < 0.4 && reachedTop === radii.length, 'walking on past the top of the stair never drops the player (they stop at the end of the tread)', `(worst single-step drop ${worst.toFixed(2)} m, reached the top in ${reachedTop}/${radii.length} runs)`);

  // 2. Random walks over the ground floor, the stair and the upper floor: no step may change the height by more than a stair step.
  const rng = mulberry32(2024);
  let worstDy = 0;
  for (let k = 0; k < 90; k++) {
    const level = k % 3;
    const a0 = rng() * TAU;
    const p = level === 0 ? polar(1.6 + rng() * 2.3, a0) : level === 1 ? polar(0.4 + rng() * 0.8, a0) : polar(1.9 + rng() * 0.7, a0);
    const w = localToWorld(p.x, p.z);
    const b: Body = { x: w.x, y: level === 0 ? PAD + FLOOR_Y : UPPER_WORLD, z: w.z };
    b.y = floors.groundAt(w.x, w.z, b.y);
    let heading = rng() * TAU;
    for (let t = 0; t < 4000; t++) {
      heading += (rng() - 0.5) * 0.35;
      const y0 = b.y;
      moveBody(b, Math.cos(heading) * 0.06, Math.sin(heading) * 0.06, col, floors);
      worstDy = Math.max(worstDy, Math.abs(b.y - y0));
    }
  }
  check(worstDy < 0.4, 'random walks over the ground floor, stair and upper floor never change height by more than a stair step', `(largest single-step change ${worstDy.toFixed(2)} m)`);
}
