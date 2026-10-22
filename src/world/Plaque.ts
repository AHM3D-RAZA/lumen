import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { type CollisionWorld } from '../core/collision';
import { type Interactable } from '../interaction/Interactable';
import { LIGHTHOUSE } from './layout';
import { DOOR_ANGLE } from './Lighthouse';
import { createStoneTexture } from './textures';

const PLAQUE_TITLE = 'Lumen Light Station';
const PLAQUE_BODY = [
  'Raised in 1887 on the last rock before the open sea.',
  'Keepers: tend the flame, log the weather, and watch the water. Every ship that passes in the dark is trusting you.',
];

/** Engraved brass face drawn on a canvas so the plaque really carries text. */
function createPlateTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 340;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available in this browser.');
  const g = ctx.createLinearGradient(0, 0, 512, 340);
  g.addColorStop(0, '#d7b565');
  g.addColorStop(0.5, '#b8923f');
  g.addColorStop(1, '#a07c33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 340);
  ctx.strokeStyle = 'rgba(60,40,10,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 476, 304);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 452, 280);
  ctx.fillStyle = 'rgba(50,32,8,0.88)';
  ctx.textAlign = 'center';
  ctx.font = '600 46px Georgia, "Times New Roman", serif';
  ctx.fillText('LUMEN LIGHT', 256, 112);
  ctx.font = '26px Georgia, "Times New Roman", serif';
  ctx.fillText('KEEPER\u2019S STATION', 256, 156);
  ctx.fillRect(166, 182, 180, 2);
  ctx.font = 'italic 28px Georgia, "Times New Roman", serif';
  ctx.fillText('Established 1887', 256, 232);
  ctx.font = '20px Georgia, "Times New Roman", serif';
  ctx.fillText('Tend the flame \u00b7 Watch the water', 256, 280);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface PlaqueBuild {
  group: Group;
  interactable: Interactable;
}

/** A stone lectern with a brass plaque beside the path to the lighthouse door: the demonstration interactable. */
export function createPlaque(collision: CollisionWorld): PlaqueBuild {
  const doorTheta = Math.atan2(LIGHTHOUSE.doorDir.z, LIGHTHOUSE.doorDir.x);
  const a = doorTheta + 0.62;
  const x = LIGHTHOUSE.x + Math.cos(a) * 7.4;
  const z = LIGHTHOUSE.z + Math.sin(a) * 7.4;

  const group = new Group();
  group.position.set(x, LIGHTHOUSE.padHeight, z);
  group.rotation.y = DOOR_ANGLE - 0.15;

  const stoneTex = createStoneTexture();
  stoneTex.repeat.set(0.6, 0.25);
  const stone = new MeshStandardMaterial({ map: stoneTex, roughness: 0.92, color: '#c0c6c9' });
  const pedestal = new Mesh(new BoxGeometry(0.72, 0.74, 0.5).translate(0, 0.37, 0), stone);
  const slope = new Mesh(new BoxGeometry(0.76, 0.14, 0.62).translate(0, 0, 0), stone);
  slope.position.set(0, 0.8, 0.0);
  slope.rotation.x = 0.55;

  const brass = new MeshStandardMaterial({ map: createPlateTexture(), color: '#ffffff', metalness: 0.75, roughness: 0.4 });
  const plate = new Mesh(new BoxGeometry(0.56, 0.37, 0.025), brass);
  plate.position.set(0, 0.8, 0.0);
  plate.rotation.x = 0.55;
  plate.translateZ(0.085);
  plate.rotation.order = 'XYZ';
  for (const m of [pedestal, slope, plate]) m.castShadow = m.receiveShadow = true;
  group.add(pedestal, slope, plate);

  collision.addCircle(x, z, 0.55);

  const interactable: Interactable = {
    id: 'keeper-plaque',
    object: group,
    prompt: 'Read the plaque',
    maxDistance: 3.4,
    onInteract(ctx) {
      ctx.showPanel(PLAQUE_TITLE, PLAQUE_BODY.join('\n\n'));
    },
  };
  return { group, interactable };
}
