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
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
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
