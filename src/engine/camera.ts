import * as THREE from 'three';

const MIN_PITCH = THREE.MathUtils.degToRad(-25);
const MAX_PITCH = THREE.MathUtils.degToRad(60);
const BASE_FOV = 70;

export class ThirdPersonCamera {
  public readonly camera: THREE.PerspectiveCamera;

  public yaw = 0;
  public pitch = THREE.MathUtils.degToRad(14);

  private currentFocus = new THREE.Vector3(0, 1.6, 0);
  private currentPos = new THREE.Vector3(0, 4, 8);
  private desiredPos = new THREE.Vector3();
  private targetOffset = new THREE.Vector3();
  private shakeOffset = new THREE.Vector3();
  private punchDir = new THREE.Vector3();

  private trauma = 0;
  private traumaSeed = 0;
  private fovPunch = 0;
  private zoomPunch = 0;
  private showcaseAngle = 0;
  private previewOrbitAngle = 0;

  // Scratch vectors to avoid GC
  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _toBall = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.15,
      250
    );
  }

  public resetBehindTarget(targetPos: THREE.Vector3, facingYaw: number): void {
    this.yaw = facingYaw;
    this.pitch = THREE.MathUtils.degToRad(14);
    this.currentFocus.set(targetPos.x, targetPos.y + 1.55, targetPos.z);
    this.computeDesiredCameraPos(24);
    this.currentPos.copy(this.desiredPos);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentFocus);
  }

  public addTrauma(amount: number, direction?: THREE.Vector3): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
    if (direction) {
      this.punchDir.copy(direction).normalize();
    }
  }

  public triggerParryPunch(intensity: number, strikeDirection?: THREE.Vector3): void {
    // Scales FOV punch (+5 to +11 deg) and subtle zoom-in toward strike
    this.fovPunch = Math.max(this.fovPunch, 5.5 + intensity * 6.5);
    this.zoomPunch = Math.max(this.zoomPunch, 0.9 + intensity * 1.15);
    this.addTrauma(0.32 + intensity * 0.45, strikeDirection);
  }

  public updateShowcase(dt: number, ballPos: THREE.Vector3): void {
    this.showcaseAngle += dt * 0.22;
    const radius = 34;
    this.desiredPos.set(
      Math.cos(this.showcaseAngle) * radius,
      14.5 + Math.sin(this.showcaseAngle * 1.7) * 2.5,
      Math.sin(this.showcaseAngle) * radius
    );
    this.currentPos.lerp(this.desiredPos, Math.min(1, dt * 4));
    this.currentFocus.lerp(
      this.targetOffset.set(ballPos.x * 0.25, 1.8, ballPos.z * 0.25),
      Math.min(1, dt * 5)
    );
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentFocus);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 60, Math.min(1, dt * 5));
    this.camera.updateProjectionMatrix();
  }

  public updateCharacterPreview(dt: number, characterPos: THREE.Vector3): void {
    this.previewOrbitAngle += dt * 0.35;
    const dist = 4.2;
    const sinA = Math.sin(this.previewOrbitAngle) * 0.35; // Gentle front-3/4 sway so face & front details stay visible
    const cosA = Math.cos(this.previewOrbitAngle * 0.5) * 0.2 + 0.94;
    const dirLen = Math.hypot(sinA, cosA) || 1;
    const nx = sinA / dirLen;
    const nz = cosA / dirLen;

    this.desiredPos.set(
      characterPos.x + nx * dist,
      characterPos.y + 1.55,
      characterPos.z + nz * dist
    );
    // Offset look-at slightly left of the fighter (relative to camera view) so the fighter
    // stands prominently in the right/center-right viewport beside the left-side UI panel.
    const camRightX = nz;
    const camRightZ = -nx;
    this.targetOffset.set(
      characterPos.x - camRightX * 0.8,
      characterPos.y + 1.18,
      characterPos.z - camRightZ * 0.8
    );

    this.currentPos.lerp(this.desiredPos, Math.min(1, dt * 7));
    this.currentFocus.lerp(this.targetOffset, Math.min(1, dt * 7));
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentFocus);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 48, Math.min(1, dt * 7));
    this.camera.updateProjectionMatrix();
  }

  public updateGameplay(
    dt: number,
    mouseDelta: { dx: number; dy: number },
    playerPos: THREE.Vector3,
    ballPos: THREE.Vector3,
    isBallLockedOnPlayer: boolean,
    ballAssistEnabled: boolean,
    arenaRadius: number
  ): void {
    const sensitivity = 0.0024;
    this.yaw -= mouseDelta.dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + mouseDelta.dy * sensitivity,
      MIN_PITCH,
      MAX_PITCH
    );

    // Optional Soft Ball-Assist Toggle: gently biases camera yaw toward incoming ball
    // while still allowing free look & curve aiming
    const userMovingMouse = Math.hypot(mouseDelta.dx, mouseDelta.dy) > 2.5;
    if (ballAssistEnabled && !userMovingMouse) {
      this._toBall.subVectors(ballPos, playerPos);
      const horizDist = Math.hypot(this._toBall.x, this._toBall.z);
      if (horizDist > 2.0) {
        const targetYaw = Math.atan2(-this._toBall.x, -this._toBall.z);
        let angleDiff = targetYaw - this.yaw;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const assistStrength = isBallLockedOnPlayer ? 2.4 : 1.1;
        this.yaw += angleDiff * Math.min(1, dt * assistStrength);
      }
    }

    // Over-the-shoulder focus offset
    this.getRightVector(this._right);
    this.targetOffset
      .set(playerPos.x, playerPos.y + 1.65, playerPos.z)
      .addScaledVector(this._right, 0.55);

    const springLerp = 1 - Math.exp(-18 * dt);
    this.currentFocus.lerp(this.targetOffset, springLerp);

    this.computeDesiredCameraPos(arenaRadius);
    this.currentPos.lerp(this.desiredPos, 1 - Math.exp(-20 * dt));

    // Trauma screen shake & directional punch
    if (this.trauma > 0) {
      this.traumaSeed += dt * 65;
      const shakeAmt = this.trauma * this.trauma * 0.42;
      this.shakeOffset.set(
        Math.sin(this.traumaSeed * 1.3) * shakeAmt + this.punchDir.x * shakeAmt * 0.6,
        Math.cos(this.traumaSeed * 1.7) * shakeAmt,
        Math.sin(this.traumaSeed * 2.1) * shakeAmt + this.punchDir.z * shakeAmt * 0.6
      );
      this.trauma = Math.max(0, this.trauma - dt * 2.6);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.camera.position.copy(this.currentPos).add(this.shakeOffset);
    this.camera.lookAt(this.currentFocus);

    // FOV punch & recovery
    this.fovPunch = THREE.MathUtils.lerp(this.fovPunch, 0, Math.min(1, dt * 11));
    this.zoomPunch = THREE.MathUtils.lerp(this.zoomPunch, 0, Math.min(1, dt * 10));
    const targetFov = BASE_FOV + this.fovPunch;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private computeDesiredCameraPos(arenaRadius: number): void {
    const baseDist = Math.max(3.2, 6.4 - this.zoomPunch);
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    const offsetX = Math.sin(this.yaw) * cosPitch * baseDist;
    const offsetZ = Math.cos(this.yaw) * cosPitch * baseDist;
    const offsetY = sinPitch * baseDist;

    this.desiredPos.set(
      this.currentFocus.x + offsetX,
      Math.max(0.85, this.currentFocus.y + offsetY),
      this.currentFocus.z + offsetZ
    );

    // Arena wall collision push-in so camera never clips outside the court
    const maxCamRadius = arenaRadius - 0.85;
    const radialDist = Math.hypot(this.desiredPos.x, this.desiredPos.z);
    if (radialDist > maxCamRadius && radialDist > 0.001) {
      const scale = maxCamRadius / radialDist;
      this.desiredPos.x *= scale;
      this.desiredPos.z *= scale;
    }
  }

  public getForwardVector(out: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return out
      .set(-Math.sin(this.yaw) * cosPitch, -Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
      .normalize();
  }

  public getFlatForwardVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  public getRightVector(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }
}
