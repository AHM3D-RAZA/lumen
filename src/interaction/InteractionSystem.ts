import { type Camera, type Mesh, type Object3D, Raycaster, Vector2 } from 'three';
import type { Interactable, InteractionContext } from './Interactable';

const SCREEN_CENTER = new Vector2(0, 0);

/**
 * Casts a ray through the centre of the view, finds the nearest registered interactable within its
 * range and reports a prompt. Knows nothing about rendering-specific UI: callers subscribe to changes.
 */
export class InteractionSystem {
  private readonly raycaster = new Raycaster();
  private readonly lookup = new Map<Object3D, Interactable>();
  private readonly meshes: Object3D[] = [];
  private readonly owned = new Map<Interactable, Object3D[]>();
  private blockers: Object3D[] = [];
  private current: Interactable | null = null;
  private currentPrompt: string | null = null;
  private maxRange = 0;

  /** Called whenever the prompt text shown for the current target changes (null = nothing targeted). */
  onPromptChange: ((prompt: string | null) => void) | null = null;

  register(item: Interactable): void {
    const mine: Object3D[] = [];
    item.object.traverse((child) => {
      if ((child as Mesh).isMesh) {
        this.lookup.set(child, item);
        this.meshes.push(child);
        mine.push(child);
      }
    });
    this.owned.set(item, mine);
    this.maxRange = Math.max(this.maxRange, item.maxDistance);
  }

  /** Stops an interactable from being targeted (e.g. it was collected). */
  unregister(item: Interactable): void {
    const mine = this.owned.get(item);
    if (!mine) return;
    for (const m of mine) {
      this.lookup.delete(m);
      const i = this.meshes.indexOf(m);
      if (i >= 0) this.meshes.splice(i, 1);
    }
    this.owned.delete(item);
    if (this.current === item) this.clearTarget();
  }

  /** Solid meshes (walls, terrain, rocks) that hide interactables behind them. Only tested when something is targeted. */
  setBlockers(blockers: Object3D[]): void {
    this.blockers = blockers;
  }

  get target(): Interactable | null {
    return this.current;
  }

  update(camera: Camera): void {
    let found: Interactable | null = null;
    if (this.meshes.length > 0) {
      camera.updateMatrixWorld();
      this.raycaster.setFromCamera(SCREEN_CENTER, camera);
      this.raycaster.far = this.maxRange;
      const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
      const item = hit ? this.lookup.get(hit.object) : undefined;
      if (hit && item && hit.distance <= item.maxDistance && !this.isOccluded(hit.distance)) found = item;
    }
    const prompt = found ? (typeof found.prompt === 'function' ? found.prompt() : found.prompt) : null;
    this.current = found;
    if (prompt !== this.currentPrompt) {
      this.currentPrompt = prompt;
      this.onPromptChange?.(prompt);
    }
  }

  /** True if a solid surface lies between the camera and a hit `distance` along the current ray. */
  private isOccluded(distance: number): boolean {
    if (this.blockers.length === 0) return false;
    const far = this.raycaster.far;
    this.raycaster.far = Math.max(0, distance - 0.03);
    const blocked = this.raycaster.intersectObjects(this.blockers, false).length > 0;
    this.raycaster.far = far;
    return blocked;
  }

  /** Triggers the currently targeted interactable. Returns true if something was triggered. */
  interact(ctx: InteractionContext): boolean {
    if (!this.current) return false;
    this.current.onInteract(ctx);
    return true;
  }

  /** Forget the current target (e.g. when the game is paused). */
  clearTarget(): void {
    this.current = null;
    if (this.currentPrompt !== null) {
      this.currentPrompt = null;
      this.onPromptChange?.(null);
    }
  }
}
