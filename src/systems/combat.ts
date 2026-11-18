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
    this.ensureValidTarget(ball, fighters, isEndlessGauntlet);

    // 1. Check active parry windows & Tatsu Ward Barrier auto-deflect
    const parryingFighters: PlayerFighter[] = [];

    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (!f.alive) continue;

      _fighterTorso.set(f.position.x, f.position.y + 1.15, f.position.z);
      const distToBall = _fighterTorso.distanceTo(ball.position);

      // A fighter can never re-hit a ball they just struck unless it has been sent back at them.
      const isOwnOutgoingBall = ball.lastHitterId === f.id && ball.targetId !== f.id;

      if (!isOwnOutgoingBall && f.kineticDomeTimer > 0 && distToBall <= f.getParryReach() + 0.5) {
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

      if (!isOwnOutgoingBall && f.parryActiveTimer > 0 && !f.swingResolved) {
        const reach = f.getParryReach();
        const sweptInReach = sweptSphereVsSphere(
          ball.prevPosition,
          ball.position,
          ball.radius,
          _fighterTorso,
          reach,
          _sweptResult
        );

        if (distToBall <= reach || sweptInReach) {
          _toTarget.subVectors(ball.position, _fighterTorso);
          const d = _toTarget.length();
          let inCone = true;
          if (d > 1.8) {
            _toTarget.divideScalar(d);
            const dot = _toTarget.dot(f.aimDirection);
            inCone = dot >= -0.3;
          }
          if (inCone) {
            parryingFighters.push(f);
          }
        }
      }
    }

    if (parryingFighters.length >= 2) {
      const fA = parryingFighters[0];
      const fB = parryingFighters[1];
      if (fA.position.distanceTo(fB.position) <= 6.5) {
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

    // 2. Toki Time Freeze check
    if (ball.stasisTimer > 0) {
      ball.stasisTimer = Math.max(0, ball.stasisTimer - dt);
      ball.prevPosition.copy(ball.position);
      ball.recordPerceptionSample(simClock);
      return;
    }

    // 3. Clean, Smooth, Predictable Homing Curve Path
    ball.prevPosition.copy(ball.position);

    const targetFighter = this.findFighterById(fighters, ball.targetId);
    let targetCenter: THREE.Vector3 | null = null;
    if (targetFighter && targetFighter.alive) {
      targetCenter = _fighterTorso.set(
        targetFighter.position.x,
        targetFighter.position.y + 1.25,
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
        ball.velocity.x = THREE.MathUtils.lerp(ball.velocity.x, _desiredDir.x, dt * 2.5);
        ball.velocity.z = THREE.MathUtils.lerp(ball.velocity.z, _desiredDir.z, dt * 2.5);
        ball.velocity.y -= ball.buntGravity * dt;
      } else {
        // Smooth horizontal curve bias decaying cleanly as the ball homes in on its target
        if (ball.curveAccel.lengthSq() > 0.001) {
          ball.velocity.x += ball.curveAccel.x * dt;
          ball.velocity.z += ball.curveAccel.z * dt;
          ball.curveAccel.multiplyScalar(Math.max(0, 1 - dt * 2.6));
        }

        const distFactor = distToTarget < 9.0 ? 1.5 : 1.0;
        const turnRate = (2.6 + ball.speed * 0.05) * distFactor;
        ball.velocity.lerp(_desiredDir, Math.min(1, turnRate * dt)).normalize();

        // Keep ball cruising smoothly at readable chest height (1.25m above target ground)
        const targetCruiseY = targetCenter.y;
        ball.position.y = THREE.MathUtils.lerp(
          ball.position.y,
          targetCruiseY,
          Math.min(1, dt * 4.5)
        );
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
          1.6,
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
            0,
            soloPlayer.position.z - ball.position.z
          )
          .normalize();
        ball.curveAccel.set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
        ball.velocity.copy(_desiredDir);
        vfx.spawnShockwaveRing(dronePosition, 0xc53030, 2.8);
      }
    }

    // 6. Swept 3D Sphere-Segment vs Fighters Hit Detection
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      if (!f.alive) continue;
      if (f.id === ball.lastHitterId && f.id !== ball.targetId) continue;

      _fighterTorso.set(f.position.x, f.position.y + 1.15, f.position.z);
      const hitFighter = sweptSphereVsSphere(
        ball.prevPosition,
        ball.position,
        ball.radius,
        _fighterTorso,
        f.radius + 0.14,
        _sweptResult
      );

      if (hitFighter) {
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

        if (f.isInvulnerable()) {
          vfx.spawnParticleBurst(f.position, f.characterDef.accentHex, 6, 5.0);
          continue;
        }

        const attacker = this.findFighterById(fighters, ball.lastHitterId) || null;
        callbacks.onFighterEliminated(f, attacker);
        return;
      }
    }

    // 7. Arena Floor, Elevated Platforms, Pillars & Perimeter Collisions
    let minFloorY = 0.65;
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (Math.hypot(ball.position.x - p.position.x, ball.position.z - p.position.z) <= p.radius) {
        minFloorY = Math.max(minFloorY, p.topY + 0.65);
      }
    }

    if (ball.position.y < minFloorY) {
      ball.position.y = minFloorY;
      if (ball.velocity.y < 0) {
        ball.velocity.y = 0;
        ball.isBuntLob = false;
        ball.velocity.normalize();
      }
    }

    if (ball.position.y > 12.0) {
      ball.position.y = 12.0;
      if (ball.velocity.y > 0) ball.velocity.y *= -0.5;
    }

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
        vfx.spawnShockwaveRing(_sweptResult.point, 0x8f887d, 2.0, _sweptResult.normal);
        gameEvents.emit('wall_hit', {
          position: _sweptResult.point,
          normal: _sweptResult.normal,
          speed: ball.speed,
        });
      }
    }

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

      vfx.spawnShockwaveRing(ball.position, 0x8f887d, 3.0, _wallNormal);
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

    ball.stasisTimer = 0;

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
      ball.isBuntLob = true;
      ball.buntGravity = 1.65;
      ball.speed = Math.max(INITIAL_BALL_SPEED * 0.8, ball.speed * 0.58);
      _launchDir.copy(fighter.aimDirection);
      _launchDir.y = 0.55;
      _launchDir.normalize();
      ball.velocity.copy(_launchDir);
      ball.curveAccel.set(0, 0, 0);

      vfx.spawnShockwaveRing(ball.position, batDef.primaryHex, 2.0);
      gameEvents.emit('bunt', {
        playerId: fighter.id,
        position: ball.position,
        newSpeed: ball.speed,
      });
      return;
    }

    ball.isBuntLob = false;
    let newSpeed = Math.min(MAX_BALL_SPEED, ball.speed * 1.075 + 1.25);

    if (isEmpowered) {
      fighter.supernovaTimer = 0;
      newSpeed = Math.min(MAX_BALL_SPEED, newSpeed * 1.55);
      vfx.spawnShockwaveRing(fighter.position, 0xb84a39, 6.0);
      vfx.spawnParticleBurst(fighter.position, 0xb84a39, 20, 11.0);

      for (let i = 0; i < fighters.length; i++) {
        const other = fighters[i];
        if (!other.alive || other.id === fighter.id) continue;
        const dist = other.position.distanceTo(fighter.position);
        if (dist <= 9.0) {
          _knockDir.subVectors(other.position, fighter.position).setY(0.25).normalize();
          other.velocity.addScaledVector(_knockDir, 14.0);
          other.isGrounded = false;
        }
      }
    }

    ball.speed = newSpeed;
    const mach = getMachFromSpeed(ball.speed);

    // Clean, horizontal aim & smooth curve control without erratic vertical spiking
    _launchDir.copy(fighter.aimDirection).setY(0);
    if (_launchDir.lengthSq() < 0.001) {
      _launchDir.set(-Math.sin(fighter.facingYaw), 0, -Math.cos(fighter.facingYaw));
    }
    _launchDir.normalize();
    ball.velocity.copy(_launchDir);

    const curveStrength = fighter.characterId === 'phantom' ? 3.4 : 2.5;
    ball.curveAccel.set(
      fighter.moveInputDir.x * curveStrength,
      0,
      fighter.moveInputDir.z * curveStrength
    );

    ball.position
      .set(fighter.position.x, fighter.position.y + 1.25, fighter.position.z)
      .addScaledVector(_launchDir, 1.35);
    ball.prevPosition.copy(ball.position);

    if (fighter.stealthNextParry) {
      fighter.stealthNextParry = false;
      ball.stealthActive = true;
      const targetEntity = this.findFighterById(fighters, nextTargetId);
      const flightDist = targetEntity
        ? ball.position.distanceTo(targetEntity.position)
        : 24.0;
      ball.stealthTotalDist = Math.max(10.0, flightDist);
      ball.stealthTraveledDist = 0;
    }

    vfx.spawnShockwaveRing(ball.position, batDef.primaryHex, 2.8);
    vfx.spawnParticleBurst(ball.position, batDef.sparkColorHex, 12, 7.0);

    // Zero hitstop freeze so ball path never lags or hitches on parry
    if (fighter.isHuman) {
      const machFactor = THREE.MathUtils.clamp((mach - 1.0) / 4.0, 0, 1);
      callbacks.onCameraParryPunch(machFactor * 0.45, _launchDir);
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
    _clashMidpoint.y += 1.25;

    const increment = (ball.speed * 0.08 + 1.25) * 2.0;
    ball.speed = Math.min(MAX_BALL_SPEED, ball.speed + increment);
    const mach = getMachFromSpeed(ball.speed);

    _knockDir.subVectors(fA.position, fB.position).setY(0).normalize();
    if (_knockDir.lengthSq() < 0.01) _knockDir.set(1, 0, 0);

    fA.velocity.copy(_knockDir).multiplyScalar(14.0);
    fA.velocity.y = 5.5;
    fA.isGrounded = false;

    fB.velocity.copy(_knockDir).multiplyScalar(-14.0);
    fB.velocity.y = 5.5;
    fB.isGrounded = false;

    ball.position.copy(_clashMidpoint);
    ball.prevPosition.copy(_clashMidpoint);
    ball.velocity.set((Math.random() - 0.5) * 0.8, 0.25, (Math.random() - 0.5) * 0.8).normalize();
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

    vfx.spawnShockwaveRing(_clashMidpoint, 0xc53030, 5.5);
    vfx.spawnParticleBurst(_clashMidpoint, 0xc53030, 24, 12.0);
    callbacks.onCameraParryPunch(0.6, ball.velocity);

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
