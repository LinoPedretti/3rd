import * as THREE from 'three';
import { PlayerFighter } from '../entities/player';
import { INITIAL_BALL_SPEED, MAX_BALL_SPEED, PlasmaBall } from '../entities/ball';
import { getBatDefinition } from '../entities/bats';
import {
  CylinderObstacle,
  PlatformSurface,
  SweptHitResult,
  sweptSphereVsCylinder,
  sweptSphereVsSphere,
} from '../engine/physics';
import { gameEvents, getMachFromSpeed } from '../engine/events';
import { VFXSystem } from './vfx';

const _toTarget = new THREE.Vector3();
const _desiredDir = new THREE.Vector3();
const _launchDir = new THREE.Vector3();
const _curveRight = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fighterTorso = new THREE.Vector3();
const _wallNormal = new THREE.Vector3();
const _knockDir = new THREE.Vector3();
const _clashMidpoint = new THREE.Vector3();

const _sweptResult: SweptHitResult = {
  hit: false,
  t: 0,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
};

export interface CombatCallbacks {
  onTriggerHitstop: (durationSec: number) => void;
  onCameraParryPunch: (intensity: number, dir: THREE.Vector3) => void;
  onFighterEliminated: (victim: PlayerFighter, attacker: PlayerFighter | null) => void;
  onGauntletParryScored?: (mach: number) => void;
}

export class CombatSystem {
  public updateBallAndParries(
    dt: number,
    simClock: number,
    ball: PlasmaBall,
    fighters: PlayerFighter[],
    isEndlessGauntlet: boolean,
    dronePosition: THREE.Vector3 | null,
    arenaRadius: number,
    obstacles: CylinderObstacle[],
    platforms: PlatformSurface[],
    vfx: VFXSystem,
    callbacks: CombatCallbacks
  ): void {
    // Ensure ball always has a valid living target
    this.ensureValidTarget(ball, fighters, isEndlessGauntlet);

    // 1. Check if any fighter in active parry window (or Aegis Kinetic Dome) intercepts the ball
    // Also check if two fighters swing simultaneously near the ball for a 3D CLASH!
    const parryingFighters: PlayerFighter[] = [];

    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (!f.alive) continue;

      _fighterTorso.set(f.position.x, f.position.y + 1.15, f.position.z);
      const distToBall = _fighterTorso.distanceTo(ball.position);

      // Aegis Kinetic Dome auto-deflect check
      if (f.kineticDomeTimer > 0 && distToBall <= f.getParryReach() + 0.45) {
        if (ball.lastHitterId !== f.id || ball.targetId === f.id) {
          this.executeParry(
            f,
            ball,
            fighters,
            isEndlessGauntlet,
            dronePosition,
            vfx,
            callbacks,
            true
          );
          return;
        }
      }

      if (f.parryActiveTimer > 0 && !f.swingResolved) {
        const reach = f.getParryReach();
        // Also check swept distance along ball segment so hyper-speed balls can be parried reliably
        const sweptInReach = sweptSphereVsSphere(
          ball.prevPosition,
          ball.position,
          ball.radius,
          _fighterTorso,
          reach,
          _sweptResult
        );

        if (distToBall <= reach || sweptInReach) {
          // Verify directional 130° cone in front of fighter (or close 1.5m proximity 360° safety)
          _toTarget.subVectors(ball.position, _fighterTorso);
          const d = _toTarget.length();
          let inCone = true;
          if (d > 1.65) {
            _toTarget.divideScalar(d);
            const dot = _toTarget.dot(f.aimDirection);
            inCone = dot >= -0.25;
          }
          if (inCone) {
            parryingFighters.push(f);
          }
        }
      }
    }

    // Check 3D CLASH: Simultaneous swings at close range
    if (parryingFighters.length >= 2) {
      const fA = parryingFighters[0];
      const fB = parryingFighters[1];
      if (fA.position.distanceTo(fB.position) <= 6.2) {
        this.executeClash(
          fA,
          fB,
          ball,
          fighters,
          isEndlessGauntlet,
          vfx,
          callbacks
        );
        return;
      }
    }

    if (parryingFighters.length >= 1) {
      // Prioritize the fighter the ball is currently locked onto if multiple are in range
      let hitter = parryingFighters[0];
      for (let i = 0; i < parryingFighters.length; i++) {
        if (parryingFighters[i].id === ball.targetId) {
          hitter = parryingFighters[i];
          break;
        }
      }
      this.executeParry(
        hitter,
        ball,
        fighters,
        isEndlessGauntlet,
        dronePosition,
        vfx,
        callbacks,
        false
      );
      return;
    }

    // 2. Chrono Temporal Stasis freeze check
    if (ball.stasisTimer > 0) {
      ball.stasisTimer = Math.max(0, ball.stasisTimer - dt);
      ball.prevPosition.copy(ball.position);
      ball.recordPerceptionSample(simClock);
      return;
    }

    // 3. 3D Homing & Curve Steering
    ball.prevPosition.copy(ball.position);

    const targetFighter = this.findFighterById(fighters, ball.targetId);
    let targetCenter: THREE.Vector3 | null = null;
    if (targetFighter && targetFighter.alive) {
      targetCenter = _fighterTorso.set(
        targetFighter.position.x,
        targetFighter.position.y + 1.15,
        targetFighter.position.z
      );
    } else if (isEndlessGauntlet && dronePosition && ball.targetId === 'gauntlet_drone') {
      targetCenter = dronePosition;
    }

    if (targetCenter) {
      _desiredDir.subVectors(targetCenter, ball.position);
      const distToTarget = _desiredDir.length();
      if (distToTarget > 0.001) {
        _desiredDir.divideScalar(distToTarget);
      }

      if (ball.isBuntLob) {
        // Bunt / Feint high-arcing lob physics
        ball.velocity.x = THREE.MathUtils.lerp(ball.velocity.x, _desiredDir.x, dt * 2.2);
        ball.velocity.z = THREE.MathUtils.lerp(ball.velocity.z, _desiredDir.z, dt * 2.2);
        ball.velocity.y -= ball.buntGravity * dt;
      } else {
        // Apply player's 3D curve acceleration (decays as ball approaches target so homing locks in)
        if (ball.curveAccel.lengthSq() > 0.001) {
          ball.velocity.addScaledVector(ball.curveAccel, dt);
          ball.curveAccel.multiplyScalar(Math.max(0, 1 - dt * 2.4));
        }

        // Homing turn rate scales up with speed & close proximity so fast rallies curve tightly in 3D
        const distFactor = distToTarget < 7.0 ? 1.45 : 1.0;
        const turnRate = (2.4 + ball.speed * 0.055) * distFactor;
        ball.velocity.lerp(_desiredDir, Math.min(1, turnRate * dt)).normalize();
      }
    }

    // 4. Advance Ball Position
    const stepDist = ball.speed * dt;
    ball.position.addScaledVector(ball.velocity, stepDist);
    if (ball.stealthActive) {
      ball.stealthTraveledDist += stepDist;
    }

    // 5. Endless Speed Gauntlet Drone Auto-Return
    if (
      isEndlessGauntlet &&
      dronePosition &&
      ball.targetId === 'gauntlet_drone' &&
      fighters.length > 0
    ) {
      if (
        sweptSphereVsSphere(
          ball.prevPosition,
          ball.position,
          ball.radius,
          dronePosition,
          1.45,
          _sweptResult
        )
      ) {
        const soloPlayer = fighters[0];
        ball.targetId = soloPlayer.id;
        ball.lastHitterId = 'gauntlet_drone';
        ball.isBuntLob = false;
        ball.speed = Math.min(MAX_BALL_SPEED, ball.speed * 1.07 + 1.1);
        _desiredDir
          .set(
            soloPlayer.position.x - ball.position.x,
            soloPlayer.position.y + 1.2 - ball.position.y,
            soloPlayer.position.z - ball.position.z
          )
          .normalize();
        // Add random 3D curve variation from drone
        ball.curveAccel.set(
          (Math.random() - 0.5) * 2.4,
          Math.random() * 1.4,
          (Math.random() - 0.5) * 2.4
        );
        ball.velocity.copy(_desiredDir);
        vfx.spawnShockwaveRing(dronePosition, 0xff1744, 3.0);
        vfx.spawnParticleBurst(dronePosition, 0xff1744, 14, 9.0);
      }
    }

    // 6. Swept 3D Sphere-Segment vs Fighters Hit Detection (Elimination or Auto-Guard)
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (!f.alive) continue;
      // Grace period for the fighter who just hit the ball unless they are currently targeted
      if (f.id === ball.lastHitterId && f.id !== ball.targetId) continue;

      _fighterTorso.set(f.position.x, f.position.y + 1.1, f.position.z);
      const hitFighter = sweptSphereVsSphere(
        ball.prevPosition,
        ball.position,
        ball.radius,
        _fighterTorso,
        f.radius + 0.15,
        _sweptResult
      );

      if (hitFighter) {
        // Check if fighter has Aegis Kinetic Dome active
        if (f.kineticDomeTimer > 0) {
          this.executeParry(
            f,
            ball,
            fighters,
            isEndlessGauntlet,
            dronePosition,
            vfx,
            callbacks,
            true
          );
          return;
        }

        // Check if fighter is in Dodge Dash invulnerability frames (140ms i-frames!)
        if (f.isInvulnerable()) {
          // Ball phases past invulnerable dashing fighter with a cool spark graze
          vfx.spawnParticleBurst(f.position, f.characterDef.accentHex, 8, 6.0);
          continue;
        }

        // Direct impact elimination!
        const attacker = this.findFighterById(fighters, ball.lastHitterId) || null;
        callbacks.onFighterEliminated(f, attacker);
        return;
      }
    }

    // 7. Arena Floor, Elevated Platforms, Pillars & Barrier Wall Collisions
    let minFloorY = 0.52;
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z) <= p.radius) {
        minFloorY = Math.max(minFloorY, p.topY + 0.52);
      }
    }

    if (ball.position.y < minFloorY) {
      ball.position.y = minFloorY;
      if (ball.velocity.y < 0) {
        ball.velocity.y = Math.abs(ball.velocity.y) * 0.75;
        if (ball.isBuntLob) {
          ball.isBuntLob = false;
          ball.velocity.normalize();
        }
      }
    }

    if (ball.position.y > 14.0) {
      ball.position.y = 14.0;
      if (ball.velocity.y > 0) ball.velocity.y *= -0.6;
    }

    // Swept Sphere vs Cylindrical Pillars / Bumpers
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (
        sweptSphereVsCylinder(
          ball.prevPosition,
          ball.position,
          ball.radius,
          obs,
          _sweptResult
        )
      ) {
        ball.position.copy(_sweptResult.point);
        ball.velocity.reflect(_sweptResult.normal).normalize();
        vfx.spawnShockwaveRing(_sweptResult.point, 0x00e5ff, 2.4, _sweptResult.normal);
        vfx.spawnParticleBurst(_sweptResult.point, 0x00e5ff, 10, 7.0);
        gameEvents.emit('wall_hit', {
          position: _sweptResult.point,
          normal: _sweptResult.normal,
          speed: ball.speed,
        });
      }
    }

    // Outer Translucent Energy Barrier Wall collision + expanding 3D shockwave ring ripple
    const maxBallR = arenaRadius - ball.radius;
    const radialDist = Math.hypot(ball.position.x, ball.position.z);
    if (radialDist > maxBallR && radialDist > 0.001) {
      const nx = -ball.position.x / radialDist;
      const nz = -ball.position.z / radialDist;
      _wallNormal.set(nx, 0, nz);

      ball.position.x = -nx * maxBallR;
      ball.position.z = -nz * maxBallR;

      const dot = ball.velocity.x * nx + ball.velocity.z * nz;
      if (dot < 0) {
        ball.velocity.x -= 2 * dot * nx;
        ball.velocity.z -= 2 * dot * nz;
        ball.velocity.normalize();
      }

      // Expanding 3D shockwave ring on barrier wall impact!
      vfx.spawnShockwaveRing(ball.position, 0x00e5ff, 4.2, _wallNormal);
      vfx.spawnParticleBurst(ball.position, 0x00e5ff, 12, 8.0);
      gameEvents.emit('wall_hit', {
        position: ball.position,
        normal: _wallNormal,
        speed: ball.speed,
      });
    }

    ball.recordPerceptionSample(simClock);
  }

  private executeParry(
    fighter: PlayerFighter,
    ball: PlasmaBall,
    fighters: PlayerFighter[],
    isEndlessGauntlet: boolean,
    dronePosition: THREE.Vector3 | null,
    vfx: VFXSystem,
    callbacks: CombatCallbacks,
    isAutoDeflect: boolean
  ): void {
    fighter.onParrySucceeded();
    fighter.parriesThisMatch++;

    // Release any active Chrono Temporal Stasis immediately on strike
    ball.stasisTimer = 0;

    // Pick new target based on camera look direction (or training drone in Endless Speed Gauntlet)
    const nextTargetId = this.selectNextTarget(
      fighter,
      fighters,
      isEndlessGauntlet,
      dronePosition
    );
    ball.targetId = nextTargetId;
    ball.lastHitterId = fighter.id;

    const batDef = getBatDefinition(fighter.batId);
    const isBunt = fighter.swingIsBunt && !isAutoDeflect;
    const isEmpowered = fighter.supernovaTimer > 0;

    if (isBunt) {
      // Bunt / Feint (E): softens ball velocity into a slow, high-arcing lob
      ball.isBuntLob = true;
      ball.buntGravity = 1.85;
      ball.speed = Math.max(INITIAL_BALL_SPEED * 0.78, ball.speed * 0.56);
      _launchDir.copy(fighter.aimDirection);
      _launchDir.y = Math.max(0.68, _launchDir.y + 0.65);
      _launchDir.normalize();
      ball.velocity.copy(_launchDir);
      ball.curveAccel.set(0, 0, 0);

      vfx.spawnShockwaveRing(ball.position, batDef.primaryHex, 2.2);
      vfx.spawnParticleBurst(ball.position, batDef.sparkColorHex, 12, 6.0);

      gameEvents.emit('bunt', {
        playerId: fighter.id,
        position: ball.position,
        newSpeed: ball.speed,
      });
      return;
    }

    // Standard or Supernova Empowered Parry
    ball.isBuntLob = false;
    let newSpeed = Math.min(MAX_BALL_SPEED, ball.speed * 1.085 + 1.35);

    if (isEmpowered) {
      // Titan Supernova Smash: launches ball at 1.6x velocity + massive radial knockback shockwave
      fighter.supernovaTimer = 0;
      newSpeed = Math.min(MAX_BALL_SPEED, newSpeed * 1.6);
      vfx.spawnShockwaveRing(fighter.position, 0xffab00, 7.5);
      vfx.spawnParticleBurst(fighter.position, 0xffab00, 36, 14.0);

      // Knock back nearby enemies
      for (let i = 0; i < fighters.length; i++) {
        const other = fighters[i];
        if (!other.alive || other.id === fighter.id) continue;
        const dist = other.position.distanceTo(fighter.position);
        if (dist <= 8.5) {
          _knockDir.subVectors(other.position, fighter.position).setY(0.35).normalize();
          other.velocity.addScaledVector(_knockDir, 15.0);
          other.isGrounded = false;
        }
      }
    }

    ball.speed = newSpeed;
    const mach = getMachFromSpeed(ball.speed);

    // Directional Aim & 3D Curve Control:
    // Camera look direction (pitch + yaw) + directional WASD movement curves the ball in 3D!
    _launchDir.copy(fighter.aimDirection);
    // Allow player to flick high into the air or spike downward
    _launchDir.y = THREE.MathUtils.clamp(_launchDir.y + 0.14, -0.55, 0.78);
    _launchDir.normalize();
    ball.velocity.copy(_launchDir);

    // Inject lateral + vertical 3D curve acceleration from WASD movement & camera pitch
    _curveRight.crossVectors(_launchDir, _up).normalize();
    const curveStrength = (fighter.characterId === 'phantom' ? 4.8 : 3.6);
    ball.curveAccel
      .copy(fighter.moveInputDir)
      .multiplyScalar(curveStrength)
      .addScaledVector(_up, THREE.MathUtils.clamp(fighter.aimDirection.y * 3.2, -2.5, 3.2));

    // Push ball slightly forward along launch direction so it cleanly clears the hitter
    ball.position
      .set(fighter.position.x, fighter.position.y + 1.2, fighter.position.z)
      .addScaledVector(_launchDir, 1.35);
    ball.prevPosition.copy(ball.position);

    // Phantom Stealth Curve: cloak ball for first 40% of 3D flight path if primed
    if (fighter.stealthNextParry) {
      fighter.stealthNextParry = false;
      ball.stealthActive = true;
      const targetEntity = this.findFighterById(fighters, nextTargetId);
      const flightDist = targetEntity
        ? ball.position.distanceTo(targetEntity.position)
        : 18.0;
      ball.stealthTotalDist = Math.max(8.0, flightDist);
      ball.stealthTraveledDist = 0;
    }

    // Bat-specific VFX (Gravity Hammer heavy amber shockwave rings, Solar Bat golden fire, etc.)
    const ringSize = fighter.batId === 'gravity_hammer' ? 5.2 : 3.4 + Math.min(2.5, mach * 0.25);
    vfx.spawnShockwaveRing(ball.position, batDef.primaryHex, ringSize);
    vfx.spawnParticleBurst(
      ball.position,
      batDef.sparkColorHex,
      18 + Math.min(24, Math.floor(mach * 3)),
      8.0 + mach * 0.9
    );

    // 3D Hitstop & Anime Impact Frames (30ms scaling up to 140ms at Mach-5 speeds)
    const machFactor = THREE.MathUtils.clamp((mach - 1.0) / 4.0, 0, 1);
    const hitstopSec = THREE.MathUtils.lerp(0.03, 0.14, machFactor);
    callbacks.onTriggerHitstop(hitstopSec);

    if (fighter.isHuman) {
      callbacks.onCameraParryPunch(machFactor, _launchDir);
      vfx.triggerAnimeSpeedLines(batDef.primaryHex, 0.18 + machFactor * 0.14);
    }

    if (isEndlessGauntlet && fighter.isHuman && callbacks.onGauntletParryScored) {
      callbacks.onGauntletParryScored(mach);
    }

    gameEvents.emit('parry', {
      playerId: fighter.id,
      position: ball.position,
      direction: _launchDir,
      newSpeed: ball.speed,
      mach,
      batId: fighter.batId,
      isEmpowered,
      isAutoDeflect,
    });
  }

  /**
   * 3D Clash: Simultaneous swings at close range trigger a massive sphere shockwave explosion,
   * doubling the speed spike and knocking both fighters backward.
   */
  private executeClash(
    fA: PlayerFighter,
    fB: PlayerFighter,
    ball: PlasmaBall,
    fighters: PlayerFighter[],
    isEndlessGauntlet: boolean,
    vfx: VFXSystem,
    callbacks: CombatCallbacks
  ): void {
    fA.onParrySucceeded();
    fB.onParrySucceeded();
    fA.clashesThisMatch++;
    fB.clashesThisMatch++;

    _clashMidpoint.addVectors(fA.position, fB.position).multiplyScalar(0.5);
    _clashMidpoint.y += 1.2;

    // Double the speed increment spike
    const increment = (ball.speed * 0.085 + 1.35) * 2.2;
    ball.speed = Math.min(MAX_BALL_SPEED, ball.speed + increment);
    const mach = getMachFromSpeed(ball.speed);

    // Knock both fighters backward
    _knockDir.subVectors(fA.position, fB.position).setY(0).normalize();
    if (_knockDir.lengthSq() < 0.01) _knockDir.set(1, 0, 0);

    fA.velocity.copy(_knockDir).multiplyScalar(14.5);
    fA.velocity.y = 6.2;
    fA.isGrounded = false;

    fB.velocity.copy(_knockDir).multiplyScalar(-14.5);
    fB.velocity.y = 6.2;
    fB.isGrounded = false;

    // Launch ball high and pick target
    ball.position.copy(_clashMidpoint);
    ball.velocity.set((Math.random() - 0.5) * 0.8, 0.65, (Math.random() - 0.5) * 0.8).normalize();
    ball.targetId = Math.random() < 0.5 ? fA.id : fB.id;
    if (fighters.length > 2 && !isEndlessGauntlet) {
      for (let i = 0; i < fighters.length; i++) {
        const cand = fighters[i];
        if (cand.alive && cand.id !== fA.id && cand.id !== fB.id) {
          ball.targetId = cand.id;
          break;
        }
      }
    }

    vfx.spawnShockwaveRing(_clashMidpoint, 0xffffff, 8.2);
    vfx.spawnShockwaveRing(_clashMidpoint, 0xff1744, 6.4);
    vfx.spawnParticleBurst(_clashMidpoint, 0xffffff, 42, 16.0);
    vfx.triggerAnimeSpeedLines(0xffffff, 0.32);

    callbacks.onTriggerHitstop(0.14);
    callbacks.onCameraParryPunch(1.0, ball.velocity);

    gameEvents.emit('clash', {
      position: _clashMidpoint,
      newSpeed: ball.speed,
      mach,
      fighterIds: [fA.id, fB.id],
    });
  }

  private selectNextTarget(
    hitter: PlayerFighter,
    fighters: PlayerFighter[],
    isEndlessGauntlet: boolean,
    dronePosition: THREE.Vector3 | null
  ): string | null {
    if (isEndlessGauntlet && dronePosition) {
      return 'gauntlet_drone';
    }

    let bestId: string | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < fighters.length; i++) {
      const other = fighters[i];
      if (!other.alive || other.id === hitter.id) continue;

      _toTarget.subVectors(other.position, hitter.position);
      const dist = _toTarget.length() || 1;
      _toTarget.divideScalar(dist);

      // Prefer opponent most aligned with hitter's 3D camera aim ray
      const alignment = _toTarget.dot(hitter.aimDirection);
      const score = alignment * 2.5 - dist * 0.015;
      if (score > bestScore) {
        bestScore = score;
        bestId = other.id;
      }
    }

    return bestId;
  }

  private ensureValidTarget(
    ball: PlasmaBall,
    fighters: PlayerFighter[],
    isEndlessGauntlet: boolean
  ): void {
    if (isEndlessGauntlet && ball.targetId === 'gauntlet_drone') {
      return;
    }
    const curr = this.findFighterById(fighters, ball.targetId);
    if (curr && curr.alive) return;

    for (let i = 0; i < fighters.length; i++) {
      if (fighters[i].alive && fighters[i].id !== ball.lastHitterId) {
        ball.targetId = fighters[i].id;
        return;
      }
    }
    for (let i = 0; i < fighters.length; i++) {
      if (fighters[i].alive) {
        ball.targetId = fighters[i].id;
        return;
      }
    }
  }

  private findFighterById(
    fighters: PlayerFighter[],
    id: string | null
  ): PlayerFighter | undefined {
    if (!id) return undefined;
    for (let i = 0; i < fighters.length; i++) {
      if (fighters[i].id === id) return fighters[i];
    }
    return undefined;
  }
}
