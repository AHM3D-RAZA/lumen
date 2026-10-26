/**
 * Lightweight 2D (top-down) collision: circles and oriented boxes. The player is a circle that is
 * pushed out of any collider it overlaps, which gives natural sliding along walls without a physics engine.
 *
 * Colliders can be switched on and off and limited to a height range (feet height of the player), so
 * upper-floor railings do not block the ground floor and a moving door can update its own collider.
 */

export interface Point2 {
  x: number;
  z: number;
}

export interface ColliderOptions {
  /** Only active while the player's feet are at or above this world height. */
  yMin?: number;
  /** Only active while the player's feet are at or below this world height. */
  yMax?: number;
}

interface ColliderBase {
  enabled: boolean;
  yMin: number;
  yMax: number;
}

export interface CircleCollider extends ColliderBase {
  x: number;
  z: number;
  r: number;
}

export interface BoxCollider extends ColliderBase {
  x: number;
  z: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  /** Moves/rotates the box (rotation matches three.js Object3D.rotation.y). */
  setPose(x: number, z: number, rotationY: number): void;
}

export class CollisionWorld {
  private readonly circles: CircleCollider[] = [];
  private readonly boxes: BoxCollider[] = [];

  addCircle(x: number, z: number, r: number, opts: ColliderOptions = {}): CircleCollider {
    const c: CircleCollider = { x, z, r, enabled: true, yMin: opts.yMin ?? -Infinity, yMax: opts.yMax ?? Infinity };
    this.circles.push(c);
    return c;
  }

  /** `halfWidth` runs along local x, `halfDepth` along local z; `rotationY` matches three.js Object3D.rotation.y. */
  addBox(x: number, z: number, halfWidth: number, halfDepth: number, rotationY = 0, opts: ColliderOptions = {}): BoxCollider {
    const b: BoxCollider = {
      x,
      z,
      hx: halfWidth,
      hz: halfDepth,
      cos: Math.cos(rotationY),
      sin: Math.sin(rotationY),
      enabled: true,
      yMin: opts.yMin ?? -Infinity,
      yMax: opts.yMax ?? Infinity,
      setPose(nx, nz, rot) {
        this.x = nx;
        this.z = nz;
        this.cos = Math.cos(rot);
        this.sin = Math.sin(rot);
      },
    };
    this.boxes.push(b);
    return b;
  }

  /** Moves `p` out of every active collider a circle of `radius` at `p` (feet at height `y`) would overlap. */
  resolve(p: Point2, radius: number, y = 0): boolean {
    let moved = false;
    for (let iter = 0; iter < 3; iter++) {
      let changed = false;
      for (const c of this.circles) {
        if (!c.enabled || y < c.yMin || y > c.yMax) continue;
        let dx = p.x - c.x;
        let dz = p.z - c.z;
        let d = Math.hypot(dx, dz);
        const min = c.r + radius;
        if (d >= min) continue;
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
          d = 1;
        }
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
        changed = true;
      }
      for (const b of this.boxes) {
        if (!b.enabled || y < b.yMin || y > b.yMax) continue;
        // Rotation by +rotationY maps local (lx, lz) to world (lx*cos + lz*sin, -lx*sin + lz*cos).
        const wx = p.x - b.x;
        const wz = p.z - b.z;
        const lx = wx * b.cos - wz * b.sin;
        const lz = wx * b.sin + wz * b.cos;
        const cx = Math.max(-b.hx, Math.min(b.hx, lx));
        const cz = Math.max(-b.hz, Math.min(b.hz, lz));
        const nx = lx - cx;
        const nz = lz - cz;
        const d = Math.hypot(nx, nz);
        let px: number;
        let pz: number;
        if (d > 1e-6) {
          if (d >= radius) continue;
          px = cx + (nx / d) * radius;
          pz = cz + (nz / d) * radius;
        } else {
          // Centre is inside the box: leave through the nearest face.
          const gapX = b.hx - Math.abs(lx);
          const gapZ = b.hz - Math.abs(lz);
          if (gapX < gapZ) {
            px = (Math.sign(lx) || 1) * (b.hx + radius);
            pz = lz;
          } else {
            px = lx;
            pz = (Math.sign(lz) || 1) * (b.hz + radius);
          }
        }
        p.x = b.x + px * b.cos + pz * b.sin;
        p.z = b.z - px * b.sin + pz * b.cos;
        changed = true;
      }
      if (!changed) break;
      moved = true;
    }
    return moved;
  }
}
