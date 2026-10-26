import { BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh, Shape, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type InteriorMaterials } from './materials';
import { FLOOR_Y, STAIR, UPPER_CEIL_Y, UPPER_Y } from './layout';

const TAU = Math.PI * 2;
const TREAD = 0.07;

/** A cast-iron spiral stair around a central pole: timber treads, iron risers, posts and a helical handrail. */
export function createStair(m: InteriorMaterials): Group {
  const group = new Group();
  const rise = (UPPER_Y - FLOOR_Y) / STAIR.steps;
  const dA = (STAIR.turns * TAU) / STAIR.steps;

  const pole = new Mesh(new CylinderGeometry(STAIR.rInner, STAIR.rInner, UPPER_CEIL_Y - FLOOR_Y, 20), m.iron);
  pole.position.y = (UPPER_CEIL_Y + FLOOR_Y) / 2;
  group.add(pole);

  const treads: BufferGeometry[] = [];
  const risers: BufferGeometry[] = [];
  const mid = (STAIR.rInner + STAIR.rOuter) / 2;
  for (let i = 0; i < STAIR.steps; i++) {
    const a0 = STAIR.startAlpha + i * dA;
    const a1 = a0 + dA + 0.03;
    const top = FLOOR_Y + (i + 1) * rise;
    const shape = new Shape();
    const n = 5;
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      const x = STAIR.rOuter * Math.sin(a);
      const y = -STAIR.rOuter * Math.cos(a);
      if (k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    for (let k = n; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / n;
      shape.lineTo(STAIR.rInner * Math.sin(a), -STAIR.rInner * Math.cos(a));
    }
    const g = new ExtrudeGeometry(shape, { depth: TREAD, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, top - TREAD, 0);
    treads.push(g);

    const riser = new BoxGeometry(STAIR.rOuter - STAIR.rInner, rise, 0.02);
    riser.rotateY(a0 - Math.PI / 2);
    riser.translate(mid * Math.sin(a0), top - rise / 2 - TREAD / 2, mid * Math.cos(a0));
    risers.push(riser);
  }
  const treadMesh = new Mesh(mergeGeometries(treads, false), m.wood);
  const riserMesh = new Mesh(mergeGeometries(risers.map((r) => r.toNonIndexed()), false), m.iron);
  treadMesh.castShadow = treadMesh.receiveShadow = riserMesh.castShadow = riserMesh.receiveShadow = true;
  group.add(treadMesh, riserMesh);
  treads.forEach((t) => t.dispose());
  risers.forEach((r) => r.dispose());

  // Handrail posts and a helical rail on the outer edge.
  const postGeo = new CylinderGeometry(0.018, 0.018, 0.9, 6);
  const posts = new InstancedMesh(postGeo, m.iron, STAIR.steps);
  const mat = new Matrix4();
  for (let i = 0; i < STAIR.steps; i++) {
    const a = STAIR.startAlpha + (i + 0.5) * dA;
    mat.makeTranslation((STAIR.rOuter - 0.04) * Math.sin(a), FLOOR_Y + (i + 1) * rise + 0.45 - TREAD / 2, (STAIR.rOuter - 0.04) * Math.cos(a));
    posts.setMatrixAt(i, mat);
  }
  posts.castShadow = true;
  group.add(posts);

  const pts: Vector3[] = [];
  const total = STAIR.turns * TAU;
  for (let u = 0; u <= total + 1e-6; u += 0.12) {
    const a = STAIR.startAlpha + u;
    pts.push(new Vector3((STAIR.rOuter - 0.04) * Math.sin(a), FLOOR_Y + rise * 0.6 + (u / total) * (UPPER_Y - FLOOR_Y - rise * 0.6) + 0.92, (STAIR.rOuter - 0.04) * Math.cos(a)));
  }
  const rail = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 140, 0.03, 6), m.brass);
  rail.castShadow = true;
  group.add(rail);
  return group;
}
