import * as THREE from 'three';
import { PlayerFighter } from './player';
import { PlasmaBall } from './ball';
import { gameEvents } from '../engine/events';

export interface AbilityVFXEmitter {
  spawnShockwaveRing(
    pos: THREE.Vector3,
    colorHex: number,
    maxRadius?: number,
    normal?: THREE.Vector3
  ): void;
  spawnParticleBurst(
    pos: THREE.Vector3,
    colorHex: number,
    count: number,
    speedScale?: number
  ): void;
  spawnLightningBolt(start: THREE.Vector3, end: THREE.Vector3, colorHex: number): void;
  spawnRunningDecoy(pos: THREE.Vector3, dir: THREE.Vector3, colorHex: number): void;
}

const _blinkDir = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _endPos = new THREE.Vector3();
const _decoyDir = new THREE.Vector3();

/**
 * Executes a fighter's active Q ability.
 * - CHRONO: Temporal Stasis (1.5s ball freeze inside cyan geodesic dome)
 * - VOLT: Overdrive Blink (12m forward teleport + jagged 3D lightning bolt + 2.0s speed boost + dash reset)
 * - TITAN: Supernova Smash (2.5s molten gold blade empowerment; next parry 1.6x speed + radial knockback ring)
 * - PHANTOM: Shadow Decoy & Stealth Curve (spawns running 3D holographic decoy in opposite direction + stealths ball for 40% flight)
 * - AEGIS: Kinetic Dome (1.2s spinning hexagonal 3D energy shield sphere that auto-deflects ball)
 */
export function tryActivateCharacterAbility(
  fighter: PlayerFighter,
  ball: PlasmaBall,
  arenaRadius: number,
  vfx: AbilityVFXEmitter
): boolean {
  if (!fighter.alive || fighter.abilityCooldown > 0) return false;

  fighter.abilityCooldown = fighter.characterDef.abilityCooldown;

  switch (fighter.characterId) {
    case 'chrono': {
      // Temporal Stasis: freezes ball in mid-air for 1.5s inside cyan geodesic dome
      ball.stasisTimer = 1.5;
      vfx.spawnShockwaveRing(ball.position, 0x00e5ff, 3.8);
      gameEvents.emit('ability_cast', {
        playerId: fighter.id,
        characterId: 'chrono',
        abilityName: fighter.characterDef.abilityName,
        position: ball.position,
      });
      return true;
    }

    case 'volt': {
      // Overdrive Blink: teleports 12m forward in camera/movement direction
      _startPos.copy(fighter.position);
      if (fighter.moveInputDir.lengthSq() > 0.05) {
        _blinkDir.copy(fighter.moveInputDir).setY(0).normalize();
      } else {
        _blinkDir.copy(fighter.aimDirection).setY(0).normalize();
      }

      _endPos.copy(fighter.position).addScaledVector(_blinkDir, 12.0);
      const maxR = arenaRadius - fighter.radius - 0.5;
      const rDist = Math.hypot(_endPos.x, _endPos.z);
      if (rDist > maxR && rDist > 0.001) {
        _endPos.x = (_endPos.x / rDist) * maxR;
        _endPos.z = (_endPos.z / rDist) * maxR;
      }

      fighter.position.copy(_endPos);
      fighter.speedBoostTimer = 2.0; // 2.0s speed boost
      fighter.dashCooldown = 0; // Reset Dodge Dash
      fighter.iframeTimer = Math.max(fighter.iframeTimer, 0.22);

      // Spawn 3D jagged lightning bolt mesh connecting start-to-end
      vfx.spawnLightningBolt(_startPos, _endPos, 0xffea00);
      vfx.spawnShockwaveRing(_endPos, 0xffea00, 2.8);

      gameEvents.emit('ability_cast', {
        playerId: fighter.id,
        characterId: 'volt',
        abilityName: fighter.characterDef.abilityName,
        position: fighter.position,
        targetPos: _startPos,
      });
      return true;
    }

    case 'titan': {
      // Supernova Smash: empowers blade with molten gold energy for 2.5s
      fighter.supernovaTimer = 2.5;
      vfx.spawnShockwaveRing(fighter.position, 0xffab00, 3.4);
      vfx.spawnParticleBurst(fighter.position, 0xffab00, 22, 9.0);

      gameEvents.emit('ability_cast', {
        playerId: fighter.id,
        characterId: 'titan',
        abilityName: fighter.characterDef.abilityName,
        position: fighter.position,
      });
      return true;
    }

    case 'phantom': {
      // Shadow Decoy & Stealth Curve
      if (fighter.moveInputDir.lengthSq() > 0.05) {
        _decoyDir.copy(fighter.moveInputDir).negate().setY(0).normalize();
      } else {
        _decoyDir.set(Math.sin(fighter.facingYaw), 0, Math.cos(fighter.facingYaw)).normalize();
      }

      // Spawn running 3D holographic decoy in opposite direction
      vfx.spawnRunningDecoy(fighter.position, _decoyDir, fighter.characterDef.accentHex);

      // Prime stealth curve (or immediately cloak ball if already in flight)
      fighter.stealthNextParry = true;
      ball.stealthActive = true;
      ball.stealthTotalDist = 18.0;
      ball.stealthTraveledDist = 0;

      vfx.spawnShockwaveRing(fighter.position, 0xd500f9, 2.6);

      gameEvents.emit('ability_cast', {
        playerId: fighter.id,
        characterId: 'phantom',
        abilityName: fighter.characterDef.abilityName,
        position: fighter.position,
      });
      return true;
    }

    case 'aegis': {
      // Kinetic Dome: spinning hexagonal 3D energy shield sphere for 1.2s
      fighter.kineticDomeTimer = 1.2;
      vfx.spawnShockwaveRing(fighter.position, 0x00e676, 3.2);

      gameEvents.emit('ability_cast', {
        playerId: fighter.id,
        characterId: 'aegis',
        abilityName: fighter.characterDef.abilityName,
        position: fighter.position,
      });
      return true;
    }
  }
}
