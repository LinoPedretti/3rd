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

/**
 * Per-character visual design: every fighter has its own palette, body build and outfit
 * so they are instantly recognisable on the court and in the character preview.
 */
export interface CharacterVisualStyle {
  outfitHex: number;
  limbHex: number;
  trimHex: number;
  skinHex: number;
  capeHex: number;
  /** Torso scale [x, y, z] — slim vs. broad builds. */
  torsoScale: [number, number, number];
  playstyle: string;
  lore: string;
}

export const CHARACTER_VISUALS: Record<CharacterId, CharacterVisualStyle> = {
  chrono: {
    outfitHex: 0x2b547e,
    limbHex: 0x1e2f45,
    trimHex: 0xc8a45d,
    skinHex: 0xe8cfb4,
    capeHex: 0x223f61,
    torsoScale: [1.0, 1.0, 1.0],
    playstyle: 'CONTROL',
    lore: 'A scholar-monk in a long navy robe and tall hat, carrying a brass astrolabe that bends time.',
  },
  volt: {
    outfitHex: 0x2b7a78,
    limbHex: 0x3d4b48,
    trimHex: 0xd4be94,
    skinHex: 0xd9b894,
    capeHex: 0xe8dcc0,
    torsoScale: [0.88, 1.0, 0.88],
    playstyle: 'SPEED',
    lore: 'A wandering ronin under a wide straw hat, trailing a long cream scarf in the wind.',
  },
  titan: {
    outfitHex: 0xa8432f,
    limbHex: 0x3a3a3f,
    trimHex: 0xc9a227,
    skinHex: 0xc99c78,
    capeHex: 0x6e2a20,
    torsoScale: [1.26, 1.05, 1.2],
    playstyle: 'POWER',
    lore: 'A towering samurai in lacquered red armour, horned kabuto and heavy shoulder plates.',
  },
  phantom: {
    outfitHex: 0x4a3560,
    limbHex: 0x1f1d24,
    trimHex: 0x8a8394,
    skinHex: 0xe3c7aa,
    capeHex: 0x2d2338,
    torsoScale: [0.85, 0.98, 0.85],
    playstyle: 'TRICKSTER',
    lore: 'A masked shinobi in a deep violet hood with twin kunai strapped across the back.',
  },
  aegis: {
    outfitHex: 0x2f6f4e,
    limbHex: 0x5b4a36,
    trimHex: 0xd6c7b2,
    skinHex: 0xb98a66,
    capeHex: 0x234f39,
    torsoScale: [1.14, 1.0, 1.14],
    playstyle: 'DEFENSE',
    lore: 'A temple guardian with a crested helm, bronze bracers and a round jade-emblem shield.',
  },
};

export function getCharacterVisuals(id: CharacterId): CharacterVisualStyle {
  return CHARACTER_VISUALS[id] || CHARACTER_VISUALS.chrono;
}
