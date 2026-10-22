import { type PerspectiveCamera, Vector3 } from 'three';
import { type CollisionWorld, type Point2 } from '../core/collision';
import { clamp } from '../core/math';
import { type Input } from '../core/Input';
import { PLAYER } from '../world/layout';
import { heightAt, isWalkableTerrain } from '../world/terrain';

const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = 1.45;
const BASE_FOV = 65;
const SPRINT_FOV = 68.5;

const scratch: Point2 = { x: 0, z: 0 };

/**
 * First-person controller: pointer-lock mouse look, WASD + sprint, terrain following, and
 * movement constrained by the walkable region and solid colliders.
 */
export class PlayerController {
  /** Position of the player's feet. */
  readonly position = new Vector3();
  yaw = 0;
  pitch = 0;
  /** Movement and look are ignored while false (title screen, intro, pause). */
  inputEnabled = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onLockError: (() => void) | null = null;

  private velX = 0;
  private velZ = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  private eyeY = 0;
  private fov = BASE_FOV;

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.inputEnabled || !this.isLocked) return;
    // Some browsers emit one huge spurious delta when pointer lock engages.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.yaw -= e.movementX * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch - e.movementY * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
  };
  private readonly onLockChangeEvent = (): void => this.onLockChange?.(this.isLocked);
  private readonly onLockErrorEvent = (): void => this.onLockError?.();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly element: HTMLElement,
    private readonly input: Input,
    private readonly collision: CollisionWorld,
  ) {
    camera.rotation.order = 'YXZ';
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChangeEvent);
    document.addEventListener('pointerlockerror', this.onLockErrorEvent);
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Must be called from a user gesture (click / key press). */
  lock(): void {
    try {
      // Newer browsers return a promise that rejects if the request is refused.
      const result = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      result?.catch?.(() => this.onLockError?.());
    } catch {
      this.onLockError?.();
    }
  }

  setPose(x: number, z: number, yaw: number, pitch: number): void {
    this.position.set(x, heightAt(x, z), z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeY = this.position.y + PLAYER.eyeHeight;
    this.velX = this.velZ = 0;
    this.applyToCamera(0, 0);
  }

  eyePosition(out: Vector3): Vector3 {
    return out.set(this.position.x, this.position.y + PLAYER.eyeHeight, this.position.z);
  }

  update(dt: number): void {
    let moving = false;
    let sprinting = false;
    if (this.inputEnabled) {
      const fwd = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
      const strafe = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
      sprinting = (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')) && fwd > 0;
      const speed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const len = Math.hypot(fwd, strafe) || 1;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // Forward is -Z rotated by yaw; right is +X rotated by yaw.
      const targetX = ((-sin * fwd + cos * strafe) / len) * speed;
      const targetZ = ((-cos * fwd - sin * strafe) / len) * speed;
      const k = 1 - Math.exp(-11 * dt);
      this.velX += (targetX - this.velX) * k;
      this.velZ += (targetZ - this.velZ) * k;
      moving = fwd !== 0 || strafe !== 0;
    } else {
      this.velX = this.velZ = 0;
    }

    if (Math.abs(this.velX) + Math.abs(this.velZ) > 0.01) this.move(this.velX * dt, this.velZ * dt);

    // Follow the ground with a little smoothing so stepped ledges feel soft.
    const targetEye = this.position.y + PLAYER.eyeHeight;
    this.eyeY += (targetEye - this.eyeY) * (1 - Math.exp(-14 * dt));

    const planarSpeed = Math.hypot(this.velX, this.velZ);
    this.bobAmount += ((moving ? Math.min(1, planarSpeed / PLAYER.walkSpeed) : 0) - this.bobAmount) * (1 - Math.exp(-8 * dt));
    this.bobPhase += planarSpeed * dt * 1.9;

    this.applyToCamera(Math.sin(this.bobPhase) * 0.011 * this.bobAmount, Math.sin(this.bobPhase * 2) * 0.02 * this.bobAmount);

    const targetFov = sprinting && moving ? SPRINT_FOV : BASE_FOV;
    const nextFov = this.fov + (targetFov - this.fov) * (1 - Math.exp(-6 * dt));
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.fov = nextFov;
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private move(dx: number, dz: number): void {
    const { x, z } = this.position;
    if (this.tryStand(x + dx, z + dz)) return;
    // Slide along obstacles by trying each axis on its own.
    if (!this.tryStand(x + dx, z)) this.tryStand(x, z + dz);
  }

  private tryStand(x: number, z: number): boolean {
    scratch.x = x;
    scratch.z = z;
    this.collision.resolve(scratch, PLAYER.radius);
    if (!isWalkableTerrain(scratch.x, scratch.z)) return false;
    this.position.set(scratch.x, heightAt(scratch.x, scratch.z), scratch.z);
    return true;
  }

  private applyToCamera(bobSide: number, bobUp: number): void {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    this.camera.position.set(this.position.x + cos * bobSide, this.eyeY + bobUp, this.position.z - sin * bobSide);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  dispose(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChangeEvent);
    document.removeEventListener('pointerlockerror', this.onLockErrorEvent);
    if (this.isLocked) document.exitPointerLock();
  }
}
