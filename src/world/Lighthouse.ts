import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type CollisionWorld } from '../core/collision';
import { noise2 } from '../core/math';
import { LIGHTHOUSE } from './layout';
import { createGlowTexture, createPlasterTexture, createStoneTexture, createWoodTexture } from './textures';

/** Dimensions in metres, measured upwards from the levelled pad. */
const BASE_TOP = 3.7;
const TOWER_TOP = 19.6;
const R_BOTTOM = 3.55;
const R_TOP = 2.3;
const FOUNDATION_RADIUS = 5.0;
const DOOR_RADIUS = 5.0;
const AMBER = new Color('#ffb45a');

export const DOOR_ANGLE = Math.atan2(LIGHTHOUSE.doorDir.x, LIGHTHOUSE.doorDir.z);

const towerRadius = (y: number): number => {
  const u = Math.min(1, Math.max(0, (y - BASE_TOP) / (TOWER_TOP - BASE_TOP)));
  return R_TOP + (R_BOTTOM - R_TOP) * Math.pow(1 - u, 1.12);
};

function cloneTexture(tex: Texture, rx: number, ry: number): Texture {
  const t = tex.clone();
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function lathe(points: Array<[number, number]>, segments = 48): LatheGeometry {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), segments);
}

/** Round-topped arch outline with its base centred on x0 at y0. */
function archPath<T extends Path>(path: T, width: number, height: number, y0 = 0): T {
  const r = width / 2;
  path.moveTo(-r, y0);
  path.lineTo(r, y0);
  path.lineTo(r, y0 + height - r);
  path.absarc(0, y0 + height - r, r, 0, Math.PI, false);
  path.lineTo(-r, y0);
  return path;
}

function archFrame(ow: number, oh: number, oy: number, iw: number, ih: number, iy: number, depth: number): ExtrudeGeometry {
  const shape = archPath(new Shape(), ow, oh, oy);
  shape.holes.push(archPath(new Path(), iw, ih, iy));
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
}

const dummy = new Object3D();
function transformed<G extends BufferGeometry>(g: G, x: number, y: number, z: number, rotY = 0): G {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rotY, 0);
  dummy.updateMatrix();
  g.applyMatrix4(dummy.matrix);
  return g;
}

function mergeAll(parts: BufferGeometry[]): BufferGeometry {
  // Extrude geometries are non-indexed while boxes and lathes are indexed; merging needs them to agree.
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Multiplies a grey "grime" factor into vertex colours (darker near the ground and salt-stained). */
function addGrime(g: BufferGeometry, y0: number): void {
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - y0;
    const angle = Math.atan2(pos.getX(i), pos.getZ(i));
    const grime = 1 - 0.28 * (1 - Math.min(1, y / 7)) - 0.1 * noise2(angle * 2.5, y * 0.35);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = grime;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
}

export interface LighthouseBuild {
  group: Group;
  addColliders(collision: CollisionWorld): void;
  update(time: number): void;
}

export function createLighthouse(): LighthouseBuild {
  const group = new Group();
  group.position.set(LIGHTHOUSE.x, LIGHTHOUSE.padHeight, LIGHTHOUSE.z);

  // ---- Materials ---------------------------------------------------------------------------
  const stoneTex = createStoneTexture();
  const plasterTex = createPlasterTexture();
  const woodTex = createWoodTexture('#6a5b4a');

  const foundationMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 9, 1.4), bumpMap: cloneTexture(stoneTex, 9, 1.4), bumpScale: 2.2, roughness: 0.95 });
  const trimMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 0.45, 0.45), bumpMap: cloneTexture(stoneTex, 0.45, 0.45), bumpScale: 1.5, roughness: 0.92, color: '#c9ced0' });
  const corbelMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 6, 0.6), roughness: 0.92, color: '#b9bfc2' });
  const whiteMat = new MeshStandardMaterial({ map: cloneTexture(plasterTex, 3, 3), vertexColors: true, color: '#e8e7de', roughness: 0.86 });
  const redMat = new MeshStandardMaterial({ map: cloneTexture(plasterTex, 3, 2), vertexColors: true, color: '#a4413a', roughness: 0.82 });
  const ironMat = new MeshStandardMaterial({ color: '#23292c', metalness: 0.65, roughness: 0.5 });
  const copperMat = new MeshStandardMaterial({ color: '#4f9283', metalness: 0.55, roughness: 0.5 });
  const woodMat = new MeshStandardMaterial({ map: woodTex, roughness: 0.88 });
  const glassMat = new MeshStandardMaterial({ color: '#b5dcd6', transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0.1, side: DoubleSide, depthWrite: false });
  const paneMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lampMat = new MeshBasicMaterial({ color: '#ffdd9a', toneMapped: false });

  // ---- Foundation: a drum of coursed stone with a projecting cornice ------------------------
  const foundation = new Mesh(
    lathe([[FOUNDATION_RADIUS, -1.6], [FOUNDATION_RADIUS, 0], [4.76, BASE_TOP - 0.7], [5.08, BASE_TOP - 0.6], [5.08, BASE_TOP - 0.1], [R_BOTTOM, BASE_TOP]], 64),
    foundationMat,
  );
  foundation.castShadow = foundation.receiveShadow = true;
  group.add(foundation);

  // ---- Tower: tapered, banded plaster ----------------------------------------------------------
  const bandEdges = [BASE_TOP, 8.9, 12.9, 16.2, TOWER_TOP];
  const whiteParts: BufferGeometry[] = [];
  const redParts: BufferGeometry[] = [];
  for (let b = 0; b < bandEdges.length - 1; b++) {
    const y0 = bandEdges[b]!;
    const y1 = bandEdges[b + 1]!;
    const steps = Math.max(3, Math.round((y1 - y0) / 1.2));
    const pts: Array<[number, number]> = [];
    for (let s = 0; s <= steps; s++) {
      const y = y0 + ((y1 - y0) * s) / steps;
      pts.push([towerRadius(y), y]);
    }
    const g = lathe(pts, 56);
    addGrime(g, BASE_TOP);
    (b % 2 === 0 ? whiteParts : redParts).push(g);
  }
  for (const [parts, mat] of [[whiteParts, whiteMat], [redParts, redMat]] as const) {
    const mesh = new Mesh(mergeAll(parts), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Thin stone string courses where the paint changes.
  const ringParts = [8.9, 12.9, 16.2].map((y) => {
    const g = new TorusGeometry(towerRadius(y) + 0.02, 0.07, 6, 56);
    g.rotateX(Math.PI / 2);
    return transformed(g, 0, y, 0);
  });
  const rings = new Mesh(mergeAll(ringParts), trimMat);
  rings.castShadow = true;
  group.add(rings);

  // ---- Gallery: corbelled deck, railing --------------------------------------------------------
  const deckY = TOWER_TOP + 0.2;
  const corbel = new Mesh(
    lathe([[towerRadius(TOWER_TOP - 1.1), TOWER_TOP - 1.1], [2.9, TOWER_TOP - 0.95], [3.45, TOWER_TOP - 0.55], [3.95, TOWER_TOP - 0.15], [3.95, deckY], [2.0, deckY]], 56),
    corbelMat,
  );
  corbel.castShadow = corbel.receiveShadow = true;
  group.add(corbel);

  const postCount = 32;
  const posts = new InstancedMesh(new CylinderGeometry(0.03, 0.03, 1.05, 6), ironMat, postCount);
  const m4 = new Matrix4();
  for (let i = 0; i < postCount; i++) {
    const a = (i / postCount) * Math.PI * 2;
    m4.makeTranslation(Math.sin(a) * 3.8, deckY + 0.525, Math.cos(a) * 3.8);
    posts.setMatrixAt(i, m4);
  }
  posts.castShadow = true;
  group.add(posts);
  for (const y of [deckY + 1.05, deckY + 0.55]) {
    const rail = new Mesh(new TorusGeometry(3.8, 0.035, 6, 72), ironMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y;
    rail.castShadow = true;
    group.add(rail);
  }

  // ---- Lantern room ------------------------------------------------------------------------------
  const plinth = new Mesh(new CylinderGeometry(2.1, 2.2, 0.85, 36), redMat);
  addGrime(plinth.geometry, deckY);
  plinth.position.y = deckY + 0.425;
  plinth.castShadow = true;
  group.add(plinth);

  const cageY0 = deckY + 0.85;
  const cageH = 2.2;
  const cageParts: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    cageParts.push(transformed(new BoxGeometry(0.1, cageH, 0.1), Math.sin(a) * 2.0, cageY0 + cageH / 2, Math.cos(a) * 2.0, a));
  }
  for (const y of [cageY0 + 0.03, cageY0 + cageH - 0.03, cageY0 + cageH * 0.5]) {
    const t = new TorusGeometry(2.0, 0.05, 6, 48);
    t.rotateX(Math.PI / 2);
    cageParts.push(transformed(t, 0, y, 0));
  }
  const cage = new Mesh(mergeAll(cageParts), ironMat);
  cage.castShadow = true;
  group.add(cage);

  const glass = new Mesh(new CylinderGeometry(1.98, 1.98, cageH, 36, 1, true), glassMat);
  glass.position.y = cageY0 + cageH / 2;
  glass.renderOrder = 2;
  group.add(glass);

  const lampY = cageY0 + cageH * 0.48;
  const lampCore = new Mesh(new CylinderGeometry(0.34, 0.34, 0.8, 16), lampMat);
  lampCore.position.y = lampY;
  group.add(lampCore);
  // Fresnel-style stacked lens ridges around the flame.
  const lensPts: Array<[number, number]> = [];
  for (let i = 0; i < 9; i++) lensPts.push([0.62 + (i % 2 === 0 ? 0.06 : -0.02), lampY - 0.7 + i * 0.175]);
  const lens = new Mesh(
    lathe(lensPts, 28),
    new MeshStandardMaterial({ color: '#ffe2ae', emissive: '#ffb458', emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.15, side: DoubleSide, depthWrite: false }),
  );
  lens.renderOrder = 1;
  group.add(lens);

  const capY = cageY0 + cageH;
  const cap = new Mesh(new CylinderGeometry(2.4, 2.35, 0.22, 36), ironMat);
  cap.position.y = capY + 0.1;
  cap.castShadow = true;
  group.add(cap);

  // ---- Roof ------------------------------------------------------------------------------------------
  const roofY = capY + 0.21;
  const roof = new Mesh(
    lathe([[2.5, roofY], [2.44, roofY + 0.18], [2.2, roofY + 0.62], [1.72, roofY + 1.22], [1.12, roofY + 1.8], [0.58, roofY + 2.22], [0.3, roofY + 2.45], [0.0, roofY + 2.58]], 40),
    copperMat,
  );
  roof.castShadow = roof.receiveShadow = true;
  group.add(roof);
  const finial = new Mesh(new SphereGeometry(0.22, 12, 10), copperMat);
  finial.position.y = roofY + 2.68;
  const rod = new Mesh(new CylinderGeometry(0.018, 0.03, 1.6, 6), ironMat);
  rod.position.y = roofY + 3.4;
  group.add(finial, rod);

  // ---- Windows: stone surrounds with glowing amber panes, spiralling up the tower ---------------
  const windowSpecs: Array<[number, number]> = [
    [6.7, 0.0],
    [9.9, 0.95],
    [13.0, -0.9],
    [15.3, 1.8],
    [17.6, -1.95],
    [8.1, 3.2],
  ];
  const frameParts: BufferGeometry[] = [];
  const paneParts: BufferGeometry[] = [];
  const barParts: BufferGeometry[] = [];
  const halo: number[] = [];
  for (const [y, rel] of windowSpecs) {
    const a = DOOR_ANGLE + rel;
    const r = towerRadius(y);
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    frameParts.push(transformed(archFrame(1.05, 1.95, 0, 0.64, 1.5, 0.2, 0.45).translate(0, 0, -0.35), sx * r, y, sz * r, a));
    frameParts.push(transformed(new BoxGeometry(1.3, 0.12, 0.55), sx * (r + 0.08), y - 0.05, sz * (r + 0.08), a));
    const pane = new ShapeGeometry(archPath(new Shape(), 0.64, 1.5, 0.2), 12);
    const pp = pane.getAttribute('position');
    const cols = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i++) {
      const t = (pp.getY(i) - 0.2) / 1.5;
      cols[i * 3] = 1.0;
      cols[i * 3 + 1] = 0.58 + 0.26 * (1 - t);
      cols[i * 3 + 2] = 0.2 + 0.2 * (1 - t);
    }
    pane.setAttribute('color', new Float32BufferAttribute(cols, 3));
    paneParts.push(transformed(pane, sx * (r - 0.02), y, sz * (r - 0.02), a));
    barParts.push(transformed(new BoxGeometry(0.045, 1.5, 0.03).translate(0, 0.95, 0.1), sx * (r - 0.02), y, sz * (r - 0.02), a));
    barParts.push(transformed(new BoxGeometry(0.64, 0.045, 0.03).translate(0, 1.0, 0.1), sx * (r - 0.02), y, sz * (r - 0.02), a));
    halo.push(sx * (r + 0.45), y + 0.95, sz * (r + 0.45));
  }
  const frames = new Mesh(mergeAll(frameParts), trimMat);
  const panes = new Mesh(mergeAll(paneParts), paneMat);
  const bars = new Mesh(mergeAll(barParts), ironMat);
  frames.castShadow = true;
  group.add(frames, panes, bars);

  // ---- Entrance: stone surround, planked door, iron fittings, step, wall lantern ---------------
  const door = new Group();
  door.rotation.y = DOOR_ANGLE;
  group.add(door);

  const doorFrame = new Mesh(archFrame(2.3, 3.3, -0.3, 1.5, 2.65, 0, 0.95).translate(0, 0, DOOR_RADIUS - 0.8), trimMat);
  const leaf = new Mesh(
    new ExtrudeGeometry(archPath(new Shape(), 1.5, 2.65, 0), { depth: 0.14, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, DOOR_RADIUS - 0.28),
    woodMat,
  );
  doorFrame.castShadow = true;
  door.add(doorFrame, leaf);

  const fittings: BufferGeometry[] = [];
  for (const y of [0.55, 1.35, 2.1]) fittings.push(new BoxGeometry(1.42, 0.09, 0.04).translate(0, y, DOOR_RADIUS - 0.12));
  const ring = new TorusGeometry(0.075, 0.016, 6, 16).translate(0.42, 1.15, DOOR_RADIUS - 0.08);
  fittings.push(ring, new BoxGeometry(0.06, 0.14, 0.05).translate(0.42, 1.28, DOOR_RADIUS - 0.1));
  door.add(new Mesh(mergeAll(fittings), ironMat));

  const step = new Mesh(new BoxGeometry(2.9, 0.18, 1.25), trimMat);
  step.position.set(0, 0.09, DOOR_RADIUS + 0.55);
  step.castShadow = step.receiveShadow = true;
  door.add(step);

  const lantern = new Mesh(new BoxGeometry(0.2, 0.3, 0.2), lampMat);
  lantern.position.set(1.55, 2.55, DOOR_RADIUS + 0.02);
  const bracket = new Mesh(new BoxGeometry(0.05, 0.05, 0.28), ironMat);
  bracket.position.set(1.55, 2.74, DOOR_RADIUS - 0.08);
  door.add(lantern, bracket);
  const doorGlowLocal = new Vector2(1.55, DOOR_RADIUS + 0.25);
  halo.push(Math.sin(DOOR_ANGLE) * doorGlowLocal.y + Math.cos(DOOR_ANGLE) * doorGlowLocal.x, 2.55, Math.cos(DOOR_ANGLE) * doorGlowLocal.y - Math.sin(DOOR_ANGLE) * doorGlowLocal.x);

  // ---- Glow: additive halos instead of post-processing bloom -----------------------------------
  const glowTex = createGlowTexture();
  const makeHalo = (positions: number[], size: number, opacity: number) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const pts = new Points(
      g,
      new PointsMaterial({ map: glowTex, color: AMBER, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    );
    pts.frustumCulled = false;
    return pts;
  };
  const windowHalos = makeHalo(halo, 3.4, 0.5);
  const lampHalo = makeHalo([0, lampY, 0], 15, 0.6);
  group.add(windowHalos, lampHalo);

  const lampLight = new PointLight('#ffb25c', 70, 42, 2);
  lampLight.position.set(0, lampY, 0);
  group.add(lampLight);

  return {
    group,
    addColliders(collision) {
      collision.addCircle(LIGHTHOUSE.x, LIGHTHOUSE.z, FOUNDATION_RADIUS);
      const sx = Math.sin(DOOR_ANGLE);
      const sz = Math.cos(DOOR_ANGLE);
      collision.addBox(LIGHTHOUSE.x + sx * (DOOR_RADIUS + 0.55), LIGHTHOUSE.z + sz * (DOOR_RADIUS + 0.55), 1.45, 0.62, DOOR_ANGLE);
    },
    update(time) {
      (lampHalo.material as PointsMaterial).opacity = 0.58 + 0.04 * Math.sin(time * 1.3) + 0.02 * Math.sin(time * 3.1);
      lampLight.intensity = 70 + 3 * Math.sin(time * 1.3);
    },
  };
}
