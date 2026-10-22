import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Rng, clamp, fbm2, lerp } from '../core/math';

/**
 * Procedural boulders: a noise-displaced, softly planed icosphere with layered strata tinted in
 * vertex colours. One template is reused (scaled/rotated) and baked into a single merged mesh.
 */

const stoneLight = new Color('#8c9ba3');
const stoneDark = new Color('#566570');
const moss = new Color('#4f6034');
const tmp = new Color();

export function createRockTemplate(rng: Rng): BufferGeometry {
  let g: BufferGeometry = new IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);

  const seed = rng() * 100;
  const planes = Array.from({ length: 3 }, () => ({
    n: new Vector3(rng() - 0.5, rng() * 0.5 + 0.1, rng() - 0.5).normalize(),
    d: 0.55 + rng() * 0.25,
  }));

  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm2(v.x * 1.6 + seed, v.z * 1.6 + v.y * 1.3 + seed * 0.3, 3);
    v.multiplyScalar(0.82 + (n - 0.5) * 0.85);
    for (const p of planes) {
      const d = v.dot(p.n) - p.d;
      if (d > 0) v.addScaledVector(p.n, -d * 0.72);
    }
    v.y *= 0.7;
    v.y += 0.028 * Math.sin(v.y * 17 + n * 6);
    if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();

  const normal = g.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const n = fbm2(pos.getX(i) * 2.4 + seed, pos.getZ(i) * 2.4, 3);
    const strata = 0.5 + 0.5 * Math.sin(y * 10 + n * 4);
    tmp.copy(stoneDark).lerp(stoneLight, clamp(0.25 + n * 0.5 + (strata - 0.5) * 0.35, 0, 1));
    const up = normal.getY(i);
    if (up > 0.72) tmp.lerp(moss, clamp((up - 0.72) * 1.6 * (0.3 + n), 0, 0.4));
    tmp.multiplyScalar(lerp(0.78, 1.0, clamp((y + 0.35) / 0.9, 0, 1)));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

const m = new Matrix4();
const rot = new Matrix4();
const sc = new Matrix4();

/** Returns a copy of `template` positioned in world space. */
export function placeRock(template: BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number): BufferGeometry {
  const g = template.clone();
  m.makeTranslation(x, y, z);
  rot.makeRotationY(rotY);
  sc.makeScale(sx, sy, sz);
  m.multiply(rot).multiply(sc);
  g.applyMatrix4(m);
  return g;
}

export function mergeRocks(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}
