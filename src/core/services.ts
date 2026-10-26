import { type AudioFeedback } from '../audio/AudioFeedback';
import { type Inventory } from '../inventory/Inventory';
import { type Interactable } from '../interaction/Interactable';

/** Shared game services handed to world objects that need to talk to the rest of the game. */
export interface GameServices {
  inventory: Inventory;
  audio: AudioFeedback;
  /** Short, restrained message near the bottom of the screen. */
  notify(message: string): void;
  /** Removes an interactable from the interaction system (e.g. after it was collected). */
  unregister(item: Interactable): void;
}
