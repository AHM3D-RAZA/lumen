import { BufferGeometry, Float32BufferAttribute } from 'three';
import { DOOR_ANGLE, type WallOpening } from './interior/layout';

/**
 * Builds curved wall surfaces with real openings (door, windows). Lathe geometry cannot have holes, so the
 * wall is assembled from angular patches around each opening, plus "reveal" faces that show its thickness.
 * Positions are in the lighthouse group's space (origin on the tower axis, y relative to the pad).
 */

const TAU = Math.PI * 2;
const RANGE_START = -Math.PI / 2;
const RANGE_END = (3 * Math.PI) / 2;

class Builder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, shade: number): void {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(shade, shade, shade);
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

export interface WallSpec {
  radius: (y: number) => number;
  yA: number;
  yB: number;
  openings: WallOpening[];
  /** Faces point towards the tower axis (interior surface). */
  inward: boolean;
  /** Metres per texture repeat. */
  uvTile?: number;
  /** Optional brightness multiplier baked into vertex colours (grime, ambient occlusion). */
  shade?: (x: number, y: number, z: number) => number;
}

function addPatch(b: Builder, spec: WallSpec, a0: number, a1: number, y0: number, y1: number): void {
  if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
  const tile = spec.uvTile ?? 2;
  const segs = Math.max(1, Math.ceil((a1 - a0) / (TAU / 72)));
  const rows = Math.max(1, Math.ceil((y1 - y0) / 0.6));
  const base = b.count;
  const sign = spec.inward ? -1 : 1;
  for (let j = 0; j <= rows; j++) {
    const y = y0 + ((y1 - y0) * j) / rows;
    const r = spec.radius(y);
    const slope = (spec.radius(y + 0.05) - spec.radius(y - 0.05)) / 0.1;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + ((a1 - a0) * i) / segs;
      const phi = DOOR_ANGLE + a;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      const x = r * s;
      const z = r * c;
      const len = Math.hypot(1, slope);
      b.vertex(x, y, z, (sign * s) / len, (sign * -slope) / len, (sign * c) / len, (r * a) / tile, y / tile, spec.shade ? spec.shade(x, y, z) : 1);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segs; i++) {
      const a = base + j * row + i;
      const bb = a + 1;
      const c = a + row;
      const d = c + 1;
      if (spec.inward) b.idx.push(a, c, bb, bb, c, d);
      else b.idx.push(a, bb, c, bb, d, c);
    }
  }
}

/** A curved wall around the full circle, with rectangular-ish holes at `openings`. */
export function buildWallSurface(spec: WallSpec): BufferGeometry {
  const b = new Builder();
  const ops = [...spec.openings].sort((p, q) => p.alpha - q.alpha);
  let cursor = RANGE_START;
  for (const op of ops) {
    const a0 = op.alpha - op.halfAngle;
    const a1 = op.alpha + op.halfAngle;
    addPatch(b, spec, cursor, a0, spec.yA, spec.yB);
    addPatch(b, spec, a0, a1, spec.yA, Math.min(op.y0, spec.yB));
    addPatch(b, spec, a0, a1, Math.max(op.y1, spec.yA), spec.yB);
    cursor = a1;
  }
  addPatch(b, spec, cursor, RANGE_END, spec.yA, spec.yB);
  return b.toGeometry();
}

type V3 = [number, number, number];

function quad(b: Builder, p: V3[], desired: V3, uvScale = 1): void {
  const e1: V3 = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]];
  const e2: V3 = [p[2]![0] - p[0]![0], p[2]![1] - p[0]![1], p[2]![2] - p[0]![2]];
  const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = n[0] * desired[0] + n[1] * desired[1] + n[2] * desired[2] < 0;
  const base = b.count;
  const uvs: Array<[number, number]> = [[0, 0], [uvScale, 0], [uvScale, uvScale], [0, uvScale]];
  p.forEach((q, i) => b.vertex(q[0], q[1], q[2], desired[0], desired[1], desired[2], uvs[i]![0], uvs[i]![1], 1));
  if (flip) b.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  else b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Jamb, sill and head faces inside each opening so the wall's thickness is visible. */
export function buildReveals(openings: WallOpening[], rIn: number, rOut: (y: number) => number): BufferGeometry {
  const b = new Builder();
  for (const op of openings) {
    const a0 = DOOR_ANGLE + op.alpha - op.halfAngle;
    const a1 = DOOR_ANGLE + op.alpha + op.halfAngle;
    const pt = (r: number, phi: number, y: number): V3 => [r * Math.sin(phi), y, r * Math.cos(phi)];
    const { y0, y1 } = op;
    quad(b, [pt(rIn, a0, y0), pt(rOut(y0), a0, y0), pt(rOut(y1), a0, y1), pt(rIn, a0, y1)], [Math.cos(a0), 0, -Math.sin(a0)]);
    quad(b, [pt(rIn, a1, y0), pt(rOut(y0), a1, y0), pt(rOut(y1), a1, y1), pt(rIn, a1, y1)], [-Math.cos(a1), 0, Math.sin(a1)]);
    quad(b, [pt(rIn, a0, y0), pt(rOut(y0), a0, y0), pt(rOut(y0), a1, y0), pt(rIn, a1, y0)], [0, 1, 0]);
    quad(b, [pt(rIn, a0, y1), pt(rOut(y1), a0, y1), pt(rOut(y1), a1, y1), pt(rIn, a1, y1)], [0, -1, 0]);
  }
  return b.toGeometry();
}
