/**
 * The player's collection: quantities per item type plus the ids of collected world objects, so a
 * collected object never reappears after a reload. Persisted in localStorage; anything unreadable or
 * out of date is ignored rather than trusted.
 */

export type ItemType = 'driftwood' | 'sea_glass' | 'shell' | 'lens_shard';

export const ITEM_ORDER: readonly ItemType[] = ['driftwood', 'sea_glass', 'shell', 'lens_shard'];

export interface ItemInfo {
  name: string;
  /** Prompt shown when looking at one in the world. */
  prompt: string;
  blurb: string;
}

export const ITEM_INFO: Record<ItemType, ItemInfo> = {
  driftwood: { name: 'Driftwood', prompt: 'Pick up driftwood', blurb: 'Silver-grey, worn smooth by a long journey.' },
  sea_glass: { name: 'Sea glass', prompt: 'Pick up sea glass', blurb: 'Frosted by the tide. It glows when held to the light.' },
  shell: { name: 'Seashell', prompt: 'Pick up seashell', blurb: 'Still faintly pink inside.' },
  lens_shard: { name: 'Lens shard', prompt: 'Take the lens shard', blurb: 'Cut glass that is warm to the touch. It hums, very faintly.' },
};

const STORAGE_KEY = 'lumen.collection.v1';
const VERSION = 1;
const MAX_COUNT = 9999;
const MAX_IDS = 1000;
const ID_PATTERN = /^[a-z_]+-\d{1,4}$/;

interface SaveData {
  version: number;
  counts: Partial<Record<ItemType, number>>;
  collected: string[];
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // blocked (private mode, disabled cookies, ...)
  }
}

export class Inventory {
  private readonly counts = new Map<ItemType, number>();
  private readonly collected = new Set<string>();
  /** Called after every change (collecting an item). */
  onChange: (() => void) | null = null;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.load();
  }

  count(type: ItemType): number {
    return this.counts.get(type) ?? 0;
  }

  total(): number {
    let n = 0;
    for (const v of this.counts.values()) n += v;
    return n;
  }

  /** Item types the player has at least one of, in display order. */
  entries(): Array<{ type: ItemType; count: number }> {
    return ITEM_ORDER.filter((t) => this.count(t) > 0).map((type) => ({ type, count: this.count(type) }));
  }

  isCollected(id: string): boolean {
    return this.collected.has(id);
  }

  /** Records a pickup. Returns false (and changes nothing) if this object was already collected. */
  add(type: ItemType, id: string): boolean {
    if (this.collected.has(id)) return false;
    this.collected.add(id);
    this.counts.set(type, Math.min(MAX_COUNT, this.count(type) + 1));
    this.save();
    this.onChange?.();
    return true;
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<SaveData> | null;
      if (!data || typeof data !== 'object' || data.version !== VERSION) return;
      if (data.counts && typeof data.counts === 'object') {
        for (const type of ITEM_ORDER) {
          const v = (data.counts as Record<string, unknown>)[type];
          if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_COUNT) this.counts.set(type, v);
        }
      }
      if (Array.isArray(data.collected)) {
        for (const id of data.collected.slice(0, MAX_IDS)) {
          if (typeof id === 'string' && ID_PATTERN.test(id)) this.collected.add(id);
        }
      }
    } catch {
      this.counts.clear();
      this.collected.clear();
    }
  }

  private save(): void {
    if (!this.storage) return;
    try {
      const counts: Partial<Record<ItemType, number>> = {};
      for (const [type, n] of this.counts) counts[type] = n;
      const data: SaveData = { version: VERSION, counts, collected: [...this.collected] };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable: the game keeps working, the collection just isn't remembered.
    }
  }
}
