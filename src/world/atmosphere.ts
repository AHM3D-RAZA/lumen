import { Color, Vector3, type IUniform } from 'three';
import { SUN_DIRECTION } from './layout';

/**
 * Shared sky / haze description. The sky dome, the ocean shader and the scene fog all read from
 * these values so the horizon, reflections and distant silhouettes blend seamlessly.
 */

export const sunDirection = new Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z).normalize();

export const FOG_DENSITY = 0.00125;

export const hazeColor = new Color('#d0c9ba');
const zenithColor = new Color('#2f5f97');
const midColor = new Color('#80a6c0');
export const sunColor = new Color('#ffb870');

export const atmosphereUniforms: Record<string, IUniform> = {
  uSunDir: { value: sunDirection },
  uZenith: { value: zenithColor },
  uMid: { value: midColor },
  uHaze: { value: hazeColor },
  uSunColor: { value: sunColor },
};

/** GLSL shared by sky and ocean: colour of the clear sky in direction `d` (unit vector). */
export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHaze;
uniform vec3 uSunColor;

vec3 skyGradient(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 c = mix(uHaze, uMid, smoothstep(0.0, 0.3, h));
  c = mix(c, uZenith, smoothstep(0.16, 0.95, h));
  float s = max(dot(d, uSunDir), 0.0);
  float horizonMask = 1.0 - smoothstep(0.0, 0.5, h);
  c += uSunColor * (0.75 * pow(s, 4.0) * horizonMask + 0.3 * pow(s, 2.0) * horizonMask + 0.3 * pow(s, 28.0));
  return c;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;
