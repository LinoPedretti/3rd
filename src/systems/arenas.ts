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
    name: 'GRAND COURTYARD',
    subtitle: 'OPEN STONE ARENA (38M)',
    description: 'Expansive, uncluttered sandstone courtyard with clear sightlines and 4 outer breeze pads.',
    radius: 38.0,
  },
  {
    id: 'twin_pillars',
    name: 'STONE SANCTUM',
    subtitle: 'TWIN MONOLITH COURT (40M)',
    description: 'Large temple court with two carved stone pillars for curving shots around cover.',
    radius: 40.0,
  },
  {
    id: 'reactor_core',
    name: 'HIGHLAND TERRACE',
    subtitle: 'CENTRAL STONE DAIS (42M)',
    description: 'Massive elevated sanctuary featuring a wide central stone terrace and outer stone posts.',
    radius: 42.0,
  },
];

export class ArenaSystem {
  public currentArenaId: ArenaId = 'cyber_dojo';
  public arenaRadius = 38.0;

  public readonly obstacles: CylinderObstacle[] = [];
  public readonly platforms: PlatformSurface[] = [];
  public readonly jumpPads: JumpPadVolume[] = [];

  private readonly rootGroup = new THREE.Group();
  private readonly mapDynamicGroup = new THREE.Group();

  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly markingMat: THREE.MeshBasicMaterial;
  private readonly wallMat: THREE.MeshStandardMaterial;
  private readonly timberMat: THREE.MeshStandardMaterial;
  private readonly jumpPadMat: THREE.MeshStandardMaterial;

  constructor(private readonly scene: THREE.Scene) {
    // Calm, matte warm sandstone floor so dark/crimson ball & characters pop clearly
    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0xd4cdc0,
      roughness: 0.92,
      metalness: 0.02,
    });

    // Subtle slate-taupe court line markings
    this.markingMat = new THREE.MeshBasicMaterial({
      color: 0x999184,
      side: THREE.DoubleSide,
    });

    // Muted warm stone wall & pillar material
    this.wallMat = new THREE.MeshStandardMaterial({
      color: 0x8f887d,
      roughness: 0.88,
      metalness: 0.05,
      flatShading: true,
    });

    // Natural dark cedar timber accent material
    this.timberMat = new THREE.MeshStandardMaterial({
      color: 0x594a3c,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true,
    });

    // Muted sage-teal wind-pad material (readable without harsh neon)
    this.jumpPadMat = new THREE.MeshStandardMaterial({
      color: 0x4a8c82,
      roughness: 0.6,
      metalness: 0.1,
    });

    this.rootGroup.add(this.mapDynamicGroup);
    this.scene.add(this.rootGroup);

    this.loadArena('cyber_dojo');
  }

  public loadArena(arenaId: ArenaId): void {
    this.currentArenaId = arenaId;
    const def = ARENA_DEFINITIONS.find((a) => a.id === arenaId) || ARENA_DEFINITIONS[0];
    this.arenaRadius = def.radius;

    while (this.mapDynamicGroup.children.length > 0) {
      this.mapDynamicGroup.remove(this.mapDynamicGroup.children[0]);
    }
    this.obstacles.length = 0;
    this.platforms.length = 0;
    this.jumpPads.length = 0;

    const R = this.arenaRadius;

    // 1. Clean, Smooth Matte Courtyard Floor Disc
    const mainFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R + 0.6, 0.5, 48),
      this.floorMat
    );
    mainFloor.position.y = -0.25;
    mainFloor.receiveShadow = true;
    this.mapDynamicGroup.add(mainFloor);

    // 2. Subtle Court Markings (Center circle, mid-court ring, outer boundary line)
    for (const ringR of [4.5, R * 0.5, R - 1.5]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ringR - 0.14, ringR, 48),
        this.markingMat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      this.mapDynamicGroup.add(ring);
    }

    // Center court axis lines for clear spatial reference
    const lineA = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.9, 0.12), this.markingMat);
    lineA.rotation.x = -Math.PI / 2;
    lineA.position.y = 0.012;
    this.mapDynamicGroup.add(lineA);

    const lineB = new THREE.Mesh(new THREE.PlaneGeometry(0.12, R * 1.9), this.markingMat);
    lineB.rotation.x = -Math.PI / 2;
    lineB.position.y = 0.012;
    this.mapDynamicGroup.add(lineB);

    // 3. Low, Clean Stone Perimeter Curb Wall (height 1.5m so horizon stays open & readable)
    const curbWall = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.4, R + 0.4, 1.5, 36, 1, true),
      this.wallMat
    );
    curbWall.position.y = 0.75;
    this.mapDynamicGroup.add(curbWall);

    // Top timber rail cap along the low perimeter wall
    const railCap = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.35, 0.25, 6, 36),
      this.timberMat
    );
    railCap.rotation.x = Math.PI / 2;
    railCap.position.y = 1.5;
    this.mapDynamicGroup.add(railCap);

    // 12 Simple Wooden Boundary Posts around the courtyard rim
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const px = Math.cos(angle) * (R + 0.45);
      const pz = Math.sin(angle) * (R + 0.45);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.8, 0.75), this.timberMat);
      post.position.set(px, 1.4, pz);
      post.lookAt(0, 1.4, 0);
      post.castShadow = true;
      this.mapDynamicGroup.add(post);
    }

    // 4. Map-Specific Simple Architectural Elements
    if (arenaId === 'cyber_dojo') {
      // Grand Courtyard: 4 outer wind jump pads at 24m radius
      const padAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      for (const a of padAngles) {
        this.addJumpPad(Math.cos(a) * 24.0, 0, Math.sin(a) * 24.0);
      }
    } else if (arenaId === 'twin_pillars') {
      // Stone Sanctum: 2 clean stone monoliths spaced 23m apart
      const pillarOffsets = [-11.5, 11.5];
      for (const xOff of pillarOffsets) {
        const radius = 2.4;
        const height = 7.2;
        this.obstacles.push({
          position: new THREE.Vector3(xOff, 0, 0),
          radius,
          height,
        });

        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 0.92, radius, height, 12),
          this.wallMat
        );
        pillar.position.set(xOff, height * 0.5, 0);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        this.mapDynamicGroup.add(pillar);

        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, 0.45, 12),
          this.timberMat
        );
        cap.position.set(xOff, height, 0);
        this.mapDynamicGroup.add(cap);
      }

      this.addJumpPad(0, 0, -24.0);
      this.addJumpPad(0, 0, 24.0);
    } else if (arenaId === 'reactor_core') {
      // Highland Terrace: Wide central stone platform (9.0m radius, 1.25m high)
      const platR = 9.0;
      const platH = 1.25;
      this.platforms.push({
        position: new THREE.Vector3(0, 0, 0),
        radius: platR,
        topY: platH,
      });

      const dais = new THREE.Mesh(
        new THREE.CylinderGeometry(platR, platR + 0.8, platH, 24),
        this.wallMat
      );
      dais.position.set(0, platH * 0.5, 0);
      dais.receiveShadow = true;
      dais.castShadow = true;
      this.mapDynamicGroup.add(dais);

      // 4 Outer Stone Bollards at 20m radius
      const bumperAngles = [
        Math.PI * 0.25,
        Math.PI * 0.75,
        Math.PI * 1.25,
        Math.PI * 1.75,
      ];
      for (const a of bumperAngles) {
        const bx = Math.cos(a) * 20.0;
        const bz = Math.sin(a) * 20.0;
        const bRadius = 1.65;
        const bHeight = 2.5;
        this.obstacles.push({
          position: new THREE.Vector3(bx, 0, bz),
          radius: bRadius,
          height: bHeight,
        });

        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(bRadius * 0.95, bRadius, bHeight, 10),
          this.wallMat
        );
        bollard.position.set(bx, bHeight * 0.5, bz);
        bollard.castShadow = true;
        this.mapDynamicGroup.add(bollard);
      }

      this.addJumpPad(0, 0, -14.5);
      this.addJumpPad(0, 0, 14.5);
      this.addJumpPad(-14.5, 0, 0);
      this.addJumpPad(14.5, 0, 0);
    }
  }

  private addJumpPad(x: number, y: number, z: number): void {
    const padRadius = 1.85;
    this.jumpPads.push({
      position: new THREE.Vector3(x, y, z),
      radius: padRadius,
      boostVelocityY: 14.5,
    });

    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(padRadius, padRadius * 1.1, 0.14, 16),
      this.jumpPadMat
    );
    padMesh.position.set(x, y + 0.07, z);
    this.mapDynamicGroup.add(padMesh);
  }

  public updateVisuals(_dt: number, _tierColor: THREE.Color, _tier: VelocityTierInfo): void {
    // Courtyard visuals remain calm, grounded, and non-flashing for maximum ball readability
  }
}
