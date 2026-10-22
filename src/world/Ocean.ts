import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  ClampToEdgeWrapping,
} from 'three';
import { ATMOSPHERE_GLSL, FOG_DENSITY, atmosphereUniforms } from './atmosphere';
import { TERRAIN_SIZE } from './layout';
import { heightAt } from './terrain';

const OCEAN_RADIUS = 2800;
const DEPTH_MAP_RES = 256;
const DEPTH_MIN = -12;
const DEPTH_MAX = 4;

/** Bakes terrain height into an 8-bit map so the water shader knows how deep it is anywhere near the island. */
function createDepthMap(): DataTexture {
  const data = new Uint8Array(DEPTH_MAP_RES * DEPTH_MAP_RES);
  const half = TERRAIN_SIZE / 2;
  for (let j = 0; j < DEPTH_MAP_RES; j++) {
    for (let i = 0; i < DEPTH_MAP_RES; i++) {
      const x = -half + ((i + 0.5) / DEPTH_MAP_RES) * TERRAIN_SIZE;
      const z = -half + ((j + 0.5) / DEPTH_MAP_RES) * TERRAIN_SIZE;
      const h = heightAt(x, z);
      data[j * DEPTH_MAP_RES + i] = Math.round(((Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, h)) - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN)) * 255);
    }
  }
  const tex = new DataTexture(data, DEPTH_MAP_RES, DEPTH_MAP_RES, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Polar grid: dense around the island, stretching out to the horizon. */
function createOceanGeometry(): BufferGeometry {
  const radii: number[] = [];
  let r = 1;
  let step = 1.4;
  while (r < OCEAN_RADIUS) {
    radii.push(r);
    if (r > 90) step *= 1.05;
    r += step;
  }
  radii.push(OCEAN_RADIUS);

  const segments = 320;
  const positions = new Float32Array(radii.length * segments * 3);
  for (let i = 0; i < radii.length; i++) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const o = (i * segments + j) * 3;
      positions[o] = Math.cos(a) * radii[i]!;
      positions[o + 1] = 0;
      positions[o + 2] = Math.sin(a) * radii[i]!;
    }
  }
  const indices = new Uint32Array((radii.length - 1) * segments * 6);
  let k = 0;
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + ((j + 1) % segments);
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

const WAVES_GLSL = /* glsl */ `
const vec2 D1 = vec2(0.866, 0.5);
const vec2 D2 = vec2(-0.419, 0.908);
const vec2 D3 = vec2(0.351, -0.936);
const vec2 D4 = vec2(-0.894, -0.447);
const vec2 D5 = vec2(0.6, 0.8);
const vec2 D6 = vec2(-0.28, -0.96);
const vec2 D7 = vec2(0.96, -0.28);

vec2 warpWaves(vec2 p, float t) {
  return p + 5.0 * vec2(vnoise(p * 0.022 + vec2(t * 0.02, 0.0)), vnoise(p * 0.022 + vec2(13.1, -t * 0.02))) - 2.5;
}

float waveHeight(vec2 p, float t) {
  p = warpWaves(p, t);
  return 0.36 * sin(dot(p, D1) * 0.1366 - t * 1.157)
       + 0.20 * sin(dot(p, D2) * 0.2327 - t * 1.51 + 1.7)
       + 0.10 * sin(dot(p, D3) * 0.3696 - t * 1.90 + 4.1);
}

vec2 waveSlope(vec2 p, float t, float detail) {
  p = warpWaves(p, t);
  vec2 s = D1 * (0.36 * 0.1366) * cos(dot(p, D1) * 0.1366 - t * 1.157)
         + D2 * (0.20 * 0.2327) * cos(dot(p, D2) * 0.2327 - t * 1.51 + 1.7)
         + D3 * (0.10 * 0.3696) * cos(dot(p, D3) * 0.3696 - t * 1.90 + 4.1);
  s += detail * D4 * 0.034 * cos(dot(p, D4) * 0.70 - t * 2.6 + 0.8);
  s += detail * D5 * 0.030 * cos(dot(p, D5) * 1.15 - t * 3.3 + 2.4);
  s += detail * D6 * 0.026 * cos(dot(p, D6) * 1.95 - t * 4.3 + 5.0);
  s += detail * D7 * 0.022 * cos(dot(p, D7) * 3.30 - t * 5.6 + 3.1);
  return s;
}

uniform sampler2D uDepthMap;
uniform float uMapSize;
float waterDepth(vec2 p) {
  vec2 uv = p / uMapSize + 0.5;
  return -(texture2D(uDepthMap, uv).r * ${(DEPTH_MAX - DEPTH_MIN).toFixed(1)} + ${DEPTH_MIN.toFixed(1)});
}
`;

const vertexShader = /* glsl */ `
${ATMOSPHERE_GLSL}
${WAVES_GLSL}
uniform float uTime;
varying vec3 vWorld;
varying float vWaveH;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float depth = waterDepth(world.xz);
  float damp = mix(0.12, 1.0, smoothstep(0.0, 3.5, depth));
  float h = waveHeight(world.xz, uTime) * damp;
  world.y += h;
  vWorld = world.xyz;
  vWaveH = h;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
${ATMOSPHERE_GLSL}
${WAVES_GLSL}
uniform float uTime;
uniform float uFogDensity;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSand;
uniform vec3 uFoam;
varying vec3 vWorld;
varying float vWaveH;

void main() {
  vec2 p = vWorld.xz;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  float depth = waterDepth(p);
  float detail = 1.0 / (1.0 + dist * 0.014);
  vec2 slope = waveSlope(p, uTime, detail) * mix(0.35, 1.0, smoothstep(0.0, 2.5, depth)) * mix(1.0, 0.5, smoothstep(120.0, 800.0, dist));
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  // Body colour: turquoise shallows fading into deep teal, with soft large-scale variation.
  float thick = 1.0 - exp(-max(depth, 0.0) * 0.30);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 1.0, thick));
  body = mix(body, uSand, exp(-max(depth, 0.0) * 0.95) * 0.5);
  float tint = vnoise(p * 0.018 + vec2(uTime * 0.004, -uTime * 0.003)) * 0.6 + vnoise(p * 0.07 - uTime * 0.01) * 0.4;
  body *= mix(0.78, 1.28, tint);
  float light = 0.5 + 0.7 * max(dot(N, uSunDir), 0.0);
  body *= light;
  body += vec3(0.018, 0.075, 0.07) * smoothstep(0.1, 0.55, vWaveH);

  // Sky reflection with fresnel, plus sun glitter.
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyGradient(R);
  float fres = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

  float sunAlign = max(dot(R, uSunDir), 0.0);
  float sparkle = 0.65 + 0.7 * vnoise(p * 1.7 + uTime * 0.6);
  col += uSunColor * (pow(sunAlign, 700.0) * 7.0 * sparkle + pow(sunAlign, 70.0) * 0.32);

  // Shoreline foam: a thin lace at the waterline and slow breaking bands rolling in.
  float shore = 1.0 - smoothstep(0.0, 0.7, depth);
  float bands = sin(depth * 2.7 - uTime * 0.85 + vnoise(p * 0.33) * 5.5);
  float breakers = smoothstep(0.8, 0.98, bands) * (1.0 - smoothstep(0.3, 3.4, depth)) * smoothstep(0.0, 0.35, depth);
  float lace = vnoise(p * 2.4 + uTime * 0.18) * 0.65 + vnoise(p * 6.0 - uTime * 0.3) * 0.35;
  float foam = clamp(shore * 0.75 + breakers * 0.6, 0.0, 1.0) * smoothstep(0.38, 0.7, lace + shore * 0.25);
  col = mix(col, uFoam, foam * 0.85);

  // Atmospheric haze towards the horizon, tinted to match the sky behind.
  vec3 horizon = skyGradient(normalize(vec3(-V.x, 0.0, -V.z)));
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  col = mix(col, horizon, fog);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface Ocean {
  mesh: Mesh;
  update(time: number): void;
  dispose(): void;
}

export function createOcean(): Ocean {
  const depthMap = createDepthMap();
  const material = new ShaderMaterial({
    uniforms: {
      ...atmosphereUniforms,
      uTime: { value: 0 },
      uDepthMap: { value: depthMap },
      uMapSize: { value: TERRAIN_SIZE },
      uFogDensity: { value: FOG_DENSITY },
      uDeep: { value: new Color('#0c4f5d') },
      uShallow: { value: new Color('#4fb7ad') },
      uSand: { value: new Color('#a9b79a') },
      uFoam: { value: new Color('#f2ede0') },
    },
    vertexShader,
    fragmentShader,
  });
  const geometry = createOceanGeometry();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return {
    mesh,
    update(time) {
      material.uniforms.uTime!.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      depthMap.dispose();
    },
  };
}
