import * as THREE from 'three';
import { BatId, BatVisualRig, createBatVisualRig } from './bats';
import { CharacterDefinition, CharacterId, getCharacterDefinition } from './characters';
import {
  CylinderObstacle,
  JumpPadVolume,
  PlatformSurface,
  resolveFighterCollisions,
} from '../engine/physics';
import { gameEvents } from '../engine/events';

const GRAVITY = 28.0;
const BASE_MOVE_SPEED = 9.6;
const GROUND_ACCEL = 72.0;
const GROUND_FRICTION = 52.0;
const AIR_ACCEL = 32.0;
const JUMP_SPEED = 10.6;
const DOUBLE_JUMP_SPEED = 9.8;
const COYOTE_TIME_MAX = 0.1; // 100ms Coyote Time
const DASH_SPEED = 26.5;
const DASH_DURATION = 0.18;
const BASE_DASH_IFRAMES = 0.14; // 140ms invulnerability frames
const BASE_DASH_COOLDOWN = 1.8; // 1.8s cooldown
const PARRY_ACTIVE_WINDOW = 0.19; // 190ms active parry window
const BASE_WHIFF_RECOVERY = 0.45; // 450ms recovery cooldown if you swing early

export class PlayerFighter {
  public readonly id: string;
  public name: string;
  public readonly isHuman: boolean;

  public characterId: CharacterId;
  public characterDef: CharacterDefinition;
  public batId: BatId;

  public readonly rootGroup: THREE.Group;
  public readonly bodyGroup: THREE.Group;
  private readonly torsoMesh: THREE.Mesh;
  private readonly headGroup: THREE.Group;
  private readonly visorMat: THREE.MeshStandardMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly leftArmPivot: THREE.Group;
  private readonly rightArmPivot: THREE.Group;
  private readonly leftLegPivot: THREE.Group;
  private readonly rightLegPivot: THREE.Group;
  private readonly weaponSocket: THREE.Group;
  private readonly shadowBlob: THREE.Mesh;
  private readonly targetLockRing: THREE.Group;
  private readonly kineticDomeMesh: THREE.Mesh;
  private readonly supernovaAuraMesh: THREE.Mesh;

  // Flowing 6-node procedural cape/scarf physics chain
  private readonly capeNodes: THREE.Vector3[] = [];
  private readonly capeMeshes: THREE.Mesh[] = [];
  private readonly capeGroup: THREE.Group;

  private batRig: BatVisualRig;

  // Spatial state
  public readonly position = new THREE.Vector3();
  public readonly velocity = new THREE.Vector3();
  public readonly aimDirection = new THREE.Vector3(0, 0, -1);
  public readonly moveInputDir = new THREE.Vector3(0, 0, 0);
  public facingYaw = 0;
  public readonly radius = 0.65;

  // Platforming & movement state
  public isGrounded = true;
  public groundY = 0;
  public coyoteTimer = 0;
  public doubleJumpAvailable = true;
  public flipAnimTimer = 0;
  public squashStretch = 1.0;
  private animClock = 0;

  // Dash state
  public dashTimer = 0;
  public dashCooldown = 0;
  public iframeTimer = 0;
  public readonly dashDirection = new THREE.Vector3();
  private afterimageSpawnAccum = 0;

  // Combat / Parry / Bunt state
  public parryActiveTimer = 0;
  public parryWhiffTimer = 0;
  public swingAnimTimer = 0;
  public swingIsBunt = false;
  public swingResolved = false;
  public lastSwingTimestamp = -10;

  // Ability state
  public abilityCooldown = 0;
  public speedBoostTimer = 0;
  public supernovaTimer = 0; // Titan 2.5s molten gold empower
  public kineticDomeTimer = 0; // Aegis 1.2s auto-deflect dome
  public stealthNextParry = false; // Phantom stealth curve flag

  // Match stats
  public alive = true;
  public parriesThisMatch = 0;
  public eliminationsThisMatch = 0;
  public clashesThisMatch = 0;

  // Scratch vectors
  private readonly _wishDir = new THREE.Vector3();
  private readonly _capeAnchor = new THREE.Vector3();

  constructor(
    id: string,
    name: string,
    isHuman: boolean,
    characterId: CharacterId,
    batId: BatId,
    scene: THREE.Scene
  ) {
    this.id = id;
    this.name = name;
    this.isHuman = isHuman;
    this.characterId = characterId;
    this.characterDef = getCharacterDefinition(characterId);
    this.batId = batId;

    this.rootGroup = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.rootGroup.add(this.bodyGroup);

    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x161d2e,
      roughness: 0.35,
      metalness: 0.75,
      flatShading: true,
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: this.characterDef.accentHex,
      emissive: this.characterDef.emissiveHex,
      emissiveIntensity: 1.5,
      roughness: 0.25,
      metalness: 0.6,
      flatShading: true,
    });

    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.characterDef.accentHex,
      emissiveIntensity: 2.4,
      roughness: 0.1,
      metalness: 0.9,
      flatShading: true,
    });

    // Torso
    this.torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.86, 6), armorMat);
    this.torsoMesh.position.y = 1.15;
    this.torsoMesh.castShadow = true;
    this.bodyGroup.add(this.torsoMesh);

    // Chest reactor core trim
    const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this.accentMat);
    chestCore.position.set(0, 1.22, 0.28);
    this.bodyGroup.add(chestCore);

    // Shoulders
    const leftShoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), this.accentMat);
    leftShoulder.position.set(-0.44, 1.48, 0);
    this.bodyGroup.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), this.accentMat);
    rightShoulder.position.set(0.44, 1.48, 0);
    this.bodyGroup.add(rightShoulder);

    // Head + Glowing Visor
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.78, 0);
    const helm = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 1), armorMat);
    helm.castShadow = true;
    this.headGroup.add(helm);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.22), this.visorMat);
    visor.position.set(0, 0.02, 0.16);
    this.headGroup.add(visor);
    this.bodyGroup.add(this.headGroup);

    // Arms & Weapon Socket
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.44, 1.42, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.15), armorMat);
    leftArmMesh.position.y = -0.28;
    this.leftArmPivot.add(leftArmMesh);
    this.bodyGroup.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.44, 1.42, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), armorMat);
    rightArmMesh.position.y = -0.28;
    this.rightArmPivot.add(rightArmMesh);

    this.weaponSocket = new THREE.Group();
    this.weaponSocket.position.set(0, -0.55, 0.15);
    this.weaponSocket.rotation.x = Math.PI * 0.35;
    this.rightArmPivot.add(this.weaponSocket);
    this.bodyGroup.add(this.rightArmPivot);

    // Legs
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.18, 0.72, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.7, 0.18), armorMat);
    leftLegMesh.position.y = -0.35;
    leftLegMesh.castShadow = true;
    this.leftLegPivot.add(leftLegMesh);
    this.bodyGroup.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.18, 0.72, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.7, 0.18), armorMat);
    rightLegMesh.position.y = -0.35;
    rightLegMesh.castShadow = true;
    this.rightLegPivot.add(rightLegMesh);
    this.bodyGroup.add(this.rightLegPivot);

    // Equipped 3D Bat & Ribbon Slash Mesh
    this.batRig = createBatVisualRig(this.batId);
    this.weaponSocket.add(this.batRig.group);
    this.rootGroup.add(this.batRig.slashRibbon);

    // Grounded Contact Shadow Blob
    const shadowGeo = new THREE.CircleGeometry(0.68, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowBlob.position.y = 0.03;
    this.rootGroup.add(this.shadowBlob);

    // Pulsing Crimson 3D Target Lock-On Ring around waist/feet
    this.targetLockRing = new THREE.Group();
    const lockOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.15, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff1744,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lockOuter.rotation.x = -Math.PI / 2;
    lockOuter.position.y = 0.08;
    this.targetLockRing.add(lockOuter);

    const lockWaist = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.035, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff1744,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    lockWaist.rotation.x = Math.PI / 2;
    lockWaist.position.y = 1.05;
    this.targetLockRing.add(lockWaist);
    this.targetLockRing.visible = false;
    this.rootGroup.add(this.targetLockRing);

    // Aegis Kinetic Dome (spinning hexagonal 3D energy shield sphere)
    this.kineticDomeMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.85, 1),
      new THREE.MeshBasicMaterial({
        color: 0x00e676,
        wireframe: true,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
      })
    );
    this.kineticDomeMesh.position.y = 1.15;
    this.kineticDomeMesh.visible = false;
    this.rootGroup.add(this.kineticDomeMesh);

    // Titan Supernova Molten Gold Aura
    this.supernovaAuraMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.25, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffab00,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      })
    );
    this.supernovaAuraMesh.position.y = 1.15;
    this.supernovaAuraMesh.visible = false;
    this.rootGroup.add(this.supernovaAuraMesh);

    // Flowing 6-node Scarf / Cape Physics Chain attached in world space
    this.capeGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      this.capeNodes.push(new THREE.Vector3());
      const w = 0.42 - i * 0.045;
      const segMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.05, 0.24),
        this.accentMat
      );
      this.capeMeshes.push(segMesh);
      this.capeGroup.add(segMesh);
    }

    scene.add(this.rootGroup);
    scene.add(this.capeGroup);
  }

  public setLoadout(characterId: CharacterId, batId: BatId): void {
    this.characterId = characterId;
    this.characterDef = getCharacterDefinition(characterId);
    this.accentMat.color.setHex(this.characterDef.accentHex);
    this.accentMat.emissive.setHex(this.characterDef.emissiveHex);
    this.visorMat.emissive.setHex(this.characterDef.accentHex);

    if (this.batId !== batId) {
      this.batId = batId;
      this.weaponSocket.remove(this.batRig.group);
      this.rootGroup.remove(this.batRig.slashRibbon);
      this.batRig = createBatVisualRig(batId);
      this.weaponSocket.add(this.batRig.group);
      this.rootGroup.add(this.batRig.slashRibbon);
    }
  }

  public respawn(spawnPos: THREE.Vector3, facingYaw: number): void {
    this.alive = true;
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.facingYaw = facingYaw;
    this.aimDirection.set(-Math.sin(facingYaw), 0, -Math.cos(facingYaw));
    this.isGrounded = true;
    this.groundY = spawnPos.y;
    this.coyoteTimer = COYOTE_TIME_MAX;
    this.doubleJumpAvailable = true;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.iframeTimer = 0;
    this.parryActiveTimer = 0;
    this.parryWhiffTimer = 0;
    this.swingAnimTimer = 0;
    this.abilityCooldown = 0;
    this.speedBoostTimer = 0;
    this.supernovaTimer = 0;
    this.kineticDomeTimer = 0;
    this.stealthNextParry = false;

    this.rootGroup.visible = true;
    this.capeGroup.visible = true;
    this.rootGroup.position.copy(this.position);

    for (let i = 0; i < this.capeNodes.length; i++) {
      this.capeNodes[i].set(
        spawnPos.x + Math.sin(facingYaw) * (0.25 + i * 0.2),
        spawnPos.y + 1.48 - i * 0.1,
        spawnPos.z + Math.cos(facingYaw) * (0.25 + i * 0.2)
      );
    }
  }

  public eliminate(): void {
    this.alive = false;
    this.rootGroup.visible = false;
    this.capeGroup.visible = false;
    this.targetLockRing.visible = false;
  }

  public getParryReach(): number {
    return 3.35 + this.characterDef.parryReachBonus;
  }

  public isInvulnerable(): boolean {
    return this.iframeTimer > 0;
  }

  public tryJump(): boolean {
    if (!this.alive) return false;
    if (this.isGrounded || this.coyoteTimer > 0) {
      this.velocity.y = JUMP_SPEED;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.squashStretch = 1.28;
      gameEvents.emit('jump', {
        playerId: this.id,
        position: this.position,
        isDoubleJump: false,
      });
      return true;
    } else if (this.doubleJumpAvailable) {
      this.velocity.y = DOUBLE_JUMP_SPEED;
      this.doubleJumpAvailable = false;
      this.flipAnimTimer = 0.38;
      this.squashStretch = 1.24;
      gameEvents.emit('jump', {
        playerId: this.id,
        position: this.position,
        isDoubleJump: true,
      });
      return true;
    }
    return false;
  }

  public tryDash(wishDir: THREE.Vector3): boolean {
    if (!this.alive || this.dashCooldown > 0 || this.dashTimer > 0) return false;

    if (wishDir.lengthSq() > 0.01) {
      this.dashDirection.copy(wishDir).setY(0).normalize();
    } else {
      this.dashDirection.set(-Math.sin(this.facingYaw), 0, -Math.cos(this.facingYaw)).normalize();
    }

    this.dashTimer = DASH_DURATION;
    this.iframeTimer = BASE_DASH_IFRAMES + this.characterDef.dashIframeBonus;
    this.dashCooldown = Math.max(0.8, BASE_DASH_COOLDOWN - this.characterDef.dashCooldownBonus);
    this.afterimageSpawnAccum = 0;
    this.velocity.x = this.dashDirection.x * DASH_SPEED;
    this.velocity.z = this.dashDirection.z * DASH_SPEED;
    if (!this.isGrounded && this.velocity.y < 0) {
      this.velocity.y = 1.5;
    }

    gameEvents.emit('dash', {
      playerId: this.id,
      position: this.position,
      direction: this.dashDirection,
      colorHex: this.characterDef.accentHex,
    });
    return true;
  }

  public tryParry(isBunt: boolean, simClock: number): boolean {
    if (!this.alive) return false;
    if (this.parryActiveTimer > 0 || this.parryWhiffTimer > 0) return false;

    this.parryActiveTimer = PARRY_ACTIVE_WINDOW;
    this.swingAnimTimer = 0.32;
    this.swingIsBunt = isBunt;
    this.swingResolved = false;
    this.lastSwingTimestamp = simClock;
    return true;
  }

  public onParrySucceeded(): void {
    this.swingResolved = true;
    this.parryActiveTimer = 0;
    this.parryWhiffTimer = 0.08; // Brief clean follow-through so player can rally rapid Volleys
  }

  public update(
    dt: number,
    wishMoveDir: THREE.Vector3,
    aimDir: THREE.Vector3,
    isBallLockedOnMe: boolean,
    arenaRadius: number,
    obstacles: CylinderObstacle[],
    platforms: PlatformSurface[],
    jumpPads: JumpPadVolume[],
    onSpawnAfterimage?: (pos: THREE.Vector3, yaw: number, colorHex: number) => void
  ): void {
    if (!this.alive) return;

    this.animClock += dt;
    this.moveInputDir.copy(wishMoveDir);
    if (aimDir.lengthSq() > 0.001) {
      this.aimDirection.copy(aimDir).normalize();
    }

    // Cooldowns & timers
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.iframeTimer > 0) this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    if (this.abilityCooldown > 0) this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    if (this.speedBoostTimer > 0) this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
    if (this.supernovaTimer > 0) this.supernovaTimer = Math.max(0, this.supernovaTimer - dt);
    if (this.kineticDomeTimer > 0) this.kineticDomeTimer = Math.max(0, this.kineticDomeTimer - dt);
    if (this.flipAnimTimer > 0) this.flipAnimTimer = Math.max(0, this.flipAnimTimer - dt);
    if (this.swingAnimTimer > 0) this.swingAnimTimer = Math.max(0, this.swingAnimTimer - dt);

    // Parry active window & whiff transition
    if (this.parryActiveTimer > 0) {
      this.parryActiveTimer -= dt;
      if (this.parryActiveTimer <= 0) {
        this.parryActiveTimer = 0;
        if (!this.swingResolved) {
          // Early swing whiff penalty (450ms recovery scaled by character passive)
          this.parryWhiffTimer = BASE_WHIFF_RECOVERY * this.characterDef.whiffRecoveryMultiplier;
          gameEvents.emit('whiff', {
            playerId: this.id,
            position: this.position,
          });
        }
      }
    } else if (this.parryWhiffTimer > 0) {
      this.parryWhiffTimer = Math.max(0, this.parryWhiffTimer - dt);
    }

    // Speed multiplier (character passive + Volt Overdrive speed boost + Chrono Reflex)
    let speedMult = this.characterDef.speedMultiplier;
    if (this.characterId === 'chrono' && isBallLockedOnMe) {
      speedMult *= 1.08;
    }
    if (this.speedBoostTimer > 0) {
      speedMult *= 1.38;
    }
    const maxSpeed = BASE_MOVE_SPEED * speedMult;

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.velocity.x = this.dashDirection.x * DASH_SPEED;
      this.velocity.z = this.dashDirection.z * DASH_SPEED;

      this.afterimageSpawnAccum += dt;
      if (this.afterimageSpawnAccum >= 0.032 && onSpawnAfterimage) {
        this.afterimageSpawnAccum = 0;
        onSpawnAfterimage(this.position, this.facingYaw, this.characterDef.accentHex);
      }
    } else {
      // Standard ground / aerial acceleration with momentum preservation in air
      this._wishDir.copy(wishMoveDir).setY(0);
      const hasInput = this._wishDir.lengthSq() > 0.01;
      if (hasInput) {
        this._wishDir.normalize();
        const accel = this.isGrounded ? GROUND_ACCEL : AIR_ACCEL;
        this.velocity.x += this._wishDir.x * accel * dt;
        this.velocity.z += this._wishDir.z * accel * dt;

        const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (horizSpeed > maxSpeed) {
          const clampScale = this.isGrounded
            ? maxSpeed / horizSpeed
            : THREE.MathUtils.lerp(1, maxSpeed / horizSpeed, dt * 4);
          this.velocity.x *= clampScale;
          this.velocity.z *= clampScale;
        }
      } else if (this.isGrounded) {
        const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        if (horizSpeed > 0) {
          const drop = Math.max(0, horizSpeed - GROUND_FRICTION * dt);
          const scale = drop / horizSpeed;
          this.velocity.x *= scale;
          this.velocity.z *= scale;
        }
      }
    }

    // Gravity
    this.velocity.y -= GRAVITY * dt;

    // Integrate position
    this.position.addScaledVector(this.velocity, dt);

    // Arena obstacles, platforms & perimeter collision
    const { groundHeight } = resolveFighterCollisions(
      this.position,
      this.velocity,
      this.radius,
      arenaRadius,
      obstacles,
      platforms
    );
    this.groundY = groundHeight;

    // Ground landing & Coyote Time
    if (this.position.y <= groundHeight) {
      if (!this.isGrounded && this.velocity.y < -4.0) {
        this.squashStretch = 0.76; // Landing squash
      }
      this.position.y = groundHeight;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.coyoteTimer = COYOTE_TIME_MAX;
      this.doubleJumpAvailable = true;
    } else {
      if (this.isGrounded) {
        this.isGrounded = false;
      }
      if (this.coyoteTimer > 0) {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }
    }

    // Check Arena Jump Pads
    for (let i = 0; i < jumpPads.length; i++) {
      const pad = jumpPads[i];
      const dx = this.position.x - pad.position.x;
      const dz = this.position.z - pad.position.z;
      if (
        Math.hypot(dx, dz) <= pad.radius &&
        Math.abs(this.position.y - pad.position.y) < 0.8 &&
        this.velocity.y <= 3.0
      ) {
        this.velocity.y = pad.boostVelocityY;
        this.isGrounded = false;
        this.coyoteTimer = 0;
        this.doubleJumpAvailable = true;
        this.squashStretch = 1.35;
        gameEvents.emit('jump', {
          playerId: this.id,
          position: this.position,
          isDoubleJump: true,
        });
      }
    }

    // Smooth facing orientation (face aim direction during combat or movement direction when sprinting)
    const desiredYaw =
      this.swingAnimTimer > 0 || isBallLockedOnMe
        ? Math.atan2(-this.aimDirection.x, -this.aimDirection.z)
        : wishMoveDir.lengthSq() > 0.05
          ? Math.atan2(-wishMoveDir.x, -wishMoveDir.z)
          : Math.atan2(-this.aimDirection.x, -this.aimDirection.z);

    let yawDiff = desiredYaw - this.facingYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.facingYaw += yawDiff * Math.min(1, dt * 16);

    // Update procedural 3D animations, target ring, and flowing cape
    this.updateProceduralAnimation(dt, isBallLockedOnMe);
  }

  private updateProceduralAnimation(dt: number, isBallLockedOnMe: boolean): void {
    this.rootGroup.position.copy(this.position);
    this.rootGroup.rotation.y = this.facingYaw;

    // Squash & stretch recovery
    this.squashStretch = THREE.MathUtils.lerp(this.squashStretch, 1.0, Math.min(1, dt * 14));
    const invScale = 1 / Math.sqrt(this.squashStretch);
    this.bodyGroup.scale.set(invScale, this.squashStretch, invScale);

    // Sprint lean & mid-air double-jump flip
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const speedRatio = Math.min(1, horizSpeed / BASE_MOVE_SPEED);

    if (this.flipAnimTimer > 0) {
      const flipProgress = 1 - this.flipAnimTimer / 0.38;
      this.bodyGroup.rotation.x = -flipProgress * Math.PI * 2;
    } else {
      this.bodyGroup.rotation.x = THREE.MathUtils.lerp(
        this.bodyGroup.rotation.x,
        -speedRatio * 0.22,
        Math.min(1, dt * 12)
      );
    }

    // Leg sprint stride cycle
    if (this.isGrounded && speedRatio > 0.1) {
      const stride = Math.sin(this.animClock * 13) * 0.68 * speedRatio;
      this.leftLegPivot.rotation.x = stride;
      this.rightLegPivot.rotation.x = -stride;
      this.leftArmPivot.rotation.x = -stride * 0.65;
    } else if (!this.isGrounded) {
      this.leftLegPivot.rotation.x = 0.35;
      this.rightLegPivot.rotation.x = -0.25;
      this.leftArmPivot.rotation.x = -0.45;
    } else {
      this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, 0, dt * 10);
      this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, 0, dt * 10);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, 0, dt * 10);
    }

    // Dramatic 3D wind-up + slash follow-through pose & 3D Ribbon Slash Arc
    if (this.swingAnimTimer > 0) {
      const p = 1 - this.swingAnimTimer / 0.32;
      const swingAngle = THREE.MathUtils.lerp(-1.4, 1.55, Math.min(1, p * 1.8));
      this.rightArmPivot.rotation.y = -swingAngle;
      this.rightArmPivot.rotation.x = -0.75;
      this.torsoMesh.rotation.y = -swingAngle * 0.35;

      this.batRig.slashRibbon.visible = true;
      this.batRig.slashRibbon.rotation.y = swingAngle * 0.35;
      this.batRig.slashMaterial.opacity = Math.max(0, Math.sin(p * Math.PI) * 0.88);
    } else {
      this.rightArmPivot.rotation.y = THREE.MathUtils.lerp(
        this.rightArmPivot.rotation.y,
        0.25,
        Math.min(1, dt * 10)
      );
      this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
        this.rightArmPivot.rotation.x,
        -0.25,
        Math.min(1, dt * 10)
      );
      this.torsoMesh.rotation.y = THREE.MathUtils.lerp(
        this.torsoMesh.rotation.y,
        0,
        Math.min(1, dt * 10)
      );
      this.batRig.slashRibbon.visible = false;
    }

    // Contact shadow blob pinned to floor height beneath fighter
    const heightAboveFloor = Math.max(0, this.position.y - this.groundY);
    this.shadowBlob.position.y = -heightAboveFloor + 0.03;
    const shadowScale = Math.max(0.35, 1 - heightAboveFloor * 0.14);
    this.shadowBlob.scale.setScalar(shadowScale);

    // Target Lock-On Crimson Ring pulsing around fighter
    this.targetLockRing.visible = isBallLockedOnMe;
    if (isBallLockedOnMe) {
      const pulse = 1 + Math.sin(this.animClock * 16) * 0.12;
      this.targetLockRing.scale.set(pulse, 1, pulse);
      this.targetLockRing.rotation.y += dt * 4.5;
    }

    // Aegis Kinetic Dome & Titan Supernova Aura
    this.kineticDomeMesh.visible = this.kineticDomeTimer > 0;
    if (this.kineticDomeTimer > 0) {
      this.kineticDomeMesh.rotation.y += dt * 3.8;
      this.kineticDomeMesh.rotation.x += dt * 1.9;
    }

    this.supernovaAuraMesh.visible = this.supernovaTimer > 0;
    if (this.supernovaTimer > 0) {
      this.supernovaAuraMesh.rotation.y -= dt * 5.2;
      const s = 1 + Math.sin(this.animClock * 20) * 0.12;
      this.supernovaAuraMesh.scale.setScalar(s);
    }

    // Update 6-node Verlet/Spring Cape Chain
    const backX = Math.sin(this.facingYaw);
    const backZ = Math.cos(this.facingYaw);
    this._capeAnchor.set(
      this.position.x + backX * 0.26,
      this.position.y + 1.48,
      this.position.z + backZ * 0.26
    );
    this.capeNodes[0].copy(this._capeAnchor);

    const segLength = 0.21;
    for (let i = 1; i < this.capeNodes.length; i++) {
      const prev = this.capeNodes[i - 1];
      const curr = this.capeNodes[i];

      // Gravity + trailing wave flutter
      curr.y -= 5.8 * dt;
      curr.x += backX * 2.2 * dt + Math.sin(this.animClock * 10 + i) * 0.4 * dt;
      curr.z += backZ * 2.2 * dt + Math.cos(this.animClock * 10 + i) * 0.4 * dt;

      // Distance constraint
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dz = curr.z - prev.z;
      const dist = Math.hypot(dx, dy, dz) || 0.001;
      if (dist > segLength) {
        const pull = (dist - segLength) / dist;
        curr.x -= dx * pull * 0.88;
        curr.y -= dy * pull * 0.88;
        curr.z -= dz * pull * 0.88;
      }

      // Prevent clipping into floor
      const minY = this.groundY + 0.12;
      if (curr.y < minY) curr.y = minY;
    }

    for (let i = 0; i < this.capeMeshes.length; i++) {
      const node = this.capeNodes[i];
      const mesh = this.capeMeshes[i];
      mesh.position.copy(node);
      if (i < this.capeNodes.length - 1) {
        mesh.lookAt(this.capeNodes[i + 1]);
      } else {
        mesh.rotation.y = this.facingYaw;
      }
    }
  }
}
