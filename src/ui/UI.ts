import { type InteractionContext } from '../interaction/Interactable';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} element in index.html`);
  return node as T;
}

/** Thin wrapper over the static DOM defined in index.html. Holds no game logic. */
export class UI implements InteractionContext {
  private readonly title = el('title');
  private readonly pause = el('pause');
  private readonly pauseMessage = el('pause-message');
  private readonly hud = el('hud');
  private readonly prompt = el('prompt');
  private readonly promptText = el('prompt-text');
  private readonly panel = el('panel');
  private readonly panelTitle = el('panel-title');
  private readonly panelBody = el('panel-body');
  private readonly errorBox = el('error');
  private readonly errorMessage = el('error-message');
  private readonly startButton = el<HTMLButtonElement>('start-button');
  private readonly resumeButton = el<HTMLButtonElement>('resume-button');
  private readonly inventory = el('inventory');
  private readonly inventoryList = el('inventory-list');
  private readonly inventoryEmpty = el('inventory-empty');
  private readonly inventoryTotal = el('inventory-total');
  private readonly toastBox = el('toast');

  private onStart: (() => void) | null = null;
  private onResume: (() => void) | null = null;
  private titleTimer = 0;
  private toastTimer = 0;
  private toastFade = 0;
  private onInventoryClose: (() => void) | null = null;

  private readonly handleStart = (): void => this.onStart?.();
  private readonly handleResume = (): void => this.onResume?.();
  private readonly handleInventoryClick = (e: MouseEvent): void => {
    if (e.target === this.inventory) this.onInventoryClose?.();
  };

  constructor() {
    this.startButton.addEventListener('click', this.handleStart);
    this.resumeButton.addEventListener('click', this.handleResume);
    this.inventory.addEventListener('click', this.handleInventoryClick);
  }

  bind(handlers: { onStart: () => void; onResume: () => void; onInventoryClose: () => void }): void {
    this.onStart = handlers.onStart;
    this.onResume = handlers.onResume;
    this.onInventoryClose = handlers.onInventoryClose;
  }

  get inventoryOpen(): boolean {
    return !this.inventory.classList.contains('hidden');
  }

  showInventory(rows: Array<{ name: string; count: number; blurb: string }>): void {
    this.inventoryList.replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement('li');
        for (const [cls, text] of [['item-name', row.name], ['item-count', String(row.count)], ['item-blurb', row.blurb]] as const) {
          const span = document.createElement('span');
          span.className = cls;
          span.textContent = text;
          li.appendChild(span);
        }
        return li;
      }),
    );
    this.inventoryEmpty.classList.toggle('hidden', rows.length > 0);
    const total = rows.reduce((n, r) => n + r.count, 0);
    this.inventoryTotal.textContent = total > 0 ? `${total} ${total === 1 ? 'treasure' : 'treasures'} gathered` : '';
    this.inventory.classList.remove('hidden');
  }

  hideInventory(): void {
    this.inventory.classList.add('hidden');
  }

  /** A brief, quiet message near the bottom of the screen. */
  toast(message: string): void {
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.toastFade);
    this.toastBox.textContent = message;
    this.toastBox.classList.remove('hidden', 'leaving');
    this.toastFade = window.setTimeout(() => this.toastBox.classList.add('leaving'), 2200);
    this.toastTimer = window.setTimeout(() => this.toastBox.classList.add('hidden'), 2750);
  }

  get panelOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  hideTitle(): void {
    this.title.classList.add('leaving');
    window.clearTimeout(this.titleTimer);
    this.titleTimer = window.setTimeout(() => this.title.classList.add('hidden'), 950);
  }

  showPause(message?: string): void {
    this.pauseMessage.textContent = message ?? 'The mouse is released. Click below to return to the island.';
    this.pause.classList.remove('hidden');
    this.resumeButton.focus({ preventScroll: true });
  }

  hidePause(): void {
    this.pause.classList.add('hidden');
  }

  setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('hidden', !visible);
  }

  setPrompt(text: string | null): void {
    this.hud.classList.toggle('targeting', text !== null);
    this.prompt.classList.toggle('hidden', text === null);
    if (text !== null) this.promptText.textContent = text;
  }

  showPanel(title: string, body: string): void {
    this.panelTitle.textContent = title;
    this.panelBody.replaceChildren(
      ...body.split('\n\n').map((paragraph) => {
        const p = document.createElement('p');
        p.textContent = paragraph;
        return p;
      }),
    );
    this.panel.classList.remove('hidden');
    this.hud.classList.add('panel-open');
  }

  hidePanel(): void {
    this.panel.classList.add('hidden');
    this.hud.classList.remove('panel-open');
  }

  showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorBox.classList.remove('hidden');
  }

  dispose(): void {
    window.clearTimeout(this.titleTimer);
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.toastFade);
    this.inventory.removeEventListener('click', this.handleInventoryClick);
    this.startButton.removeEventListener('click', this.handleStart);
    this.resumeButton.removeEventListener('click', this.handleResume);
  }
}
