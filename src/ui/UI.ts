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

  private onStart: (() => void) | null = null;
  private onResume: (() => void) | null = null;
  private titleTimer = 0;

  private readonly handleStart = (): void => this.onStart?.();
  private readonly handleResume = (): void => this.onResume?.();

  constructor() {
    this.startButton.addEventListener('click', this.handleStart);
    this.resumeButton.addEventListener('click', this.handleResume);
  }

  bind(handlers: { onStart: () => void; onResume: () => void }): void {
    this.onStart = handlers.onStart;
    this.onResume = handlers.onResume;
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
    this.startButton.removeEventListener('click', this.handleStart);
    this.resumeButton.removeEventListener('click', this.handleResume);
  }
}
