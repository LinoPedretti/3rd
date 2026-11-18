import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getVelocityTier, VelocityTierInfo } from './events';

export class ArenaRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly composer: EffectComposer;
  public readonly bloomPass: UnrealBloomPass;

  public readonly hemiLight: THREE.HemisphereLight;
  public readonly keyLight: THREE.DirectionalLight;
  public readonly reactorLightNorth: THREE.PointLight;
  public readonly reactorLightSouth: THREE.PointLight;
  public readonly ballAccentLight: THREE.PointLight;

  private targetTierColor = new THREE.Color(0x00e5ff);
  private currentTierColor = new THREE.Color(0x00e5ff);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050811);
    this.scene.fog = new THREE.FogExp2(0x050811, 0.0085);

    // Global HemisphereLight
    this.hemiLight = new THREE.HemisphereLight(0x88b4ff, 0x0a0e17, 0.95);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // Directional shadow-casting key light (PCFSoftShadowMap)
    this.keyLight = new THREE.DirectionalLight(0xeef6ff, 1.85);
    this.keyLight.position.set(22, 38, 18);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 110;
    const d = 34;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    // Dynamic Reactor PointLights that shift color with Velocity Tier
    this.reactorLightNorth = new THREE.PointLight(0x00e5ff, 18, 55, 1.4);
    this.reactorLightNorth.position.set(0, 12, -16);
    this.scene.add(this.reactorLightNorth);

    this.reactorLightSouth = new THREE.PointLight(0x00e5ff, 18, 55, 1.4);
    this.reactorLightSouth.position.set(0, 12, 16);
    this.scene.add(this.reactorLightSouth);

    this.ballAccentLight = new THREE.PointLight(0x00e5ff, 14, 18, 1.5);
    this.ballAccentLight.position.set(0, 2, 0);
    this.scene.add(this.ballAccentLight);

    // Post-processing pipeline with selective UnrealBloomPass
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.38, // strength
      0.28, // radius
      0.86 // threshold so only bright emissive neon cores bloom
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    window.addEventListener('resize', this.onResize);
  }

  public updateReactiveLighting(
    ballSpeed: number,
    ballPos: THREE.Vector3,
    dt: number,
    onTierColorUpdated?: (color: THREE.Color, tier: VelocityTierInfo) => void
  ): void {
    const tier = getVelocityTier(ballSpeed);
    this.currentTier = tier;
    this.targetTierColor.setHex(tier.colorHex);

    const lerpRate = Math.min(1, dt * 6.5);
    this.currentTierColor.lerp(this.targetTierColor, lerpRate);

    this.reactorLightNorth.color.copy(this.currentTierColor);
    this.reactorLightSouth.color.copy(this.currentTierColor);
    this.ballAccentLight.color.copy(this.currentTierColor);
    this.ballAccentLight.position.copy(ballPos);

    // Subtle bloom escalation with velocity tier
    this.bloomPass.strength = THREE.MathUtils.lerp(
      this.bloomPass.strength,
      tier.bloomStrength,
      lerpRate
    );

    if (onTierColorUpdated) {
      onTierColorUpdated(this.currentTierColor, this.currentTier);
    }
  }

  public getCurrentTierColor(): THREE.Color {
    return this.currentTierColor;
  }

  public render(): void {
    this.composer.render();
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
    this.composer.setSize(w, h);
  };
}
