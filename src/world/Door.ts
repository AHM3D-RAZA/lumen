import { BoxGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry } from 'three';
import { type BoxCollider, type CollisionWorld } from '../core/collision';
import { type GameServices } from '../core/services';
import { smoothstep } from '../core/math';
import { type Interactable } from '../interaction/Interactable';
import { DOOR_ANGLE, DOOR_LEAF, localToWorld, worldToLocal } from './interior/layout';

const OPEN_SECONDS = 0.9;
const OPEN_ANGLE = 1.66; // ~95 degrees
const HALF_WIDTH = DOOR_LEAF.width / 2;

export interface DoorBuild {
  group: Group;
  interactable: Interactable;
  update(dt: number, player: { x: number; z: number }): void;
  isOpen(): boolean;
  /** `target` is where it is heading (1 = open); `settled` is true once the animation has finished. */
  state(): { target: number; settled: boolean };
}

/**
 * The front door: a planked leaf hinged on one jamb. It always swings away from whoever opens it, its
 * collider follows its state (closed across the doorway, open along the wall), and it will not shut on
 * the player.
 */
export function createDoor(collision: CollisionWorld, services: GameServices, woodMat: MeshStandardMaterial, stoneMat: MeshStandardMaterial, ironMat: MeshStandardMaterial): DoorBuild {
  const group = new Group();
  group.rotation.y = DOOR_ANGLE;

  // Static surround: stone jambs and lintel outside, a plain timber architrave inside.
  const outer = new Group();
  const jamb = (x: number) => new Mesh(new BoxGeometry(0.3, 2.95, 0.26).translate(x, 1.5, 4.94), stoneMat);
  const lintel = new Mesh(new BoxGeometry(2.95, 0.34, 0.3).translate(0, 2.97, 4.93), stoneMat);
  outer.add(jamb(-1.16), jamb(1.16), lintel);
  const trim = (w: number, h: number, x: number, y: number) => new Mesh(new BoxGeometry(w, h, 0.1).translate(x, y, 4.14), woodMat);
  outer.add(trim(0.12, 2.7, -0.9, 1.5), trim(0.12, 2.7, 0.9, 1.5), trim(1.92, 0.12, 0, 2.84));
  outer.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = (o as Mesh).receiveShadow = true;
  });
  group.add(outer);

  // The leaf, hinged at the left jamb (seen from outside).
  const pivot = new Group();
  pivot.position.set(DOOR_LEAF.hingeX, 0, DOOR_LEAF.z);
  group.add(pivot);
  const leaf = new Mesh(new BoxGeometry(DOOR_LEAF.width, DOOR_LEAF.height, 0.1).translate(HALF_WIDTH, DOOR_LEAF.y0 + DOOR_LEAF.height / 2, 0), woodMat);
  leaf.castShadow = leaf.receiveShadow = true;
  pivot.add(leaf);
  for (const y of [0.55, 1.35, 2.2]) {
    pivot.add(new Mesh(new BoxGeometry(DOOR_LEAF.width - 0.12, 0.09, 0.125).translate(HALF_WIDTH, y, 0), ironMat));
  }
  for (const side of [-1, 1]) {
    const ring = new Mesh(new TorusGeometry(0.075, 0.016, 6, 16).translate(1.38, 1.15, side * 0.075), ironMat);
    const plate = new Mesh(new BoxGeometry(0.07, 0.18, 0.025).translate(1.38, 1.3, side * 0.06), ironMat);
    pivot.add(ring, plate);
  }
  const closedAt = localToWorld(0, DOOR_LEAF.z);
  const collider: BoxCollider = collision.addBox(closedAt.x, closedAt.z, HALF_WIDTH, 0.12, DOOR_ANGLE);

  let progress = 0;
  let target = 0;
  let swing = 1;
  let player = { x: closedAt.x, z: closedAt.z };

  const inDoorway = (): boolean => {
    const { lx, lz } = worldToLocal(player.x, player.z);
    return Math.abs(lx) < 1.25 && lz > 3.75 && lz < 5.2;
  };

  const setClosedCollider = () => {
    collider.setPose(closedAt.x, closedAt.z, DOOR_ANGLE);
    collider.enabled = true;
  };
  const setOpenCollider = () => {
    const a = swing * OPEN_ANGLE;
    const lx = DOOR_LEAF.hingeX + HALF_WIDTH * Math.cos(a);
    const lz = DOOR_LEAF.z - HALF_WIDTH * Math.sin(a);
    const w = localToWorld(lx, lz);
    collider.setPose(w.x, w.z, DOOR_ANGLE + a);
    collider.enabled = true;
  };

  const interactable: Interactable = {
    id: 'front-door',
    object: pivot,
    prompt: () => (target === 1 ? 'Close the door' : 'Open the door'),
    maxDistance: 3.2,
    onInteract() {
      if (progress !== target) return; // already moving
      if (target === 0) {
        const { lz } = worldToLocal(player.x, player.z);
        swing = lz > DOOR_LEAF.z ? 1 : -1; // swing away from the person opening it
        collider.enabled = false;
        target = 1;
        services.audio.play('doorOpen');
      } else if (inDoorway()) {
        services.notify('Something is in the doorway.');
      } else {
        collider.enabled = false;
        target = 0;
        services.audio.play('doorClose');
      }
    },
  };

  return {
    group,
    interactable,
    isOpen: () => target === 1,
    state: () => ({ target, settled: progress === target }),
    update(dt, p) {
      player = p;
      if (progress === target) return;
      progress = Math.min(1, Math.max(0, progress + Math.sign(target - progress) * (dt / OPEN_SECONDS)));
      pivot.rotation.y = swing * OPEN_ANGLE * smoothstep(0, 1, progress);
      if (progress !== target) return;
      if (target === 1) {
        setOpenCollider();
      } else if (inDoorway()) {
        // Never shut the door on someone standing in it: swing it back open.
        target = 1;
        services.notify('Something is in the doorway.');
      } else {
        setClosedCollider();
      }
    },
  };
}
