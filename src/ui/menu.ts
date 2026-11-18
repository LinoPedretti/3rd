import { BAT_DEFINITIONS, BatId } from '../entities/bats';
import {
  CHARACTER_DEFINITIONS,
  CharacterId,
  getCharacterVisuals,
} from '../entities/characters';
import { AI_DIFFICULTY_TIERS, AIDifficultyId } from '../systems/ai';
import { ARENA_DEFINITIONS, ArenaId } from '../systems/arenas';
import { GameModeId, MatchSummaryStats } from '../systems/match';
import { ProgressionSystem } from '../systems/progression';

export type MenuTab = 'PLAY' | 'CHARACTERS' | 'ARENAS';

export interface MenuCallbacks {
  onStartMatch: (mode: GameModeId, arena: ArenaId, difficulty: AIDifficultyId) => void;
  onLoadoutChanged: (characterId: CharacterId, batId: BatId) => void;
  onArenaPreviewChanged?: (arena: ArenaId) => void;
  onMenuTabChanged?: (tab: MenuTab) => void;
  onPreviewSlash?: () => void;
  onReturnToShowcase: () => void;
}

export class MenuUI {
  private readonly root: HTMLElement;
  public selectedMode: GameModeId = 'duel_1v1';
  public selectedArena: ArenaId = 'twin_pillars';
  public selectedDifficulty: AIDifficultyId = 'contender';
  public activeTab: MenuTab = 'PLAY';

  constructor(
    root: HTMLElement,
    private readonly progression: ProgressionSystem,
    private readonly callbacks: MenuCallbacks
  ) {
    this.root = root;
    this.renderMainMenu();
  }

  public setActiveTab(tab: MenuTab): void {
    if (this.activeTab !== tab) {
      this.activeTab = tab;
      if (this.callbacks.onMenuTabChanged) {
        this.callbacks.onMenuTabChanged(tab);
      }
    }
    this.renderMainMenu();
  }

  public hide(): void {
    this.root.innerHTML = '';
  }

  public renderMainMenu(): void {
    const save = this.progression.data;

    let tabBody = '';
    if (this.activeTab === 'PLAY') {
      tabBody = this.renderPlayTab();
    } else if (this.activeTab === 'CHARACTERS') {
      tabBody = this.renderCharactersTab();
    } else {
      tabBody = this.renderArenasTab();
    }

    const previewBadge =
      this.activeTab === 'CHARACTERS'
        ? `<div class="preview-hint-pill">3D CHARACTER STUDIO // LIVE TURNTABLE PREVIEW</div>`
        : '';

    this.root.innerHTML = `
      <div class="menu-overlay">
        <div class="menu-top-nav">
          <div>
            <div class="brand-title">BLADE COURTYARD 3D</div>
            <div class="brand-subtitle">MARTIAL PARRY ARENA</div>
          </div>

          <div class="menu-tab-bar">
            <button class="menu-tab-btn ${this.activeTab === 'PLAY' ? 'active' : ''}" data-menu-tab="PLAY">
              1. PLAY
            </button>
            <button class="menu-tab-btn ${this.activeTab === 'CHARACTERS' ? 'active' : ''}" data-menu-tab="CHARACTERS">
              2. CHARACTERS (PREVIEW)
            </button>
            <button class="menu-tab-btn ${this.activeTab === 'ARENAS' ? 'active' : ''}" data-menu-tab="ARENAS">
              3. ARENAS (5 MAPS)
            </button>
          </div>

          <div class="profile-coins-pill">
            <span>WINS: ${save.totalWins}</span>
            <span style="color:#cbd5e0;">PARRIES: ${save.totalParries}</span>
            <span style="color:#f6ad55;">PEAK: MACH ${save.peakMach.toFixed(2)}</span>
          </div>
        </div>

        <div class="menu-content-area">
          ${tabBody}
        </div>

        <div class="menu-footer-controls">
          CONTROLS: <strong>WASD</strong> Move &amp; Curve · <strong>Mouse</strong> Look · <strong>Left Click / F</strong> Parry · <strong>E</strong> Lob · <strong>Shift / RMB</strong> Dodge · <strong>Space</strong> Double Jump · <strong>Q</strong> Character Ability
        </div>

        ${previewBadge}
      </div>
    `;

    this.bindMainMenuEvents();
  }

  private renderPlayTab(): string {
    const save = this.progression.data;
    const charDef =
      CHARACTER_DEFINITIONS.find((c) => c.id === save.equippedCharacter) ||
      CHARACTER_DEFINITIONS[0];
    const batDef =
      BAT_DEFINITIONS.find((b) => b.id === save.equippedBat) || BAT_DEFINITIONS[0];
    const arenaDef =
      ARENA_DEFINITIONS.find((a) => a.id === this.selectedArena) || ARENA_DEFINITIONS[0];

    const modeOptions: Array<{ id: GameModeId; title: string; desc: string }> = [
      {
        id: 'duel_1v1',
        title: '1V1 DUEL (VS BOT)',
        desc: 'Head-to-head parry duel. First to 3 round wins.',
      },
      {
        id: 'ffa_4p',
        title: '4-PLAYER FREE-FOR-ALL',
        desc: '4 fighters enter the arena. Last survivor wins the round.',
      },
      {
        id: 'endless_gauntlet',
        title: 'ENDLESS SPEED GAUNTLET',
        desc: 'Solo survival rally testing your reflexes as speed escalates.',
      },
    ];

    return `
      <div class="menu-left-panel">
        <div class="panel-heading">READY LOADOUT &amp; MAP</div>
        <div class="summary-card">
          <div class="summary-row">
            <div>
              <div class="summary-label">CHARACTER &amp; WEAPON</div>
              <div class="summary-value">${charDef.name} · ${batDef.name}</div>
              <div class="summary-sub">[Q] ${charDef.abilityName}</div>
            </div>
            <button class="btn-inline-link" data-jump-tab="CHARACTERS">Change &amp; Preview →</button>
          </div>
          <div class="summary-row" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
            <div>
              <div class="summary-label">ARENA MAP</div>
              <div class="summary-value">${arenaDef.name}</div>
              <div class="summary-sub">${arenaDef.subtitle}</div>
            </div>
            <button class="btn-inline-link" data-jump-tab="ARENAS">Change Map →</button>
          </div>
        </div>

        <div class="selector-group">
          <div class="panel-heading">GAME MODE</div>
          <div class="selector-options">
            ${modeOptions
              .map(
                (m) => `
              <button class="option-btn ${this.selectedMode === m.id ? 'selected' : ''}" data-mode="${m.id}">
                <span class="option-btn-title">${m.title}</span>
                <span class="option-btn-desc">${m.desc}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="selector-group">
          <div class="panel-heading">BOT DIFFICULTY</div>
          <div class="selector-options row-2">
            ${AI_DIFFICULTY_TIERS.map(
              (d) => `
              <button class="option-btn ${this.selectedDifficulty === d.id ? 'selected' : ''}" data-diff="${d.id}">
                <span class="option-btn-title">${d.name}</span>
              </button>
            `
            ).join('')}
          </div>
        </div>

        <div class="launch-btn-row">
          <button class="btn-primary-launch" id="btn-launch-match">START MATCH</button>
        </div>
      </div>
    `;
  }

  private renderCharactersTab(): string {
    const save = this.progression.data;
    const selectedChar =
      CHARACTER_DEFINITIONS.find((c) => c.id === save.equippedCharacter) ||
      CHARACTER_DEFINITIONS[0];
    const visual = getCharacterVisuals(selectedChar.id);

    const charPills = CHARACTER_DEFINITIONS.map((c) => {
      const equipped = save.equippedCharacter === c.id;
      const v = getCharacterVisuals(c.id);
      return `
        <button class="char-pill-btn ${equipped ? 'equipped' : ''}" data-char-action="${c.id}">
          ${c.name}
          <span class="char-pill-tag">${v.playstyle}</span>
        </button>
      `;
    }).join('');

    const batButtons = BAT_DEFINITIONS.map((b) => {
      const equipped = save.equippedBat === b.id;
      return `
        <button class="option-btn ${equipped ? 'selected' : ''}" data-bat-action="${b.id}">
          <span class="option-btn-title">${b.name}</span>
          <span class="option-btn-desc">${b.tagline}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="menu-left-panel wide">
        <div class="panel-heading">SELECT CHARACTER (LIVE 3D PREVIEW)</div>
        <div class="char-selector-strip">${charPills}</div>

        <div class="char-detail-card">
          <div class="char-detail-header">
            <div>
              <div class="char-detail-name">${selectedChar.name}</div>
              <div style="font-size:11px; color:#f6e05e; font-weight:700;">${selectedChar.title}</div>
            </div>
            <span class="char-playstyle-badge">${visual.playstyle}</span>
          </div>

          <div class="char-lore-text">${visual.lore}</div>

          <div class="char-kit-box">
            <strong style="color:#f6ad55;">[Q] ${selectedChar.abilityName} (${selectedChar.abilityCooldown}s CD):</strong>
            ${selectedChar.abilityDesc}
          </div>

          <div class="char-kit-box" style="margin-bottom:10px;">
            <strong style="color:#68d391;">PASSIVE — ${selectedChar.passiveName}:</strong>
            ${selectedChar.passiveDesc}
          </div>

          <button class="btn-inline-link" id="btn-preview-slash" style="width:100%; padding:8px; font-size:11px;">
            PREVIEW WEAPON SLASH POSE
          </button>
        </div>

        <div class="selector-group">
          <div class="panel-heading">SELECT WEAPON</div>
          <div class="selector-options row-2">${batButtons}</div>
        </div>

        <div class="launch-btn-row">
          <button class="btn-secondary-tab" data-jump-tab="PLAY">← BACK TO PLAY</button>
          <button class="btn-primary-launch" id="btn-launch-match">START MATCH</button>
        </div>
      </div>
    `;
  }

  private renderArenasTab(): string {
    const arenaListHtml = ARENA_DEFINITIONS.map((a) => {
      const selected = this.selectedArena === a.id;
      return `
        <button class="arena-card-btn ${selected ? 'selected' : ''}" data-arena="${a.id}">
          <div class="arena-card-top">
            <span class="option-btn-title">${a.name}</span>
            <span class="arena-theme-tag">${a.themeTag}</span>
          </div>
          <span class="option-btn-desc" style="color:#f6e05e; margin-top:3px;">${a.subtitle}</span>
          <span class="option-btn-desc">${a.description}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="menu-left-panel wide">
        <div class="panel-heading">SELECT ARENA MAP (LIVE 3D BACKGROUND)</div>
        <div class="arena-list">${arenaListHtml}</div>

        <div class="launch-btn-row">
          <button class="btn-secondary-tab" data-jump-tab="PLAY">← BACK TO PLAY</button>
          <button class="btn-primary-launch" id="btn-launch-match">START MATCH</button>
        </div>
      </div>
    `;
  }

  private bindMainMenuEvents(): void {
    this.root.querySelectorAll('[data-menu-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = (btn as HTMLElement).dataset.menuTab as MenuTab;
        this.setActiveTab(nextTab);
      });
    });

    this.root.querySelectorAll('[data-jump-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = (btn as HTMLElement).dataset.jumpTab as MenuTab;
        this.setActiveTab(nextTab);
      });
    });

    this.root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMode = (btn as HTMLElement).dataset.mode as GameModeId;
        this.renderMainMenu();
      });
    });

    this.root.querySelectorAll('[data-arena]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedArena = (btn as HTMLElement).dataset.arena as ArenaId;
        if (this.callbacks.onArenaPreviewChanged) {
          this.callbacks.onArenaPreviewChanged(this.selectedArena);
        }
        this.renderMainMenu();
      });
    });

    this.root.querySelectorAll('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedDifficulty = (btn as HTMLElement).dataset.diff as AIDifficultyId;
        this.renderMainMenu();
      });
    });

    const launchBtn = this.root.querySelector('#btn-launch-match');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        this.hide();
        this.callbacks.onStartMatch(
          this.selectedMode,
          this.selectedArena,
          this.selectedDifficulty
        );
      });
    }

    const slashBtn = this.root.querySelector('#btn-preview-slash');
    if (slashBtn) {
      slashBtn.addEventListener('click', () => {
        if (this.callbacks.onPreviewSlash) {
          this.callbacks.onPreviewSlash();
        }
      });
    }

    this.root.querySelectorAll('[data-char-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const charId = (el as HTMLElement).dataset.charAction as CharacterId;
        this.progression.unlockOrEquipCharacter(charId);
        this.callbacks.onLoadoutChanged(
          this.progression.data.equippedCharacter,
          this.progression.data.equippedBat
        );
        this.renderMainMenu();
      });
    });

    this.root.querySelectorAll('[data-bat-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const batId = (btn as HTMLElement).dataset.batAction as BatId;
        this.progression.unlockOrEquipBat(batId);
        this.callbacks.onLoadoutChanged(
          this.progression.data.equippedCharacter,
          this.progression.data.equippedBat
        );
        this.renderMainMenu();
      });
    });
  }

  public renderPostMatchCard(summary: MatchSummaryStats): void {
    const titleText =
      summary.mode === 'endless_gauntlet'
        ? 'GAUNTLET RUN COMPLETE'
        : summary.playerWon
          ? 'VICTORY // ARENA CHAMPION'
          : 'DEFEAT // ELIMINATED';
    const titleColor = summary.playerWon ? '#68d391' : '#fc8181';

    this.root.innerHTML = `
      <div class="post-match-backdrop">
        <div class="mvp-card">
          <div class="mvp-outcome-title" style="color:${titleColor}">${titleText}</div>
          <div style="font-size:13px; color:#cbd5e0;">PEAK BALL SPEED: ${summary.peakKmh} KM/H (MACH ${summary.peakMach})</div>

          <div class="mvp-badge-box">
            <div style="font-size:11px; letter-spacing:2px; color:#cbd5e0;">MATCH MVP</div>
            <div style="font-family:var(--font-display); font-size:22px; font-weight:900; color:#f6e05e; margin-top:2px;">
              ${summary.mvpName}
            </div>
            <div style="font-size:12px; color:#f7fafc;">${summary.mvpTitle}</div>
          </div>

          <div class="stats-grid-4">
            <div class="stat-tile">
              <div class="stat-tile-val">${summary.playerParries}</div>
              <div class="stat-tile-lbl">PARRIES</div>
            </div>
            <div class="stat-tile">
              <div class="stat-tile-val">${summary.playerEliminations}</div>
              <div class="stat-tile-lbl">KO'S</div>
            </div>
            <div class="stat-tile">
              <div class="stat-tile-val">MACH ${summary.peakMach}</div>
              <div class="stat-tile-lbl">PEAK SPEED</div>
            </div>
            <div class="stat-tile">
              <div class="stat-tile-val">+${summary.coinsEarned}</div>
              <div class="stat-tile-lbl">HONOR</div>
            </div>
          </div>

          <div class="launch-btn-row">
            <button class="btn-primary-launch" id="btn-rematch">PLAY AGAIN</button>
            <button class="btn-secondary-tab" id="btn-back-menu">MAIN MENU</button>
          </div>
        </div>
      </div>
    `;

    const rematchBtn = this.root.querySelector('#btn-rematch');
    if (rematchBtn) {
      rematchBtn.addEventListener('click', () => {
        this.hide();
        this.callbacks.onStartMatch(
          this.selectedMode,
          this.selectedArena,
          this.selectedDifficulty
        );
      });
    }

    const menuBtn = this.root.querySelector('#btn-back-menu');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        this.activeTab = 'PLAY';
        this.callbacks.onReturnToShowcase();
        this.renderMainMenu();
      });
    }
  }
}
