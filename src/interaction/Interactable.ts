import type { Object3D } from 'three';

/** What an interactable can do to the outside world, without knowing anything about the UI layer. */
export interface InteractionContext {
  showPanel(title: string, body: string): void;
  hidePanel(): void;
}

/**
 * Anything the player can look at and press E on. Future collectibles, repair tasks, doors and
 * machinery implement this same interface and are registered with the InteractionSystem.
 */
export interface Interactable {
  readonly id: string;
  /** Root object; every mesh below it is a valid raycast target. */
  readonly object: Object3D;
  /** Text for the contextual prompt (e.g. "Read the plaque"). */
  readonly prompt: string | (() => string);
  /** Maximum distance in metres from the camera at which the object can be used. */
  readonly maxDistance: number;
  onInteract(ctx: InteractionContext): void;
}
