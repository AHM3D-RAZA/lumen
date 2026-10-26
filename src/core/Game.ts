import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { AudioFeedback } from '../audio/AudioFeedback';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { ITEM_INFO, Inventory } from '../inventory/Inventory';
import { type InteractionContext } from '../interaction/Interactable';
import { PlayerController } from '../player/PlayerController';
import { UI } from '../ui/UI';
import { LIGHTHOUSE, PLAYER, PLAYER_START } from '../world/layout';
import { heightAt } from '../world/terrain';
import { isInsideLighthouse } from '../world/Floors';
import { createLighting, type Lighting } from '../world/Lighting';
import { createSky, type Sky } from '../world/Sky';
import { createWorld, type World } from '../world/World';
import { Input } from './Input';
import { type GameServices } from './services';
import { clamp, smoothstep } from './math';

type State = 'title' | 'intro' | 'playing' | 'paused' | 'inventory';

const INTRO_SECONDS = 3;
const PANEL_CLOSE_DISTANCE = 4.5;
const BASE_FOV = 65;

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Yaw/pitch that make the camera look from `from` towards `to`. */
function lookPose(from: Vector3, to: Vector3): Pose {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { x: from.x, y: from.y, z: from.z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

const heightAtForDebug = (x: number, z: number) => heightAt(x, z);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Owns the renderer, scene, game loop and the high-level state machine (title, intro, playing, paused). */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 6000);
  private readonly timer = new Timer();
  private readonly input = new Input();
  private readonly ui: UI;
  private readonly world: World;
  private readonly lighting: Lighting;
  private readonly sky: Sky;
  private readonly player: PlayerController;
  private readonly interaction = new InteractionSystem();
  private readonly inventory = new Inventory();
  private readonly audio = new AudioFeedback();
  private indoor = 0;

  private state: State = 'title';
  private resumeState: State = 'playing';
  private introT = 0;
  private panelOrigin: Vector3 | null = null;
  private debugPose: Pose | null = null;
  private disposed = false;
  private readonly unsubscribers: Array<() => void> = [];

  private readonly startPose: Pose;
  private readonly titleLook = new Vector3(LIGHTHOUSE.x - 25, 11, LIGHTHOUSE.z);
  private readonly tmp = new Vector3();

  private readonly onResize = (): void => this.resize();
  private readonly onContextLost = (e: Event): void => {
    e.preventDefault();
    this.ui.showError('The graphics context was lost (the browser or GPU reset it). Please reload the page to continue.');
  };

  constructor(canvas: HTMLCanvasElement, ui: UI) {
    this.canvas = canvas;
    this.ui = ui;

    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!this.renderer.getContext()) throw new Error('WebGL is not available.');
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(0xc3ccc9);
    canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.lighting = createLighting(this.scene, this.renderer);
    this.sky = createSky(3000);
    this.scene.add(this.sky.mesh);

    const services: GameServices = {
      inventory: this.inventory,
      audio: this.audio,
      notify: (message) => this.ui.toast(message),
      unregister: (item) => this.interaction.unregister(item),
    };
    this.world = createWorld(services);
    this.scene.add(this.world.group);

    this.player = new PlayerController(this.camera, canvas, this.input, this.world.collision, this.world.floors);
    this.player.onLockChange = (locked) => this.handleLockChange(locked);
    this.player.onLockError = () => this.handleLockError();

    for (const item of this.world.interactables) this.interaction.register(item);
    this.interaction.setBlockers(this.world.blockers);
    this.interaction.onPromptChange = (text) => this.ui.setPrompt(text);

    this.unsubscribers.push(
      this.input.onPress('KeyE', () => this.handleInteractKey()),
      this.input.onPress('Tab', () => this.toggleInventory()),
      this.input.onPress('Escape', () => {
        if (this.state === 'inventory') this.closeInventory();
      }),
    );
    this.ui.bind({
      onStart: () => this.begin(),
      onResume: () => {
        this.audio.unlock();
        this.player.lock();
      },
      onInventoryClose: () => this.closeInventory(),
    });

    const towards = lookPose(new Vector3(PLAYER_START.x, 0, PLAYER_START.z), new Vector3(LIGHTHOUSE.x, 0, LIGHTHOUSE.z));
    this.startPose = { ...towards, y: 0, pitch: 0.2 };
    this.player.setPose(PLAYER_START.x, PLAYER_START.z, this.startPose.yaw, this.startPose.pitch);
    this.startPose.y = this.camera.position.y;

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.applyTitlePose(0);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- State machine -------------------------------------------------------------------------

  private begin(): void {
    if (this.state !== 'title') return;
    this.ui.hideTitle();
    this.state = 'intro';
    this.introT = 0;
    this.audio.unlock(); // browsers only allow audio after a gesture
    this.player.lock(); // must happen inside the click handler
  }

  private handleLockChange(locked: boolean): void {
    if (locked) {
      this.ui.hidePause();
      if (this.state === 'paused') this.state = this.resumeState;
      this.player.inputEnabled = this.state === 'playing';
    } else if (this.state === 'inventory') {
      // The collection screen releases the pointer on purpose; closing it asks for the lock back.
    } else if (this.state === 'playing' || this.state === 'intro') {
      this.resumeState = this.state;
      this.state = 'paused';
      this.player.inputEnabled = false;
      this.input.reset();
      this.interaction.clearTarget();
      this.ui.showPause();
    }
  }

  private handleLockError(): void {
    if (this.state === 'intro' || this.state === 'playing') {
      this.resumeState = this.state;
      this.state = 'paused';
      this.player.inputEnabled = false;
    }
    this.ui.showPause('The browser did not let LUMEN capture the mouse. Click Resume to try again.');
  }

  private toggleInventory(): void {
    if (this.state === 'playing') {
      this.state = 'inventory';
      this.player.inputEnabled = false;
      this.input.reset();
      this.interaction.clearTarget();
      this.ui.hidePanel();
      this.ui.showInventory(this.inventory.entries().map(({ type, count }) => ({ name: ITEM_INFO[type].name, count, blurb: ITEM_INFO[type].blurb })));
      this.audio.play('click');
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (this.state === 'inventory') {
      this.closeInventory();
    }
  }

  private closeInventory(): void {
    if (this.state !== 'inventory') return;
    this.ui.hideInventory();
    this.state = 'playing';
    this.player.inputEnabled = true;
    this.audio.play('click');
    this.player.lock(); // if the browser refuses, the pause screen offers a Resume button
  }

  private handleInteractKey(): void {
    if (this.state !== 'playing') return;
    if (this.ui.panelOpen) {
      this.ui.hidePanel();
      return;
    }
    const ctx: InteractionContext = this.ui;
    if (this.interaction.interact(ctx)) this.panelOrigin = this.player.position.clone();
  }

  // ---- Frame ---------------------------------------------------------------------------------

  /** Slow, drifting establishing shot from the sea, with the lighthouse framed right of the title text. */
  private titlePose(t: number): Pose {
    const eye = new Vector3(-21 + Math.sin(t * 0.12) * 1.4, 3.8 + Math.sin(t * 0.17) * 0.2, 55 + Math.cos(t * 0.1) * 0.8);
    return lookPose(eye, this.titleLook);
  }

  private applyTitlePose(t: number): void {
    this.setCamera(this.titlePose(t));
  }

  private setCamera(p: Pose): void {
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  }

  private tick(): void {
    if (this.disposed) return;
    this.timer.update();
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const t = this.timer.getElapsed();

    switch (this.state) {
      case 'title':
        if (this.debugPose) this.setCamera(this.debugPose);
        else this.applyTitlePose(t);
        break;
      case 'intro':
        // The intro follows wall-clock time so slow frames never stretch it out.
        this.updateIntro(Math.min(rawDt, 1), t);
        break;
      case 'playing':
        this.player.update(dt);
        this.interaction.update(this.camera);
        this.autoClosePanel();
        break;
      case 'paused':
        break;
    }

    this.world.update(t, Math.min(rawDt, 0.25), this.player.position);
    this.updateIndoorLighting(Math.min(rawDt, 0.25));
    this.sky.update(t);
    this.sky.mesh.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  /** Eases between outdoor and indoor light as the player steps through the door. */
  private updateIndoorLighting(dt: number): void {
    const inside = this.state !== 'title' && this.state !== 'intro' && isInsideLighthouse(this.player.position.x, this.player.position.z) ? 1 : 0;
    this.indoor += (inside - this.indoor) * (1 - Math.exp(-dt * 3));
    this.lighting.setIndoor(this.indoor);
  }

  private updateIntro(dt: number, t: number): void {
    this.introT = clamp(this.introT + dt / INTRO_SECONDS, 0, 1);
    const k = smoothstep(0, 1, this.introT);
    const from = this.titlePose(t);
    const to = this.startPose;
    this.setCamera({
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
      z: from.z + (to.z - from.z) * k,
      yaw: from.yaw + wrapAngle(to.yaw - from.yaw) * k,
      pitch: from.pitch + (to.pitch - from.pitch) * k,
    });
    if (this.introT >= 1) this.finishIntro();
  }

  private finishIntro(): void {
    this.player.setPose(PLAYER_START.x, PLAYER_START.z, this.startPose.yaw, this.startPose.pitch);
    if (this.player.isLocked) {
      this.state = 'playing';
      this.player.inputEnabled = true;
      this.ui.setHudVisible(true);
    } else {
      // Pointer lock never arrived (refused or released): wait for the player to resume.
      this.resumeState = 'playing';
      this.state = 'paused';
      this.ui.setHudVisible(true);
      this.ui.showPause('Click Resume to capture the mouse and start exploring.');
    }
  }

  private autoClosePanel(): void {
    if (!this.panelOrigin || !this.ui.panelOpen) return;
    const moved = this.tmp.copy(this.player.position).sub(this.panelOrigin).length();
    if (moved > PANEL_CLOSE_DISTANCE) this.ui.hidePanel();
  }

  /** Development-only hook for automated checks; stripped from production builds. */
  debug() {
    return {
      state: () => this.state,
      position: () => this.player.position.toArray(),
      teleport: (x: number, z: number, yaw: number, pitch = 0) => this.player.setPose(x, z, yaw, pitch),
      forceStart: () => {
        this.ui.hideTitle();
        this.state = 'playing';
        this.player.inputEnabled = true;
        this.ui.setHudVisible(true);
      },
      /** Freezes the title-screen camera at an arbitrary pose (for screenshots). */
      setCamera: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
        this.debugPose = lookPose(new Vector3(x, y, z), new Vector3(tx, ty, tz));
      },
      /** Runs `seconds` of player simulation synchronously, without rendering. */
      advance: (seconds: number) => {
        for (let i = 0; i < Math.round(seconds * 60); i++) this.player.update(1 / 60);
        this.interaction.update(this.camera);
      },
      look: (yaw: number, pitch: number) => {
        this.player.yaw = yaw;
        this.player.pitch = pitch;
        this.player.update(0);
      },
      hudPrompt: () => document.getElementById('prompt-text')?.textContent ?? null,
      eyeHeight: PLAYER.eyeHeight,
      /** Counts per item type, as shown in the collection screen. */
      inventory: () => Object.fromEntries(this.inventory.entries().map((e) => [e.type, e.count])),
      collectibles: () => this.world.collectibles.specs.map((s) => ({ ...s, y: heightAtForDebug(s.x, s.z), collected: this.inventory.isCollected(s.id) })),
      toggleInventory: () => this.toggleInventory(),
      inventoryOpen: () => this.ui.inventoryOpen,
      targetId: () => this.interaction.target?.id ?? null,
      indoorAmount: () => this.indoor,
      pressInteract: () => this.handleInteractKey(),
      doorState: () => this.world.doorState(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.timer.dispose();
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.unsubscribers.forEach((u) => u());
    this.player.dispose();
    this.input.dispose();
    this.world.dispose();
    this.sky.mesh.geometry.dispose();
    (this.sky.mesh.material as { dispose(): void }).dispose();
    this.lighting.dispose();
    this.ui.dispose();
    this.renderer.dispose();
  }
}
