/** Keyboard state plus one-shot "pressed" callbacks. Listeners are attached once and removed in dispose(). */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressHandlers = new Map<string, Array<() => void>>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressHandlers.get(e.code)?.forEach((fn) => fn());
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.reset();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Runs `fn` each time `code` goes down (ignores key repeat). Returns an unsubscribe function. */
  onPress(code: string, fn: () => void): () => void {
    const list = this.pressHandlers.get(code) ?? [];
    list.push(fn);
    this.pressHandlers.set(code, list);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  /** Forget held keys (e.g. when the window loses focus or the pointer is released). */
  reset(): void {
    this.down.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.pressHandlers.clear();
    this.down.clear();
  }
}
