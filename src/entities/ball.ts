import * as THREE from 'three';
import { getVelocityTier } from '../engine/events';

const TRAIL_POINTS = 26;
export const INITIAL_BALL_SPEED = 16.5;
export const MAX_BALL_SPEED = 165.0; // ~Mach 13.75 in Endless Speed Gauntlet

export interface BallHistorySample {
  time: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  targetId: string | null;
}

export class PlasmaBall {
  public readonly rootGroup: THREE.Group;
  private readonly coreMesh: THREE.Mesh;
  private readonly coreMat: THREE.MeshStandardMaterial;
  private readonly gyroRingA: THREE.Mesh;
  private readonly gyroRingB: THREE.Mesh;
  private readonly ringMat: THREE.MeshStandardMaterial;

  // Floor projection ring + vertical laser drop line for effortless 3D depth perception
  private readonly floorRingGroup: THREE.Group;
  private readonly floorRingMat: THREE.MeshBasicMaterial;
  private readonly dropLineMesh: THREE.Mesh;

  // Target Lock-On directional chevron/beam from ball toward target
  private readonly lockBeamGroup: THREE.Group;
  private readonly lockBeamMesh: THREE.Mesh;
  private readonly lockBeamMat: THREE.MeshBasicMaterial;
  private readonly lockChevronMesh: THREE.Mesh;

  // Chrono Temporal Stasis translucent glowing cyan 3D geodesic dome
  private readonly stasisDomeMesh: THREE.Mesh;

  // Tapering 3D volumetric ribbon trail (pre-allocated BufferGeometry)
  private readonly trailMesh: THREE.Mesh;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private readonly trailPositions: Float32Array;
  private readonly trailHistory: THREE.Vector3[] = [];

  // Delayed perception ring buffer for AI reaction windows
  private readonly perceptionBuffer: BallHistorySample[] = [];
  private perceptionHead = 0;

  // Simulation physics state
  public readonly position = new THREE.Vector3(0, 1.5, 0);
  public readonly prevPosition = new THREE.Vector3(0, 1.5, 0);
  public readonly velocity = new THREE.Vector3(0, 0, 1);
  public readonly curveAccel = new THREE.Vector3(0, 0, 0);
  public speed = INITIAL_BALL_SPEED;
  public readonly radius = 0.48;

  public targetId: string | null = null;
  public lastHitterId: string | null = null;

  // Ball states
  public stasisTimer = 0; // Chrono 1.5s freeze
  public isBuntLob = false;
  public buntGravity = 0;

  // Phantom Stealth Curve state (cloaked for first 40% of 3D flight path)
  public stealthActive = false;
  public stealthTotalDist = 0;
  public stealthTraveledDist = 0;

  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _dir = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();
  private readonly _toTarget = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.rootGroup = new THREE.Group();

    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00e5ff,
      emissiveIntensity: 3.2,
      roughness: 0.1,
      metalness: 0.2,
    });
    this.coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), this.coreMat);
    this.rootGroup.add(this.coreMesh);

    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
    });

    this.gyroRingA = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.042, 6, 18), this.ringMat);
    this.gyroRingB = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 18), this.ringMat);
    this.gyroRingB.rotation.x = Math.PI * 0.5;
    this.rootGroup.add(this.gyroRingA);
    this.rootGroup.add(this.gyroRingB);

    // Chrono Geodesic Stasis Dome around ball
    this.stasisDomeMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.75, 1),
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        wireframe: true,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
      })
    );
    this.stasisDomeMesh.visible = false;
    this.rootGroup.add(this.stasisDomeMesh);

    // Floor projection ring directly underneath the ball
    this.floorRingGroup = new THREE.Group();
    this.floorRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const floorRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.64, 24), this.floorRingMat);
    floorRing.rotation.x = -Math.PI / 2;
    this.floorRingGroup.add(floorRing);

    const dropGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
    dropGeo.translate(0, 0.5, 0);
    this.dropLineMesh = new THREE.Mesh(dropGeo, this.floorRingMat);
    this.floorRingGroup.add(this.dropLineMesh);

    // Directional Target Lock Beam & Chevron pointing from ball toward target
    this.lockBeamGroup = new THREE.Group();
    this.lockBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff1744,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamGeo = new THREE.CylinderGeometry(0.035, 0.075, 1, 6);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    this.lockBeamMesh = new THREE.Mesh(beamGeo, this.lockBeamMat);
    this.lockBeamGroup.add(this.lockBeamMesh);

    const chevronGeo = new THREE.ConeGeometry(0.24, 0.55, 4);
    chevronGeo.rotateX(Math.PI / 2);
    this.lockChevronMesh = new THREE.Mesh(chevronGeo, this.lockBeamMat);
    this.lockChevronMesh.position.z = 1.35;
    this.lockBeamGroup.add(this.lockChevronMesh);

    // Tapering 3D Volumetric Ribbon Trail
    for (let i = 0; i < TRAIL_POINTS; i++) {
      this.trailHistory.push(new THREE.Vector3());
    }
    this.trailPositions = new Float32Array(TRAIL_POINTS * 2 * 3);
    const trailIndices: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const b = i * 2;
      trailIndices.push(b, b + 1, b + 2);
      trailIndices.push(b + 1, b + 3, b + 2);
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeo.setIndex(trailIndices);

    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trailMesh = new THREE.Mesh(trailGeo, this.trailMat);
    this.trailMesh.frustumCulled = false;

    // Pre-allocate perception history ring buffer (60 samples = 1.0s at 60Hz)
    for (let i = 0; i < 64; i++) {
      this.perceptionBuffer.push({
        time: 0,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        speed: INITIAL_BALL_SPEED,
        targetId: null,
      });
    }

    scene.add(this.rootGroup);
    scene.add(this.floorRingGroup);
    scene.add(this.lockBeamGroup);
    scene.add(this.trailMesh);
  }

  public reset(spawnPos: THREE.Vector3, initialDir: THREE.Vector3, targetId: string | null): void {
    this.position.copy(spawnPos);
    this.prevPosition.copy(spawnPos);
    this.velocity.copy(initialDir).normalize();
    this.curveAccel.set(0, 0, 0);
    this.speed = INITIAL_BALL_SPEED;
    this.targetId = targetId;
    this.lastHitterId = null;
    this.stasisTimer = 0;
    this.isBuntLob = false;
    this.buntGravity = 0;
    this.stealthActive = false;
    this.stealthTotalDist = 0;
    this.stealthTraveledDist = 0;

    for (let i = 0; i < TRAIL_POINTS; i++) {
      this.trailHistory[i].copy(spawnPos);
    }
    this.updateTrailGeometry();
  }

  public recordPerceptionSample(simClock: number): void {
    const slot = this.perceptionBuffer[this.perceptionHead];
    slot.time = simClock;
    slot.position.copy(this.position);
    slot.velocity.copy(this.velocity);
    slot.speed = this.speed;
    slot.targetId = this.targetId;
    this.perceptionHead = (this.perceptionHead + 1) % this.perceptionBuffer.length;
  }

  public getDelayedSample(simClock: number, delaySeconds: number): BallHistorySample {
    const targetTime = simClock - delaySeconds;
    let best = this.perceptionBuffer[(this.perceptionHead + this.perceptionBuffer.length - 1) % this.perceptionBuffer.length];
    let minDiff = Infinity;
    for (let i = 0; i < this.perceptionBuffer.length; i++) {
      const s = this.perceptionBuffer[i];
      if (s.time > 0) {
        const diff = Math.abs(s.time - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          best = s;
        }
      }
    }
    return best;
  }

  public updateVisuals(
    dt: number,
    targetPos: THREE.Vector3 | null,
    isTargetLocalHuman: boolean,
    floorY: number
  ): void {
    const tier = getVelocityTier(this.speed);
    this.coreMat.emissive.setHex(tier.colorHex);
    this.ringMat.color.setHex(tier.colorHex);
    this.ringMat.emissive.setHex(tier.colorHex);
    this.floorRingMat.color.setHex(tier.colorHex);
    this.trailMat.color.setHex(tier.colorHex);

    // Phantom Stealth Curve: translucent cloak for first 40% of flight path
    let isCloaked = false;
    if (this.stealthActive && this.stealthTotalDist > 1.0) {
      const frac = this.stealthTraveledDist / this.stealthTotalDist;
      if (frac < 0.4) {
        isCloaked = true;
      } else {
        this.stealthActive = false;
      }
    }

    const alphaVis = isCloaked ? 0.14 : 1.0;
    this.coreMat.transparent = isCloaked;
    this.coreMat.opacity = alphaVis;
    this.ringMat.transparent = isCloaked;
    this.ringMat.opacity = alphaVis;
    this.trailMat.opacity = isCloaked ? 0.08 : 0.65;

    this.rootGroup.position.copy(this.position);

    // Counter-rotating gyroscopic outer containment rings
    const spinRate = 3.5 + this.speed * 0.18;
    this.gyroRingA.rotation.x += dt * spinRate;
    this.gyroRingA.rotation.y += dt * spinRate * 0.7;
    this.gyroRingB.rotation.y -= dt * spinRate * 1.1;
    this.gyroRingB.rotation.z += dt * spinRate * 0.8;

    // Chrono Temporal Stasis geodesic dome
    this.stasisDomeMesh.visible = this.stasisTimer > 0;
    if (this.stasisTimer > 0) {
      this.stasisDomeMesh.rotation.y += dt * 2.5;
      this.stasisDomeMesh.rotation.z -= dt * 1.6;
    }

    // Floor projection ring directly below ball
    this.floorRingGroup.position.set(this.position.x, floorY + 0.04, this.position.z);
    const heightAboveFloor = Math.max(0.1, this.position.y - floorY);
    this.dropLineMesh.scale.set(1, heightAboveFloor, 1);

    // Target Lock-On directional beam & chevron pointing from ball toward locked fighter
    if (targetPos) {
      this.lockBeamGroup.visible = true;
      this.lockBeamGroup.position.copy(this.position);
      this._toTarget.set(targetPos.x, targetPos.y + 1.15, targetPos.z);
      const dist = this.position.distanceTo(this._toTarget);
      this.lockBeamGroup.lookAt(this._toTarget);
      this.lockBeamMesh.scale.set(1, 1, Math.max(0.5, Math.min(dist * 0.65, 6.5)));
      this.lockBeamMat.color.setHex(isTargetLocalHuman ? 0xff1744 : tier.colorHex);
      this.lockBeamMat.opacity = isTargetLocalHuman ? 0.88 : 0.42;
    } else {
      this.lockBeamGroup.visible = false;
    }

    // Shift ribbon trail points and rebuild vertices
    for (let i = TRAIL_POINTS - 1; i > 0; i--) {
      this.trailHistory[i].copy(this.trailHistory[i - 1]);
    }
    this.trailHistory[0].copy(this.position);
    this.updateTrailGeometry();
  }

  private updateTrailGeometry(): void {
    const baseWidth = 0.42;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const p = this.trailHistory[i];
      const next = i < TRAIL_POINTS - 1 ? this.trailHistory[i + 1] : p;
      this._dir.subVectors(p, next);
      if (this._dir.lengthSq() < 1e-6) {
        this._dir.copy(this.velocity);
      }
      this._dir.normalize();
      this._side.crossVectors(this._dir, this._up);
      if (this._side.lengthSq() < 1e-5) {
        this._side.set(1, 0, 0);
      } else {
        this._side.normalize();
      }

      const taper = 1 - i / (TRAIL_POINTS - 1);
      const w = baseWidth * taper;

      const idx = i * 6;
      this.trailPositions[idx] = p.x - this._side.x * w;
      this.trailPositions[idx + 1] = p.y;
      this.trailPositions[idx + 2] = p.z - this._side.z * w;

      this.trailPositions[idx + 3] = p.x + this._side.x * w;
      this.trailPositions[idx + 4] = p.y;
      this.trailPositions[idx + 5] = p.z + this._side.z * w;
    }
    const posAttr = this.trailMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }
}
