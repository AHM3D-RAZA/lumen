import { Color, Mesh, MeshStandardMaterial, PlaneGeometry, Float32BufferAttribute, RepeatWrapping } from 'three';
import { clamp, fbm2, lerp, noise2, smoothstep } from '../core/math';
import { LIGHTHOUSE, TERRAIN_SIZE } from './layout';
import { createGroundDetailTexture } from './textures';
import { coastDistance, distanceToPath, heightAt } from './terrain';

const SEGMENTS = 224;
const DETAIL_TILE = 7; // metres per repeat of the ground detail texture

const sand = new Color('#cdc3a8');
const wetSand = new Color('#7f7a6c');
const seabed = new Color('#6f7d70');
const grassDeep = new Color('#456a2b');
const grassLight = new Color('#6e8e38');
const grassDry = new Color('#8f9248');
const rock = new Color('#66737b');
const rockDark = new Color('#47545c');
const gravel = new Color('#8e9394');
const pathEarth = new Color('#9c9279');
const c = new Color();

function colourAt(x: number, z: number, h: number, slope: number, out: Color): Color {
  const patch = fbm2(x * 0.09 + 3, z * 0.09 - 8, 3);
  const fine = noise2(x * 0.6, z * 0.6);

  // Ground: sand on the shore, grass inland, drier grass towards the coast.
  const grassiness = smoothstep(0.85 + (patch - 0.5) * 1.4, 1.7 + (patch - 0.5) * 1.4, h);
  const lush = smoothstep(0.3, 0.7, fbm2(x * 0.05 - 4, z * 0.05 + 12, 3));
  out.copy(grassDeep).lerp(grassLight, lush * 0.8 + fine * 0.25);
  const coastal = smoothstep(0.7, 0.96, coastDistance(x, z));
  out.lerp(grassDry, coastal * 0.55 * (0.4 + patch));
  out.lerp(sand, 1 - grassiness);

  // Rock on steep ground, banded with a faint stratified pattern.
  const rockiness = smoothstep(0.42, 0.9, slope);
  if (rockiness > 0) {
    const strata = 0.5 + 0.5 * Math.sin(h * 5.2 + patch * 6);
    c.copy(rockDark).lerp(rock, clamp(0.3 + strata * 0.4 + fine * 0.3, 0, 1));
    out.lerp(c, rockiness);
  }

  // Paved area around the lighthouse and the worn footpath.
  const pd = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  out.lerp(c.copy(gravel).multiplyScalar(0.9 + fine * 0.2), 1 - smoothstep(6.8, 9.2, pd + (patch - 0.5) * 2));
  const pathF = 1 - smoothstep(0.8, 1.7, distanceToPath(x, z) + (fine - 0.5) * 0.7);
  if (pathF > 0 && h > 0.7) out.lerp(c.copy(pathEarth).multiplyScalar(0.92 + fine * 0.16), pathF * 0.85);

  // Wet sand at the waterline and seabed under the water.
  out.lerp(wetSand, smoothstep(0.55, 0.15, h) * (1 - rockiness));
  out.lerp(seabed, smoothstep(0.0, -0.8, h));
  return out;
}

export function createTerrain(): Mesh {
  const geometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    uv.setXY(i, pos.getX(i) / DETAIL_TILE, pos.getZ(i) / DETAIL_TILE);
  }
  geometry.computeVertexNormals();

  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const col = new Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = clamp(normal.getY(i), 0.05, 1);
    const slope = Math.sqrt(1 - ny * ny) / ny;
    colourAt(pos.getX(i), pos.getZ(i), pos.getY(i), slope, col);
    // Gentle darkening in hollows (lower than their surroundings' average) for soft contact shading.
    const shade = lerp(0.92, 1.04, ny);
    colors[i * 3] = col.r * shade;
    colors[i * 3 + 1] = col.g * shade;
    colors[i * 3 + 2] = col.b * shade;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

  const map = createGroundDetailTexture();
  map.wrapS = map.wrapT = RepeatWrapping;
  const material = new MeshStandardMaterial({ vertexColors: true, map, roughness: 0.96, metalness: 0 });
  material.color.setScalar(1.18);

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
