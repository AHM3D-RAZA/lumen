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
  private current: Interactable | null = null;
  private currentPrompt: string | null = null;
  private maxRange = 0;

  /** Called whenever the prompt text shown for the current target changes (null = nothing targeted). */
  onPromptChange: ((prompt: string | null) => void) | null = null;

  register(item: Interactable): void {
    item.object.traverse((child) => {
      if ((child as Mesh).isMesh) {
        this.lookup.set(child, item);
        this.meshes.push(child);
      }
    });
    this.maxRange = Math.max(this.maxRange, item.maxDistance);
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
      if (hit && item && hit.distance <= item.maxDistance) found = item;
    }
    const prompt = found ? (typeof found.prompt === 'function' ? found.prompt() : found.prompt) : null;
    this.current = found;
    if (prompt !== this.currentPrompt) {
      this.currentPrompt = prompt;
      this.onPromptChange?.(prompt);
    }
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
