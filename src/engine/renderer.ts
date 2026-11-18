import * as THREE from 'three';
import { getVelocityTier, VelocityTierInfo } from './events';

/**
 * Clean, high-readability Daylight Courtyard Renderer.
 * Uses direct WebGL rendering without heavy post-processing bloom so silhouettes,
 * court markings, and the incoming ball remain crisp and 100% readable at 60+ FPS.
 */
export class ArenaRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;

  public readonly hemiLight: THREE.HemisphereLight;
  public readonly keyLight: THREE.DirectionalLight;

  private currentTierColor = new THREE.Color(0x2b6cb0);
  private currentTier: VelocityTierInfo = getVelocityTier(0);

  constructor(
    public readonly canvas: HTMLCanvasElement,
    public readonly camera: THREE.PerspectiveCamera
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // Calm, soft daylight overcast/sky tone so dark & crimson ball contrasts effortlessly
    this.scene.background = new THREE.Color(0xdce5ec);
    this.scene.fog = new THREE.Fog(0xdce5ec, 65, 165);

    // Natural daylight HemisphereLight (soft sky blue top, warm sandstone bounce bottom)
    this.hemiLight = new THREE.HemisphereLight(0xf5f8fa, 0xc7bfb2, 1.35);
    this.hemiLight.position.set(0, 60, 0);
    this.scene.add(this.hemiLight);

    // Warm sunlit directional key light
    this.keyLight = new THREE.DirectionalLight(0xfff9ed, 1.65);
    this.keyLight.position.set(32, 54, 26);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 140;
    const d = 46;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    window.addEventListener('resize', this.onResize);
  }

  public updateReactiveLighting(
    ballSpeed: number,
    _ballPos: THREE.Vector3,
    _dt: number,
    onTierColorUpdated?: (color: THREE.Color, tier: VelocityTierInfo) => void
  ): void {
    const tier = getVelocityTier(ballSpeed);
    this.currentTier = tier;
    this.currentTierColor.setHex(tier.colorHex);

    if (onTierColorUpdated) {
      onTierColorUpdated(this.currentTierColor, this.currentTier);
    }
  }

  public getCurrentTierColor(): THREE.Color {
    return this.currentTierColor;
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public getRenderStats(): { drawCalls: number; triangles: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
}
