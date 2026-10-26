import { BoxGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, PlaneGeometry, MeshStandardMaterial, PointLight, RingGeometry, type Texture } from 'three';
import { type GameServices } from '../../core/services';
import { type Interactable } from '../../interaction/Interactable';
import { buildWallSurface } from '../wallGeometry';
import { createGlowTexture } from '../textures';
import { createFurniture } from './Furniture';
import { LAYOUT } from './furnitureLayout';
import { CEIL_Y, DOOR_ANGLE, DOOR_OPENING, FLOOR_Y, GROUND_WINDOWS, R_IN, R_UP, STAIR, UPPER_CEIL_Y, UPPER_WINDOW, UPPER_Y, foundationRadius, polar, type WallOpening } from './layout';
import { createInteriorMaterials, type InteriorMaterials } from './materials';
import { createStair } from './Stairs';

export interface InteriorBuild {
  group: Group;
  interactables: Interactable[];
  /** Surfaces that hide what is behind them from the interaction ray. */
  blockers: Mesh[];
  update(time: number): void;
}

const LOGBOOK_TEXT = [
  '14 March. Glass cleaned, wicks trimmed. Calm all day, the sea like pewter.',
  '2 April. The light dimmed again at dusk. I can find no fault with the lamp, the oil or the clockwork.',
  '9 April. Nothing on the shore but sea glass. Last night I heard the old lens ring like a struck bell, though no one was near it.',
].join('\n\n');

const CHART_TEXT = [
  'A chart of this island in a careful hand. A dotted path climbs from the southern beach to the light.',
  'In pencil, beside the tower: “light dims here at dusk?”',
].join('\n\n');

const HATCH_TEXT = [
  'The hatch above the ladder is bolted from the other side. Someone has scratched a small sun into the wood.',
  'The lantern room must be beyond it.',
].join('\n\n');

/** Frame, glass, sill and stone dressing for one window opening. Built in the room frame. */
function windowDressing(op: WallOpening, rIn: number, rOut: (y: number) => number, m: InteriorMaterials): Group {
  const g = new Group();
  const yMid = (op.y0 + op.y1) / 2;
  const h = op.y1 - op.y0;
  const rMid = (rIn + rOut(yMid)) / 2;
  const chord = 2 * rMid * Math.sin(op.halfAngle);
  const add = (geo: BoxGeometry | PlaneGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = mat !== m.glass;
    g.add(mesh);
    return mesh;
  };
  const glass = add(new PlaneGeometry(chord, h), m.glass, 0, yMid, 0);
  glass.renderOrder = 2;
  add(new BoxGeometry(chord + 0.04, 0.06, 0.09), m.woodDark, 0, op.y1, 0);
  add(new BoxGeometry(chord + 0.04, 0.06, 0.09), m.woodDark, 0, op.y0, 0);
  for (const s of [-1, 1]) add(new BoxGeometry(0.06, h, 0.09), m.woodDark, (s * chord) / 2, yMid, 0);
  add(new BoxGeometry(0.025, h, 0.04), m.woodDark, 0, yMid, 0);
  add(new BoxGeometry(chord, 0.025, 0.04), m.woodDark, 0, yMid + h * 0.12, 0);
  const zIn = rIn - rMid;
  add(new BoxGeometry(chord + 0.36, 0.05, 0.3), m.wood, 0, op.y0 - 0.01, zIn - 0.06);
  add(new BoxGeometry(chord + 0.4, 0.08, 0.3), m.stone, 0, op.y0 - 0.04, rOut(op.y0) - rMid + 0.08);
  add(new BoxGeometry(chord + 0.4, 0.2, 0.3), m.stone, 0, op.y1 + 0.1, rOut(op.y1) - rMid + 0.06);
  const c = polar(rMid, op.alpha);
  g.position.set(c.x, 0, c.z);
  g.rotation.y = op.alpha;
  return g;
}

export function createInterior(services: GameServices, towerRadius: (y: number) => number): InteriorBuild {
  const m = createInteriorMaterials();
  const glow: Texture = createGlowTexture();
  const root = new Group();
  const blockers: Mesh[] = [];
  const shell = (geo: ConstructorParameters<typeof Mesh>[0], mat: MeshStandardMaterial, opts: { y?: number; shadow?: boolean } = {}) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.y = opts.y ?? 0;
    mesh.receiveShadow = true;
    mesh.castShadow = opts.shadow ?? false;
    root.add(mesh);
    blockers.push(mesh);
    return mesh;
  };

  // Walls, built in the lighthouse frame (angles include the door rotation).
  const groundOpenings = [DOOR_OPENING, ...GROUND_WINDOWS];
  shell(buildWallSurface({ radius: () => R_IN, yA: FLOOR_Y, yB: FLOOR_Y + 0.9, openings: groundOpenings, inward: true, uvTile: 1.6 }), m.wainscot);
  shell(buildWallSurface({ radius: () => R_IN, yA: FLOOR_Y + 0.9, yB: CEIL_Y, openings: groundOpenings, inward: true, uvTile: 2.4 }), m.plaster);
  shell(buildWallSurface({ radius: () => R_UP, yA: UPPER_Y, yB: UPPER_CEIL_Y, openings: [UPPER_WINDOW], inward: true, uvTile: 2.4 }), m.plaster);

  // Everything else lives in the room frame: +z out of the door.
  const room = new Group();
  room.rotation.y = DOOR_ANGLE;
  root.add(room);
  const flat = (geo: RingGeometry | CircleGeometry, mat: MeshStandardMaterial, y: number, up: boolean) => {
    geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    const mesh = new Mesh(geo, mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    room.add(mesh);
    blockers.push(mesh);
  };
  const floorGeo = new CircleGeometry(R_IN, 64);
  flat(floorGeo, m.floor, FLOOR_Y, true);
  flat(new RingGeometry(STAIR.well, R_IN, 64, 1), m.ceiling, CEIL_Y, false);
  flat(new RingGeometry(STAIR.well, R_UP + 0.05, 64, 1), m.upperFloor, UPPER_Y, true);
  flat(new CircleGeometry(R_UP, 48), m.ceiling, UPPER_CEIL_Y, false);
  const wellWall = new Mesh(new CylinderGeometry(STAIR.well, STAIR.well, UPPER_Y - CEIL_Y, 40, 1, true), new MeshStandardMaterial({ color: '#8a6d4c', roughness: 0.85, side: DoubleSide }));
  wellWall.position.y = (UPPER_Y + CEIL_Y) / 2;
  room.add(wellWall);

  // Exposed ceiling beams.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const len = R_IN - STAIR.well - 0.1;
    const beam = new Mesh(new BoxGeometry(len, 0.2, 0.17), m.beam);
    const c = polar((R_IN + STAIR.well) / 2, a);
    beam.position.set(c.x, CEIL_Y - 0.1, c.z);
    beam.rotation.y = a - Math.PI / 2;
    beam.castShadow = beam.receiveShadow = true;
    room.add(beam);
  }

  for (const op of GROUND_WINDOWS) room.add(windowDressing(op, R_IN, foundationRadius, m));
  room.add(windowDressing(UPPER_WINDOW, R_UP, towerRadius, m));
  room.add(createStair(m));

  const furniture = createFurniture(m, glow);
  room.add(furniture.group);

  // Warm, local light: a ceiling lantern, the desk lamp and the upper lantern. No shadows (cheap).
  const lantern = new PointLight('#ffb066', 16, 8.5, 2);
  lantern.position.set(furniture.ceilingLantern.position.x, furniture.ceilingLantern.position.y - 0.05, furniture.ceilingLantern.position.z);
  const deskLight = new PointLight('#ffb870', 5, 4.2, 2);
  deskLight.position.set(furniture.deskLampPos.x, furniture.deskLampPos.y + 0.12, furniture.deskLampPos.z);
  const upperLight = new PointLight('#ffb066', 10, 7, 2);
  upperLight.position.set(LAYOUT.upperLantern.x, LAYOUT.upperLantern.y - 0.05, LAYOUT.upperLantern.z);
  room.add(lantern, deskLight, upperLight);

  // ---- Interactions -------------------------------------------------------------------------------
  let lampOn = true;
  const interactables: Interactable[] = [
    {
      id: 'keeper-logbook',
      object: furniture.logbook,
      prompt: 'Read the logbook',
      maxDistance: 2.8,
      onInteract(ctx) {
        services.audio.play('paper');
        ctx.showPanel('Keeper’s logbook', LOGBOOK_TEXT);
      },
    },
    {
      id: 'sea-chart',
      object: furniture.chart,
      prompt: 'Study the sea chart',
      maxDistance: 3.0,
      onInteract(ctx) {
        services.audio.play('paper');
        ctx.showPanel('Sea chart', CHART_TEXT);
      },
    },
    {
      id: 'desk-lamp',
      object: furniture.deskLamp.group,
      prompt: () => (lampOn ? 'Turn the lamp off' : 'Turn the lamp on'),
      maxDistance: 2.8,
      onInteract() {
        lampOn = !lampOn;
        furniture.deskLamp.flame.visible = lampOn;
        furniture.deskLamp.halo.visible = lampOn;
        services.audio.play('click');
      },
    },
    {
      id: 'sealed-hatch',
      object: furniture.hatch,
      prompt: 'Inspect the hatch',
      maxDistance: 3.6,
      onInteract(ctx) {
        services.audio.play('click');
        ctx.showPanel('Sealed hatch', HATCH_TEXT);
      },
    },
  ];

  return {
    group: root,
    interactables,
    blockers,
    update(time) {
      const flicker = 1 + 0.035 * Math.sin(time * 7.1) + 0.02 * Math.sin(time * 13.3);
      lantern.intensity = 16 * flicker;
      upperLight.intensity = 10 * flicker;
      deskLight.intensity = lampOn ? 5 * flicker : 0;
      furniture.deskLamp.flame.scale.y = 0.9 + 0.2 * Math.sin(time * 9.1);
    },
  };
}
