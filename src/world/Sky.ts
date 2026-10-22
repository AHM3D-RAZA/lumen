import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { ATMOSPHERE_GLSL, atmosphereUniforms } from './atmosphere';

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // Pin the dome to the far plane so it never clips, whatever its radius.
  gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww;
}
`;

const fragmentShader = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform float uTime;
varying vec3 vDir;

float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s / 0.9375;
}

vec3 clouds(vec3 sky, vec3 d) {
  if (d.y < 0.012) return sky;
  vec2 p = d.xz / (d.y + 0.17) * 1.15 + uTime * vec2(0.006, 0.0022);
  float n = fbm(p);
  float cover = smoothstep(0.5, 0.74, n);
  if (cover <= 0.0) return sky;
  float shifted = fbm(p + uSunDir.xz * 0.35);
  float lit = clamp(0.55 + (n - shifted) * 4.5, 0.0, 1.0);
  float facing = max(dot(d, uSunDir), 0.0);
  vec3 shadowCol = mix(vec3(0.36, 0.44, 0.56), uMid, 0.25);
  vec3 litCol = mix(vec3(0.95, 0.84, 0.74), uSunColor * 1.5 + vec3(0.35), pow(facing, 2.5));
  vec3 cloud = mix(shadowCol, litCol, lit);
  float fade = smoothstep(0.012, 0.24, d.y);
  return mix(sky, cloud, cover * fade * 0.9);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);
  float s = dot(d, uSunDir);
  col += vec3(1.0, 0.82, 0.55) * smoothstep(0.99925, 0.9997, s) * 4.0 * step(0.0, d.y);
  col = clouds(col, d);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface Sky {
  mesh: Mesh;
  update(time: number): void;
}

/** Gradient sky dome with a low sun and drifting clouds. Re-used (small radius) to bake the environment map. */
export function createSky(radius: number): Sky {
  const material = new ShaderMaterial({
    uniforms: { ...atmosphereUniforms, uTime: { value: 0 } },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  return {
    mesh,
    update(time) {
      material.uniforms.uTime!.value = time;
    },
  };
}
