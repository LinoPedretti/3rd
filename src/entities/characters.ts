export type CharacterId = 'chrono' | 'volt' | 'titan' | 'phantom' | 'aegis';

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  title: string;
  accentHex: number;
  emissiveHex: number;
  cssColor: string;
  cost: number;
  passiveName: string;
  passiveDesc: string;
  abilityName: string;
  abilityDesc: string;
  abilityCooldown: number;
  speedMultiplier: number;
  parryReachBonus: number;
  dashCooldownBonus: number;
  dashIframeBonus: number;
  whiffRecoveryMultiplier: number;
}

export const CHARACTER_DEFINITIONS: CharacterDefinition[] = [
  {
    id: 'chrono',
    name: 'CHRONO',
    title: 'TIME WEAVER',
    accentHex: 0x00e5ff,
    emissiveHex: 0x00b8d4,
    cssColor: '#00e5ff',
    cost: 0,
    passiveName: 'Chrono Reflex',
    passiveDesc: '+8% sprint agility while the ball is locked onto you.',
    abilityName: 'TEMPORAL STASIS',
    abilityDesc:
      'Spawns a glowing cyan 3D geodesic dome around the ball, freezing it in mid-air for 1.5s while you reposition for a lethal 3D curve angle.',
    abilityCooldown: 10.0,
    speedMultiplier: 1.0,
    parryReachBonus: 0,
    dashCooldownBonus: 0,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'volt',
    name: 'VOLT',
    title: 'HYPER SPEEDSTER',
    accentHex: 0xffea00,
    emissiveHex: 0xffc400,
    cssColor: '#ffea00',
    cost: 200,
    passiveName: 'Hyper Capacitor',
    passiveDesc: '+10% base sprint speed and -0.25s Dodge Dash cooldown.',
    abilityName: 'OVERDRIVE BLINK',
    abilityDesc:
      'Teleports 12m forward in your look/move direction with a 3D jagged lightning bolt mesh, granting a 2.0s speed boost and resetting Dodge Dash.',
    abilityCooldown: 8.5,
    speedMultiplier: 1.1,
    parryReachBonus: 0,
    dashCooldownBonus: 0.25,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'titan',
    name: 'TITAN',
    title: 'HEAVY JUGGERNAUT',
    accentHex: 0xff6d00,
    emissiveHex: 0xff3d00,
    cssColor: '#ff6d00',
    cost: 350,
    passiveName: 'Colossus Reach',
    passiveDesc: '+0.4m wider parry cone reach and heavy knockback resistance.',
    abilityName: 'SUPERNOVA SMASH',
    abilityDesc:
      'Empowers your blade with molten gold energy for 2.5s; your next parry launches the ball at 1.6x velocity with a radial 3D shockwave ring that knocks back nearby enemies.',
    abilityCooldown: 11.0,
    speedMultiplier: 0.96,
    parryReachBonus: 0.4,
    dashCooldownBonus: 0,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'phantom',
    name: 'PHANTOM',
    title: 'VOID TRICKSTER',
    accentHex: 0xd500f9,
    emissiveHex: 0xaa00ff,
    cssColor: '#d500f9',
    cost: 450,
    passiveName: 'Phase Stride',
    passiveDesc: '+50ms Dodge Dash invulnerability window and sharper curve angles.',
    abilityName: 'SHADOW DECOY & STEALTH CURVE',
    abilityDesc:
      'Spawns a running 3D holographic decoy in the opposite direction while cloaking the ball translucent for the first 40% of its 3D flight path.',
    abilityCooldown: 9.5,
    speedMultiplier: 1.04,
    parryReachBonus: 0,
    dashCooldownBonus: 0,
    dashIframeBonus: 0.05,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'aegis',
    name: 'AEGIS',
    title: 'KINETIC BASTION',
    accentHex: 0x00e676,
    emissiveHex: 0x00c853,
    cssColor: '#00e676',
    cost: 600,
    passiveName: 'Guardian Core',
    passiveDesc: '-20% whiff recovery cooldown on early swings.',
    abilityName: 'KINETIC DOME',
    abilityDesc:
      'Projects a spinning hexagonal 3D energy shield sphere around your fighter for 1.2s that automatically deflects the incoming ball cleanly.',
    abilityCooldown: 14.0,
    speedMultiplier: 1.0,
    parryReachBonus: 0.15,
    dashCooldownBonus: 0,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 0.8,
  },
];

export function getCharacterDefinition(id: CharacterId): CharacterDefinition {
  return CHARACTER_DEFINITIONS.find((c) => c.id === id) || CHARACTER_DEFINITIONS[0];
}
