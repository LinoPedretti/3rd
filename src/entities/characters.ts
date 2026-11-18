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
    name: 'TOKI',
    title: 'TIME KEEPER',
    accentHex: 0x2b547e,
    emissiveHex: 0x1a365d,
    cssColor: '#2b547e',
    cost: 0,
    passiveName: 'Focused Calm',
    passiveDesc: '+8% movement speed while the ball is targeting you.',
    abilityName: 'TIME FREEZE',
    abilityDesc:
      'Freezes the ball in mid-air for 1.5s inside a temporal ring while you reposition for a clean strike angle.',
    abilityCooldown: 10.0,
    speedMultiplier: 1.0,
    parryReachBonus: 0,
    dashCooldownBonus: 0,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'volt',
    name: 'KAZE',
    title: 'WIND STRIDER',
    accentHex: 0x2b7a78,
    emissiveHex: 0x1f5c5a,
    cssColor: '#2b7a78',
    cost: 0,
    passiveName: 'Swift Footwork',
    passiveDesc: '+10% base sprint speed and -0.25s Dodge cooldown.',
    abilityName: 'GALE STEP',
    abilityDesc:
      'Dashes 12m forward in an instant gust of wind, granting a 2.0s sprint boost and refreshing your Dodge.',
    abilityCooldown: 8.5,
    speedMultiplier: 1.1,
    parryReachBonus: 0,
    dashCooldownBonus: 0.25,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'titan',
    name: 'GORO',
    title: 'IRON CHAMPION',
    accentHex: 0xb84a39,
    emissiveHex: 0x8c3427,
    cssColor: '#b84a39',
    cost: 0,
    passiveName: 'Heavy Reach',
    passiveDesc: '+0.4m wider parry reach and knockback resistance.',
    abilityName: 'EARTH SHATTER',
    abilityDesc:
      'Empowers your weapon for 2.5s; your next parry launches the ball at 1.6x speed and knocks back nearby rivals.',
    abilityCooldown: 11.0,
    speedMultiplier: 0.96,
    parryReachBonus: 0.4,
    dashCooldownBonus: 0,
    dashIframeBonus: 0,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'phantom',
    name: 'KAGE',
    title: 'SHADOW ROGUE',
    accentHex: 0x5e4378,
    emissiveHex: 0x443059,
    cssColor: '#5e4378',
    cost: 0,
    passiveName: 'Evasive Step',
    passiveDesc: '+50ms Dodge invulnerability window and sharper curve control.',
    abilityName: 'MIRAGE FEINT',
    abilityDesc:
      'Sends a decoy runner in the opposite direction while masking the ball for the first 40% of its flight path.',
    abilityCooldown: 9.5,
    speedMultiplier: 1.04,
    parryReachBonus: 0,
    dashCooldownBonus: 0,
    dashIframeBonus: 0.05,
    whiffRecoveryMultiplier: 1.0,
  },
  {
    id: 'aegis',
    name: 'TATSU',
    title: 'TEMPLE WARDEN',
    accentHex: 0x2f6f4e,
    emissiveHex: 0x215239,
    cssColor: '#2f6f4e',
    cost: 0,
    passiveName: 'Poised Guard',
    passiveDesc: '-20% recovery cooldown on early swings.',
    abilityName: 'WARD BARRIER',
    abilityDesc:
      'Raises a protective ward sphere around your fighter for 1.2s that automatically deflects the incoming ball.',
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
