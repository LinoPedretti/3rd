import { BAT_DEFINITIONS, BatId } from '../entities/bats';
import { CHARACTER_DEFINITIONS, CharacterId } from '../entities/characters';

const STORAGE_KEY = 'hyperblade.save.v2';

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

const ALL_CHARS: CharacterId[] = CHARACTER_DEFINITIONS.map((c) => c.id);
const ALL_BATS: BatId[] = BAT_DEFINITIONS.map((b) => b.id);

const DEFAULT_SAVE: SaveProfileData = {
  coins: 500,
  unlockedCharacters: [...ALL_CHARS],
  unlockedBats: [...ALL_BATS],
  equippedCharacter: 'chrono',
  equippedBat: 'neon_katana',
  totalMatches: 0,
  totalWins: 0,
  totalParries: 0,
  peakMach: 1.46,
  gauntletBestParries: 0,
};

export class ProgressionSystem {
  public data: SaveProfileData;

  constructor(_unlockAllFlag = false) {
    this.data = this.load();
    // Ensure all 5 characters & 4 weapons are always selectable before entering a game
    this.unlockAll();
  }

  private load(): SaveProfileData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SAVE };
      const parsed = JSON.parse(raw) as Partial<SaveProfileData>;
      return {
        coins: typeof parsed.coins === 'number' ? parsed.coins : DEFAULT_SAVE.coins,
        unlockedCharacters: [...ALL_CHARS],
        unlockedBats: [...ALL_BATS],
        equippedCharacter: parsed.equippedCharacter || 'chrono',
        equippedBat: parsed.equippedBat || 'neon_katana',
        totalMatches: parsed.totalMatches || 0,
        totalWins: parsed.totalWins || 0,
        totalParries: parsed.totalParries || 0,
        peakMach: parsed.peakMach || 1.46,
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
    this.data.unlockedCharacters = [...ALL_CHARS];
    this.data.unlockedBats = [...ALL_BATS];
    this.save();
  }

  public isCharacterUnlocked(_id: CharacterId): boolean {
    return true;
  }

  public isBatUnlocked(_id: BatId): boolean {
    return true;
  }

  public unlockOrEquipCharacter(id: CharacterId): { success: boolean; message: string } {
    this.data.equippedCharacter = id;
    this.save();
    return { success: true, message: 'CHARACTER SELECTED' };
  }

  public unlockOrEquipBat(id: BatId): { success: boolean; message: string } {
    this.data.equippedBat = id;
    this.save();
    return { success: true, message: 'WEAPON SELECTED' };
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
