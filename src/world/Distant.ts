import { type BufferGeometry, Mesh, MeshStandardMaterial } from 'three';
import { type Rng } from '../core/math';
import { createRockTemplate, mergeRocks, placeRock } from './rockGeometry';

/** [bearing in degrees (0 = east, 90 = south), distance, width, height] for faint islands on the horizon. */
const ISLANDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-92, 720, 230, 58],
  [-62, 1150, 320, 42],
  [-34, 540, 80, 22],
  [-6, 930, 190, 30],
  [24, 650, 95, 36],
  [52, 1350, 280, 38],
  [96, 820, 130, 13],
  [-138, 580, 130, 44],
  [-168, 1050, 210, 30],
  [152, 1250, 240, 26],
];

/** Hazy rock silhouettes that make the ocean feel like it goes on; fog does the atmospheric perspective. */
export function createDistantIslands(rng: Rng): Mesh {
  const template = createRockTemplate(rng);
  const parts: BufferGeometry[] = [];
  for (const [bearing, dist, width, height] of ISLANDS) {
    const a = (bearing * Math.PI) / 180;
    parts.push(placeRock(template, Math.cos(a) * dist, -height * 0.25, Math.sin(a) * dist, width * 0.7, height * 1.1, width * 0.45, rng() * Math.PI * 2));
  }
  template.dispose();
  const merged = mergeRocks(parts)!;
  return new Mesh(merged, new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
}
