import * as THREE from 'three';

const MAX_PARTICLES = 320;
const MAX_SHOCKWAVES = 28;
const MAX_AFTERIMAGES = 32;
const MAX_DECOYS = 6;
const SPEED_LINE_COUNT = 28;

interface ParticleSlot {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  scale: number;
  color: THREE.Color;
}

interface ShockwaveSlot {
  active: boolean;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  age: number;
  life: number;
  maxRadius: number;
  color: THREE.Color;
  isWallRipple: boolean;
}

interface AfterimageSlot {
  active: boolean;
  position: THREE.Vector3;
  yaw: number;
  age: number;
  life: number;
  color: THREE.Color;
}

interface DecoySlot {
  active: boolean;
  mesh: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  life: number;
}

export class VFXSystem {
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly particles: ParticleSlot[] = [];
  private particleCursor = 0;

  private readonly shockwaveMesh: THREE.InstancedMesh;
  private readonly shockwaves: ShockwaveSlot[] = [];
  private shockwaveCursor = 0;

  private readonly afterimageMesh: THREE.InstancedMesh;
  private readonly afterimages: AfterimageSlot[] = [];
  private afterimageCursor = 0;

  private readonly decoys: DecoySlot[] = [];

  // Volt 3D jagged lightning bolt mesh
  private readonly lightningMesh: THREE.Mesh;
  private readonly lightningMat: THREE.MeshBasicMaterial;
  private lightningTimer = 0;

  // Radial 3D Anime Speed-Lines attached to camera
  private readonly speedLinesGroup: THREE.Group;
  private readonly speedLineMat: THREE.MeshBasicMaterial;
  private speedLineTimer = 0;

  // Scratch transform matrix & helpers
  private readonly _dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _quat = new THREE.Quaternion();

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    // 1. Pooled 3D Spark / Dust Particles (InstancedMesh)
    const partGeo = new THREE.OctahedronGeometry(0.11, 0);
    const partMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        life: 0.35,
        scale: 1,
        color: new THREE.Color(0x8f887d),
      });
      this._dummy.position.set(0, -100, 0);
      this._dummy.scale.setScalar(0);
      this._dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this._dummy.matrix);
      this.particleMesh.setColorAt(i, this._color.setHex(0x8f887d));
    }
    this.scene.add(this.particleMesh);

    // 2. Pooled 3D Expanding Shockwave Rings (InstancedMesh)
    const ringGeo = new THREE.RingGeometry(0.84, 1.0, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.shockwaveMesh = new THREE.InstancedMesh(ringGeo, ringMat, MAX_SHOCKWAVES);
    this.shockwaveMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shockwaveMesh.frustumCulled = false;

    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      this.shockwaves.push({
        active: false,
        position: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        age: 0,
        life: 0.38,
        maxRadius: 3.0,
        color: new THREE.Color(0x8f887d),
        isWallRipple: false,
      });
      this._dummy.position.set(0, -100, 0);
      this._dummy.scale.setScalar(0);
      this._dummy.updateMatrix();
      this.shockwaveMesh.setMatrixAt(i, this._dummy.matrix);
      this.shockwaveMesh.setColorAt(i, this._color.setHex(0x8f887d));
    }
    this.scene.add(this.shockwaveMesh);

    // 3. Pooled 3D Dash Afterimages (InstancedMesh)
    const afterGeo = new THREE.CylinderGeometry(0.32, 0.22, 1.55, 6);
    afterGeo.translate(0, 0.85, 0);
    const afterMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: false,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.afterimageMesh = new THREE.InstancedMesh(afterGeo, afterMat, MAX_AFTERIMAGES);
    this.afterimageMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.afterimageMesh.frustumCulled = false;

    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      this.afterimages.push({
        active: false,
        position: new THREE.Vector3(),
        yaw: 0,
        age: 0,
        life: 0.28,
        color: new THREE.Color(0x00e5ff),
      });
      this._dummy.position.set(0, -100, 0);
      this._dummy.scale.setScalar(0);
      this._dummy.updateMatrix();
      this.afterimageMesh.setMatrixAt(i, this._dummy.matrix);
      this.afterimageMesh.setColorAt(i, this._color.setHex(0x00e5ff));
    }
    this.scene.add(this.afterimageMesh);

    // 4. Pooled Phantom Running 3D Holographic Decoys
    for (let i = 0; i < MAX_DECOYS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd500f9,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
      });
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 1.35, 6), mat);
      body.position.y = 0.88;
      g.add(body);
      const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat);
      head.position.y = 1.78;
      g.add(head);
      g.visible = false;
      this.scene.add(g);
      this.decoys.push({
        active: false,
        mesh: g,
        mat,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        life: 1.8,
      });
    }

    // 5. Volt Overdrive Blink 3D Jagged Lightning Bolt Mesh
    const boltSegments = 10;
    const boltPositions = new Float32Array((boltSegments + 1) * 2 * 3);
    const boltIndices: number[] = [];
    for (let i = 0; i < boltSegments; i++) {
      const b = i * 2;
      boltIndices.push(b, b + 1, b + 2);
      boltIndices.push(b + 1, b + 3, b + 2);
    }
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPositions, 3));
    boltGeo.setIndex(boltIndices);
    this.lightningMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lightningMesh = new THREE.Mesh(boltGeo, this.lightningMat);
    this.lightningMesh.frustumCulled = false;
    this.lightningMesh.visible = false;
    this.scene.add(this.lightningMesh);

    // 6. Radial 3D Anime Speed-Lines around screen edges attached to camera
    this.speedLinesGroup = new THREE.Group();
    this.speedLineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const spikeGeo = new THREE.ConeGeometry(0.025, 0.85, 4);
    spikeGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < SPEED_LINE_COUNT; i++) {
      const angle = (i / SPEED_LINE_COUNT) * Math.PI * 2;
      const spike = new THREE.Mesh(spikeGeo, this.speedLineMat);
      const r = 1.05 + (i % 3) * 0.12;
      spike.position.set(Math.cos(angle) * r, Math.sin(angle) * r * 0.68, -1.65);
      spike.lookAt(0, 0, -3.5);
      this.speedLinesGroup.add(spike);
    }
    this.speedLinesGroup.visible = false;
    camera.add(this.speedLinesGroup);
    this.scene.add(camera);
  }

  public spawnParticleBurst(
    pos: THREE.Vector3,
    colorHex: number,
    count: number,
    speedScale = 8.0
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;

      slot.active = true;
      slot.position.copy(pos);
      slot.position.y += 0.2;

      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.25) * Math.PI;
      const spd = (0.4 + Math.random() * 0.85) * speedScale;
      slot.velocity.set(
        Math.cos(theta) * Math.cos(phi) * spd,
        Math.max(1.5, Math.sin(phi) * spd + 3.0),
        Math.sin(theta) * Math.cos(phi) * spd
      );
      slot.age = 0;
      slot.life = 0.28 + Math.random() * 0.26;
      slot.scale = 0.75 + Math.random() * 0.9;
      slot.color.setHex(colorHex);
    }
  }

  public spawnShockwaveRing(
    pos: THREE.Vector3,
    colorHex: number,
    maxRadius = 3.6,
    normal?: THREE.Vector3
  ): void {
    const slot = this.shockwaves[this.shockwaveCursor];
    this.shockwaveCursor = (this.shockwaveCursor + 1) % MAX_SHOCKWAVES;

    slot.active = true;
    slot.position.copy(pos);
    if (normal) {
      slot.normal.copy(normal).normalize();
      slot.isWallRipple = true;
    } else {
      slot.normal.set(0, 1, 0);
      slot.position.y = Math.max(0.08, pos.y);
      slot.isWallRipple = false;
    }
    slot.age = 0;
    slot.life = 0.42;
    slot.maxRadius = maxRadius;
    slot.color.setHex(colorHex);
  }

  public spawnDashAfterimage(pos: THREE.Vector3, yaw: number, colorHex: number): void {
    const slot = this.afterimages[this.afterimageCursor];
    this.afterimageCursor = (this.afterimageCursor + 1) % MAX_AFTERIMAGES;

    slot.active = true;
    slot.position.copy(pos);
    slot.yaw = yaw;
    slot.age = 0;
    slot.life = 0.28;
    slot.color.setHex(colorHex);
  }

  public spawnRunningDecoy(pos: THREE.Vector3, dir: THREE.Vector3, colorHex: number): void {
    for (let i = 0; i < this.decoys.length; i++) {
      const d = this.decoys[i];
      if (!d.active) {
        d.active = true;
        d.position.copy(pos);
        d.velocity.copy(dir).normalize().multiplyScalar(10.5);
        d.age = 0;
        d.life = 1.65;
        d.mat.color.setHex(colorHex);
        d.mesh.position.copy(pos);
        d.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
        d.mesh.visible = true;
        return;
      }
    }
  }

  public spawnLightningBolt(start: THREE.Vector3, end: THREE.Vector3, colorHex: number): void {
    const boltSegments = 10;
    const attr = this.lightningMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i <= boltSegments; i++) {
      const t = i / boltSegments;
      const jitter = i > 0 && i < boltSegments ? Math.sin(i * 2.7) * 0.55 : 0;
      const x = THREE.MathUtils.lerp(start.x, end.x, t) + jitter;
      const y = THREE.MathUtils.lerp(start.y + 1.0, end.y + 1.0, t) + (i % 2 === 0 ? 0.22 : -0.18);
      const z = THREE.MathUtils.lerp(start.z, end.z, t) - jitter * 0.7;

      const idx = i * 6;
      arr[idx] = x - 0.14;
      arr[idx + 1] = y;
      arr[idx + 2] = z;

      arr[idx + 3] = x + 0.14;
      arr[idx + 4] = y + 0.18;
      arr[idx + 5] = z;
    }

    attr.needsUpdate = true;
    this.lightningMat.color.setHex(colorHex);
    this.lightningMat.opacity = 1.0;
    this.lightningMesh.visible = true;
    this.lightningTimer = 0.28;
  }

  public triggerAnimeSpeedLines(colorHex: number, duration = 0.22): void {
    this.speedLineMat.color.setHex(colorHex);
    this.speedLineMat.opacity = 0.85;
    this.speedLinesGroup.visible = true;
    this.speedLineTimer = duration;
  }

  public update(dt: number): void {
    // 1. Update particles
    let particlesDirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      particlesDirty = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.setScalar(0);
        this._dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.velocity.y -= 18.0 * dt;
      p.position.addScaledVector(p.velocity, dt);
      const frac = 1 - p.age / p.life;
      this._dummy.position.copy(p.position);
      this._dummy.rotation.set(p.age * 8, p.age * 11, 0);
      this._dummy.scale.setScalar(p.scale * frac);
      this._dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this._dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (particlesDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // 2. Update shockwaves & barrier wall ripples
    let shockwavesDirty = false;
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const s = this.shockwaves[i];
      if (!s.active) continue;
      shockwavesDirty = true;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.setScalar(0);
        this._dummy.updateMatrix();
        this.shockwaveMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      const progress = s.age / s.life;
      const easeOut = 1 - Math.pow(1 - progress, 2.4);
      const radius = Math.max(0.2, easeOut * s.maxRadius);

      this._dummy.position.copy(s.position);
      this._quat.setFromUnitVectors(this._up, s.normal);
      this._dummy.quaternion.copy(this._quat);
      this._dummy.scale.set(radius, 1, radius);
      this._dummy.updateMatrix();
      this.shockwaveMesh.setMatrixAt(i, this._dummy.matrix);

      this._color.copy(s.color).multiplyScalar(1 - progress * 0.75);
      this.shockwaveMesh.setColorAt(i, this._color);
    }
    if (shockwavesDirty) {
      this.shockwaveMesh.instanceMatrix.needsUpdate = true;
      if (this.shockwaveMesh.instanceColor) this.shockwaveMesh.instanceColor.needsUpdate = true;
    }

    // 3. Update dash afterimages
    let afterDirty = false;
    for (let i = 0; i < MAX_AFTERIMAGES; i++) {
      const a = this.afterimages[i];
      if (!a.active) continue;
      afterDirty = true;
      a.age += dt;
      if (a.age >= a.life) {
        a.active = false;
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.setScalar(0);
        this._dummy.updateMatrix();
        this.afterimageMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }
      const frac = 1 - a.age / a.life;
      this._dummy.position.copy(a.position);
      this._dummy.rotation.set(0, a.yaw, 0);
      this._dummy.scale.set(frac, 1, frac);
      this._dummy.updateMatrix();
      this.afterimageMesh.setMatrixAt(i, this._dummy.matrix);
      this._color.copy(a.color).multiplyScalar(frac);
      this.afterimageMesh.setColorAt(i, this._color);
    }
    if (afterDirty) {
      this.afterimageMesh.instanceMatrix.needsUpdate = true;
      if (this.afterimageMesh.instanceColor) this.afterimageMesh.instanceColor.needsUpdate = true;
    }

    // 4. Update Phantom holographic decoys
    for (let i = 0; i < this.decoys.length; i++) {
      const d = this.decoys[i];
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.life) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      d.position.addScaledVector(d.velocity, dt);
      d.mesh.position.copy(d.position);
      d.mat.opacity = (1 - d.age / d.life) * 0.75;
    }

    // 5. Update Volt lightning bolt
    if (this.lightningTimer > 0) {
      this.lightningTimer = Math.max(0, this.lightningTimer - dt);
      this.lightningMat.opacity = this.lightningTimer / 0.28;
      if (this.lightningTimer <= 0) {
        this.lightningMesh.visible = false;
      }
    }

    // 6. Update radial anime speed-lines
    if (this.speedLineTimer > 0) {
      this.speedLineTimer = Math.max(0, this.speedLineTimer - dt);
      this.speedLineMat.opacity = (this.speedLineTimer / 0.22) * 0.85;
      this.speedLinesGroup.rotation.z += dt * 4.5;
      if (this.speedLineTimer <= 0) {
        this.speedLinesGroup.visible = false;
      }
    }
  }
}
