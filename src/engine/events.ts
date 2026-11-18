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
    label: 'TIER 1 // KINETIC',
    minMach: 0,
    colorHex: 0x00e5ff,
    cssColor: '#00e5ff',
    emissiveHex: 0x0088cc,
    bloomStrength: 0.36,
  },
  {
    name: 'AMBER',
    label: 'TIER 2 // THERMAL',
    minMach: 2.0,
    colorHex: 0xffb300,
    cssColor: '#ffb300',
    emissiveHex: 0xcc7700,
    bloomStrength: 0.44,
  },
  {
    name: 'CRIMSON',
    label: 'TIER 3 // SUPERSONIC',
    minMach: 4.0,
    colorHex: 0xff1744,
    cssColor: '#ff1744',
    emissiveHex: 0xcc0033,
    bloomStrength: 0.52,
  },
  {
    name: 'ULTRAVIOLET',
    label: 'TIER 4 // HYPERSONIC',
    minMach: 6.0,
    colorHex: 0xb388ff,
    cssColor: '#b388ff',
    emissiveHex: 0x7c4dff,
    bloomStrength: 0.6,
  },
  {
    name: 'OVERDRIVE',
    label: 'TIER 5 // WHITE-HOT OVERDRIVE',
    minMach: 9.0,
    colorHex: 0xffffff,
    cssColor: '#ffffff',
    emissiveHex: 0x80f8ff,
    bloomStrength: 0.68,
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
