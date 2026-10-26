import { DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Texture } from 'three';
import { createStoneTexture, createWoodTexture } from '../textures';
import { createChartTexture, createLimewashTexture, createLogbookTexture, createPlaidTexture, createRugTexture } from './textures';

function repeated(tex: Texture, x: number, y: number): Texture {
  const t = tex.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

export interface InteriorMaterials {
  floor: MeshStandardMaterial;
  upperFloor: MeshStandardMaterial;
  plaster: MeshStandardMaterial;
  wainscot: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  beam: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  woodDark: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  iron: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  blanket: MeshStandardMaterial;
  linen: MeshStandardMaterial;
  rug: MeshStandardMaterial;
  chart: MeshStandardMaterial;
  logbook: MeshStandardMaterial;
  leather: MeshStandardMaterial;
  ceramic: MeshStandardMaterial;
  oilskin: MeshStandardMaterial;
  flame: MeshBasicMaterial;
  lampShade: MeshStandardMaterial;
  copper: MeshStandardMaterial;
}

/** One shared set of interior materials (and textures), so furniture reuses them. */
export function createInteriorMaterials(): InteriorMaterials {
  const wood = createWoodTexture('#7a5b3e');
  const darkWood = createWoodTexture('#4d3a2a');
  const stone = createStoneTexture();
  const lime = createLimewashTexture();
  return {
    floor: new MeshStandardMaterial({ map: repeated(wood, 2.2, 2.2), roughness: 0.78, color: '#cdb99c' }),
    upperFloor: new MeshStandardMaterial({ map: repeated(wood, 1.6, 1.6), roughness: 0.8, color: '#cbb593' }),
    plaster: new MeshStandardMaterial({ map: repeated(lime, 1, 1), color: '#dfd2b8', roughness: 0.95 }),
    wainscot: new MeshStandardMaterial({ map: repeated(wood, 1.2, 0.5), roughness: 0.8, color: '#b89a76' }),
    ceiling: new MeshStandardMaterial({ map: repeated(lime, 1.5, 1.5), color: '#d3c7ac', roughness: 0.96 }),
    beam: new MeshStandardMaterial({ map: repeated(darkWood, 0.5, 2), roughness: 0.85, color: '#9a7d5e' }),
    wood: new MeshStandardMaterial({ map: repeated(wood, 0.7, 0.7), roughness: 0.75, color: '#d6b88f' }),
    woodDark: new MeshStandardMaterial({ map: repeated(darkWood, 0.7, 0.7), roughness: 0.8, color: '#a98b69' }),
    stone: new MeshStandardMaterial({ map: repeated(stone, 0.5, 0.5), roughness: 0.92, color: '#c3c8ca' }),
    iron: new MeshStandardMaterial({ color: '#24292c', metalness: 0.7, roughness: 0.5 }),
    brass: new MeshStandardMaterial({ color: '#c9a047', metalness: 0.85, roughness: 0.35 }),
    glass: new MeshStandardMaterial({ color: '#cfe8e6', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, side: DoubleSide, depthWrite: false }),
    blanket: new MeshStandardMaterial({ map: createPlaidTexture(), roughness: 1 }),
    linen: new MeshStandardMaterial({ color: '#e5dcc7', roughness: 1 }),
    rug: new MeshStandardMaterial({ map: createRugTexture(), roughness: 1 }),
    chart: new MeshStandardMaterial({ map: createChartTexture(), roughness: 0.9 }),
    logbook: new MeshStandardMaterial({ map: createLogbookTexture(), roughness: 0.9 }),
    leather: new MeshStandardMaterial({ color: '#5a3a28', roughness: 0.7 }),
    ceramic: new MeshStandardMaterial({ color: '#e9e4d6', roughness: 0.35 }),
    oilskin: new MeshStandardMaterial({ color: '#c3992a', roughness: 0.55 }),
    flame: new MeshBasicMaterial({ color: '#ffc772', toneMapped: false }),
    lampShade: new MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffa955', emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.3 }),
    copper: new MeshStandardMaterial({ color: '#b2683f', metalness: 0.8, roughness: 0.4 }),
  };
}
