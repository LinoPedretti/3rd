import * as THREE from 'three';
import { PlayerFighter } from '../entities/player';
import { PlasmaBall } from '../entities/ball';
import { tryActivateCharacterAbility } from '../entities/abilities';
import { CylinderObstacle } from '../engine/physics';
import { getMachFromSpeed } from '../engine/events';
import { VFXSystem } from './vfx';

export type AIDifficultyId = 'rookie' | 'contender' | 'veteran' | 'grandmaster';

export interface AIDifficultyTier {
  id: AIDifficultyId;
  name: string;
  reactionDelaySec: number; // 240ms, 150ms, 95ms, 55ms
  earlySwingChance: number;
  buntChanceHighSpeed: number;
  useAbilities: boolean;
  useDashSpacing: boolean;
  aggressiveBaiting: boolean;
  curveStrength: number;
}

export const AI_DIFFICULTY_TIERS: AIDifficultyTier[] = [
  {
    id: 'rookie',
    name: 'ROOKIE (240ms)',
    reactionDelaySec: 0.24,
    earlySwingChance: 0.22,
    buntChanceHighSpeed: 0.0,
    useAbilities: false,
    useDashSpacing: false,
    aggressiveBaiting: false,
    curveStrength: 0.25,
  },
  {
    id: 'contender',
    name: 'CONTENDER (150ms)',
    reactionDelaySec: 0.15,
    earlySwingChance: 0.09,
    buntChanceHighSpeed: 0.08,
    useAbilities: true,
    useDashSpacing: true,
    aggressiveBaiting: false,
    curveStrength: 0.55,
  },
  {
    id: 'veteran',
    name: 'VETERAN (95ms)',
    reactionDelaySec: 0.095,
    earlySwingChance: 0.03,
    buntChanceHighSpeed: 0.18,
    useAbilities: true,
    useDashSpacing: true,
    aggressiveBaiting: true,
    curveStrength: 0.85,
  },
  {
    id: 'grandmaster',
    name: 'GRANDMASTER (55ms)',
    reactionDelaySec: 0.055,
    earlySwingChance: 0.0,
    buntChanceHighSpeed: 0.34,
    useAbilities: true,
    useDashSpacing: true,
    aggressiveBaiting: true,
    curveStrength: 1.0,
  },
];

export function getAIDifficultyTier(id: AIDifficultyId): AIDifficultyTier {
  return AI_DIFFICULTY_TIERS.find((t) => t.id === id) || AI_DIFFICULTY_TIERS[1];
}

interface BotBrainState {
  strafeSign: number;
  strafeSwitchTimer: number;
  decisionCooldown: number;
  curveYawOffset: number;
  curvePitchOffset: number;
}

export class AISystem {
  private readonly brains: Map<string, BotBrainState> = new Map();

  private readonly _moveDir = new THREE.Vector3();
  private readonly _aimDir = new THREE.Vector3();
  private readonly _toBall = new THREE.Vector3();
  private readonly _toOpponent = new THREE.Vector3();
  private readonly _avoid = new THREE.Vector3();

  public updateBot(
    dt: number,
    simClock: number,
    bot: PlayerFighter,
    tierId: AIDifficultyId,
    ball: PlasmaBall,
    fighters: PlayerFighter[],
    arenaRadius: number,
    obstacles: CylinderObstacle[],
    vfx: VFXSystem,
    outMoveDir: THREE.Vector3,
    outAimDir: THREE.Vector3
  ): void {
    if (!bot.alive) {
      outMoveDir.set(0, 0, 0);
      return;
    }

    const tier = getAIDifficultyTier(tierId);
    let brain = this.brains.get(bot.id);
    if (!brain) {
      brain = {
        strafeSign: Math.random() < 0.5 ? -1 : 1,
        strafeSwitchTimer: 1.2 + Math.random() * 1.5,
        decisionCooldown: 0,
        curveYawOffset: 0,
        curvePitchOffset: 0.15,
      };
      this.brains.set(bot.id, brain);
    }

    brain.strafeSwitchTimer -= dt;
    if (brain.strafeSwitchTimer <= 0) {
      brain.strafeSign *= -1;
      brain.strafeSwitchTimer = 1.0 + Math.random() * 1.6;
      brain.curveYawOffset = (Math.random() - 0.5) * 0.85 * tier.curveStrength;
      brain.curvePitchOffset = (0.1 + (Math.random() - 0.35) * 0.55) * tier.curveStrength;
    }
    if (brain.decisionCooldown > 0) {
      brain.decisionCooldown = Math.max(0, brain.decisionCooldown - dt);
    }

    // Delayed perception of the ball based on difficulty tier reaction window!
    const perceived = ball.getDelayedSample(simClock, tier.reactionDelaySec);
    const isTargeted = perceived.targetId === bot.id || ball.targetId === bot.id;

    // Pick closest living opponent to face/pressure
    let nearestOpponent: PlayerFighter | null = null;
    let nearestOppDist = Infinity;
    for (let i = 0; i < fighters.length; i++) {
      const other = fighters[i];
      if (!other.alive || other.id === bot.id) continue;
      const d = bot.position.distanceTo(other.position);
      if (d < nearestOppDist) {
        nearestOppDist = d;
        nearestOpponent = other;
      }
    }

    this._toBall.subVectors(perceived.position, bot.position);
    const distToBall = this._toBall.length() || 1;
    const mach = getMachFromSpeed(perceived.speed);

    // 1. Steering Movement
    this._moveDir.set(0, 0, 0);

    if (ball.stasisTimer > 0 && distToBall < 14.0) {
      // Sprint toward frozen ball during Chrono Temporal Stasis to shatter it
      this._moveDir.copy(this._toBall).setY(0).normalize();
    } else if (isTargeted) {
      // Orbit & spacing based on ball speed
      const tangentX = -this._toBall.z / distToBall;
      const tangentZ = this._toBall.x / distToBall;
      this._moveDir.set(tangentX * brain.strafeSign, 0, tangentZ * brain.strafeSign);

      if (distToBall < 8.5 && mach > 1.8) {
        // Backpedal / create spacing as ball speed climbs
        this._moveDir.addScaledVector(this._toBall, -0.85 / distToBall);
      }
    } else if (nearestOpponent) {
      this._toOpponent.subVectors(nearestOpponent.position, bot.position);
      const desiredDist = tier.aggressiveBaiting ? 6.8 : 11.5;
      const radialPush = (nearestOppDist - desiredDist) * 0.25;
      const tangentX = -this._toOpponent.z / (nearestOppDist || 1);
      const tangentZ = this._toOpponent.x / (nearestOppDist || 1);

      this._moveDir.set(
        (this._toOpponent.x / (nearestOppDist || 1)) * radialPush + tangentX * brain.strafeSign,
        0,
        (this._toOpponent.z / (nearestOppDist || 1)) * radialPush + tangentZ * brain.strafeSign
      );
    }

    // Obstacle & Outer Rim Avoidance steering
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      this._avoid.subVectors(bot.position, obs.position).setY(0);
      const d = this._avoid.length();
      if (d < obs.radius + 2.6 && d > 0.001) {
        this._moveDir.addScaledVector(this._avoid.normalize(), 1.8);
      }
    }

    const rFromCenter = Math.hypot(bot.position.x, bot.position.z);
    if (rFromCenter > arenaRadius - 3.4 && rFromCenter > 0.01) {
      this._moveDir.x -= (bot.position.x / rFromCenter) * 1.75;
      this._moveDir.z -= (bot.position.z / rFromCenter) * 1.75;
    }

    if (this._moveDir.lengthSq() > 0.001) {
      this._moveDir.normalize();
    }
    outMoveDir.copy(this._moveDir);

    // 2. Aiming & 3D Curve Shot Orientation
    if (nearestOpponent) {
      this._toOpponent.subVectors(nearestOpponent.position, bot.position).normalize();
      const baseYaw = Math.atan2(-this._toOpponent.x, -this._toOpponent.z) + brain.curveYawOffset;
      const pitch = brain.curvePitchOffset;
      const cosP = Math.cos(pitch);
      this._aimDir
        .set(-Math.sin(baseYaw) * cosP, Math.sin(pitch), -Math.cos(baseYaw) * cosP)
        .normalize();
    } else {
      this._aimDir.copy(this._toBall).normalize();
    }
    outAimDir.copy(this._aimDir);

    // 3. Jump over low sweeps or onto elevated pads (Veteran / Grandmaster)
    if (
      tier.id !== 'rookie' &&
      isTargeted &&
      distToBall < 7.5 &&
      perceived.position.y > bot.position.y + 2.2 &&
      bot.isGrounded
    ) {
      bot.tryJump();
    }

    // 4. Dodge Dash Spacing / Aggressive Baiting
    if (tier.useDashSpacing && bot.dashCooldown <= 0) {
      if (isTargeted && mach >= 2.5 && distToBall > 6.5 && distToBall < 12.5) {
        bot.tryDash(outMoveDir);
      } else if (
        tier.aggressiveBaiting &&
        !isTargeted &&
        nearestOpponent &&
        nearestOppDist > 9.5 &&
        nearestOppDist < 15.0 &&
        Math.random() < 0.02
      ) {
        bot.tryDash(this._toOpponent);
      }
    }

    // 5. Smart Character Ability Usage
    if (tier.useAbilities && bot.abilityCooldown <= 0 && brain.decisionCooldown <= 0) {
      let shouldCast = false;
      if (bot.characterId === 'chrono' && isTargeted && distToBall < 7.0 && mach >= 2.2) {
        shouldCast = true;
      } else if (bot.characterId === 'aegis' && isTargeted && distToBall < 5.5 && mach >= 2.4) {
        shouldCast = true;
      } else if (bot.characterId === 'titan' && isTargeted && distToBall < 9.0) {
        shouldCast = true;
      } else if (bot.characterId === 'phantom' && isTargeted && distToBall < 8.5) {
        shouldCast = true;
      } else if (bot.characterId === 'volt' && distToBall > 9.0 && Math.random() < 0.04) {
        shouldCast = true;
      }

      if (shouldCast) {
        tryActivateCharacterAbility(bot, ball, arenaRadius, vfx);
        brain.decisionCooldown = 0.5;
      }
    }

    // 6. Parry & Deceptive Bunt Timing
    const realDistToBall = bot.position.distanceTo(ball.position);
    const reach = bot.getParryReach();
    const ballIsComingAtMe =
      ball.targetId === bot.id &&
      ball.lastHitterId !== bot.id &&
      ball.velocity.x * (bot.position.x - ball.position.x) +
        ball.velocity.z * (bot.position.z - ball.position.z) >
        0;

    // Rookie/Contender occasional early panic swing on fast rallies
    if (
      ballIsComingAtMe &&
      tier.earlySwingChance > 0 &&
      mach >= 2.2 &&
      distToBall > reach + 1.8 &&
      distToBall < reach + 4.4 &&
      brain.decisionCooldown <= 0
    ) {
      if (Math.random() < tier.earlySwingChance * dt * 8) {
        bot.tryParry(false, simClock);
        brain.decisionCooldown = 0.65;
        return;
      }
    }

    // Optimal parry window check using perceived distance + reaction projection.
    // Bots only swing when the ball is genuinely coming at them (targeted, not their own outgoing
    // shot, and moving toward them) so they no longer flail at the ball repeatedly.
    const timeToImpact = distToBall / Math.max(10, perceived.speed);
    const triggerThreshold = reach + Math.min(2.2, perceived.speed * 0.042);

    if (
      ballIsComingAtMe &&
      brain.decisionCooldown <= 0 &&
      (distToBall <= triggerThreshold || realDistToBall <= reach || timeToImpact <= 0.095)
    ) {
      // Grandmaster / Veteran deceptive bunt lobs after Mach-3+ rallies
      const useDeceptiveBunt =
        mach >= 3.0 && Math.random() < tier.buntChanceHighSpeed;
      if (bot.tryParry(useDeceptiveBunt, simClock)) {
        brain.decisionCooldown = 0.42;
      }
    }
  }
}
