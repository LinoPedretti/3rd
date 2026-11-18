import * as THREE from 'three';

export type VelocityTierName = 'CYAN' | 'AMBER' | 'CRIMSON' | 'ULTRAVIOLET' | 'OVERDRIVE';

export interface VelocityTierInfo {
  name: VelocityTierName;
  label: string;
  minMach: number;
  colorHex: number;
  cssColor: string;
  emissiveHex: number;
  bloomStrength: number;
}

/**
 * 1 in-game Mach = 12 m/s simulation velocity, displayed as Mach * 1235 KM/H
 */
export const SIM_SPEED_PER_MACH = 12.0;
export const KMH_PER_MACH = 1235;

export const VELOCITY_TIERS: VelocityTierInfo[] = [
  {
    name: 'CYAN',
    label: 'PACE // STEADY',
    minMach: 0,
    colorHex: 0x2b6cb0,
    cssColor: '#2b6cb0',
    emissiveHex: 0x1e4e8c,
    bloomStrength: 0,
  },
  {
    name: 'AMBER',
    label: 'PACE // BRISK',
    minMach: 2.0,
    colorHex: 0xc05621,
    cssColor: '#c05621',
    emissiveHex: 0x9c4221,
    bloomStrength: 0,
  },
  {
    name: 'CRIMSON',
    label: 'PACE // SWIFT',
    minMach: 4.0,
    colorHex: 0xc53030,
    cssColor: '#c53030',
    emissiveHex: 0x9b2c2c,
    bloomStrength: 0,
  },
  {
    name: 'ULTRAVIOLET',
    label: 'PACE // FIERCE',
    minMach: 6.0,
    colorHex: 0x6b46c1,
    cssColor: '#6b46c1',
    emissiveHex: 0x553c9a,
    bloomStrength: 0,
  },
  {
    name: 'OVERDRIVE',
    label: 'PACE // MAXIMUM',
    minMach: 9.0,
    colorHex: 0x1a202c,
    cssColor: '#1a202c',
    emissiveHex: 0xc53030,
    bloomStrength: 0,
  },
];

export function getVelocityTier(speed: number): VelocityTierInfo {
  const mach = speed / SIM_SPEED_PER_MACH;
  let current = VELOCITY_TIERS[0];
  for (let i = 0; i < VELOCITY_TIERS.length; i++) {
    if (mach >= VELOCITY_TIERS[i].minMach) {
      current = VELOCITY_TIERS[i];
    }
  }
  return current;
}

export function getMachFromSpeed(speed: number): number {
  return speed / SIM_SPEED_PER_MACH;
}

export function getKmhFromSpeed(speed: number): number {
  return Math.round(getMachFromSpeed(speed) * KMH_PER_MACH);
}

export interface GameEventMap {
  parry: {
    playerId: string;
    position: THREE.Vector3;
    direction: THREE.Vector3;
    newSpeed: number;
    mach: number;
    batId: string;
    isEmpowered: boolean;
    isAutoDeflect: boolean;
  };
  bunt: {
    playerId: string;
    position: THREE.Vector3;
    newSpeed: number;
  };
  clash: {
    position: THREE.Vector3;
    newSpeed: number;
    mach: number;
    fighterIds: [string, string];
  };
  wall_hit: {
    position: THREE.Vector3;
    normal: THREE.Vector3;
    speed: number;
  };
  elimination: {
    victimId: string;
    victimName: string;
    attackerId: string | null;
    attackerName: string;
    position: THREE.Vector3;
    speed: number;
  };
  ability_cast: {
    playerId: string;
    characterId: string;
    abilityName: string;
    position: THREE.Vector3;
    targetPos?: THREE.Vector3;
  };
  dash: {
    playerId: string;
    position: THREE.Vector3;
    direction: THREE.Vector3;
    colorHex: number;
  };
  jump: {
    playerId: string;
    position: THREE.Vector3;
    isDoubleJump: boolean;
  };
  whiff: {
    playerId: string;
    position: THREE.Vector3;
  };
  round_start: {
    roundNumber: number;
  };
  round_end: {
    winnerId: string | null;
    winnerName: string;
  };
}

type Listener<T> = (payload: T) => void;

export class EventBus {
  private listeners: { [K in keyof GameEventMap]?: Listener<GameEventMap[K]>[] } = {};

  public on<K extends keyof GameEventMap>(event: K, fn: Listener<GameEventMap[K]>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(fn);
  }

  public emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      list[i](payload);
    }
  }
}

export const gameEvents = new EventBus();

export interface UrlFlags {
  debug: boolean;
  autoplay: boolean;
  unlockall: boolean;
}

export function getUrlFlags(): UrlFlags {
  const params = new URLSearchParams(window.location.search);
  return {
    debug: params.get('debug') === '1',
    autoplay: params.get('autoplay') === '1',
    unlockall: params.get('unlockall') === '1',
  };
}
