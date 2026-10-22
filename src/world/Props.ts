import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Shape,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type CollisionWorld } from '../core/collision';
import { LIGHTHOUSE } from './layout';
import { coastRadius, distanceToPath, heightAt, isWalkableTerrain, slopeAt } from './terrain';
import { createGlowTexture, createStoneTexture, createWoodTexture } from './textures';

const helper = new Object3D();

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Point on the coast at angle `theta`, `inset` as a fraction of the coast radius. */
function coastPoint(theta: number, inset: number): { x: number; z: number } {
  const r = coastRadius(theta) * inset;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
}

/** A bench and short timber railing at a clifftop viewpoint, looking out to sea. */
function createOverlook(theta: number, woodMat: MeshStandardMaterial, collision: CollisionWorld): Group {
  const group = new Group();
  const p = coastPoint(theta, 0.9);
  const outward = Math.atan2(Math.cos(theta), Math.sin(theta)); // local +z faces the sea
  const y = heightAt(p.x, p.z);

  const bench = new Group();
  bench.position.set(p.x, y, p.z);
  bench.rotation.y = outward;
  const parts: BufferGeometry[] = [
    new BoxGeometry(1.7, 0.07, 0.48).translate(0, 0.46, 0),
    new BoxGeometry(1.7, 0.36, 0.05).translate(0, 0.83, -0.22),
    new BoxGeometry(0.07, 0.46, 0.5).translate(-0.76, 0.23, 0),
    new BoxGeometry(0.07, 0.46, 0.5).translate(0.76, 0.23, 0),
  ];
  const benchMesh = new Mesh(mergeParts(parts), woodMat);
  benchMesh.castShadow = benchMesh.receiveShadow = true;
  bench.add(benchMesh);
  group.add(bench);
  collision.addBox(p.x, p.z, 0.9, 0.3, outward);

  // Railing a few metres seaward of the bench, following the cliff edge.
  const tx = -Math.sin(theta);
  const tz = Math.cos(theta);
  const posts: Vector3[] = [];
  for (let i = -3; i <= 3; i++) {
    const rx = p.x + Math.cos(theta) * 2.6 + tx * i * 1.5;
    const rz = p.z + Math.sin(theta) * 2.6 + tz * i * 1.5;
    if (!isWalkableTerrain(rx, rz)) continue;
    posts.push(new Vector3(rx, heightAt(rx, rz), rz));
  }
  const fence: BufferGeometry[] = [];
  for (const post of posts) fence.push(new BoxGeometry(0.11, 1.05, 0.11).translate(post.x, post.y + 0.5, post.z));
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    if (a.distanceTo(b) > 2.2) continue;
    for (const lift of [0.95, 0.55]) {
      const from = new Vector3(a.x, a.y + lift, a.z);
      const to = new Vector3(b.x, b.y + lift, b.z);
      const len = from.distanceTo(to);
      helper.position.copy(from).lerp(to, 0.5);
      helper.lookAt(to);
      helper.updateMatrix();
      fence.push(new BoxGeometry(0.05, 0.07, len).applyMatrix4(helper.matrix));
    }
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    collision.addBox(mx, mz, 0.07, Math.hypot(b.x - a.x, b.z - a.z) / 2, Math.atan2(b.x - a.x, b.z - a.z));
  }
  if (fence.length > 0) {
    const mesh = new Mesh(mergeParts(fence), woodMat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** A small weathered shed with a lit window, set on level ground near the lighthouse. */
function createShed(woodMat: MeshStandardMaterial, stoneMat: MeshStandardMaterial, collision: CollisionWorld): Group | null {
  const W = 3.6;
  const D = 3.0;
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    for (const r of [15, 17, 19]) {
      const x = LIGHTHOUSE.x + Math.cos(a) * r;
      const z = LIGHTHOUSE.z + Math.sin(a) * r;
      if (distanceToPath(x, z) < 5) continue;
      const hs: number[] = [];
      let ok = true;
      for (const [dx, dz] of [[-2.4, -2.1], [2.4, -2.1], [-2.4, 2.1], [2.4, 2.1], [0, 0]] as const) {
        if (!isWalkableTerrain(x + dx, z + dz) || slopeAt(x + dx, z + dz) > 0.35) ok = false;
        hs.push(heightAt(x + dx, z + dz));
      }
      if (!ok) continue;
      const score = Math.max(...hs) - Math.min(...hs) + r * 0.02;
      if (!best || score < best.score) best = { x, z, score };
    }
  }
  if (!best) return null;

  const hs = [[-2, -1.7], [2, -1.7], [-2, 1.7], [2, 1.7]].map(([dx, dz]) => heightAt(best!.x + dx!, best!.z + dz!));
  const floorY = Math.max(...hs) + 0.22;
  const baseDepth = floorY - (Math.min(...hs) - 0.5);

  const shed = new Group();
  shed.position.set(best.x, 0, best.z);
  shed.rotation.y = Math.atan2(LIGHTHOUSE.x - best.x, LIGHTHOUSE.z - best.z); // door faces the lighthouse

  const base = new Mesh(new BoxGeometry(W + 0.3, baseDepth, D + 0.3).translate(0, floorY - baseDepth / 2, 0), stoneMat);
  const walls = new Mesh(new BoxGeometry(W, 2.2, D).translate(0, floorY + 1.1, 0), woodMat);

  const gable = new Shape();
  gable.moveTo(-(D / 2 + 0.35), 0);
  gable.lineTo(D / 2 + 0.35, 0);
  gable.lineTo(0, 1.15);
  const roofGeo = new ExtrudeGeometry(gable, { depth: W + 0.6, bevelEnabled: false });
  roofGeo.translate(0, 0, -(W + 0.6) / 2);
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.translate(0, floorY + 2.2, 0);
  const roof = new Mesh(roofGeo, new MeshStandardMaterial({ color: '#4a5560', roughness: 0.8 }));

  const door = new Mesh(new BoxGeometry(0.95, 1.85, 0.07).translate(-0.7, floorY + 0.95, D / 2 + 0.02), new MeshStandardMaterial({ color: '#4c3e31', roughness: 0.9 }));
  const frame = new Mesh(new BoxGeometry(0.85, 0.75, 0.08).translate(0.85, floorY + 1.4, D / 2 + 0.01), new MeshStandardMaterial({ color: '#2c2722', roughness: 0.8 }));
  const pane = new Mesh(new BoxGeometry(0.7, 0.6, 0.02).translate(0.85, floorY + 1.4, D / 2 + 0.06), new MeshBasicMaterial({ color: new Color(1.0, 0.7, 0.32), toneMapped: false }));

  for (const mesh of [base, walls, roof, door, frame]) {
    mesh.castShadow = mesh.receiveShadow = true;
    shed.add(mesh);
  }
  shed.add(pane);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0.85, floorY + 1.4, D / 2 + 0.5], 3));
  const glow = new Points(
    g,
    new PointsMaterial({ map: createGlowTexture(), color: '#ffa94d', size: 2.8, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
  );
  glow.frustumCulled = false;
  shed.add(glow);

  collision.addBox(best.x, best.z, W / 2 + 0.15, D / 2 + 0.15, shed.rotation.y);
  return shed;
}

export function createProps(collision: CollisionWorld): Group {
  const group = new Group();
  const woodMat = new MeshStandardMaterial({ map: createWoodTexture('#6b5d4d'), roughness: 0.9 });
  const stoneTex = createStoneTexture() as CanvasTexture;
  stoneTex.repeat.set(2, 0.4);
  const stoneMat = new MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: '#b8bec2' });

  group.add(createOverlook(Math.PI + 0.22, woodMat, collision));
  group.add(createOverlook(-0.7, woodMat, collision));
  const shed = createShed(woodMat, stoneMat, collision);
  if (shed) group.add(shed);
  return group;
}
