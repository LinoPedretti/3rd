import * as THREE from 'three';
import { CylinderObstacle, JumpPadVolume, PlatformSurface } from '../engine/physics';
import { VelocityTierInfo } from '../engine/events';

export type ArenaId =
  | 'twin_pillars'
  | 'volcano_crater'
  | 'sports_gym'
  | 'cyber_dojo'
  | 'reactor_core';

export interface ArenaDefinition {
  id: ArenaId;
  name: string;
  subtitle: string;
  themeTag: string;
  description: string;
  radius: number;
  skyHex: number;
  fogNear: number;
  fogFar: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
}

export const ARENA_DEFINITIONS: ArenaDefinition[] = [
  {
    id: 'twin_pillars',
    name: 'ALPINE SUMMIT',
    subtitle: 'MOUNTAIN RIDGE · 40M · 2 MONOLITHS',
    themeTag: 'MOUNTAINS',
    description:
      'High-altitude mountain slate court ringed by snow-capped alpine peaks, evergreen pines, and two granite monoliths.',
    radius: 40.0,
    skyHex: 0xcfe2f3,
    fogNear: 75,
    fogFar: 215,
    sunIntensity: 1.68,
    hemiSkyHex: 0xf5f9ff,
    hemiGroundHex: 0x8a95a5,
  },
  {
    id: 'volcano_crater',
    name: 'CALDERA CRATER',
    subtitle: 'VOLCANIC RIM · 40M · 4 OBSIDIAN SPIRES',
    themeTag: 'VOLCANO',
    description:
      'Matte volcanic basalt arena inside an active caldera crater surrounded by glowing lava moats and jagged obsidian ridges.',
    radius: 40.0,
    skyHex: 0xd8bfb0,
    fogNear: 68,
    fogFar: 205,
    sunIntensity: 1.55,
    hemiSkyHex: 0xf2d9c9,
    hemiGroundHex: 0x5c3a2e,
  },
  {
    id: 'sports_gym',
    name: 'CHAMPIONSHIP GYM HALL',
    subtitle: 'INDOOR ARENA · 38M · SPRINGBOARD PADS',
    themeTag: 'GYM HALL',
    description:
      'Polished maple hardwood court inside a packed indoor sports hall with tiered bleachers, backboards, banners, and roof trusses.',
    radius: 38.0,
    skyHex: 0xdcd6cc,
    fogNear: 80,
    fogFar: 195,
    sunIntensity: 1.5,
    hemiSkyHex: 0xfff8eb,
    hemiGroundHex: 0xb8a389,
  },
  {
    id: 'cyber_dojo',
    name: 'ZEN BAMBOO SANCTUARY',
    subtitle: 'TEMPLE GROVE · 40M · OPEN COURT',
    themeTag: 'SANCTUARY',
    description:
      'Tranquil sandstone martial courtyard framed by a dense green bamboo forest, sakura blossom trees, stone lanterns, and a pagoda.',
    radius: 40.0,
    skyHex: 0xd9e8e4,
    fogNear: 75,
    fogFar: 210,
    sunIntensity: 1.65,
    hemiSkyHex: 0xf4faf8,
    hemiGroundHex: 0xb5c2b2,
  },
  {
    id: 'reactor_core',
    name: 'FLOATING SKY RUINS',
    subtitle: 'SKY TEMPLE · 42M · CENTRAL DAIS',
    themeTag: 'SKY RUINS',
    description:
      'Sun-bleached marble sky sanctuary with a raised central dais, sundial bollards, drifting island ruins, and cloud banks.',
    radius: 42.0,
    skyHex: 0xd2e5f5,
    fogNear: 75,
    fogFar: 215,
    sunIntensity: 1.7,
    hemiSkyHex: 0xf7fbff,
    hemiGroundHex: 0xa8bbd0,
  },
];

export type EnvironmentPaletteCallback = (def: ArenaDefinition) => void;

export class ArenaSystem {
  public currentArenaId: ArenaId = 'twin_pillars';
  public arenaRadius = 40.0;

  public readonly obstacles: CylinderObstacle[] = [];
  public readonly platforms: PlatformSurface[] = [];
  public readonly jumpPads: JumpPadVolume[] = [];

  private readonly rootGroup = new THREE.Group();
  private readonly mapDynamicGroup = new THREE.Group();
  private readonly dummy = new THREE.Object3D();

  // Reusable shared materials (never disposed on arena swap)
  private readonly sharedMaterials: Set<THREE.Material> = new Set();

  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly markingMat: THREE.MeshBasicMaterial;
  private readonly wallMat: THREE.MeshStandardMaterial;
  private readonly timberMat: THREE.MeshStandardMaterial;
  private readonly jumpPadMat: THREE.MeshStandardMaterial;
  private readonly foliageGreenMat: THREE.MeshStandardMaterial;
  private readonly snowMat: THREE.MeshStandardMaterial;
  private readonly basaltMat: THREE.MeshStandardMaterial;
  private readonly lavaMat: THREE.MeshBasicMaterial;
  private readonly sakuraMat: THREE.MeshStandardMaterial;
  private readonly cloudMat: THREE.MeshStandardMaterial;
  private readonly steelMat: THREE.MeshStandardMaterial;
  private readonly bluePaintMat: THREE.MeshStandardMaterial;
  private readonly redPaintMat: THREE.MeshStandardMaterial;
  private readonly goldTrimMat: THREE.MeshStandardMaterial;

  private onEnvironmentChanged?: EnvironmentPaletteCallback;

  constructor(
    private readonly scene: THREE.Scene,
    onEnvironmentChanged?: EnvironmentPaletteCallback
  ) {
    this.onEnvironmentChanged = onEnvironmentChanged;

    this.floorMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0xd4cdc0, roughness: 0.9, metalness: 0.02 })
    );
    this.markingMat = this.regMat(
      new THREE.MeshBasicMaterial({ color: 0x999184, side: THREE.DoubleSide })
    );
    this.wallMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0x8f887d,
        roughness: 0.88,
        metalness: 0.05,
        flatShading: true,
      })
    );
    this.timberMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0x594a3c,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: true,
      })
    );
    this.jumpPadMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x4a8c82, roughness: 0.6, metalness: 0.1 })
    );
    this.foliageGreenMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x355e49, roughness: 0.88, flatShading: true })
    );
    this.snowMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.8, flatShading: true })
    );
    this.basaltMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x3d3532, roughness: 0.92, flatShading: true })
    );
    this.lavaMat = this.regMat(new THREE.MeshBasicMaterial({ color: 0xe05a2b }));
    this.sakuraMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0xf0bfc9, roughness: 0.85, flatShading: true })
    );
    this.cloudMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0xf7fafc, roughness: 0.95, flatShading: true })
    );
    this.steelMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0x4a5568,
        roughness: 0.55,
        metalness: 0.45,
        flatShading: true,
      })
    );
    this.bluePaintMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.65, flatShading: true })
    );
    this.redPaintMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0xb83232, roughness: 0.65, flatShading: true })
    );
    this.goldTrimMat = this.regMat(
      new THREE.MeshStandardMaterial({
        color: 0xc8a45d,
        roughness: 0.45,
        metalness: 0.6,
        flatShading: true,
      })
    );

    this.rootGroup.add(this.mapDynamicGroup);
    this.scene.add(this.rootGroup);

    this.loadArena('twin_pillars');
  }

  private regMat<T extends THREE.Material>(mat: T): T {
    this.sharedMaterials.add(mat);
    return mat;
  }

  public setEnvironmentCallback(cb: EnvironmentPaletteCallback): void {
    this.onEnvironmentChanged = cb;
    const def =
      ARENA_DEFINITIONS.find((a) => a.id === this.currentArenaId) || ARENA_DEFINITIONS[0];
    cb(def);
  }

  public loadArena(arenaId: ArenaId): void {
    this.currentArenaId = arenaId;
    const def = ARENA_DEFINITIONS.find((a) => a.id === arenaId) || ARENA_DEFINITIONS[0];
    this.arenaRadius = def.radius;

    // Dispose geometries of old dynamic arena objects cleanly
    this.mapDynamicGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material && !Array.isArray(mesh.material) && !this.sharedMaterials.has(mesh.material)) {
        mesh.material.dispose();
      }
    });
    while (this.mapDynamicGroup.children.length > 0) {
      this.mapDynamicGroup.remove(this.mapDynamicGroup.children[0]);
    }

    this.obstacles.length = 0;
    this.platforms.length = 0;
    this.jumpPads.length = 0;

    if (this.onEnvironmentChanged) {
      this.onEnvironmentChanged(def);
    }

    switch (arenaId) {
      case 'twin_pillars':
        this.buildAlpineSummit(def.radius);
        break;
      case 'volcano_crater':
        this.buildVolcanoCrater(def.radius);
        break;
      case 'sports_gym':
        this.buildSportsGymHall(def.radius);
        break;
      case 'cyber_dojo':
        this.buildZenBambooSanctuary(def.radius);
        break;
      case 'reactor_core':
        this.buildFloatingSkyRuins(def.radius);
        break;
    }
  }

  private buildCourtFloorAndMarkings(
    R: number,
    floorHex: number,
    lineHex: number,
    wallHex: number,
    capHex: number,
    padHex: number,
    postCount = 12
  ): void {
    this.floorMat.color.setHex(floorHex);
    this.markingMat.color.setHex(lineHex);
    this.wallMat.color.setHex(wallHex);
    this.timberMat.color.setHex(capHex);
    this.jumpPadMat.color.setHex(padHex);

    const mainFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R + 0.6, 0.5, 48),
      this.floorMat
    );
    mainFloor.position.y = -0.25;
    mainFloor.receiveShadow = true;
    this.mapDynamicGroup.add(mainFloor);

    // Subtle court circles & cross lines
    for (const ringR of [4.8, R * 0.5, R - 1.5]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ringR - 0.16, ringR, 48),
        this.markingMat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      this.mapDynamicGroup.add(ring);
    }

    const lineA = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.9, 0.14), this.markingMat);
    lineA.rotation.x = -Math.PI / 2;
    lineA.position.y = 0.012;
    this.mapDynamicGroup.add(lineA);

    const lineB = new THREE.Mesh(new THREE.PlaneGeometry(0.14, R * 1.9), this.markingMat);
    lineB.rotation.x = -Math.PI / 2;
    lineB.position.y = 0.012;
    this.mapDynamicGroup.add(lineB);

    // Low perimeter curb wall (1.45m high so surrounding vistas remain open & clear)
    const curbWall = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.4, R + 0.4, 1.45, 36, 1, true),
      this.wallMat
    );
    curbWall.position.y = 0.725;
    this.mapDynamicGroup.add(curbWall);

    const railCap = new THREE.Mesh(
      new THREE.TorusGeometry(R + 0.35, 0.24, 6, 36),
      this.timberMat
    );
    railCap.rotation.x = Math.PI / 2;
    railCap.position.y = 1.45;
    this.mapDynamicGroup.add(railCap);

    if (postCount > 0) {
      const postGeo = new THREE.BoxGeometry(0.75, 2.7, 0.75);
      const posts = new THREE.InstancedMesh(postGeo, this.timberMat, postCount);
      posts.castShadow = true;
      for (let i = 0; i < postCount; i++) {
        const a = (i / postCount) * Math.PI * 2;
        this.dummy.position.set(Math.cos(a) * (R + 0.45), 1.35, Math.sin(a) * (R + 0.45));
        this.dummy.lookAt(0, 1.35, 0);
        this.dummy.updateMatrix();
        posts.setMatrixAt(i, this.dummy.matrix);
      }
      posts.instanceMatrix.needsUpdate = true;
      this.mapDynamicGroup.add(posts);
    }
  }

  /**
   * 1. ALPINE SUMMIT (In the Mountains — 40m radius)
   */
  private buildAlpineSummit(R: number): void {
    this.buildCourtFloorAndMarkings(R, 0xcbd2d9, 0xf0f4f8, 0x6b7785, 0x4f3e31, 0x3b82a6, 12);

    // 2 Carved Granite Monoliths with snow-dusted timber caps
    for (const xOff of [-11.5, 11.5]) {
      const radius = 2.4;
      const height = 7.2;
      this.obstacles.push({ position: new THREE.Vector3(xOff, 0, 0), radius, height });

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.9, radius, height, 10),
        this.wallMat
      );
      pillar.position.set(xOff, height * 0.5, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.mapDynamicGroup.add(pillar);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.42, 10),
        this.timberMat
      );
      cap.position.set(xOff, height, 0);
      this.mapDynamicGroup.add(cap);

      const snowTop = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.95, radius * 1.1, 0.25, 10),
        this.snowMat
      );
      snowTop.position.set(xOff, height + 0.3, 0);
      this.mapDynamicGroup.add(snowTop);
    }

    this.addJumpPad(0, 0, -24.0);
    this.addJumpPad(0, 0, 24.0);

    // Mountain ridge plateau base
    const ridgeBase = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 9, R + 22, 6.0, 24),
      this.wallMat
    );
    ridgeBase.position.y = -3.35;
    this.mapDynamicGroup.add(ridgeBase);

    // 360° Ring of 16 Snow-Capped Mountain Peaks (Instanced)
    const peakCount = 16;
    const peakBaseGeo = new THREE.ConeGeometry(18, 42, 7);
    const peakCapGeo = new THREE.ConeGeometry(7.2, 16.8, 7);
    const peakBases = new THREE.InstancedMesh(peakBaseGeo, this.wallMat, peakCount);
    const peakCaps = new THREE.InstancedMesh(peakCapGeo, this.snowMat, peakCount);

    for (let i = 0; i < peakCount; i++) {
      const a = (i / peakCount) * Math.PI * 2 + (i % 2) * 0.12;
      const dist = 68 + (i % 3) * 16;
      const scaleY = 0.75 + (i % 4) * 0.24;
      const scaleXZ = 0.85 + (i % 3) * 0.25;
      const baseH = 42 * scaleY;

      this.dummy.position.set(Math.cos(a) * dist, baseH * 0.38 - 6, Math.sin(a) * dist);
      this.dummy.rotation.set(0, a * 1.7, 0);
      this.dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      this.dummy.updateMatrix();
      peakBases.setMatrixAt(i, this.dummy.matrix);

      // Snow cap perched on upper 40% of each mountain peak
      this.dummy.position.set(
        Math.cos(a) * dist,
        baseH * 0.38 - 6 + baseH * 0.305,
        Math.sin(a) * dist
      );
      this.dummy.scale.set(scaleXZ * 1.02, scaleY * 1.01, scaleXZ * 1.02);
      this.dummy.updateMatrix();
      peakCaps.setMatrixAt(i, this.dummy.matrix);
    }
    peakBases.instanceMatrix.needsUpdate = true;
    peakCaps.instanceMatrix.needsUpdate = true;
    this.mapDynamicGroup.add(peakBases);
    this.mapDynamicGroup.add(peakCaps);

    // 26 Evergreen Pine Trees around rocky perimeter ledges
    const treeCount = 26;
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.25, 0.38, 2.6, 6),
      this.timberMat,
      treeCount
    );
    const pineLower = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.9, 4.4, 7),
      this.foliageGreenMat,
      treeCount
    );
    const pineUpper = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.35, 3.6, 7),
      this.foliageGreenMat,
      treeCount
    );
    for (let i = 0; i < treeCount; i++) {
      const a = (i / treeCount) * Math.PI * 2 + 0.15;
      const r = 43.2 + (i % 3) * 2.2;
      const s = 0.85 + (i % 4) * 0.18;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      this.dummy.position.set(x, 0.8 * s, z);
      this.dummy.rotation.set(0, a, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x, 3.2 * s, z);
      this.dummy.updateMatrix();
      pineLower.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x, 5.1 * s, z);
      this.dummy.updateMatrix();
      pineUpper.setMatrixAt(i, this.dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    pineLower.instanceMatrix.needsUpdate = true;
    pineUpper.instanceMatrix.needsUpdate = true;
    this.mapDynamicGroup.add(trunks);
    this.mapDynamicGroup.add(pineLower);
    this.mapDynamicGroup.add(pineUpper);

    // Wooden Torii Mountain Gate on North Overlook
    this.buildToriiGate(0, 0, -R - 2.2, 0xb83232);
  }

  /**
   * 2. CALDERA CRATER (In the Crater of a Volcano — 40m radius)
   */
  private buildVolcanoCrater(R: number): void {
    // Muted warm slate-basalt court so dark/crimson ball & trajectory remain super crisp
    this.buildCourtFloorAndMarkings(R, 0x6a615b, 0xb5aba2, 0x3d3532, 0x6e422c, 0xd97724, 12);

    // 4 Obsidian Rock Spires on the court diagonals
    const spireAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (const a of spireAngles) {
      const sx = Math.cos(a) * 16.5;
      const sz = Math.sin(a) * 16.5;
      const radius = 1.65;
      const height = 4.6;
      this.obstacles.push({ position: new THREE.Vector3(sx, 0, sz), radius, height });

      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.55, radius, height, 7),
        this.basaltMat
      );
      spire.position.set(sx, height * 0.5, sz);
      spire.castShadow = true;
      spire.receiveShadow = true;
      this.mapDynamicGroup.add(spire);
    }

    // 4 Thermal Geyser Jump Pads
    this.addJumpPad(0, 0, -23.0);
    this.addJumpPad(0, 0, 23.0);
    this.addJumpPad(-23.0, 0, 0);
    this.addJumpPad(23.0, 0, 0);

    // Glowing Lava Moat surrounding the basalt arena
    const lavaMoat = new THREE.Mesh(
      new THREE.RingGeometry(R + 0.5, R + 20.0, 48),
      this.lavaMat
    );
    lavaMoat.rotation.x = -Math.PI / 2;
    lavaMoat.position.y = -2.2;
    this.mapDynamicGroup.add(lavaMoat);

    // Jagged Caldera Crater Rim Wall (24 massive slanted volcanic rock formations)
    const rimCount = 24;
    const rimGeo = new THREE.ConeGeometry(13.5, 34, 6);
    const rimMesh = new THREE.InstancedMesh(rimGeo, this.basaltMat, rimCount);
    for (let i = 0; i < rimCount; i++) {
      const a = (i / rimCount) * Math.PI * 2;
      const dist = R + 22 + (i % 3) * 6;
      const scaleY = 0.8 + (i % 4) * 0.22;
      this.dummy.position.set(Math.cos(a) * dist, 10 * scaleY - 3, Math.sin(a) * dist);
      this.dummy.rotation.set(0, a * 1.4, (i % 2 === 0 ? 1 : -1) * 0.14);
      this.dummy.scale.set(1.2, scaleY, 1.4);
      this.dummy.updateMatrix();
      rimMesh.setMatrixAt(i, this.dummy.matrix);
    }
    rimMesh.instanceMatrix.needsUpdate = true;
    this.mapDynamicGroup.add(rimMesh);

    // 14 Volcanic Rock Islands / Boulders protruding from the lava moat
    const rockCount = 14;
    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(2.4, 0),
      this.basaltMat,
      rockCount
    );
    for (let i = 0; i < rockCount; i++) {
      const a = (i / rockCount) * Math.PI * 2 + 0.2;
      const dist = R + 6.5 + (i % 3) * 3.5;
      this.dummy.position.set(Math.cos(a) * dist, -1.3, Math.sin(a) * dist);
      this.dummy.rotation.set(i, i * 0.8, 0);
      this.dummy.scale.set(1.2, 0.75 + (i % 3) * 0.35, 1.1);
      this.dummy.updateMatrix();
      rockMesh.setMatrixAt(i, this.dummy.matrix);
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    this.mapDynamicGroup.add(rockMesh);
  }

  /**
   * 3. CHAMPIONSHIP GYM HALL (Indoor Sport Gym Hall — 38m radius)
   */
  private buildSportsGymHall(R: number): void {
    // Maple Hardwood Court Floor + White & Royal Blue court markings
    this.buildCourtFloorAndMarkings(R, 0xd6b07a, 0xf7fafc, 0x2b6cb0, 0xf7fafc, 0x2b6cb0, 0);

    // Regulation court key lanes & center blue accent ring
    const centerBlueRing = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 4.85, 48),
      new THREE.MeshBasicMaterial({ color: 0x2b6cb0, side: THREE.DoubleSide })
    );
    centerBlueRing.rotation.x = -Math.PI / 2;
    centerBlueRing.position.y = 0.02;
    this.mapDynamicGroup.add(centerBlueRing);

    for (const zSign of [-1, 1]) {
      const keyRect = new THREE.Mesh(
        new THREE.PlaneGeometry(11.0, 12.0),
        new THREE.MeshBasicMaterial({ color: 0x2b6cb0, side: THREE.DoubleSide })
      );
      keyRect.rotation.x = -Math.PI / 2;
      keyRect.position.set(0, 0.01, zSign * (R - 7.5));
      this.mapDynamicGroup.add(keyRect);
    }

    // 4 Blue Gymnastic Springboard Pads
    this.addJumpPad(0, 0, -23.0);
    this.addJumpPad(0, 0, 23.0);
    this.addJumpPad(-23.0, 0, 0);
    this.addJumpPad(23.0, 0, 0);

    // Stadium concrete apron surrounding the circular hardwood court
    const apronMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.9, flatShading: true })
    );
    const apron = new THREE.Mesh(new THREE.BoxGeometry(116, 0.6, 116), apronMat);
    apron.position.y = -0.6;
    apron.receiveShadow = true;
    this.mapDynamicGroup.add(apron);

    // 4 Banks of Tiered Indoor Stadium Bleachers (N, S, E, W)
    const bleacherConfigs = [
      { x: 0, z: -46, rotY: 0, seatMat: this.bluePaintMat },
      { x: 0, z: 46, rotY: Math.PI, seatMat: this.redPaintMat },
      { x: -46, z: 0, rotY: Math.PI / 2, seatMat: this.bluePaintMat },
      { x: 46, z: 0, rotY: -Math.PI / 2, seatMat: this.redPaintMat },
    ];
    for (const cfg of bleacherConfigs) {
      const bank = new THREE.Group();
      for (let step = 0; step < 5; step++) {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(56, 1.4, 2.4), this.steelMat);
        tier.position.set(0, 0.7 + step * 1.4, -step * 2.3);
        bank.add(tier);

        const bench = new THREE.Mesh(new THREE.BoxGeometry(55.4, 0.3, 1.4), cfg.seatMat);
        bench.position.set(0, 1.55 + step * 1.4, -step * 2.3);
        bank.add(bench);
      }
      bank.position.set(cfg.x, 0, cfg.z);
      bank.rotation.y = cfg.rotY;
      this.mapDynamicGroup.add(bank);
    }

    // North & South Basketball Backboards + Scoreboard Panels
    for (const zSign of [-1, 1]) {
      const hoopGroup = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.5, 0.9), this.steelMat);
      post.position.set(0, 4.75, zSign * (R + 2.4));
      hoopGroup.add(post);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 3.2), this.steelMat);
      arm.position.set(0, 8.8, zSign * (R + 0.9));
      hoopGroup.add(arm);

      const board = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.6, 0.25), this.snowMat);
      board.position.set(0, 9.2, zSign * (R - 0.6));
      hoopGroup.add(board);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 6, 16), this.redPaintMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 8.0, zSign * (R - 1.5));
      hoopGroup.add(rim);

      const scoreboard = new THREE.Mesh(new THREE.BoxGeometry(10.5, 3.4, 0.8), this.steelMat);
      scoreboard.position.set(0, 16.5, zSign * (R + 3.5));
      hoopGroup.add(scoreboard);

      this.mapDynamicGroup.add(hoopGroup);
    }

    // Tall Gym Hall Columns & Overhead Steel Roof Trusses
    const trussSpan = 104;
    for (let i = -2; i <= 2; i++) {
      const zPos = i * 22;
      const colL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 26, 1.6), this.steelMat);
      colL.position.set(-51, 13, zPos);
      this.mapDynamicGroup.add(colL);

      const colR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 26, 1.6), this.steelMat);
      colR.position.set(51, 13, zPos);
      this.mapDynamicGroup.add(colR);

      const beam = new THREE.Mesh(new THREE.BoxGeometry(trussSpan, 1.4, 1.2), this.steelMat);
      beam.position.set(0, 25.5, zPos);
      this.mapDynamicGroup.add(beam);
    }

    // Championship Banners hanging from upper rafters
    for (let i = 0; i < 6; i++) {
      const bx = -25 + i * 10;
      const mat = i % 2 === 0 ? this.bluePaintMat : this.redPaintMat;
      const banner = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 0.14), mat);
      banner.position.set(bx, 22.0, -42);
      this.mapDynamicGroup.add(banner);
    }
  }

  /**
   * 4. ZEN BAMBOO SANCTUARY (Temple Courtyard — 40m radius)
   */
  private buildZenBambooSanctuary(R: number): void {
    this.buildCourtFloorAndMarkings(R, 0xd4cdc0, 0x999184, 0x8f887d, 0x594a3c, 0x4a8c82, 12);

    this.addJumpPad(0, 0, -24.0);
    this.addJumpPad(0, 0, 24.0);
    this.addJumpPad(-24.0, 0, 0);
    this.addJumpPad(24.0, 0, 0);

    // Surrounding Tranquil Grass Meadow
    const grassMat = this.regMat(
      new THREE.MeshStandardMaterial({ color: 0x7fa37c, roughness: 0.94, flatShading: true })
    );
    const meadow = new THREE.Mesh(new THREE.RingGeometry(R + 0.4, 120, 48), grassMat);
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.35;
    meadow.receiveShadow = true;
    this.mapDynamicGroup.add(meadow);

    // 8 Carved Stone Lanterns around the courtyard rim
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const lx = Math.cos(a) * (R + 2.2);
      const lz = Math.sin(a) * (R + 2.2);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 2.2, 6), this.wallMat);
      post.position.set(lx, 1.1, lz);
      this.mapDynamicGroup.add(post);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.65, 6), this.wallMat);
      roof.position.set(lx, 2.5, lz);
      this.mapDynamicGroup.add(roof);
    }

    // 42 Tall Green Bamboo Stalks & Leaf Canopies (Instanced)
    const bambooCount = 42;
    const stalkGeo = new THREE.CylinderGeometry(0.24, 0.3, 12.5, 6);
    const canopyGeo = new THREE.ConeGeometry(1.75, 4.2, 6);
    const stalks = new THREE.InstancedMesh(stalkGeo, this.foliageGreenMat, bambooCount);
    const canopies = new THREE.InstancedMesh(canopyGeo, this.foliageGreenMat, bambooCount);
    for (let i = 0; i < bambooCount; i++) {
      const a = (i / bambooCount) * Math.PI * 2 + (i % 3) * 0.08;
      const dist = R + 5.5 + (i % 5) * 3.8;
      const hScale = 0.8 + (i % 4) * 0.22;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;

      this.dummy.position.set(x, 6.0 * hScale, z);
      this.dummy.rotation.set(0, a, 0);
      this.dummy.scale.set(1, hScale, 1);
      this.dummy.updateMatrix();
      stalks.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x, 12.2 * hScale, z);
      this.dummy.updateMatrix();
      canopies.setMatrixAt(i, this.dummy.matrix);
    }
    stalks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    this.mapDynamicGroup.add(stalks);
    this.mapDynamicGroup.add(canopies);

    // 4 Cherry Blossom (Sakura) Trees on Diagonal Corners
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const tx = Math.cos(a) * (R + 5.0);
      const tz = Math.sin(a) * (R + 5.0);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 4.2, 7), this.timberMat);
      trunk.position.set(tx, 2.1, tz);
      trunk.castShadow = true;
      this.mapDynamicGroup.add(trunk);

      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 1), this.sakuraMat);
      crown.position.set(tx, 5.4, tz);
      crown.castShadow = true;
      this.mapDynamicGroup.add(crown);
    }

    // Traditional Wooden Pagoda Pavilion outside the North Wall
    const pagoda = new THREE.Group();
    for (let tier = 0; tier < 3; tier++) {
      const w = 8.4 - tier * 1.8;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, w), this.wallMat);
      body.position.y = 1.6 + tier * 3.8;
      pagoda.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.92, 1.8, 4), this.timberMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 3.7 + tier * 3.8;
      pagoda.add(roof);
    }
    pagoda.position.set(0, 0, -R - 9.5);
    this.mapDynamicGroup.add(pagoda);
  }

  /**
   * 5. FLOATING SKY RUINS (Highland Sky Terrace — 42m radius)
   */
  private buildFloatingSkyRuins(R: number): void {
    this.buildCourtFloorAndMarkings(R, 0xe0dad0, 0xb5a78c, 0x8f887d, 0xc8a45d, 0x4a8c82, 12);

    // Central Elevated Temple Dais (radius 9.0m, 1.25m high)
    const platR = 9.0;
    const platH = 1.25;
    this.platforms.push({ position: new THREE.Vector3(0, 0, 0), radius: platR, topY: platH });

    const dais = new THREE.Mesh(
      new THREE.CylinderGeometry(platR, platR + 0.85, platH, 24),
      this.wallMat
    );
    dais.position.set(0, platH * 0.5, 0);
    dais.receiveShadow = true;
    dais.castShadow = true;
    this.mapDynamicGroup.add(dais);

    const daisCap = new THREE.Mesh(
      new THREE.CylinderGeometry(platR * 0.96, platR * 0.96, 0.14, 24),
      this.floorMat
    );
    daisCap.position.set(0, platH, 0);
    daisCap.receiveShadow = true;
    this.mapDynamicGroup.add(daisCap);

    // 4 Carved Stone Sundial Bollards at 20m radius
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const bx = Math.cos(a) * 20.0;
      const bz = Math.sin(a) * 20.0;
      const bRadius = 1.65;
      const bHeight = 2.6;
      this.obstacles.push({ position: new THREE.Vector3(bx, 0, bz), radius: bRadius, height: bHeight });

      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(bRadius * 0.95, bRadius, bHeight, 10),
        this.wallMat
      );
      bollard.position.set(bx, bHeight * 0.5, bz);
      bollard.castShadow = true;
      this.mapDynamicGroup.add(bollard);

      const goldRing = new THREE.Mesh(
        new THREE.CylinderGeometry(bRadius * 1.04, bRadius * 1.04, 0.24, 10),
        this.goldTrimMat
      );
      goldRing.position.set(bx, bHeight - 0.15, bz);
      this.mapDynamicGroup.add(goldRing);
    }

    this.addJumpPad(0, 0, -14.5);
    this.addJumpPad(0, 0, 14.5);
    this.addJumpPad(-14.5, 0, 0);
    this.addJumpPad(14.5, 0, 0);

    // Tapered floating sky-island underside beneath main sanctuary
    const islandRoot = new THREE.Mesh(new THREE.ConeGeometry(R * 0.95, 22, 16), this.wallMat);
    islandRoot.rotation.x = Math.PI;
    islandRoot.position.y = -11.5;
    this.mapDynamicGroup.add(islandRoot);

    // 8 Drifting Floating Stone Islands with Ancient Columns
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.25;
      const dist = R + 16 + (i % 3) * 9;
      const yOff = -2 + (i % 3) * 5.5;
      const isl = new THREE.Group();

      const rockCone = new THREE.Mesh(new THREE.ConeGeometry(6.5, 11.0, 7), this.wallMat);
      rockCone.rotation.x = Math.PI;
      rockCone.position.y = -5.5;
      isl.add(rockCone);

      const topSlab = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.2, 0.9, 7), this.floorMat);
      isl.add(topSlab);

      // Broken ancient stone columns
      for (let c = 0; c < 2; c++) {
        const colH = 3.2 + ((i + c) % 3) * 1.4;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, colH, 8), this.floorMat);
        col.position.set(c === 0 ? -2.0 : 2.0, colH * 0.5 + 0.4, 0);
        isl.add(col);
      }

      isl.position.set(Math.cos(a) * dist, yOff, Math.sin(a) * dist);
      this.mapDynamicGroup.add(isl);
    }

    // Fluffy Low-Poly Cloud Banks floating below & around the sanctuary rim (Instanced)
    const cloudCount = 32;
    const clouds = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(4.2, 1),
      this.cloudMat,
      cloudCount
    );
    for (let i = 0; i < cloudCount; i++) {
      const a = (i / cloudCount) * Math.PI * 2;
      const dist = R + 8 + (i % 4) * 12;
      this.dummy.position.set(Math.cos(a) * dist, -6 - (i % 3) * 4, Math.sin(a) * dist);
      this.dummy.rotation.set(0, a, 0);
      this.dummy.scale.set(1.6 + (i % 2) * 0.6, 0.55, 1.2);
      this.dummy.updateMatrix();
      clouds.setMatrixAt(i, this.dummy.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
    this.mapDynamicGroup.add(clouds);
  }

  private buildToriiGate(x: number, y: number, z: number, colorHex: number): void {
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.72,
      flatShading: true,
    });
    const gate = new THREE.Group();
    const pL = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 9.5, 8), mat);
    pL.position.set(-4.2, 4.75, 0);
    gate.add(pL);

    const pR = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 9.5, 8), mat);
    pR.position.set(4.2, 4.75, 0);
    gate.add(pR);

    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.9, 1.1), mat);
    topBeam.position.set(0, 9.5, 0);
    gate.add(topBeam);

    const lowerBeam = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.65, 0.75), mat);
    lowerBeam.position.set(0, 7.6, 0);
    gate.add(lowerBeam);

    gate.position.set(x, y, z);
    this.mapDynamicGroup.add(gate);
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
    // Arenas remain calm, grounded, and crisp so the incoming ball never blends into flashing visuals
  }
}
