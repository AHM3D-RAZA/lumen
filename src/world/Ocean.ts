import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
} from 'three';
import { ATMOSPHERE_GLSL, FOG_DENSITY, atmosphereUniforms } from './atmosphere';
import { TERRAIN_SIZE } from './layout';
import { type RockFootprint } from './rockGeometry';
import { heightAt } from './terrain';

const OCEAN_RADIUS = 2800;
const DEPTH_MAP_RES = 384;
const DEPTH_MIN = -12;
const DEPTH_MAX = 4;

/**
 * Bakes terrain height (plus approximate rock domes) into an 8-bit map, so the water shader knows how
 * deep it is anywhere near the island, including around rocks and sea stacks.
 */
function createDepthMap(rocks: RockFootprint[]): DataTexture {
  const half = TERRAIN_SIZE / 2;
  const texel = TERRAIN_SIZE / DEPTH_MAP_RES;
  const heights = new Float32Array(DEPTH_MAP_RES * DEPTH_MAP_RES);
  for (let j = 0; j < DEPTH_MAP_RES; j++) {
    for (let i = 0; i < DEPTH_MAP_RES; i++) {
      heights[j * DEPTH_MAP_RES + i] = heightAt(-half + (i + 0.5) * texel, -half + (j + 0.5) * texel);
    }
  }
  for (const rock of rocks) {
    const reach = rock.radius + texel;
    const i0 = Math.max(0, Math.floor((rock.x - reach + half) / texel));
    const i1 = Math.min(DEPTH_MAP_RES - 1, Math.ceil((rock.x + reach + half) / texel));
    const j0 = Math.max(0, Math.floor((rock.z - reach + half) / texel));
    const j1 = Math.min(DEPTH_MAP_RES - 1, Math.ceil((rock.z + reach + half) / texel));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-half + (i + 0.5) * texel - rock.x, -half + (j + 0.5) * texel - rock.z) / rock.radius;
        if (d >= 1) continue;
        // A dome rising out of the seabed: ~1.2 m below the surface at its rim, `top` at its centre.
        const dome = -1.2 + (rock.top + 1.2) * Math.pow(1 - d * d, 0.7);
        const k = j * DEPTH_MAP_RES + i;
        if (dome > heights[k]!) heights[k] = dome;
      }
    }
  }
  const data = new Uint8Array(heights.length);
  for (let k = 0; k < heights.length; k++) {
    const h = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, heights[k]!));
    data[k] = Math.round(((h - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN)) * 255);
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

// ---------------------------------------------------------------------------------------------
// Wave spectrum
//
// A swell group (long, slow, drives the vertex displacement), a mid-scale group, and fine ripples
// (shading only). Every wave has its own direction, wavelength, speed (deep-water dispersion) and phase,
// with irrational-looking ratios so the pattern never lines up. Spatially varying amplitude fields and
// a domain warp (see the GLSL below) keep any two places on the sea from moving alike.

interface Wave {
  deg: number;
  length: number;
  amp: number;
  phase: number;
}

const SWELL: Wave[] = [
  { deg: 24, length: 63, amp: 0.42, phase: 0.4 },
  { deg: -17, length: 41.3, amp: 0.3, phase: 2.1 },
  { deg: 71, length: 28.7, amp: 0.2, phase: 4.6 },
];
const MID: Wave[] = [
  { deg: 112, length: 19.3, amp: 0.085, phase: 1.3 },
  { deg: -52, length: 14.1, amp: 0.06, phase: 5.2 },
  { deg: 151, length: 10.7, amp: 0.045, phase: 3.3 },
  { deg: 6, length: 8.3, amp: 0.034, phase: 0.9 },
];
const RIPPLE: Wave[] = [
  { deg: 203, length: 5.9, amp: 0.02, phase: 2.7 },
  { deg: 94, length: 4.1, amp: 0.014, phase: 5.9 },
  { deg: -121, length: 2.9, amp: 0.01, phase: 1.1 },
  { deg: 39, length: 2.13, amp: 0.007, phase: 4.2 },
  { deg: 251, length: 1.52, amp: 0.005, phase: 3.6 },
];
const ALL_WAVES = [...SWELL, ...MID, ...RIPPLE];

const f = (n: number) => n.toFixed(5);
const waveArrays = (() => {
  const dirs = ALL_WAVES.map((w) => {
    const a = (w.deg * Math.PI) / 180;
    const k = (2 * Math.PI) / w.length;
    const omega = Math.sqrt(9.81 * k) * 0.55; // deep-water dispersion, slowed for a calm sea
    return `vec4(${f(Math.cos(a))}, ${f(Math.sin(a))}, ${f(k)}, ${f(omega)})`;
  });
  const amps = ALL_WAVES.map((w) => `vec2(${f(w.amp)}, ${f(w.phase)})`);
  return /* glsl */ `
#define N_SWELL ${SWELL.length}
#define N_MID_END ${SWELL.length + MID.length}
#define N_ALL ${ALL_WAVES.length}
const vec4 WV[N_ALL] = vec4[N_ALL](${dirs.join(', ')});
const vec2 WA[N_ALL] = vec2[N_ALL](${amps.join(', ')});
`;
})();

const WAVES_GLSL = /* glsl */ `
${waveArrays}

// Large-scale coherent warp so crest lines wander instead of running in straight parallel bands.
vec2 warpPos(vec2 p, float t) {
  vec2 a = vec2(vnoise(p * 0.012 + vec2(t * 0.015, 3.0)), vnoise(p * 0.012 + vec2(9.0, -t * 0.012)));
  vec2 b = vec2(vnoise(p * 0.045 + vec2(-t * 0.03, 1.0)), vnoise(p * 0.045 + vec2(5.0, t * 0.03)));
  return p + (a - 0.5) * 18.0 + (b - 0.5) * 5.0;
}

// Slowly drifting amplitude fields: some stretches of sea roll heavily, others lie almost flat.
float swellMod(vec2 p, float t) { return 0.5 + 1.0 * vnoise(p * 0.0062 + vec2(t * 0.010, 3.1)); }
float midMod(vec2 p, float t) { return 0.45 + 1.1 * vnoise(p * 0.013 + vec2(-t * 0.018, t * 0.012 + 8.7)); }
float rippleMod(vec2 p, float t) { return 0.5 + 1.0 * vnoise(p * 0.045 + vec2(t * 0.03, -t * 0.04 + 1.3)); }

float waveHeight(vec2 p, float t) {
  vec2 q = warpPos(p, t);
  float ms = swellMod(p, t);
  float mm = midMod(p, t);
  float h = 0.0;
  for (int i = 0; i < N_SWELL; i++) h += ms * WA[i].x * sin(dot(q, WV[i].xy) * WV[i].z - t * WV[i].w + WA[i].y);
  for (int i = N_SWELL; i < N_MID_END; i++) h += mm * WA[i].x * sin(dot(q, WV[i].xy) * WV[i].z - t * WV[i].w + WA[i].y);
  return h;
}

// Non-periodic ripple detail: gradient of scrolling noise, so fine structure is not a sum of sines.
vec2 rippleNoiseSlope(vec2 p, float t) {
  vec2 q = p * 0.85 + vec2(t * 0.11, -t * 0.07);
  float n0 = vnoise(q);
  return vec2(vnoise(q + vec2(0.12, 0.0)) - n0, vnoise(q + vec2(0.0, 0.12)) - n0) * (0.05 / 0.12);
}

// Surface slope (d height / d x, d height / d z). \`detail\` fades fine ripples with distance.
vec2 waveSlope(vec2 p, float t, float detail) {
  vec2 q = warpPos(p, t);
  float ms = swellMod(p, t);
  float mm = midMod(p, t);
  float mr = rippleMod(p, t) * detail;
  vec2 s = vec2(0.0);
  for (int i = 0; i < N_SWELL; i++) {
    s += ms * WA[i].x * WV[i].z * WV[i].xy * cos(dot(q, WV[i].xy) * WV[i].z - t * WV[i].w + WA[i].y);
  }
  for (int i = N_SWELL; i < N_MID_END; i++) {
    s += mm * WA[i].x * WV[i].z * WV[i].xy * cos(dot(q, WV[i].xy) * WV[i].z - t * WV[i].w + WA[i].y);
  }
  for (int i = N_MID_END; i < N_ALL; i++) {
    s += mr * WA[i].x * WV[i].z * WV[i].xy * cos(dot(q, WV[i].xy) * WV[i].z - t * WV[i].w + WA[i].y);
  }
  return s + rippleNoiseSlope(p, t) * mr;
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
  // Waves calm down in the shallows, and fade out with distance so the horizon stays rock steady.
  float calm = mix(0.12, 1.0, smoothstep(0.0, 3.5, depth));
  float far = 1.0 - smoothstep(500.0, 1700.0, distance(world.xz, cameraPosition.xz));
  float h = waveHeight(world.xz, uTime) * calm * far;
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
uniform vec3 uSlate;
uniform vec3 uSand;
uniform vec3 uFoam;
varying vec3 vWorld;
varying float vWaveH;

void main() {
  vec2 p = vWorld.xz;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float t = uTime;

  float depth = waterDepth(p);
  float shallowAmt = mix(0.3, 1.0, smoothstep(0.0, 2.5, depth));
  float detail = 1.0 / (1.0 + dist * 0.014);
  vec2 slope = waveSlope(p, t, detail) * shallowAmt * mix(1.0, 0.55, smoothstep(120.0, 900.0, dist));
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 L = uSunDir;
  float NdotL = max(dot(N, L), 0.0);

  // ---- Body colour: teal shallows into deep teal, drifting blue-grey patches, thin water over sand ----
  float thick = 1.0 - exp(-max(depth, 0.0) * 0.28);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 1.0, thick));
  float broad = vnoise(p * 0.011 + vec2(t * 0.004, 1.7)) * 0.6 + vnoise(p * 0.034 + vec2(-t * 0.007, 8.3)) * 0.4;
  body = mix(body, uSlate, smoothstep(0.35, 0.85, broad) * smoothstep(0.1, 0.9, thick) * 0.65);
  body *= mix(0.8, 1.22, vnoise(p * 0.02 - vec2(t * 0.005, 4.0)));
  body *= 0.5 + 0.65 * NdotL;                                  // faces turned to the sun glow a little
  body += vec3(0.016, 0.07, 0.066) * smoothstep(0.1, 0.6, vWaveH); // light scattering through crests
  float thin = exp(-max(depth, 0.0) * 2.4);
  body = mix(body, uSand * (0.5 + 0.45 * NdotL), thin * 0.3);

  // Soft caustic-like light on the shallow bed.
  if (depth < 3.2) {
    vec2 cq = p * 0.8 + vec2(t * 0.1, -t * 0.08);
    float c1 = 1.0 - abs(2.0 * vnoise(cq) - 1.0);
    float c2 = 1.0 - abs(2.0 * vnoise(cq * 1.9 + vec2(-t * 0.12, t * 0.09) + 4.0) - 1.0);
    body += uSunColor * 0.1 * pow(c1 * c2, 3.0) * exp(-max(depth, 0.0) * 0.8);
  }

  // ---- Reflection of the sky, weighted by fresnel ----
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  float fres = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  // Reflect the sky slightly tinted by the water so grazing shallows don't go milky.
  vec3 refl = mix(skyGradient(R), body * 1.5 + 0.02, 0.18);
  vec3 col = mix(body, refl, clamp(fres, 0.0, 0.85));

  // ---- Sun glitter: reflection off wave facets, not painted-on dots ----
  // A facet lights up when its slope is close to the slope that would mirror the sun to the eye. The lobe
  // widens with distance (unresolved ripples), so the highlight is a broken, drifting path made of the
  // actual wave shapes.
  vec3 H = normalize(V + L);
  vec2 wanted = -H.xz / H.y;
  vec2 off = slope - wanted;
  float sigma = (0.042 + dist * 0.00014) * mix(0.8, 1.3, smoothstep(0.2, 0.9, rippleMod(p, t)));
  float facet = exp(-dot(off, off) / (2.0 * sigma * sigma));
  float fH = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  float glint = facet * fH * 6.0 * (0.05 / sigma + 0.4);
  col += uSunColor * glint * smoothstep(0.0, 0.5, L.y);

  // ---- Shoreline and rock foam: selective, irregular, following the depth contours ----
  float stretch = smoothstep(0.3, 0.72, vnoise(p * 0.05 + 11.0));   // some stretches of coast get more foam
  float sets = smoothstep(0.35, 0.8, vnoise(p * 0.03 + vec2(-t * 0.02, 5.0))); // waves arrive in sets
  float edge = depth + 0.12 * sin(t * 0.9 + vnoise(p * 0.3) * 6.0);           // slow wash up and down
  float lap = 1.0 - smoothstep(0.0, 0.85, edge);
  float lace = vnoise(p * 2.6 + t * 0.2) * 0.6 + vnoise(p * 7.0 - t * 0.35) * 0.4;
  float bands = sin(depth * 2.4 - t * 0.8 + vnoise(p * 0.25) * 5.0);
  float breakers = smoothstep(0.82, 0.98, bands) * (1.0 - smoothstep(0.4, 2.8, depth)) * smoothstep(0.05, 0.4, depth) * sets;
  float foam = (lap * (0.42 + 0.58 * stretch) + breakers * 0.7 * stretch) * smoothstep(0.32, 0.7, lace + lap * 0.2);
  col = mix(col, uFoam * (0.82 + 0.25 * NdotL), min(foam, 0.7));

  // ---- Atmospheric haze towards the horizon, tinted to match the sky behind ----
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

export function createOcean(rocks: RockFootprint[] = []): Ocean {
  const depthMap = createDepthMap(rocks);
  const material = new ShaderMaterial({
    uniforms: {
      ...atmosphereUniforms,
      uTime: { value: 0 },
      uDepthMap: { value: depthMap },
      uMapSize: { value: TERRAIN_SIZE },
      uFogDensity: { value: FOG_DENSITY },
      uDeep: { value: new Color('#0c4f5d') },
      uShallow: { value: new Color('#4fb7ad') },
      uSlate: { value: new Color('#2a5468') },
      uSand: { value: new Color('#a9b79a') },
      uFoam: { value: new Color('#ece9de') },
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
