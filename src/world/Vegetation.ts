import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type CollisionWorld } from '../core/collision';
import { type Rng, clamp, fbm2, lerp, smoothstep } from '../core/math';
import { LIGHTHOUSE } from './layout';
import { createGrassTexture } from './textures';
import { coastDistance, distanceToPath, heightAt, slopeAt } from './terrain';

export interface Vegetation {
  group: Group;
  update(time: number): void;
}

const timeUniform = { value: 0 };

/** Three crossed alpha-tested cards, each carrying a clump of blades. */
function createTuftGeometry(): BufferGeometry {
  const cards: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new PlaneGeometry(1.15, 0.85);
    g.translate(0, 0.425, 0);
    g.rotateY((i * Math.PI) / 3);
    cards.push(g);
  }
  const merged = mergeGeometries(cards, false);
  cards.forEach((c) => c.dispose());
  return merged;
}

function createGrassMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: createGrassTexture(),
    alphaTest: 0.45,
    alphaToCoverage: true,
    side: DoubleSide,
    roughness: 1,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 ip = instanceMatrix[3].xz;
        float bend = position.y * position.y;
        float gust = sin(uTime * 1.6 + ip.x * 0.31 + ip.y * 0.23) + 0.5 * sin(uTime * 2.7 + ip.x * 0.7 - ip.y * 0.4);
        transformed.x += gust * 0.16 * bend;
        transformed.z += gust * 0.09 * bend;`,
      );
    // Both faces of a card should be lit as if facing up, otherwise the back side goes dark.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\n        normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
    );
  };
  return material;
}

function scatter(
  rng: Rng,
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  maxCount: number,
  attempts: number,
  accept: (x: number, z: number, h: number) => boolean,
  style: (x: number, z: number, rng: Rng, color: Color) => number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, maxCount);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const pos = new Vector3();
  const scale = new Vector3();
  const color = new Color();
  let count = 0;
  for (let i = 0; i < attempts && count < maxCount; i++) {
    const x = (rng() - 0.5) * 150;
    const z = (rng() - 0.5) * 150;
    if (coastDistance(x, z) > 0.96) continue;
    const h = heightAt(x, z);
    if (!accept(x, z, h)) continue;
    const s = style(x, z, rng, color);
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    scale.set(s * (0.9 + rng() * 0.4), s * (0.85 + rng() * 0.5), s * (0.9 + rng() * 0.4));
    pos.set(x, h - 0.03, z);
    m.compose(pos, q, scale);
    mesh.setMatrixAt(count, m);
    mesh.setColorAt(count, color);
    count++;
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

function createShrubTemplate(rng: Rng): BufferGeometry {
  let g: BufferGeometry = new IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const seed = rng() * 50;
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const base = new Color('#27431f');
  const top = new Color('#5f8236');
  const warm = new Color('#7c7a3c');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos, i);
    const n = fbm2(v.x * 2.5 + seed, v.z * 2.5 + v.y * 2, 3);
    v.multiplyScalar(0.8 + n * 0.5);
    v.y = Math.max(v.y * 0.72, -0.25);
    pos.setXYZ(i, v.x, v.y, v.z);
    c.copy(base).lerp(top, clamp((v.y + 0.3) / 1.0 + (n - 0.5) * 0.6, 0, 1));
    c.lerp(warm, clamp((n - 0.55) * 1.6, 0, 0.5));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function createVegetation(rng: Rng, collision: CollisionWorld): Vegetation {
  const group = new Group();
  const tuft = createTuftGeometry();
  const grassMat = createGrassMaterial();

  const nearLighthouse = (x: number, z: number, r: number) => Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < r;

  // Meadow grass: lush in patches, thinning out towards the sand.
  const meadow = scatter(
    rng,
    tuft,
    grassMat,
    16000,
    110000,
    (x, z, h) => {
      if (h < 1.05 || nearLighthouse(x, z, 9.6) || distanceToPath(x, z) < 1.9 || slopeAt(x, z) > 0.6) return false;
      const mask = smoothstep(0.3, 0.52, fbm2(x * 0.07 + 30, z * 0.07 + 5, 3));
      return rng() < 0.12 + 0.88 * mask;
    },
    (x, z, r, color) => {
      const t = fbm2(x * 0.11, z * 0.11, 2);
      color.setRGB(lerp(0.78, 1.1, t), lerp(0.92, 1.12, t), lerp(0.62, 0.78, t));
      return 0.6 + r() * 0.5;
    },
  );

  // Taller, paler dune grass hugging the beach edge.
  const dune = scatter(
    rng,
    tuft,
    grassMat,
    3800,
    90000,
    (x, z, h) => {
      const d = coastDistance(x, z);
      if (h < 0.65 || h > 2.0 || d < 0.8 || distanceToPath(x, z) < 2.2) return false;
      return rng() < smoothstep(0.35, 0.6, fbm2(x * 0.09 - 9, z * 0.09 + 21, 3));
    },
    (_x, _z, r, color) => {
      color.setRGB(1.18, 1.1, 0.74);
      return 0.7 + r() * 0.45;
    },
  );
  group.add(meadow, dune);

  // Shrubs: clusters of lumpy blobs, merged into one mesh.
  const templates = [createShrubTemplate(rng), createShrubTemplate(rng), createShrubTemplate(rng)];
  const parts: BufferGeometry[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  let placed = 0;
  for (let i = 0; i < 500 && placed < 30; i++) {
    const x = (rng() - 0.5) * 110;
    const z = (rng() - 0.5) * 100;
    const h = heightAt(x, z);
    const d = coastDistance(x, z);
    const coastal = placed >= 22;
    if (d > (coastal ? 0.97 : 0.9) || (coastal && d < 0.8)) continue;
    if (h < 1.0 || h > 7.2 || slopeAt(x, z) > 0.5 || distanceToPath(x, z) < 2.6 || nearLighthouse(x, z, 11)) continue;
    const size = coastal ? 0.45 + rng() * 0.3 : 0.8 + rng() * 0.8;
    const blobs = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < blobs; b++) {
      const bx = x + (rng() - 0.5) * size * 1.5;
      const bz = z + (rng() - 0.5) * size * 1.5;
      const s = size * (0.55 + rng() * 0.5);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      m.compose(new Vector3(bx, heightAt(bx, bz) + s * 0.12, bz), q, new Vector3(s, s * (0.8 + rng() * 0.4), s));
      parts.push(templates[Math.floor(rng() * templates.length)]!.clone().applyMatrix4(m));
    }
    if (size > 0.9) collision.addCircle(x, z, size * 0.7);
    placed++;
  }
  templates.forEach((t) => t.dispose());
  if (parts.length > 0) {
    const shrubs = new Mesh(mergeGeometries(parts, false), new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    parts.forEach((p) => p.dispose());
    shrubs.castShadow = true;
    shrubs.receiveShadow = true;
    group.add(shrubs);
  }

  return {
    group,
    update(time) {
      timeUniform.value = time;
    },
  };
}
