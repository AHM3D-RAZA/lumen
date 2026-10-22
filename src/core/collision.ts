/**
 * Lightweight 2D (top-down) collision: circles and oriented boxes. The player is a circle that is
 * pushed out of any collider it overlaps, which gives natural sliding along walls without a physics engine.
 */

export interface Point2 {
  x: number;
  z: number;
}

interface Circle {
  x: number;
  z: number;
  r: number;
}

interface Box {
  x: number;
  z: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
}

export class CollisionWorld {
  private readonly circles: Circle[] = [];
  private readonly boxes: Box[] = [];

  addCircle(x: number, z: number, r: number): void {
    this.circles.push({ x, z, r });
  }

  /** `halfWidth` runs along local x, `halfDepth` along local z; `rotationY` matches three.js Object3D.rotation.y. */
  addBox(x: number, z: number, halfWidth: number, halfDepth: number, rotationY = 0): void {
    this.boxes.push({ x, z, hx: halfWidth, hz: halfDepth, cos: Math.cos(rotationY), sin: Math.sin(rotationY) });
  }

  /** Moves `p` out of every collider a circle of `radius` at `p` would overlap. Returns true if it was moved. */
  resolve(p: Point2, radius: number): boolean {
    let moved = false;
    for (let iter = 0; iter < 3; iter++) {
      let changed = false;
      for (const c of this.circles) {
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
        // Rotation by +rotationY maps local (lx, lz) to world (lx*cos + lz*sin, -lx*sin + lz*cos).
        const wx = p.x - b.x;
        const wz = p.z - b.z;
        const lx = wx * b.cos - wz * b.sin;
        const lz = wx * b.sin + wz * b.cos;
        const cx = Math.max(-b.hx, Math.min(b.hx, lx));
        const cz = Math.max(-b.hz, Math.min(b.hz, lz));
        let nx = lx - cx;
        let nz = lz - cz;
        let d = Math.hypot(nx, nz);
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
            nx = Math.sign(lx) || 1;
            nz = 0;
            px = nx * (b.hx + radius);
            pz = lz;
          } else {
            nx = 0;
            nz = Math.sign(lz) || 1;
            px = lx;
            pz = nz * (b.hz + radius);
          }
          d = 1;
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
