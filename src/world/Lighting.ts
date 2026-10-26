import { DirectionalLight, HemisphereLight, FogExp2, PMREMGenerator, Scene, type WebGLRenderer } from 'three';
import { FOG_DENSITY, hazeColor, sunDirection } from './atmosphere';
import { createSky } from './Sky';

export interface Lighting {
  sun: DirectionalLight;
  /** 0 = outdoors, 1 = indoors: dims the sky fill and brightens exposure so interiors read as warm lamplight. */
  setIndoor(amount: number): void;
  dispose(): void;
}

/** Late-afternoon light: one shadow-casting golden sun, a cool sky fill and a baked sky environment. */
export function createLighting(scene: Scene, renderer: WebGLRenderer): Lighting {
  scene.fog = new FogExp2(hazeColor, FOG_DENSITY);

  const sun = new DirectionalLight('#ffb272', 4.5);
  sun.position.copy(sunDirection).multiplyScalar(170);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -85;
  cam.right = 85;
  cam.top = 85;
  cam.bottom = -85;
  cam.near = 20;
  cam.far = 380;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.45;
  scene.add(sun, sun.target);

  const hemi = new HemisphereLight('#8fb0cc', '#4a4a3c', 0.22);
  scene.add(hemi);

  // Bake the sky into a small environment map for ambient light and metal/glass reflections.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  const envSky = createSky(50);
  envScene.add(envSky.mesh);
  const envTarget = pmrem.fromScene(envScene, 0.02, 0.1, 200);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.3;
  envSky.mesh.geometry.dispose();
  (envSky.mesh.material as { dispose(): void }).dispose();
  pmrem.dispose();

  const outdoorExposure = renderer.toneMappingExposure;
  return {
    sun,
    setIndoor(k) {
      hemi.intensity = 0.22 - 0.16 * k;
      scene.environmentIntensity = 0.3 - 0.2 * k;
      renderer.toneMappingExposure = outdoorExposure + 0.2 * k;
    },
    dispose() {
      envTarget.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
