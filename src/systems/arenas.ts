import * as THREE from 'three';
import { CylinderObstacle, JumpPadVolume, PlatformSurface } from '../engine/physics';
import { VelocityTierInfo } from '../engine/events';

export type ArenaId = 'cyber_dojo' | 'twin_pillars' | 'reactor_core';

export interface ArenaDefinition {
  id: ArenaId;
  name: string;
  subtitle: string;
  description: string;
  radius: number;
}

export const ARENA_DEFINITIONS: ArenaDefinition[] = [
  {
    id: 'cyber_dojo',
    name: 'CYBER DOJO',
    subtitle: 'KINETIC OCTAGON COURT',
    description: 'Clean open octagonal reactor deck with 4 high-velocity jump pads around the outer rim.',
    radius: 22.0,
  },
  {
    id: 'twin_pillars',
    name: 'TWIN PILLARS',
    subtitle: 'DUAL MONOLITH SANCTUM',
    description: 'Two towering glowing monoliths in mid-court for 3D curve-shot line-of-sight breaks.',
    radius: 23.0,
  },
  {
    id: 'reactor_core',
    name: 'REACTOR CORE',
    subtitle: 'OVERDRIVE DAIS & BUMPERS',
    description: 'Central elevated platform surrounded by 4 pulsing outer energy bumpers.',
    radius: 23.5,
  },
];

export class ArenaSystem {
  public currentArenaId: ArenaId = 'cyber_dojo';
  public arenaRadius = 22.0;

  public readonly obstacles: CylinderObstacle[] = [];
  public readonly platforms: PlatformSurface[] = [];
  public readonly jumpPads: JumpPadVolume[] = [];

  private readonly rootGroup = new THREE.Group();
  private readonly mapDynamicGroup = new THREE.Group();

  private readonly energyChannelMat: THREE.MeshStandardMaterial;
  private readonly barrierWallMat: THREE.MeshBasicMaterial;
  private readonly holoRingMat: THREE.MeshBasicMaterial;
  private readonly jumpPadMat: THREE.MeshStandardMaterial;
  private readonly pillarTrimMat: THREE.MeshStandardMaterial;

  private readonly holoRingA: THREE.Mesh;
  private readonly holoRingB: THREE.Mesh;
  private clock = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.energyChannelMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.8,
    });

    this.barrierWallMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.11,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.holoRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.jumpPadMat = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      emissive: 0x00e676,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.5,
    });

    this.pillarTrimMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b8d4,
      emissiveIntensity: 2.0,
      roughness: 0.2,
      metalness: 0.7,
      flatShading: true,
    });

    this.buildBaseReactorDeck();

    // Floating holographic arena rings overhead
    this.holoRingA = new THREE.Mesh(
      new THREE.TorusGeometry(19.5, 0.11, 6, 48),
      this.holoRingMat
    );
    this.holoRingA.rotation.x = Math.PI / 2;
    this.holoRingA.position.y = 11.5;
    this.rootGroup.add(this.holoRingA);

    this.holoRingB = new THREE.Mesh(
      new THREE.TorusGeometry(14.0, 0.08, 6, 36),
      this.holoRingMat
    );
    this.holoRingB.rotation.x = Math.PI / 2;
    this.holoRingB.position.y = 14.2;
    this.rootGroup.add(this.holoRingB);

    this.rootGroup.add(this.mapDynamicGroup);
    this.scene.add(this.rootGroup);

    this.loadArena('cyber_dojo');
  }

  /**
   * Hexagonal obsidian-slate arena deck (#0a0e17) with recessed glowing energy channels
   * built using a single InstancedMesh for zero draw-call bloat.
   */
  private buildBaseReactorDeck(): void {
    // Glowing recessed sub-floor plane (visible through gaps between hexagonal obsidian tiles)
    const subFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(24.2, 24.2, 0.2, 32),
      this.energyChannelMat
    );
    subFloor.position.y = -0.22;
    this.rootGroup.add(subFloor);

    // Instanced Hexagonal Obsidian-Slate Tiles (#0a0e17)
    const hexRadius = 1.75;
    const hexGeo = new THREE.CylinderGeometry(hexRadius * 0.93, hexRadius * 0.96, 0.28, 6);
    const hexMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e17,
      roughness: 0.42,
      metalness: 0.72,
      flatShading: true,
    });

    const positions: Array<{ x: number; z: number }> = [];
    const stepX = hexRadius * 1.75;
    const stepZ = hexRadius * 1.515;

    for (let row = -15; row <= 15; row++) {
      for (let col = -15; col <= 15; col++) {
        const x = col * stepX + (Math.abs(row) % 2 === 1 ? stepX * 0.5 : 0);
        const z = row * stepZ;
        if (Math.hypot(x, z) <= 23.2) {
          positions.push({ x, z });
        }
      }
    }

    const hexInstanced = new THREE.InstancedMesh(hexGeo, hexMat, positions.length);
    hexInstanced.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < positions.length; i++) {
      dummy.position.set(positions[i].x, -0.14, positions[i].z);
      dummy.updateMatrix();
      hexInstanced.setMatrixAt(i, dummy.matrix);
    }
    hexInstanced.instanceMatrix.needsUpdate = true;
    this.rootGroup.add(hexInstanced);

    // Translucent Energy Barrier Perimeter Wall
    const barrierWall = new THREE.Mesh(
      new THREE.CylinderGeometry(23.5, 23.5, 7.5, 24, 2, true),
      this.barrierWallMat
    );
    barrierWall.position.y = 3.75;
    this.rootGroup.add(barrierWall);

    // Outer Obsidian Perimeter Rim Pillars
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.35,
      metalness: 0.8,
      flatShading: true,
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 24.0;
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, 8.2, 1.1), pillarMat);
      post.position.set(Math.cos(angle) * r, 4.1, Math.sin(angle) * r);
      post.lookAt(0, 4.1, 0);
      this.rootGroup.add(post);
    }
  }

  public loadArena(arenaId: ArenaId): void {
    this.currentArenaId = arenaId;
    const def = ARENA_DEFINITIONS.find((a) => a.id === arenaId) || ARENA_DEFINITIONS[0];
    this.arenaRadius = def.radius;

    // Clear previous dynamic map meshes & volumes
    while (this.mapDynamicGroup.children.length > 0) {
      this.mapDynamicGroup.remove(this.mapDynamicGroup.children[0]);
    }
    this.obstacles.length = 0;
    this.platforms.length = 0;
    this.jumpPads.length = 0;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x141c2e,
      roughness: 0.35,
      metalness: 0.78,
      flatShading: true,
    });

    if (arenaId === 'cyber_dojo') {
      // 4 Jump Pads around outer rim
      const padAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      for (const a of padAngles) {
        this.addJumpPad(Math.cos(a) * 14.5, 0, Math.sin(a) * 14.5);
      }
    } else if (arenaId === 'twin_pillars') {
      // 2 Tall Glowing Monoliths in mid-court for 3D curve-shot line-of-sight breaks
      const pillarOffsets = [-7.2, 7.2];
      for (const xOff of pillarOffsets) {
        const radius = 2.15;
        const height = 8.5;
        this.obstacles.push({
          position: new THREE.Vector3(xOff, 0, 0),
          radius,
          height,
        });

        const monolith = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.92, radius, height, 8),
          stoneMat
        );
        monolith.position.set(xOff, height * 0.5, 0);
        monolith.castShadow = true;
        monolith.receiveShadow = true;
        this.mapDynamicGroup.add(monolith);

        // Glowing neon rings on monolith
        for (const ry of [1.8, 4.5, 7.2]) {
          const band = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.25, 8),
            this.pillarTrimMat
          );
          band.position.set(xOff, ry, 0);
          this.mapDynamicGroup.add(band);
        }
      }

      // 2 Jump Pads North/South
      this.addJumpPad(0, 0, -14.5);
      this.addJumpPad(0, 0, 14.5);
    } else if (arenaId === 'reactor_core') {
      // Central Elevated Platform (radius 5.8m, topY 1.55m)
      const platR = 5.8;
      const platH = 1.55;
      this.platforms.push({
        position: new THREE.Vector3(0, 0, 0),
        radius: platR,
        topY: platH,
      });

      const dais = new THREE.Mesh(
        new THREE.CylinderGeometry(platR, platR + 0.65, platH, 12),
        stoneMat
      );
      dais.position.set(0, platH * 0.5, 0);
      dais.receiveShadow = true;
      dais.castShadow = true;
      this.mapDynamicGroup.add(dais);

      const daisTrim = new THREE.Mesh(
        new THREE.TorusGeometry(platR + 0.05, 0.09, 6, 24),
        this.pillarTrimMat
      );
      daisTrim.rotation.x = Math.PI / 2;
      daisTrim.position.y = platH;
      this.mapDynamicGroup.add(daisTrim);

      // 4 Outer Energy Bumpers
      const bumperAngles = [
        Math.PI * 0.25,
        Math.PI * 0.75,
        Math.PI * 1.25,
        Math.PI * 1.75,
      ];
      for (const a of bumperAngles) {
        const bx = Math.cos(a) * 12.2;
        const bz = Math.sin(a) * 12.2;
        const bRadius = 1.45;
        const bHeight = 2.6;
        this.obstacles.push({
          position: new THREE.Vector3(bx, 0, bz),
          radius: bRadius,
          height: bHeight,
        });

        const bumper = new THREE.Mesh(
          new THREE.CylinderGeometry(bRadius, bRadius * 1.1, bHeight, 8),
          stoneMat
        );
        bumper.position.set(bx, bHeight * 0.5, bz);
        bumper.castShadow = true;
        this.mapDynamicGroup.add(bumper);

        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(bRadius * 1.06, bRadius * 1.06, 0.35, 8),
          this.pillarTrimMat
        );
        cap.position.set(bx, 1.35, bz);
        this.mapDynamicGroup.add(cap);
      }

      // 4 Jump Pads leading up to the central dais
      this.addJumpPad(0, 0, -9.5);
      this.addJumpPad(0, 0, 9.5);
      this.addJumpPad(-9.5, 0, 0);
      this.addJumpPad(9.5, 0, 0);
    }
  }

  private addJumpPad(x: number, y: number, z: number): void {
    const padRadius = 1.55;
    this.jumpPads.push({
      position: new THREE.Vector3(x, y, z),
      radius: padRadius,
      boostVelocityY: 14.8,
    });

    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(padRadius, padRadius * 1.15, 0.18, 12),
      this.jumpPadMat
    );
    padMesh.position.set(x, y + 0.09, z);
    this.mapDynamicGroup.add(padMesh);
  }

  public updateVisuals(dt: number, tierColor: THREE.Color, _tier: VelocityTierInfo): void {
    this.clock += dt;
    this.energyChannelMat.color.copy(tierColor);
    this.energyChannelMat.emissive.copy(tierColor);
    this.barrierWallMat.color.copy(tierColor);
    this.holoRingMat.color.copy(tierColor);
    this.pillarTrimMat.emissive.copy(tierColor);

    this.holoRingA.rotation.z = this.clock * 0.18;
    this.holoRingB.rotation.z = -this.clock * 0.28;
    this.holoRingA.position.y = 11.5 + Math.sin(this.clock * 1.4) * 0.35;
  }
}
