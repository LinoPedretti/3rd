import * as THREE from 'three';
import { BatId, BatVisualRig, createBatVisualRig } from './bats';
import { CharacterDefinition, CharacterId, getCharacterDefinition, getCharacterVisuals } from './characters';
import {
  CylinderObstacle,
  JumpPadVolume,
  PlatformSurface,
  resolveFighterCollisions,
} from '../engine/physics';
import { gameEvents } from '../engine/events';

const GRAVITY = 28.0;
const BASE_MOVE_SPEED = 10.5;
const GROUND_ACCEL = 76.0;
const GROUND_FRICTION = 55.0;
const AIR_ACCEL = 36.0;
const JUMP_SPEED = 10.6;
const DOUBLE_JUMP_SPEED = 9.8;
const COYOTE_TIME_MAX = 0.1; // 100ms Coyote Time
const DASH_SPEED = 27.5;
const DASH_DURATION = 0.18;
const BASE_DASH_IFRAMES = 0.14; // 140ms invulnerability frames
const BASE_DASH_COOLDOWN = 1.8; // 1.8s cooldown
const PARRY_ACTIVE_WINDOW = 0.21; // 210ms clean parry window
const BASE_WHIFF_RECOVERY = 0.42; // 420ms recovery cooldown if you swing early

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
  private readonly characterHatGroup: THREE.Group;
  private readonly accessoryGroup: THREE.Group;
  private readonly clothMat: THREE.MeshStandardMaterial;
  private readonly trimMat: THREE.MeshStandardMaterial;
  private readonly limbMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly capeMat: THREE.MeshStandardMaterial;
  /** When false (e.g. the menu preview model) the fighter emits no gameplay events/audio. */
  public emitEvents = true;
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

  // Spatial state (with prevPosition & renderPosition for butter-smooth sub-frame interpolation)
  public readonly position = new THREE.Vector3();
  public readonly prevPosition = new THREE.Vector3();
  public readonly renderPosition = new THREE.Vector3();
  public readonly velocity = new THREE.Vector3();
  public readonly aimDirection = new THREE.Vector3(0, 0, -1);
  public readonly moveInputDir = new THREE.Vector3(0, 0, 0);
  public facingYaw = 0;
  public readonly radius = 0.68;

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
  public supernovaTimer = 0;
  public kineticDomeTimer = 0;
  public stealthNextParry = false;

  // Match stats
  public alive = true;
  public parriesThisMatch = 0;
  public eliminationsThisMatch = 0;
  public clashesThisMatch = 0;

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

    const style = getCharacterVisuals(characterId);

    this.limbMat = new THREE.MeshStandardMaterial({
      color: style.limbHex,
      roughness: 0.78,
      metalness: 0.12,
      flatShading: true,
    });
    const darkSlateMat = this.limbMat;

    this.skinMat = new THREE.MeshStandardMaterial({
      color: style.skinHex,
      roughness: 0.8,
      metalness: 0.05,
      flatShading: true,
    });
    const skinWarmMat = this.skinMat;

    this.clothMat = new THREE.MeshStandardMaterial({
      color: style.outfitHex,
      roughness: 0.75,
      metalness: 0.1,
      flatShading: true,
    });

    this.trimMat = new THREE.MeshStandardMaterial({
      color: style.trimHex,
      roughness: 0.55,
      metalness: 0.35,
      flatShading: true,
    });

    this.capeMat = new THREE.MeshStandardMaterial({
      color: style.capeHex,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: true,
    });

    this.accessoryGroup = new THREE.Group();
    this.bodyGroup.add(this.accessoryGroup);

    // Tunic / Torso
    this.torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.27, 0.88, 8), this.clothMat);
    this.torsoMesh.position.y = 1.15;
    this.torsoMesh.castShadow = true;
    this.bodyGroup.add(this.torsoMesh);

    // Belt / Sash
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.16, 8), this.trimMat);
    sash.position.y = 0.85;
    this.bodyGroup.add(sash);

    // Shoulders
    const leftShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.28), this.clothMat);
    leftShoulder.position.set(-0.44, 1.46, 0);
    this.bodyGroup.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.28), this.clothMat);
    rightShoulder.position.set(0.44, 1.46, 0);
    this.bodyGroup.add(rightShoulder);

    // Head + Distinct Character Headgear Group
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.78, 0);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skinWarmMat);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Simple focused eyes band
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.18), darkSlateMat);
    eyes.position.set(0, 0.02, 0.14);
    this.headGroup.add(eyes);

    this.characterHatGroup = new THREE.Group();
    this.headGroup.add(this.characterHatGroup);
    this.bodyGroup.add(this.headGroup);

    // Arms & Weapon Socket
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.44, 1.42, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), darkSlateMat);
    leftArmMesh.position.y = -0.28;
    this.leftArmPivot.add(leftArmMesh);
    this.bodyGroup.add(this.leftArmPivot);

    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.44, 1.42, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), darkSlateMat);
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
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.19), darkSlateMat);
    leftLegMesh.position.y = -0.35;
    leftLegMesh.castShadow = true;
    this.leftLegPivot.add(leftLegMesh);
    this.bodyGroup.add(this.leftLegPivot);

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.18, 0.72, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.19), darkSlateMat);
    rightLegMesh.position.y = -0.35;
    rightLegMesh.castShadow = true;
    this.rightLegPivot.add(rightLegMesh);
    this.bodyGroup.add(this.rightLegPivot);

    // Equipped 3D Weapon & Slash Arc
    this.batRig = createBatVisualRig(this.batId);
    this.weaponSocket.add(this.batRig.group);
    this.rootGroup.add(this.batRig.slashRibbon);

    // Build character-specific 3D silhouette features
    this.rebuildCharacterSilhouette();

    // Grounded Contact Shadow Blob
    const shadowGeo = new THREE.CircleGeometry(0.72, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x3b352d,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.shadowBlob = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowBlob.position.y = 0.03;
    this.rootGroup.add(this.shadowBlob);

    // High-Readability Crimson Target Ring around feet when ball is targeting this fighter
    this.targetLockRing = new THREE.Group();
    const lockOuter = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.24, 32),
      new THREE.MeshBasicMaterial({
        color: 0xc53030,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    lockOuter.rotation.x = -Math.PI / 2;
    lockOuter.position.y = 0.05;
    this.targetLockRing.add(lockOuter);
    this.targetLockRing.visible = false;
    this.rootGroup.add(this.targetLockRing);

    // Tatsu Ward Barrier Dome
    this.kineticDomeMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.85, 1),
      new THREE.MeshBasicMaterial({
        color: 0x2f6f4e,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.kineticDomeMesh.position.y = 1.15;
    this.kineticDomeMesh.visible = false;
    this.rootGroup.add(this.kineticDomeMesh);

    // Goro Earth Shatter Ring
    this.supernovaAuraMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({
        color: 0xb84a39,
        transparent: true,
        opacity: 0.75,
      })
    );
    this.supernovaAuraMesh.rotation.x = Math.PI / 2;
    this.supernovaAuraMesh.position.y = 1.05;
    this.supernovaAuraMesh.visible = false;
    this.rootGroup.add(this.supernovaAuraMesh);

    // Flowing 6-node Scarf / Cape Physics Chain
    this.capeGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      this.capeNodes.push(new THREE.Vector3());
      const w = 0.4 - i * 0.045;
      const segMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.05, 0.24),
        this.capeMat
      );
      this.capeMeshes.push(segMesh);
      this.capeGroup.add(segMesh);
    }

    scene.add(this.rootGroup);
    scene.add(this.capeGroup);
  }

  /**
   * Builds a unique outfit for each of the 5 playable characters (headwear, body build,
   * armour pieces and back accessories) so every fighter has its own recognisable design.
   * Only shared per-fighter materials are used, so swapping characters never leaks materials.
   */
  private rebuildCharacterSilhouette(): void {
    const clearGroup = (g: THREE.Group): void => {
      while (g.children.length > 0) {
        const child = g.children[0] as THREE.Mesh;
        g.remove(child);
        if (child.geometry) child.geometry.dispose();
      }
    };
    clearGroup(this.characterHatGroup);
    clearGroup(this.accessoryGroup);

    const style = getCharacterVisuals(this.characterId);
    this.clothMat.color.setHex(style.outfitHex);
    this.limbMat.color.setHex(style.limbHex);
    this.trimMat.color.setHex(style.trimHex);
    this.skinMat.color.setHex(style.skinHex);
    this.capeMat.color.setHex(style.capeHex);
    this.torsoMesh.scale.set(style.torsoScale[0], style.torsoScale[1], style.torsoScale[2]);

    const hat = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.characterHatGroup.add(m);
      return m;
    };
    const acc = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.accessoryGroup.add(m);
      return m;
    };

    switch (this.characterId) {
      case 'chrono': {
        // TOKI — scholar hat with square board, long robe skirt, brass astrolabe rings on the back
        hat(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 10), this.clothMat, 0, 0.3, 0);
        hat(new THREE.BoxGeometry(0.44, 0.04, 0.44), this.trimMat, 0, 0.48, 0);
        acc(new THREE.CylinderGeometry(0.3, 0.52, 0.76, 12), this.clothMat, 0, 0.5, 0);
        acc(new THREE.CylinderGeometry(0.53, 0.53, 0.06, 12), this.trimMat, 0, 0.14, 0);
        const ringA = acc(new THREE.TorusGeometry(0.42, 0.03, 6, 24), this.trimMat, 0, 1.72, -0.4);
        ringA.rotation.y = 0.5;
        const ringB = acc(new THREE.TorusGeometry(0.33, 0.03, 6, 24), this.trimMat, 0, 1.72, -0.4);
        ringB.rotation.y = -0.6;
        acc(new THREE.OctahedronGeometry(0.08, 0), this.trimMat, 0, 1.72, -0.4);
        break;
      }
      case 'volt': {
        // KAZE — wide straw kasa hat, neck scarf wrap, gourd on the hip, slim build
        hat(new THREE.ConeGeometry(0.68, 0.28, 14), this.trimMat, 0, 0.25, 0);
        hat(new THREE.SphereGeometry(0.06, 6, 6), this.trimMat, 0, 0.4, 0);
        const wrap = acc(new THREE.TorusGeometry(0.2, 0.075, 6, 14), this.capeMat, 0, 1.6, 0);
        wrap.rotation.x = Math.PI / 2;
        acc(new THREE.SphereGeometry(0.11, 8, 8), this.trimMat, 0.32, 0.8, -0.12);
        acc(new THREE.SphereGeometry(0.08, 8, 8), this.trimMat, 0.32, 0.96, -0.12);
        break;
      }
      case 'titan': {
        // GORO — horned kabuto with neck guard, iron face mask, huge pauldrons and armoured tassets
        hat(new THREE.CylinderGeometry(0.29, 0.34, 0.24, 10), this.limbMat, 0, 0.13, 0);
        hat(new THREE.CylinderGeometry(0.32, 0.48, 0.2, 12, 1, true), this.clothMat, 0, -0.04, -0.04);
        const crestL = hat(new THREE.BoxGeometry(0.06, 0.38, 0.06), this.trimMat, -0.17, 0.36, 0.16);
        crestL.rotation.z = 0.45;
        const crestR = hat(new THREE.BoxGeometry(0.06, 0.38, 0.06), this.trimMat, 0.17, 0.36, 0.16);
        crestR.rotation.z = -0.45;
        hat(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), this.trimMat, 0, 0.2, 0.3).rotation.x = Math.PI / 2;
        hat(new THREE.BoxGeometry(0.3, 0.12, 0.06), this.limbMat, 0, -0.1, 0.2);
        const padL = acc(new THREE.BoxGeometry(0.42, 0.13, 0.44), this.clothMat, -0.6, 1.5, 0);
        padL.rotation.z = 0.35;
        const padR = acc(new THREE.BoxGeometry(0.42, 0.13, 0.44), this.clothMat, 0.6, 1.5, 0);
        padR.rotation.z = -0.35;
        acc(new THREE.BoxGeometry(0.44, 0.04, 0.46), this.trimMat, -0.6, 1.43, 0).rotation.z = 0.35;
        acc(new THREE.BoxGeometry(0.44, 0.04, 0.46), this.trimMat, 0.6, 1.43, 0).rotation.z = -0.35;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const t = acc(new THREE.BoxGeometry(0.3, 0.32, 0.06), this.clothMat, Math.sin(a) * 0.38, 0.66, Math.cos(a) * 0.38);
          t.rotation.y = a;
        }
        break;
      }
      case 'phantom': {
        // KAGE — pointed shinobi hood, lower face mask, twin kunai crossed on the back, slim build
        const hood = hat(new THREE.SphereGeometry(0.28, 10, 8), this.clothMat, 0, 0.04, -0.04);
        hood.scale.set(1, 1.05, 1.1);
        const tip = hat(new THREE.ConeGeometry(0.16, 0.4, 8), this.clothMat, 0, 0.12, -0.3);
        tip.rotation.x = -1.1;
        hat(new THREE.BoxGeometry(0.34, 0.14, 0.12), this.limbMat, 0, -0.08, 0.17);
        const kunaiA = acc(new THREE.BoxGeometry(0.05, 0.66, 0.04), this.trimMat, 0, 1.2, -0.32);
        kunaiA.rotation.z = 0.6;
        const kunaiB = acc(new THREE.BoxGeometry(0.05, 0.66, 0.04), this.trimMat, 0, 1.2, -0.32);
        kunaiB.rotation.z = -0.6;
        break;
      }
      case 'aegis': {
        // TATSU — domed crest helm, broad shoulder plates and a round jade-emblem shield on the back
        const dome = hat(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.limbMat, 0, 0.02, 0);
        dome.scale.set(1, 1.05, 1);
        hat(new THREE.BoxGeometry(0.07, 0.32, 0.52), this.trimMat, 0, 0.27, 0);
        acc(new THREE.BoxGeometry(0.36, 0.09, 0.36), this.trimMat, -0.5, 1.58, 0);
        acc(new THREE.BoxGeometry(0.36, 0.09, 0.36), this.trimMat, 0.5, 1.58, 0);
        const shield = acc(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 18), this.clothMat, 0, 1.15, -0.4);
        shield.rotation.x = Math.PI / 2;
        acc(new THREE.TorusGeometry(0.44, 0.04, 6, 24), this.limbMat, 0, 1.15, -0.44);
        const emblem = acc(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 6), this.trimMat, 0, 1.15, -0.46);
        emblem.rotation.x = Math.PI / 2;
        break;
      }
    }
  }

  public setLoadout(characterId: CharacterId, batId: BatId): void {
    this.characterId = characterId;
    this.characterDef = getCharacterDefinition(characterId);
    this.rebuildCharacterSilhouette();

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
    this.prevPosition.copy(spawnPos);
    this.renderPosition.copy(spawnPos);
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
    return 3.55 + this.characterDef.parryReachBonus;
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
      this.squashStretch = 1.24;
      if (this.emitEvents) {
        gameEvents.emit('jump', {
          playerId: this.id,
          position: this.position,
          isDoubleJump: false,
        });
      }
      return true;
    } else if (this.doubleJumpAvailable) {
      this.velocity.y = DOUBLE_JUMP_SPEED;
      this.doubleJumpAvailable = false;
      this.flipAnimTimer = 0.36;
      this.squashStretch = 1.2;
      if (this.emitEvents) {
        gameEvents.emit('jump', {
          playerId: this.id,
          position: this.position,
          isDoubleJump: true,
        });
      }
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

    if (this.emitEvents) {
      gameEvents.emit('dash', {
        playerId: this.id,
        position: this.position,
        direction: this.dashDirection,
        colorHex: this.characterDef.accentHex,
      });
    }
    return true;
  }

  public tryParry(isBunt: boolean, simClock: number): boolean {
    if (!this.alive) return false;
    if (this.parryActiveTimer > 0 || this.parryWhiffTimer > 0) return false;

    this.parryActiveTimer = PARRY_ACTIVE_WINDOW;
    this.swingAnimTimer = 0.3;
    this.swingIsBunt = isBunt;
    this.swingResolved = false;
    this.lastSwingTimestamp = simClock;
    return true;
  }

  public onParrySucceeded(): void {
    this.swingResolved = true;
    this.parryActiveTimer = 0;
    this.parryWhiffTimer = 0.34;
  }

  /** Plays a visual slash animation on the 3D preview turntable without triggering parry hitboxes. */
  public triggerPreviewPose(): void {
    this.swingAnimTimer = 0.36;
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

    this.prevPosition.copy(this.position);
    this.animClock += dt;
    this.moveInputDir.copy(wishMoveDir);
    if (aimDir.lengthSq() > 0.001) {
      this.aimDirection.copy(aimDir).normalize();
    }

    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.iframeTimer > 0) this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    if (this.abilityCooldown > 0) this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    if (this.speedBoostTimer > 0) this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
    if (this.supernovaTimer > 0) this.supernovaTimer = Math.max(0, this.supernovaTimer - dt);
    if (this.kineticDomeTimer > 0) this.kineticDomeTimer = Math.max(0, this.kineticDomeTimer - dt);
    if (this.flipAnimTimer > 0) this.flipAnimTimer = Math.max(0, this.flipAnimTimer - dt);
    if (this.swingAnimTimer > 0) this.swingAnimTimer = Math.max(0, this.swingAnimTimer - dt);

    if (this.parryActiveTimer > 0) {
      this.parryActiveTimer -= dt;
      if (this.parryActiveTimer <= 0) {
        this.parryActiveTimer = 0;
        if (!this.swingResolved) {
          this.parryWhiffTimer = BASE_WHIFF_RECOVERY * this.characterDef.whiffRecoveryMultiplier;
          if (this.emitEvents) {
            gameEvents.emit('whiff', {
              playerId: this.id,
              position: this.position,
            });
          }
        }
      }
    } else if (this.parryWhiffTimer > 0) {
      this.parryWhiffTimer = Math.max(0, this.parryWhiffTimer - dt);
    }

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
      if (this.afterimageSpawnAccum >= 0.036 && onSpawnAfterimage) {
        this.afterimageSpawnAccum = 0;
        onSpawnAfterimage(this.position, this.facingYaw, this.characterDef.accentHex);
      }
    } else {
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

    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    const { groundHeight } = resolveFighterCollisions(
      this.position,
      this.velocity,
      this.radius,
      arenaRadius,
      obstacles,
      platforms
    );
    this.groundY = groundHeight;

    if (this.position.y <= groundHeight) {
      if (!this.isGrounded && this.velocity.y < -4.0) {
        this.squashStretch = 0.8;
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
        this.squashStretch = 1.28;
        gameEvents.emit('jump', {
          playerId: this.id,
          position: this.position,
          isDoubleJump: true,
        });
      }
    }

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

    this.renderPosition.copy(this.position);
    this.updateProceduralAnimation(dt, isBallLockedOnMe);
  }

  public updateRenderInterpolation(alpha: number): void {
    if (!this.alive) return;
    this.renderPosition.lerpVectors(this.prevPosition, this.position, alpha);
    this.rootGroup.position.copy(this.renderPosition);
  }

  private updateProceduralAnimation(dt: number, isBallLockedOnMe: boolean): void {
    this.rootGroup.position.copy(this.renderPosition);
    this.rootGroup.rotation.y = this.facingYaw;

    this.squashStretch = THREE.MathUtils.lerp(this.squashStretch, 1.0, Math.min(1, dt * 14));
    const invScale = 1 / Math.sqrt(this.squashStretch);
    this.bodyGroup.scale.set(invScale, this.squashStretch, invScale);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const speedRatio = Math.min(1, horizSpeed / BASE_MOVE_SPEED);

    if (this.flipAnimTimer > 0) {
      const flipProgress = 1 - this.flipAnimTimer / 0.36;
      this.bodyGroup.rotation.x = -flipProgress * Math.PI * 2;
    } else {
      this.bodyGroup.rotation.x = THREE.MathUtils.lerp(
        this.bodyGroup.rotation.x,
        -speedRatio * 0.2,
        Math.min(1, dt * 12)
      );
    }

    if (this.isGrounded && speedRatio > 0.1) {
      const stride = Math.sin(this.animClock * 13) * 0.65 * speedRatio;
      this.leftLegPivot.rotation.x = stride;
      this.rightLegPivot.rotation.x = -stride;
      this.leftArmPivot.rotation.x = -stride * 0.6;
    } else if (!this.isGrounded) {
      this.leftLegPivot.rotation.x = 0.35;
      this.rightLegPivot.rotation.x = -0.25;
      this.leftArmPivot.rotation.x = -0.45;
    } else {
      this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, 0, dt * 10);
      this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, 0, dt * 10);
      this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, 0, dt * 10);
    }

    if (this.swingAnimTimer > 0) {
      const p = 1 - this.swingAnimTimer / 0.3;
      const swingAngle = THREE.MathUtils.lerp(-1.35, 1.5, Math.min(1, p * 1.8));
      this.rightArmPivot.rotation.y = -swingAngle;
      this.rightArmPivot.rotation.x = -0.75;
      this.torsoMesh.rotation.y = -swingAngle * 0.32;

      this.batRig.slashRibbon.visible = true;
      this.batRig.slashRibbon.rotation.y = swingAngle * 0.32;
      this.batRig.slashMaterial.opacity = Math.max(0, Math.sin(p * Math.PI) * 0.65);
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

    const heightAboveFloor = Math.max(0, this.position.y - this.groundY);
    this.shadowBlob.position.y = -heightAboveFloor + 0.03;
    const shadowScale = Math.max(0.35, 1 - heightAboveFloor * 0.14);
    this.shadowBlob.scale.setScalar(shadowScale);

    this.targetLockRing.visible = isBallLockedOnMe;
    if (isBallLockedOnMe) {
      const pulse = 1 + Math.sin(this.animClock * 14) * 0.1;
      this.targetLockRing.scale.set(pulse, 1, pulse);
    }

    this.kineticDomeMesh.visible = this.kineticDomeTimer > 0;
    if (this.kineticDomeTimer > 0) {
      this.kineticDomeMesh.rotation.y += dt * 3.0;
    }

    this.supernovaAuraMesh.visible = this.supernovaTimer > 0;
    if (this.supernovaTimer > 0) {
      const s = 1 + Math.sin(this.animClock * 16) * 0.1;
      this.supernovaAuraMesh.scale.setScalar(s);
    }

    const backX = Math.sin(this.facingYaw);
    const backZ = Math.cos(this.facingYaw);
    this._capeAnchor.set(
      this.position.x + backX * 0.26,
      this.position.y + 1.46,
      this.position.z + backZ * 0.26
    );
    this.capeNodes[0].copy(this._capeAnchor);

    const segLength = 0.21;
    for (let i = 1; i < this.capeNodes.length; i++) {
      const prev = this.capeNodes[i - 1];
      const curr = this.capeNodes[i];

      curr.y -= 5.8 * dt;
      curr.x += backX * 2.2 * dt + Math.sin(this.animClock * 10 + i) * 0.35 * dt;
      curr.z += backZ * 2.2 * dt + Math.cos(this.animClock * 10 + i) * 0.35 * dt;

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
