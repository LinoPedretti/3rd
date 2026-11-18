import * as THREE from 'three';

const TRAIL_POINTS = 22;
const PATH_SEGMENTS = 16;
export const INITIAL_BALL_SPEED = 17.5;
export const MAX_BALL_SPEED = 165.0;

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

  // High-contrast floor shadow ring directly underneath the ball
  private readonly floorRingGroup: THREE.Group;
  private readonly floorRingMat: THREE.MeshBasicMaterial;
  private readonly dropLineMesh: THREE.Mesh;

  // Clear predicted floor trajectory line from ball to target
  private readonly pathLineMesh: THREE.Mesh;
  private readonly pathLineMat: THREE.MeshBasicMaterial;
  private readonly pathPositions: Float32Array;

  // Toki Time Freeze ring around ball
  private readonly stasisDomeMesh: THREE.Mesh;

  // Clean Ribbon Trail
  private readonly trailMesh: THREE.Mesh;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private readonly trailPositions: Float32Array;
  private readonly trailHistory: THREE.Vector3[] = [];

  // Delayed perception ring buffer for AI reaction windows
  private readonly perceptionBuffer: BallHistorySample[] = [];
  private perceptionHead = 0;

  // Simulation physics state + sub-frame renderPosition for lag-free visual motion
  public readonly position = new THREE.Vector3(0, 1.25, 0);
  public readonly prevPosition = new THREE.Vector3(0, 1.25, 0);
  public readonly renderPosition = new THREE.Vector3(0, 1.25, 0);
  public readonly velocity = new THREE.Vector3(0, 0, 1);
  public readonly curveAccel = new THREE.Vector3(0, 0, 0);
  public speed = INITIAL_BALL_SPEED;
  public readonly radius = 0.54;

  public targetId: string | null = null;
  public lastHitterId: string | null = null;

  public stasisTimer = 0;
  public isBuntLob = false;
  public buntGravity = 0;

  public stealthActive = false;
  public stealthTotalDist = 0;
  public stealthTraveledDist = 0;

  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _dir = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();
  private readonly _simPos = new THREE.Vector3();
  private readonly _simVel = new THREE.Vector3();
  private readonly _toTarget = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.rootGroup = new THREE.Group();

    // High-contrast sphere core (bold crimson when targeting you, dark charcoal when targeting others)
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xc53030,
      roughness: 0.3,
      metalness: 0.15,
    });
    this.coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 20), this.coreMat);
    this.coreMesh.castShadow = true;
    this.rootGroup.add(this.coreMesh);

    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.35,
      metalness: 0.5,
      flatShading: true,
    });

    this.gyroRingA = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 8, 20), this.ringMat);
    this.gyroRingB = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 20), this.ringMat);
    this.gyroRingB.rotation.x = Math.PI * 0.5;
    this.rootGroup.add(this.gyroRingA);
    this.rootGroup.add(this.gyroRingB);

    // Toki Time Freeze sphere
    this.stasisDomeMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.65, 1),
      new THREE.MeshBasicMaterial({
        color: 0x2b547e,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      })
    );
    this.stasisDomeMesh.visible = false;
    this.rootGroup.add(this.stasisDomeMesh);

    // Floor marker ring directly below ball for effortless 3D depth perception
    this.floorRingGroup = new THREE.Group();
    this.floorRingMat = new THREE.MeshBasicMaterial({
      color: 0x1a202c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const floorRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 24), this.floorRingMat);
    floorRing.rotation.x = -Math.PI / 2;
    this.floorRingGroup.add(floorRing);

    const dropGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
    dropGeo.translate(0, 0.5, 0);
    this.dropLineMesh = new THREE.Mesh(dropGeo, this.floorRingMat);
    this.floorRingGroup.add(this.dropLineMesh);

    // Clear Floor Trajectory Path Ribbon showing the curved path from ball to target
    this.pathPositions = new Float32Array((PATH_SEGMENTS + 1) * 2 * 3);
    const pathIndices: number[] = [];
    for (let i = 0; i < PATH_SEGMENTS; i++) {
      const b = i * 2;
      pathIndices.push(b, b + 1, b + 2);
      pathIndices.push(b + 1, b + 3, b + 2);
    }
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute('position', new THREE.BufferAttribute(this.pathPositions, 3));
    pathGeo.setIndex(pathIndices);
    this.pathLineMat = new THREE.MeshBasicMaterial({
      color: 0xc53030,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.pathLineMesh = new THREE.Mesh(pathGeo, this.pathLineMat);
    this.pathLineMesh.frustumCulled = false;

    // Clean Tapering Ribbon Trail
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
      color: 0xc53030,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.trailMesh = new THREE.Mesh(trailGeo, this.trailMat);
    this.trailMesh.frustumCulled = false;

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
    scene.add(this.pathLineMesh);
    scene.add(this.trailMesh);
  }

  public setVisible(visible: boolean): void {
    this.rootGroup.visible = visible;
    this.floorRingGroup.visible = visible;
    this.trailMesh.visible = visible;
    if (!visible) {
      this.pathLineMesh.visible = false;
    }
  }

  public reset(spawnPos: THREE.Vector3, initialDir: THREE.Vector3, targetId: string | null): void {
    this.position.copy(spawnPos);
    this.prevPosition.copy(spawnPos);
    this.renderPosition.copy(spawnPos);
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
    let best =
      this.perceptionBuffer[
        (this.perceptionHead + this.perceptionBuffer.length - 1) % this.perceptionBuffer.length
      ];
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
    alpha: number,
    dt: number,
    targetPos: THREE.Vector3 | null,
    isTargetLocalHuman: boolean,
    floorY: number
  ): void {
    // Sub-frame interpolation between fixed 60Hz ticks for silk-smooth ball motion
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.rootGroup.position.copy(this.renderPosition);

    // High-contrast color: Bold Crimson when targeting you, Deep Navy-Charcoal when targeting others
    const primaryColor = isTargetLocalHuman ? 0xc53030 : 0x1e293b;
    const accentBandColor = isTargetLocalHuman ? 0xf6e05e : 0x2b6cb0;

    this.coreMat.color.setHex(primaryColor);
    this.ringMat.color.setHex(accentBandColor);
    this.floorRingMat.color.setHex(primaryColor);
    this.trailMat.color.setHex(primaryColor);
    this.pathLineMat.color.setHex(primaryColor);

    // Mirage Feint partial cloak
    let isCloaked = false;
    if (this.stealthActive && this.stealthTotalDist > 1.0) {
      const frac = this.stealthTraveledDist / this.stealthTotalDist;
      if (frac < 0.4) {
        isCloaked = true;
      } else {
        this.stealthActive = false;
      }
    }

    const alphaVis = isCloaked ? 0.25 : 1.0;
    this.coreMat.transparent = isCloaked;
    this.coreMat.opacity = alphaVis;
    this.trailMat.opacity = isCloaked ? 0.12 : 0.48;

    const spinRate = 3.0 + this.speed * 0.14;
    this.gyroRingA.rotation.x += dt * spinRate;
    this.gyroRingA.rotation.y += dt * spinRate * 0.7;
    this.gyroRingB.rotation.y -= dt * spinRate * 1.1;

    this.stasisDomeMesh.visible = this.stasisTimer > 0;
    if (this.stasisTimer > 0) {
      this.stasisDomeMesh.rotation.y += dt * 2.2;
    }

    // Floor marker ring directly underneath the interpolated ball
    this.floorRingGroup.position.set(
      this.renderPosition.x,
      floorY + 0.03,
      this.renderPosition.z
    );
    const heightAboveFloor = Math.max(0.1, this.renderPosition.y - floorY);
    this.dropLineMesh.scale.set(1, heightAboveFloor, 1);

    // Update predicted curved trajectory ribbon on the floor from ball to target
    if (targetPos) {
      this.pathLineMesh.visible = true;
      this.updatePredictedPathGeometry(targetPos, floorY, isTargetLocalHuman);
    } else {
      this.pathLineMesh.visible = false;
    }

    // Shift ribbon trail points and rebuild vertices
    for (let i = TRAIL_POINTS - 1; i > 0; i--) {
      this.trailHistory[i].copy(this.trailHistory[i - 1]);
    }
    this.trailHistory[0].copy(this.renderPosition);
    this.updateTrailGeometry();
  }

  /**
   * Projects the ball's smooth curved trajectory onto the floor between the ball and its target
   * so players can always read incoming curve angles cleanly.
   */
  private updatePredictedPathGeometry(
    targetPos: THREE.Vector3,
    floorY: number,
    isTargetLocalHuman: boolean
  ): void {
    this._simPos.copy(this.renderPosition);
    this._simVel.copy(this.velocity).setY(0);
    if (this._simVel.lengthSq() < 0.001) {
      this._simVel.subVectors(targetPos, this.renderPosition).setY(0);
    }
    this._simVel.normalize();

    const totalDist = Math.hypot(
      targetPos.x - this.renderPosition.x,
      targetPos.z - this.renderPosition.z
    );
    const stepLen = Math.max(0.2, totalDist / PATH_SEGMENTS);
    const ribbonHalfWidth = isTargetLocalHuman ? 0.16 : 0.1;

    for (let i = 0; i <= PATH_SEGMENTS; i++) {
      const t = i / PATH_SEGMENTS;
      // Blend velocity smoothly toward target along curve
      this._toTarget.subVectors(targetPos, this._simPos).setY(0);
      if (this._toTarget.lengthSq() > 0.01) {
        this._toTarget.normalize();
        this._simVel.lerp(this._toTarget, 0.18 + t * 0.35).normalize();
      }

      this._side.set(-this._simVel.z, 0, this._simVel.x).normalize();

      const idx = i * 6;
      const y = floorY + 0.035;
      this.pathPositions[idx] = this._simPos.x - this._side.x * ribbonHalfWidth;
      this.pathPositions[idx + 1] = y;
      this.pathPositions[idx + 2] = this._simPos.z - this._side.z * ribbonHalfWidth;

      this.pathPositions[idx + 3] = this._simPos.x + this._side.x * ribbonHalfWidth;
      this.pathPositions[idx + 4] = y;
      this.pathPositions[idx + 5] = this._simPos.z + this._side.z * ribbonHalfWidth;

      if (i < PATH_SEGMENTS) {
        this._simPos.addScaledVector(this._simVel, stepLen);
      }
    }

    this.pathLineMat.opacity = isTargetLocalHuman ? 0.58 : 0.28;
    const attr = this.pathLineMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  private updateTrailGeometry(): void {
    const baseWidth = 0.38;
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
