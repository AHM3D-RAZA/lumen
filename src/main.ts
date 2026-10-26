import './style.css';
import { Game } from './core/Game';
import { UI } from './ui/UI';

function showFatal(message: string): void {
  const box = document.getElementById('error');
  const text = document.getElementById('error-message');
  if (box && text) {
    text.textContent = message;
    box.classList.remove('hidden');
  } else {
    document.body.textContent = message;
  }
}

let game: Game | null = null;

try {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('The game canvas is missing from the page.');
  const ui = new UI();
  const t0 = performance.now();
  game = new Game(canvas, ui);
  if (import.meta.env.DEV) console.info(`[lumen] world built in ${Math.round(performance.now() - t0)} ms`);
  game.start();
  if (import.meta.env.DEV) (window as unknown as { __lumen: ReturnType<Game['debug']> }).__lumen = game.debug();
} catch (err) {
  console.error(err);
  const reason = err instanceof Error ? err.message : String(err);
  showFatal(`${reason}\n\nLUMEN needs a browser with WebGL 2 enabled. Try updating your browser or enabling hardware acceleration, then reload.`);
}

// Clean up when Vite hot-reloads this module so we never leave a second render loop or duplicate listeners behind.
import.meta.hot?.dispose(() => game?.dispose());
