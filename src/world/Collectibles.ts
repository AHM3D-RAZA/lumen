import { Group, type Points, type PointsMaterial } from 'three';
import { type GameServices } from '../core/services';
import { type Interactable } from '../interaction/Interactable';
import { ITEM_INFO } from '../inventory/Inventory';
import { createCollectibleKit } from './collectibleModels';
import { type CollectibleSpec } from './collectiblePlan';
import { createGlowTexture } from './textures';
import { heightAt } from './terrain';

const PICKUP_SECONDS = 0.3;

interface Entry {
  spec: CollectibleSpec;
  root: Group;
  visual: Group;
  interactable: Interactable;
  taken: boolean;
  fade: number;
}

export interface Collectibles {
  group: Group;
  interactables: Interactable[];
  /** Everything that was placed (including already-collected ids), for tests and debugging. */
  specs: CollectibleSpec[];
  update(time: number, dt: number): void;
}

/**
 * Collectible objects scattered around the island. Each one is a real 3D object with an interactable;
 * picking it up shrinks it away, adds it to the inventory and unregisters it. Objects whose ids are already
 * in the saved collection are never created, so nothing comes back after a reload.
 */
export function createCollectibles(specs: CollectibleSpec[], services: GameServices): Collectibles {
  const group = new Group();
  const kit = createCollectibleKit(createGlowTexture());
  const entries: Entry[] = [];

  if (specs.some((s) => s.type === 'lens_shard')) {
    const s = specs.find((x) => x.type === 'lens_shard')!;
    const cairn = kit.createCairn();
    cairn.position.set(s.x, heightAt(s.x, s.z) - 0.02, s.z);
    group.add(cairn);
  }

  for (const spec of specs) {
    if (services.inventory.isCollected(spec.id)) continue;
    const { visual, proxy } = kit.create(spec.type, spec.variant);
    const root = new Group();
    const ground = heightAt(spec.x, spec.z);
    root.position.set(spec.x, ground + (spec.type === 'lens_shard' ? 0.3 : 0.0), spec.z);
    visual.rotation.y = spec.rotY;
    root.add(visual, proxy);
    group.add(root);

    const info = ITEM_INFO[spec.type];
    const entry: Entry = {
      spec,
      root,
      visual,
      taken: false,
      fade: 0,
      interactable: {
        id: spec.id,
        object: root,
        prompt: info.prompt,
        maxDistance: spec.type === 'driftwood' ? 3.2 : 2.6,
        onInteract() {
          if (entry.taken) return;
          if (!services.inventory.add(spec.type, spec.id)) return;
          entry.taken = true;
          services.unregister(entry.interactable);
          services.audio.play(spec.type === 'lens_shard' ? 'rare' : 'pickup', spec.variant);
          services.notify(
            spec.type === 'lens_shard' ? 'Lens shard — it hums, very faintly' : `${info.name} collected · ${services.inventory.count(spec.type)}`,
          );
        },
      },
    };
    entries.push(entry);
  }

  return {
    group,
    interactables: entries.map((e) => e.interactable),
    specs,
    update(time, dt) {
      for (const e of entries) {
        if (e.spec.type === 'lens_shard' && !e.taken) {
          e.visual.position.y = 0.025 * Math.sin(time * 1.4);
          e.visual.rotation.y = e.spec.rotY + time * 0.35;
          const halo = e.visual.getObjectByName('halo') as Points | undefined;
          if (halo) (halo.material as PointsMaterial).opacity = 0.32 + 0.14 * Math.sin(time * 1.9);
        }
        if (e.taken && e.fade < 1) {
          e.fade = Math.min(1, e.fade + dt / PICKUP_SECONDS);
          const k = 1 - e.fade * e.fade;
          e.visual.scale.setScalar(Math.max(0.001, k));
          e.root.position.y += dt * 0.5;
          if (e.fade >= 1) e.root.removeFromParent();
        }
      }
    },
  };
}
