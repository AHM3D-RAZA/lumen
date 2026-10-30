import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Material,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SphereGeometry,
  Texture,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type Rng, mulberry32 } from '../../core/math';
import { type InteriorMaterials } from './materials';
import { LAYOUT, type Placement } from './furnitureLayout';
import { CEIL_Y, FLOOR_Y, UPPER_CEIL_Y, UPPER_Y, polar } from './layout';

type Mat = Material;

function shadowed<T extends Object3D>(o: T): T {
  o.traverse((c) => {
    const mesh = c as Mesh;
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
  });
  return o;
}

function mesh(g: BufferGeometry, mat: Mat, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(g, mat);
  m.position.set(x, y, z);
  return m;
}
const box = (w: number, h: number, d: number, mat: Mat, x: number, y: number, z: number) => mesh(new BoxGeometry(w, h, d), mat, x, y, z);
const rbox = (w: number, h: number, d: number, r: number, mat: Mat, x: number, y: number, z: number) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z);
const cyl = (rt: number, rb: number, h: number, mat: Mat, x: number, y: number, z: number, seg = 12) => mesh(new CylinderGeometry(rt, rb, h, seg), mat, x, y, z);

/** Places a furniture group at a polar position on the floor (or `y0`), its back (+z) to the wall. */
function placed(group: Group, p: Placement, y0 = FLOOR_Y, faceCentre = false): Group {
  const c = polar(p.r, p.alpha);
  group.position.set(c.x, y0, c.z);
  group.rotation.y = p.alpha + (faceCentre ? Math.PI : 0);
  return group;
}

function halo(tex: Texture, x: number, y: number, z: number, size: number, opacity: number, color = '#ffb460'): Points {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([x, y, z], 3));
  const p = new Points(g, new PointsMaterial({ map: tex, color, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  p.frustumCulled = false;
  return p;
}

/** Instanced book spines filling a shelf. */
function bookRow(rng: Rng, width: number, maxH: number, mat: Mat): InstancedMesh {
  const palette = ['#6b2f2a', '#2f4a5c', '#4d5a34', '#8a6a3a', '#3a3a44', '#7a4a3a', '#a08a5a', '#2f5a52'].map((c) => new Color(c));
  const items: Array<{ x: number; w: number; h: number; d: number; tilt: number; c: Color }> = [];
  let x = -width / 2 + 0.03;
  while (x < width / 2 - 0.12) {
    const w = 0.025 + rng() * 0.035;
    if (rng() < 0.08) {
      x += 0.08 + rng() * 0.12;
      continue;
    }
    items.push({ x: x + w / 2, w, h: maxH * (0.7 + rng() * 0.3), d: 0.2 + rng() * 0.06, tilt: 0, c: palette[Math.floor(rng() * palette.length)]! });
    x += w + 0.002;
  }
  if (items.length > 3 && rng() < 0.8) items[items.length - 1]!.tilt = 0.22;
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, items.length);
  const m = new Matrix4();
  items.forEach((b, i) => {
    m.makeRotationZ(-b.tilt).setPosition(b.x, b.h / 2, 0);
    m.multiply(new Matrix4().makeScale(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, b.c);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export interface OilLamp {
  group: Group;
  flame: Mesh;
  halo: Points;
}

function oilLamp(m: InteriorMaterials, glow: Texture): OilLamp {
  const group = new Group();
  group.add(cyl(0.06, 0.07, 0.04, m.brass, 0, 0.02, 0, 16), cyl(0.05, 0.05, 0.07, m.brass, 0, 0.075, 0, 16));
  const chimney = cyl(0.032, 0.04, 0.17, m.glass, 0, 0.19, 0, 12);
  const flame = mesh(new ConeGeometry(0.014, 0.06, 8), m.flame, 0, 0.14, 0);
  const h = halo(glow, 0, 0.17, 0, 0.55, 0.55);
  group.add(chimney, flame, h);
  return { group: shadowed(group), flame, halo: h };
}

export interface FurnitureParts {
  group: Group;
  logbook: Object3D;
  chart: Object3D;
  deskLamp: OilLamp;
  deskLampPos: { x: number; y: number; z: number };
  hatch: Object3D;
  ceilingLantern: { group: Group; position: { x: number; y: number; z: number } };
  upperLantern: { group: Group; position: { x: number; y: number; z: number } };
}

function hangingLantern(m: InteriorMaterials, glow: Texture, hangFrom: number, y: number): Group {
  const g = new Group();
  g.add(cyl(0.008, 0.008, hangFrom - y - 0.13, m.iron, 0, (hangFrom - y) / 2 + 0.065, 0, 5));
  g.add(cyl(0.12, 0.09, 0.04, m.brass, 0, 0.12, 0, 6), cyl(0.07, 0.1, 0.22, m.lampShade, 0, 0, 0, 6), cyl(0.09, 0.12, 0.03, m.brass, 0, -0.12, 0, 6));
  g.add(halo(glow, 0, 0, 0, 1.6, 0.5));
  return shadowed(g);
}

export function createFurniture(m: InteriorMaterials, glow: Texture): FurnitureParts {
  const rng = mulberry32(404);
  const group = new Group();
  const ceilingH = CEIL_Y - FLOOR_Y;

  // ---- Bed: timber frame, mattress, plaid blanket, pillow ------------------------------------
  {
    const bed = new Group();
    bed.add(box(2.0, 0.26, 0.95, m.woodDark, 0, 0.17, 0));
    bed.add(box(0.07, 0.95, 0.99, m.woodDark, -1.0, 0.47, 0), box(0.07, 0.55, 0.99, m.woodDark, 1.0, 0.27, 0));
    bed.add(rbox(1.88, 0.2, 0.86, 0.06, m.linen, 0, 0.4, 0));
    bed.add(rbox(1.12, 0.1, 0.92, 0.045, m.blanket, 0.38, 0.53, 0));
    bed.add(rbox(0.5, 0.13, 0.38, 0.06, m.linen, -0.68, 0.56, 0), rbox(0.36, 0.11, 0.3, 0.05, m.linen, -0.66, 0.67, -0.04));
    bed.add(rbox(0.5, 0.06, 0.9, 0.03, m.blanket, -0.08, 0.5, 0.02));
    group.add(placed(shadowed(bed), LAYOUT.bed));
  }

  // ---- Nightstand with a candle -----------------------------------------------------------------
  {
    const stand = new Group();
    stand.add(box(0.44, 0.55, 0.38, m.wood, 0, 0.275, 0), box(0.36, 0.14, 0.01, m.woodDark, 0, 0.4, -0.195), cyl(0.012, 0.012, 0.02, m.brass, 0, 0.4, -0.2, 6));
    stand.add(cyl(0.07, 0.07, 0.015, m.brass, 0, 0.56, 0, 16), cyl(0.018, 0.018, 0.1, m.ceramic, 0, 0.62, 0, 8));
    stand.add(mesh(new ConeGeometry(0.01, 0.04, 6), m.flame, 0, 0.7, 0), halo(glow, 0, 0.71, 0, 0.5, 0.4));
    group.add(placed(shadowed(stand), LAYOUT.nightstand));
  }

  // ---- Desk with logbook, chart, lamp, inkwell, mug, books; chair -------------------------------
  const desk = new Group();
  desk.add(box(1.3, 0.05, 0.7, m.wood, 0, 0.76, 0));
  for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]] as const) desk.add(box(0.06, 0.74, 0.06, m.woodDark, x, 0.37, z));
  desk.add(box(0.5, 0.15, 0.62, m.woodDark, 0.38, 0.65, 0), box(0.46, 0.1, 0.01, m.wood, 0.38, 0.65, -0.315), cyl(0.014, 0.014, 0.02, m.brass, 0.38, 0.65, -0.325, 8));
  const logbook = new Group();
  logbook.add(box(0.32, 0.03, 0.22, m.leather, 0, 0.015, 0), mesh(new PlaneGeometry(0.29, 0.19), m.logbook, 0, 0.032, 0));
  logbook.children[1]!.rotation.x = -Math.PI / 2;
  logbook.position.set(0.1, 0.785, -0.02);
  logbook.rotation.y = 0.15;
  desk.add(logbook);
  const sheet = mesh(new PlaneGeometry(0.46, 0.32), m.chart, -0.12, 0.7875, -0.17);
  sheet.rotation.set(-Math.PI / 2, 0, -0.2);
  desk.add(sheet);
  const deskLamp = oilLamp(m, glow);
  deskLamp.group.position.set(-0.5, 0.785, 0.18);
  desk.add(deskLamp.group);
  desk.add(cyl(0.025, 0.03, 0.05, m.ceramic, 0.5, 0.81, 0.2, 10), cyl(0.02, 0.02, 0.07, m.iron, 0.35, 0.82, 0.22, 8));
  const quill = cyl(0.004, 0.004, 0.22, m.linen, 0.33, 0.9, 0.22, 4);
  quill.rotation.z = 0.5;
  desk.add(quill, rbox(0.2, 0.05, 0.14, 0.01, m.leather, 0.5, 0.815, 0.0), rbox(0.18, 0.04, 0.13, 0.01, m.woodDark, 0.5, 0.857, 0.0));
  const deskPos = polar(LAYOUT.desk.r, LAYOUT.desk.alpha);
  group.add(placed(shadowed(desk), LAYOUT.desk));
  const lampLocal = { x: -0.5, y: 0.785 + 0.17, z: 0.18 };
  const ca = Math.cos(LAYOUT.desk.alpha);
  const sa = Math.sin(LAYOUT.desk.alpha);
  const deskLampPos = { x: deskPos.x + lampLocal.x * ca + lampLocal.z * sa, y: FLOOR_Y + lampLocal.y, z: deskPos.z - lampLocal.x * sa + lampLocal.z * ca };

  const chair = new Group();
  chair.add(box(0.42, 0.05, 0.42, m.wood, 0, 0.45, 0));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) chair.add(box(0.04, 0.45, 0.04, m.woodDark, x, 0.225, z));
  chair.add(box(0.04, 0.5, 0.04, m.woodDark, -0.18, 0.72, 0.2), box(0.04, 0.5, 0.04, m.woodDark, 0.18, 0.72, 0.2));
  for (const y of [0.78, 0.92]) chair.add(box(0.36, 0.07, 0.025, m.wood, 0, y, 0.2));
  group.add(placed(shadowed(chair), LAYOUT.chair, FLOOR_Y, true));

  // ---- Bookshelf: shelves, spines, rolled charts, a lantern ------------------------------------
  {
    const shelf = new Group();
    shelf.add(box(0.045, 2.15, 0.34, m.woodDark, -0.64, 1.075, 0), box(0.045, 2.15, 0.34, m.woodDark, 0.64, 1.075, 0), box(1.3, 2.1, 0.02, m.woodDark, 0, 1.05, 0.16));
    const ys = [0.06, 0.52, 0.94, 1.36, 1.78, 2.14];
    ys.forEach((y) => shelf.add(box(1.3, 0.035, 0.34, m.wood, 0, y, 0)));
    ys.slice(0, 4).forEach((y, i) => {
      const row = bookRow(rng, 1.2, 0.33 + (i % 2) * 0.02, m.linen);
      row.position.set(i % 2 ? 0.05 : -0.05, y + 0.0175, 0.01);
      shelf.add(row);
    });
    for (let i = 0; i < 3; i++) {
      const roll = cyl(0.03, 0.03, 0.4, m.chart, -0.35 + i * 0.07, 1.82 + 0.03, 0, 10);
      roll.rotation.z = Math.PI / 2;
      shelf.add(roll);
    }
    shelf.add(cyl(0.06, 0.07, 0.04, m.brass, 0.3, 1.82, 0, 8), cyl(0.05, 0.06, 0.18, m.lampShade, 0.3, 1.93, 0, 6));
    group.add(placed(shadowed(shelf), LAYOUT.bookshelf));
  }

  // ---- Iron stove with kettle, a glowing grate and a flue to the ceiling -----------------------
  {
    const stove = new Group();
    stove.add(cyl(0.26, 0.27, 0.72, m.iron, 0, 0.55, 0, 20), cyl(0.3, 0.3, 0.04, m.iron, 0, 0.93, 0, 20), cyl(0.3, 0.3, 0.04, m.iron, 0, 0.19, 0, 20));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      stove.add(cyl(0.025, 0.025, 0.18, m.iron, Math.sin(a) * 0.22, 0.09, Math.cos(a) * 0.22, 6));
    }
    const grate = box(0.2, 0.13, 0.02, m.flame, 0, 0.5, -0.27);
    stove.add(grate, halo(glow, 0, 0.5, -0.4, 0.9, 0.35, '#ff8a3a'));
    stove.add(cyl(0.05, 0.05, ceilingH - 0.95, m.iron, 0.05, 0.95 + (ceilingH - 0.95) / 2, 0.1, 10));
    const kettle = mesh(new SphereGeometry(0.12, 12, 8), m.copper, 0.08, 1.04, -0.02);
    kettle.scale.set(1, 0.8, 1);
    stove.add(kettle);
    const spout = cyl(0.015, 0.025, 0.12, m.copper, 0.2, 1.06, -0.02, 6);
    spout.rotation.z = -0.9;
    const handle = mesh(new TorusGeometry(0.08, 0.01, 6, 14, Math.PI), m.iron, 0.08, 1.1, -0.02);
    stove.add(spout, handle);
    group.add(placed(shadowed(stove), LAYOUT.stove));
  }

  // ---- Sea chest, sideboard with crockery ---------------------------------------------------------
  {
    const chest = new Group();
    chest.add(box(1.1, 0.38, 0.55, m.woodDark, 0, 0.19, 0));
    const lidGeo = new CylinderGeometry(0.275, 0.275, 1.1, 16, 1, false, -Math.PI / 2, Math.PI);
    lidGeo.rotateZ(Math.PI / 2);
    lidGeo.rotateX(-Math.PI / 2);
    chest.add(mesh(lidGeo, m.woodDark, 0, 0.38, 0));
    for (const x of [-0.45, 0.45]) chest.add(box(0.06, 0.66, 0.58, m.brass, x, 0.3, 0));
    chest.add(box(0.09, 0.12, 0.03, m.brass, 0, 0.42, -0.29));
    group.add(placed(shadowed(chest), LAYOUT.chest));

    const side = new Group();
    side.add(box(1.0, 0.9, 0.45, m.wood, 0, 0.45, 0), box(1.04, 0.04, 0.48, m.woodDark, 0, 0.92, 0));
    side.add(box(0.46, 0.7, 0.01, m.woodDark, -0.25, 0.45, -0.23), box(0.46, 0.7, 0.01, m.woodDark, 0.25, 0.45, -0.23), cyl(0.013, 0.013, 0.02, m.brass, -0.03, 0.45, -0.24, 6), cyl(0.013, 0.013, 0.02, m.brass, 0.03, 0.45, -0.24, 6));
    for (let i = 0; i < 3; i++) side.add(cyl(0.04, 0.03, 0.08, m.ceramic, -0.3 + i * 0.11, 0.98, 0.05, 10));
    const plate = cyl(0.11, 0.11, 0.012, m.ceramic, 0.28, 0.95, 0.04, 16);
    side.add(plate, cyl(0.06, 0.06, 0.1, m.brass, 0.1, 0.99, -0.05, 10));
    group.add(placed(shadowed(side), LAYOUT.sideboard));
  }

  // ---- By the door: oilskin coat on hooks, boots -------------------------------------------------
  {
    const hooks = new Group();
    hooks.add(box(0.8, 0.1, 0.04, m.woodDark, 0, 1.78, -0.02));
    for (const x of [-0.25, 0, 0.25]) {
      const peg = cyl(0.014, 0.014, 0.1, m.iron, x, 1.78, -0.08, 6);
      peg.rotation.x = Math.PI / 2;
      hooks.add(peg);
    }
    const coat = mesh(new CylinderGeometry(0.15, 0.25, 0.95, 14), m.oilskin, -0.02, 1.25, -0.14);
    coat.scale.z = 0.55;
    hooks.add(coat, box(0.09, 0.55, 0.12, m.oilskin, -0.2, 1.25, -0.14), box(0.09, 0.55, 0.12, m.oilskin, 0.16, 1.25, -0.14));
    const hat = cyl(0.14, 0.2, 0.05, m.oilskin, 0.25, 1.62, -0.12, 14);
    hooks.add(hat);
    group.add(placed(shadowed(hooks), LAYOUT.coatHooks, FLOOR_Y));

    const boots = new Group();
    for (const x of [-0.08, 0.1]) {
      boots.add(rbox(0.11, 0.3, 0.1, 0.02, m.leather, x, 0.15, 0), rbox(0.11, 0.1, 0.24, 0.03, m.leather, x, 0.05, -0.08), box(0.12, 0.025, 0.28, m.iron, x, 0.0125, -0.06));
    }
    group.add(placed(shadowed(boots), LAYOUT.boots));
  }

  // ---- Wall chart ---------------------------------------------------------------------------------------
  const chart = new Group();
  {
    const frame = new Group();
    frame.add(box(1.02, 0.74, 0.04, m.woodDark, 0, 0, 0));
    const sheetPlane = mesh(new PlaneGeometry(0.9, 0.62), m.chart, 0, 0, -0.022);
    sheetPlane.rotation.y = Math.PI;
    frame.add(sheetPlane);
    frame.position.y = 1.7 - FLOOR_Y;
    chart.add(shadowed(frame));
    placed(chart, LAYOUT.chart);
    group.add(chart);
  }

  // ---- Round rug -------------------------------------------------------------------------------------------
  {
    const rugGeo = new CircleGeometry(1.15, 40);
    rugGeo.rotateX(-Math.PI / 2);
    const c = polar(LAYOUT.rug.r, LAYOUT.rug.alpha);
    const rug = mesh(rugGeo, m.rug, c.x, FLOOR_Y + 0.012, c.z);
    rug.receiveShadow = true;
    group.add(rug);
  }

  // ---- Hanging lanterns -------------------------------------------------------------------------------------
  const ceilingLantern = hangingLantern(m, glow, CEIL_Y, LAYOUT.lantern.y);
  ceilingLantern.position.set(LAYOUT.lantern.x, LAYOUT.lantern.y, LAYOUT.lantern.z);
  group.add(ceilingLantern);
  const upperLantern = hangingLantern(m, glow, UPPER_CEIL_Y, LAYOUT.upperLantern.y);
  upperLantern.position.set(LAYOUT.upperLantern.x, LAYOUT.upperLantern.y, LAYOUT.upperLantern.z);
  group.add(upperLantern);

  // ---- Upper room: telescope, table with a lamp, crate, ladder and the sealed hatch -------------------------
  {
    const scope = new Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.015, 0.02, 1.2, m.woodDark, Math.sin(a) * 0.13, 0.57, Math.cos(a) * 0.13, 6);
      leg.rotation.set(Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22);
      scope.add(leg);
    }
    const tube = cyl(0.045, 0.055, 0.95, m.brass, 0, 1.28, 0, 14);
    tube.rotation.x = Math.PI / 2 - 0.35;
    scope.add(tube, cyl(0.06, 0.06, 0.04, m.iron, 0, 1.22, 0, 10));
    const c = polar(LAYOUT.telescope.r, LAYOUT.telescope.alpha);
    scope.position.set(c.x, UPPER_Y, c.z);
    scope.rotation.y = Math.atan2(-c.x, 3.0 - c.z); // tube points out of the south window
    group.add(shadowed(scope));

    const table = new Group();
    table.add(cyl(0.3, 0.3, 0.04, m.wood, 0, 0.72, 0, 20), cyl(0.04, 0.04, 0.7, m.woodDark, 0, 0.35, 0, 8), cyl(0.16, 0.19, 0.04, m.woodDark, 0, 0.02, 0, 12));
    const lamp = oilLamp(m, glow);
    lamp.group.position.set(0.05, 0.74, 0);
    table.add(lamp.group, cyl(0.03, 0.025, 0.06, m.ceramic, -0.16, 0.77, 0.08, 10));
    group.add(placed(shadowed(table), LAYOUT.table, UPPER_Y));

    const crate = new Group();
    crate.add(box(0.74, 0.44, 0.56, m.woodDark, 0, 0.22, 0), box(0.78, 0.04, 0.6, m.wood, 0, 0.46, 0));
    for (const x of [-0.3, 0.3]) crate.add(box(0.05, 0.46, 0.6, m.iron, x, 0.23, 0));
    const rope = mesh(new TorusGeometry(0.16, 0.035, 8, 20), m.linen, 0.05, 0.53, 0);
    rope.rotation.x = Math.PI / 2;
    crate.add(rope);
    group.add(placed(shadowed(crate), LAYOUT.crate, UPPER_Y));
  }

  const hatchGroup = new Group();
  {
    const c = polar(LAYOUT.hatch.r, LAYOUT.hatch.alpha);
    hatchGroup.add(box(0.9, 0.06, 0.9, m.woodDark, 0, 0, 0));
    for (const x of [-0.28, 0.28]) hatchGroup.add(box(0.06, 0.07, 0.92, m.iron, x, 0, 0));
    hatchGroup.add(box(0.1, 0.05, 0.1, m.brass, 0, -0.05, -0.34), cyl(0.012, 0.012, 0.12, m.brass, 0, -0.07, -0.34, 6));
    hatchGroup.rotation.y = LAYOUT.hatch.alpha;
    hatchGroup.position.set(c.x, UPPER_CEIL_Y - 0.04, c.z);
    group.add(shadowed(hatchGroup));
    const ladder = new Group();
    const h = UPPER_CEIL_Y - UPPER_Y - 0.1;
    for (const x of [-0.22, 0.22]) ladder.add(box(0.045, h, 0.045, m.iron, x, h / 2, 0));
    for (let i = 0; i < 9; i++) {
      const rung = cyl(0.013, 0.013, 0.44, m.iron, 0, 0.3 + i * 0.32, 0, 6);
      rung.rotation.z = Math.PI / 2;
      ladder.add(rung);
    }
    const lc = polar(2.88, LAYOUT.hatch.alpha);
    ladder.position.set(lc.x, UPPER_Y, lc.z);
    ladder.rotation.y = LAYOUT.hatch.alpha;
    group.add(shadowed(ladder));
  }

  return {
    group,
    logbook,
    chart,
    deskLamp,
    deskLampPos,
    hatch: hatchGroup,
    ceilingLantern: { group: ceilingLantern, position: { ...LAYOUT.lantern } },
    upperLantern: { group: upperLantern, position: { ...LAYOUT.upperLantern } },
  };
}
