import { BAT_DEFINITIONS, BatId } from '../entities/bats';
import { CHARACTER_DEFINITIONS, CharacterId } from '../entities/characters';

const STORAGE_KEY = 'hyperblade.save.v1';

export interface SaveProfileData {
  coins: number;
  unlockedCharacters: CharacterId[];
  unlockedBats: BatId[];
  equippedCharacter: CharacterId;
  equippedBat: BatId;
  totalMatches: number;
  totalWins: number;
  totalParries: number;
  peakMach: number;
  gauntletBestParries: number;
}

const DEFAULT_SAVE: SaveProfileData = {
  coins: 250,
  unlockedCharacters: ['chrono'],
  unlockedBats: ['neon_katana'],
  equippedCharacter: 'chrono',
  equippedBat: 'neon_katana',
  totalMatches: 0,
  totalWins: 0,
  totalParries: 0,
  peakMach: 1.4,
  gauntletBestParries: 0,
};

export class ProgressionSystem {
  public data: SaveProfileData;

  constructor(unlockAllFlag = false) {
    this.data = this.load();
    if (unlockAllFlag) {
      this.unlockAll();
    }
  }

  private load(): SaveProfileData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SAVE };
      const parsed = JSON.parse(raw) as Partial<SaveProfileData>;
      return {
        coins: typeof parsed.coins === 'number' ? parsed.coins : DEFAULT_SAVE.coins,
        unlockedCharacters: Array.isArray(parsed.unlockedCharacters)
          ? parsed.unlockedCharacters
          : ['chrono'],
        unlockedBats: Array.isArray(parsed.unlockedBats)
          ? parsed.unlockedBats
          : ['neon_katana'],
        equippedCharacter: parsed.equippedCharacter || 'chrono',
        equippedBat: parsed.equippedBat || 'neon_katana',
        totalMatches: parsed.totalMatches || 0,
        totalWins: parsed.totalWins || 0,
        totalParries: parsed.totalParries || 0,
        peakMach: parsed.peakMach || 1.4,
        gauntletBestParries: parsed.gauntletBestParries || 0,
      };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  public save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota warnings
    }
  }

  public unlockAll(): void {
    this.data.unlockedCharacters = CHARACTER_DEFINITIONS.map((c) => c.id);
    this.data.unlockedBats = BAT_DEFINITIONS.map((b) => b.id);
    this.data.coins = Math.max(this.data.coins, 2500);
    this.save();
  }

  public isCharacterUnlocked(id: CharacterId): boolean {
    return this.data.unlockedCharacters.includes(id);
  }

  public isBatUnlocked(id: BatId): boolean {
    return this.data.unlockedBats.includes(id);
  }

  public unlockOrEquipCharacter(id: CharacterId): { success: boolean; message: string } {
    if (this.isCharacterUnlocked(id)) {
      this.data.equippedCharacter = id;
      this.save();
      return { success: true, message: 'EQUIPPED' };
    }

    const def = CHARACTER_DEFINITIONS.find((c) => c.id === id);
    if (!def) return { success: false, message: 'INVALID' };

    if (this.data.coins < def.cost) {
      return { success: false, message: `NEED ${def.cost - this.data.coins} MORE COINS` };
    }

    this.data.coins -= def.cost;
    this.data.unlockedCharacters.push(id);
    this.data.equippedCharacter = id;
    this.save();
    return { success: true, message: 'UNLOCKED & EQUIPPED' };
  }

  public unlockOrEquipBat(id: BatId): { success: boolean; message: string } {
    if (this.isBatUnlocked(id)) {
      this.data.equippedBat = id;
      this.save();
      return { success: true, message: 'EQUIPPED' };
    }

    const def = BAT_DEFINITIONS.find((b) => b.id === id);
    if (!def) return { success: false, message: 'INVALID' };

    if (this.data.coins < def.cost) {
      return { success: false, message: `NEED ${def.cost - this.data.coins} MORE COINS` };
    }

    this.data.coins -= def.cost;
    this.data.unlockedBats.push(id);
    this.data.equippedBat = id;
    this.save();
    return { success: true, message: 'UNLOCKED & EQUIPPED' };
  }

  public recordMatchReward(params: {
    won: boolean;
    parries: number;
    eliminations: number;
    peakMach: number;
    isGauntlet: boolean;
  }): number {
    const baseCoins = params.won ? 120 : 45;
    const parryBonus = params.parries * 8;
    const elimBonus = params.eliminations * 25;
    const speedBonus = Math.floor(params.peakMach * 12);
    const totalEarned = baseCoins + parryBonus + elimBonus + speedBonus;

    this.data.coins += totalEarned;
    this.data.totalMatches++;
    if (params.won) this.data.totalWins++;
    this.data.totalParries += params.parries;
    if (params.peakMach > this.data.peakMach) {
      this.data.peakMach = Number(params.peakMach.toFixed(2));
    }
    if (params.isGauntlet && params.parries > this.data.gauntletBestParries) {
      this.data.gauntletBestParries = params.parries;
    }

    this.save();
    return totalEarned;
  }
}
