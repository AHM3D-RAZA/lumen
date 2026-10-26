import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Points,
  PointsMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Rng, fbm2, mulberry32 } from '../core/math';
import { type ItemType } from '../inventory/Inventory';

/** Shared geometry and materials for the four kinds of collectible; instances only differ by variant. */
export interface CollectibleKit {
  create(type: ItemType, variant: number): { visual: Group; proxy: Mesh };
  createCairn(): Group;
  glow: Texture;
}

function driftwoodGeometry(rng: Rng): BufferGeometry {
  const len = 0.9 + rng() * 0.7;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push(new Vector3((t - 0.5) * len, 0.05 + Math.sin(t * Math.PI) * (0.03 + rng() * 0.08), (rng() - 0.5) * 0.14 * Math.sin(t * Math.PI)));
  }
  const main = new TubeGeometry(new CatmullRomCurve3(pts), 18, 0.06 + rng() * 0.03, 7);
  const branchStart = pts[2]!.clone();
  const branch = new TubeGeometry(new CatmullRomCurve3([branchStart, branchStart.clone().add(new Vector3(0.1, 0.1, 0.12)), branchStart.clone().add(new Vector3(0.18, 0.12, 0.3))]), 8, 0.022, 6);
  const pos = main.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const n = (fbm2(pos.getX(i) * 9, pos.getZ(i) * 9 + pos.getY(i) * 5, 2) - 0.5) * 0.022;
    pos.setXYZ(i, pos.getX(i) + n, pos.getY(i) + n * 0.6, pos.getZ(i) + n);
  }
  const merged = mergeGeometries([main, branch], false);
  main.dispose();
  branch.dispose();
  return merged;
}

/** Fan-shaped scallop with radial ribs. */
function scallopGeometry(): BufferGeometry {
  const nA = 16;
  const nR = 6;
  const R = 0.14;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nR; j++) {
    const v = j / nR;
    for (let i = 0; i <= nA; i++) {
      const th = ((i / nA) * 2 - 1) * 1.15;
      const edge = 1 + 0.045 * Math.sin(th * 9) * v;
      const r = v * R * edge;
      const rib = 0.008 * Math.sin(th * 9) * v;
      pos.push(r * Math.sin(th), 0.05 * v * (1 - 0.55 * v) + rib + 0.004, r * Math.cos(th));
    }
  }
  for (let j = 0; j < nR; j++) {
    for (let i = 0; i < nA; i++) {
      const a = j * (nA + 1) + i;
      idx.push(a, a + nA + 1, a + 1, a + 1, a + nA + 1, a + nA + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ridged spiral whelk lying on its side. */
function whelkGeometry(): BufferGeometry {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    pts.push(new Vector2(Math.max(0.002, 0.06 * Math.pow(1 - t, 0.85) * (1 + (i % 2 === 0 ? 0.16 : -0.06))), t * 0.17));
  }
  const g = new LatheGeometry(pts, 14);
  g.scale(1.4, 1.4, 1.4);
  g.rotateZ(1.35);
  g.translate(0, 0.06, 0);
  return g;
}

function glassNugget(rng: Rng): BufferGeometry {
  const g = new IcosahedronGeometry(0.1, 1);
  const pos = g.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 0.8 + fbm2(v.x * 20 + rng(), v.z * 20, 2) * 0.5;
    pos.setXYZ(i, v.x * n * 1.1, Math.max(v.y * n * 0.6, -0.012), v.z * n * 0.85);
  }
  g.computeVertexNormals();
  return g;
}

export function createCollectibleKit(glow: Texture): CollectibleKit {
  const rng = mulberry32(2718);
  const driftwoodGeos = [driftwoodGeometry(rng), driftwoodGeometry(rng), driftwoodGeometry(rng)];
  const driftMat = new MeshStandardMaterial({ color: '#cfc8ba', roughness: 0.95 });
  const glassGeos = [glassNugget(rng), glassNugget(rng), glassNugget(rng)];
  const glassColors = ['#8fdcc0', '#4a74c8', '#d79a45', '#e9f2ee'];
  const glassMats = glassColors.map((c) => new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.22, transparent: true, opacity: 0.8, roughness: 0.42, metalness: 0.05 }));
  const scallop = scallopGeometry();
  const whelk = whelkGeometry();
  const shellColors = ['#eadccb', '#e2b9a2', '#f2e8d8'];
  const shellMats = shellColors.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.05, side: 2 }));
  const shardGeo = new OctahedronGeometry(0.08, 0);
  shardGeo.scale(0.5, 2.0, 0.36);
  const shardMat = new MeshStandardMaterial({ color: '#d6f4ee', emissive: '#58d2c0', emissiveIntensity: 0.85, transparent: true, opacity: 0.88, roughness: 0.08, metalness: 0.2 });
  const stoneMat = new MeshStandardMaterial({ color: '#7c8a92', roughness: 0.95 });
  const proxyMat = new MeshBasicMaterial({ visible: false });
  const glintMats = glassColors.map((c) => new PointsMaterial({ map: glow, color: new Color(c), size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  const glintGeo = new BufferGeometry();
  glintGeo.setAttribute('position', new Float32BufferAttribute([0, 0.05, 0], 3));

  const proxy = (radius: number, y: number): Mesh => {
    const p = new Mesh(new SphereGeometry(radius, 8, 6), proxyMat);
    p.position.y = y;
    return p;
  };
  const shadowed = <T extends Mesh>(m: T): T => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  return {
    glow,
    create(type, variant) {
      const visual = new Group();
      switch (type) {
        case 'driftwood':
          visual.add(shadowed(new Mesh(driftwoodGeos[variant % 3]!, driftMat)));
          return { visual, proxy: proxy(0.55, 0.15) };
        case 'sea_glass': {
          const m = shadowed(new Mesh(glassGeos[variant % 3]!, glassMats[variant % 4]!));
          const glint = new Points(glintGeo, glintMats[variant % 4]!);
          glint.frustumCulled = false;
          visual.add(m, glint);
          return { visual, proxy: proxy(0.3, 0.05) };
        }
        case 'shell': {
          const geo = variant % 3 === 1 ? whelk : scallop;
          visual.add(shadowed(new Mesh(geo, shellMats[variant % 3]!)));
          return { visual, proxy: proxy(0.28, 0.05) };
        }
        case 'lens_shard': {
          const shard = shadowed(new Mesh(shardGeo, shardMat));
          shard.position.y = 0.2;
          shard.rotation.z = 0.35;
          const small = shadowed(new Mesh(shardGeo, shardMat));
          small.scale.setScalar(0.55);
          small.position.set(0.09, 0.14, 0.03);
          small.rotation.z = -0.5;
          const g = new BufferGeometry();
          g.setAttribute('position', new Float32BufferAttribute([0, 0.25, 0], 3));
          const halo = new Points(g, new PointsMaterial({ map: glow, color: new Color('#8ef0dc'), size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
          halo.frustumCulled = false;
          halo.name = 'halo';
          visual.add(shard, small, halo);
          visual.name = 'shard';
          return { visual, proxy: proxy(0.4, 0.25) };
        }
      }
    },
    createCairn() {
      const g = new Group();
      const sizes: Array<[number, number, number]> = [[0.26, 0.09, 0], [0.19, 0.08, 0.13], [0.12, 0.06, 0.24]];
      for (const [r, h, y] of sizes) {
        const s = shadowed(new Mesh(new IcosahedronGeometry(r, 1), stoneMat));
        s.scale.y = h / r;
        s.position.y = y + h * 0.4;
        g.add(s);
      }
      return g;
    },
  };
}
