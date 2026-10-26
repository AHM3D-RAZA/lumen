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
import { type GameServices } from '../core/services';
import { noise2 } from '../core/math';
import { type Interactable } from '../interaction/Interactable';
import { createDoor } from './Door';
import { addLighthouseColliders } from './interior/colliders';
import { createInterior } from './interior/Interior';
import { DOOR_ANGLE, DOOR_OPENING, GROUND_WINDOWS, R_FOUNDATION_TOP, R_IN, R_UP, UPPER_WINDOW, foundationRadius } from './interior/layout';
import { LIGHTHOUSE } from './layout';
import { buildReveals, buildWallSurface } from './wallGeometry';
import { createGlowTexture, createPlasterTexture, createStoneTexture, createWoodTexture } from './textures';

/** Dimensions in metres, measured upwards from the levelled pad. */
const BASE_TOP = 3.7;
const TOWER_TOP = 19.6;
const R_BOTTOM = 3.55;
const R_TOP = 2.3;
const AMBER = new Color('#ffb45a');

export { DOOR_ANGLE };

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
  interactables: Interactable[];
  doorState(): { target: number; settled: boolean };
  /** Solid surfaces that must hide what is behind them from the interaction ray. */
  blockers: Mesh[];
  update(time: number, dt: number, player: { x: number; z: number }): void;
}

export function createLighthouse(collision: CollisionWorld, services: GameServices): LighthouseBuild {
  const group = new Group();
  group.position.set(LIGHTHOUSE.x, LIGHTHOUSE.padHeight, LIGHTHOUSE.z);
  const blockers: Mesh[] = [];

  // ---- Materials ---------------------------------------------------------------------------
  const stoneTex = createStoneTexture();
  const plasterTex = createPlasterTexture();
  const woodTex = createWoodTexture('#6a5b4a');

  const foundationMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 1, 1), bumpMap: cloneTexture(stoneTex, 1, 1), bumpScale: 2.2, roughness: 0.95 });
  const corniceMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 9, 0.6), roughness: 0.95 });
  const trimMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 0.45, 0.45), bumpMap: cloneTexture(stoneTex, 0.45, 0.45), bumpScale: 1.5, roughness: 0.92, color: '#c9ced0' });
  const corbelMat = new MeshStandardMaterial({ map: cloneTexture(stoneTex, 6, 0.6), roughness: 0.92, color: '#b9bfc2' });
  const whiteMat = new MeshStandardMaterial({ map: cloneTexture(plasterTex, 1, 1), vertexColors: true, color: '#e8e7de', roughness: 0.86 });
  const redMat = new MeshStandardMaterial({ map: cloneTexture(plasterTex, 1, 1), vertexColors: true, color: '#a4413a', roughness: 0.82 });
  const ironMat = new MeshStandardMaterial({ color: '#23292c', metalness: 0.65, roughness: 0.5 });
  const copperMat = new MeshStandardMaterial({ color: '#4f9283', metalness: 0.55, roughness: 0.5 });
  const woodMat = new MeshStandardMaterial({ map: woodTex, roughness: 0.88 });
  const glassMat = new MeshStandardMaterial({ color: '#b5dcd6', transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0.1, side: DoubleSide, depthWrite: false });
  const paneMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lampMat = new MeshBasicMaterial({ color: '#ffdd9a', toneMapped: false });

  const solid = (mesh: Mesh): Mesh => {
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    blockers.push(mesh);
    return mesh;
  };

  // ---- Foundation: a drum of coursed stone with real openings for the door and windows ----------
  const openings = [DOOR_OPENING, ...GROUND_WINDOWS];
  solid(new Mesh(buildWallSurface({ radius: foundationRadius, yA: -1.6, yB: 3.0, openings, inward: false, uvTile: 3.2 }), foundationMat));
  solid(new Mesh(buildReveals(openings, R_IN, foundationRadius), trimMat));
  solid(new Mesh(lathe([[R_FOUNDATION_TOP, 2.98], [5.08, 3.1], [5.08, 3.6], [R_BOTTOM, BASE_TOP]], 64), corniceMat));

  // ---- Tower: tapered, banded plaster (the lowest band has the upper-room window) -------------------
  const bandEdges = [BASE_TOP, 8.9, 12.9, 16.2, TOWER_TOP];
  const whiteParts: BufferGeometry[] = [];
  const redParts: BufferGeometry[] = [];
  const grime = (x: number, y: number, z: number) => 1 - 0.28 * (1 - Math.min(1, (y - BASE_TOP) / 7)) - 0.1 * noise2(Math.atan2(x, z) * 2.5, y * 0.35);
  for (let b = 0; b < bandEdges.length - 1; b++) {
    const g = buildWallSurface({ radius: towerRadius, yA: bandEdges[b]!, yB: bandEdges[b + 1]!, openings: b === 0 ? [UPPER_WINDOW] : [], inward: false, uvTile: 3.5, shade: grime });
    (b % 2 === 0 ? whiteParts : redParts).push(g);
  }
  for (const [parts, mat] of [[whiteParts, whiteMat], [redParts, redMat]] as const) solid(new Mesh(mergeAll(parts), mat));
  solid(new Mesh(buildReveals([UPPER_WINDOW], R_UP, towerRadius), trimMat));
  // Thin stone string courses where the paint changes.
  const ringParts = [8.9, 12.9, 16.2].map((y) => {
    const g = new TorusGeometry(towerRadius(y) + 0.02, 0.07, 6, 56);
    g.rotateX(Math.PI / 2);
    return transformed(g, 0, y, 0);
  });
  group.add(new Mesh(mergeAll(ringParts), trimMat));

  // ---- Gallery: corbelled deck, railing --------------------------------------------------------
  const deckY = TOWER_TOP + 0.2;
  solid(
    new Mesh(
      lathe([[towerRadius(TOWER_TOP - 1.1), TOWER_TOP - 1.1], [2.9, TOWER_TOP - 0.95], [3.45, TOWER_TOP - 0.55], [3.95, TOWER_TOP - 0.15], [3.95, deckY], [2.0, deckY]], 56),
      corbelMat,
    ),
  );

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

  // ---- Decorative windows (amber glow) spiralling up the upper tower --------------------------------
  const windowSpecs: Array<[number, number]> = [
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

  // ---- Entrance: working door, doorstep and wall lantern ---------------------------------------------
  const door = createDoor(collision, services, woodMat, trimMat, ironMat);
  group.add(door.group);

  const entrance = new Group();
  entrance.rotation.y = DOOR_ANGLE;
  group.add(entrance);
  const step = new Mesh(new BoxGeometry(2.9, 0.18, 1.25), trimMat);
  step.position.set(0, 0.09, 5.55);
  step.castShadow = step.receiveShadow = true;
  const lantern = new Mesh(new BoxGeometry(0.2, 0.3, 0.2), lampMat);
  lantern.position.set(1.62, 2.55, 4.72);
  const bracket = new Mesh(new BoxGeometry(0.05, 0.05, 0.28), ironMat);
  bracket.position.set(1.62, 2.74, 4.62);
  entrance.add(step, lantern, bracket);
  halo.push(Math.sin(DOOR_ANGLE) * 4.97 + Math.cos(DOOR_ANGLE) * 1.62, 2.55, Math.cos(DOOR_ANGLE) * 4.97 - Math.sin(DOOR_ANGLE) * 1.62);

  // ---- Interior ------------------------------------------------------------------------------------------
  const interior = createInterior(services, towerRadius);
  group.add(interior.group);
  blockers.push(...interior.blockers);
  addLighthouseColliders(collision);

  // ---- Glow: additive halos instead of post-processing bloom -----------------------------------------
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
    interactables: [door.interactable, ...interior.interactables],
    doorState: () => door.state(),
    blockers,
    update(time, dt, player) {
      (lampHalo.material as PointsMaterial).opacity = 0.58 + 0.04 * Math.sin(time * 1.3) + 0.02 * Math.sin(time * 3.1);
      lampLight.intensity = 70 + 3 * Math.sin(time * 1.3);
      door.update(dt, player);
      interior.update(time);
    },
  };
}
