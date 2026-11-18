import { BAT_DEFINITIONS, BatId } from '../entities/bats';
import { CHARACTER_DEFINITIONS, CharacterId } from '../entities/characters';
import { AI_DIFFICULTY_TIERS, AIDifficultyId } from '../systems/ai';
import { ARENA_DEFINITIONS, ArenaId } from '../systems/arenas';
import { GameModeId, MatchSummaryStats } from '../systems/match';
import { ProgressionSystem } from '../systems/progression';

export interface MenuCallbacks {
  onStartMatch: (mode: GameModeId, arena: ArenaId, difficulty: AIDifficultyId) => void;
  onLoadoutChanged: (characterId: CharacterId, batId: BatId) => void;
  onArenaPreviewChanged?: (arena: ArenaId) => void;
  onReturnToShowcase: () => void;
}

export class MenuUI {
  private readonly root: HTMLElement;
  public selectedMode: GameModeId = 'duel_1v1';
  public selectedArena: ArenaId = 'cyber_dojo';
  public selectedDifficulty: AIDifficultyId = 'contender';
  private activeTab: 'PLAY' | 'ARMORY' = 'PLAY';
  private statusToast = '';

  constructor(
    root: HTMLElement,
    private readonly progression: ProgressionSystem,
    private readonly callbacks: MenuCallbacks
  ) {
    this.root = root;
    this.renderMainMenu();
  }

  public hide(): void {
    this.root.innerHTML = '';
  }

  public renderMainMenu(): void {
    const save = this.progression.data;

    const modeOptions: Array<{ id: GameModeId; title: string; desc: string }> = [
      {
        id: 'duel_1v1',
        title: '1V1 DUEL (VS BOT)',
        desc: 'Intense head-to-head kinetic parry duel. First to 3 round wins.',
      },
      {
        id: 'ffa_4p',
        title: '4-PLAYER FREE-FOR-ALL',
        desc: '4 fighters enter the reactor court. Last survivor takes the round.',
      },
      {
        id: 'endless_gauntlet',
        title: 'ENDLESS SPEED GAUNTLET',
        desc: 'Solo high-score survival escalating the plasma sphere past Mach 10.',
      },
    ];

    const rightPanelContent =
      this.activeTab === 'PLAY' ? this.buildOverviewPanel() : this.buildArmoryPanel();

    this.root.innerHTML = `
      <div class="menu-overlay">
        <div class="menu-header">
          <div>
            <div class="brand-title">HYPERBLADE ARENA 3D</div>
            <div class="brand-subtitle">THIRD-PERSON KINETIC PARRY BRAWLER // LIVE 3D SHOWCASE</div>
          </div>
          <div class="profile-coins-pill">
            <span>⚡ ${save.coins} COINS</span>
            <span style="font-size:12px; color:#8da2c0;">PEAK: MACH ${save.peakMach.toFixed(2)}</span>
          </div>
        </div>

        <div class="menu-main-grid">
          <!-- Left Configuration Column -->
          <div class="glass-panel">
            <div class="selector-group">
              <div class="panel-heading">1 // SELECT GAME MODE</div>
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
              <div class="panel-heading">2 // SELECT 3D ARENA MAP</div>
              <div class="selector-options row-3">
                ${ARENA_DEFINITIONS.map(
                  (a) => `
                  <button class="option-btn ${this.selectedArena === a.id ? 'selected' : ''}" data-arena="${a.id}">
                    <span class="option-btn-title">${a.name}</span>
                    <span class="option-btn-desc">${a.subtitle}</span>
                  </button>
                `
                ).join('')}
              </div>
            </div>

            <div class="selector-group">
              <div class="panel-heading">3 // AI BOT DIFFICULTY TIER</div>
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
              <button class="btn-primary-launch" id="btn-launch-match">ENTER ARENA</button>
              <button class="btn-secondary-tab" id="btn-toggle-armory">
                ${this.activeTab === 'ARMORY' ? 'OVERVIEW' : 'ARMORY'}
              </button>
            </div>
          </div>

          <!-- Right Panel: Loadout Overview or Full Armory -->
          ${rightPanelContent}
        </div>
      </div>
    `;

    this.bindMainMenuEvents();
  }

  private buildOverviewPanel(): string {
    const save = this.progression.data;
    const charDef =
      CHARACTER_DEFINITIONS.find((c) => c.id === save.equippedCharacter) ||
      CHARACTER_DEFINITIONS[0];
    const batDef =
      BAT_DEFINITIONS.find((b) => b.id === save.equippedBat) || BAT_DEFINITIONS[0];
    const arenaDef =
      ARENA_DEFINITIONS.find((a) => a.id === this.selectedArena) || ARENA_DEFINITIONS[0];

    return `
      <div class="glass-panel">
        <div class="panel-heading">EQUIPPED FIGHTER & 3D BLADE LOADOUT</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:14px;">
          <div class="armory-card equipped">
            <div>
              <div class="armory-card-name" style="color:${charDef.cssColor}">${charDef.name} // ${charDef.title}</div>
              <div class="armory-card-role" style="margin-top:4px;">PASSIVE: ${charDef.passiveName}</div>
              <div class="armory-card-ability">${charDef.passiveDesc}</div>
              <div class="armory-card-role" style="margin-top:8px; color:${charDef.cssColor}">ACTIVE [Q]: ${charDef.abilityName}</div>
              <div class="armory-card-ability">${charDef.abilityDesc}</div>
            </div>
          </div>
          <div class="armory-card equipped">
            <div>
              <div class="armory-card-name" style="color:${batDef.cssColor}">${batDef.name}</div>
              <div class="armory-card-role" style="margin-top:4px;">${batDef.tagline}</div>
              <div class="armory-card-ability" style="margin-top:6px;">${batDef.description}</div>
              <div class="armory-card-role" style="margin-top:12px; color:#00e5ff">ARENA: ${arenaDef.name}</div>
              <div class="armory-card-ability">${arenaDef.description}</div>
            </div>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#8da2c0;">
          <span>CONTROLS: WASD Move · Mouse Aim Curve · LMB/F Parry · E Bunt Lob · Shift/RMB Dash · Space x2 Double Jump · Q Ability</span>
          <span style="color:#00e5ff; font-weight:700;">CAREER WINS: ${save.totalWins} // PARRIES: ${save.totalParries}</span>
        </div>
      </div>
    `;
  }

  private buildArmoryPanel(): string {
    const save = this.progression.data;

    const charCards = CHARACTER_DEFINITIONS.map((c) => {
      const unlocked = this.progression.isCharacterUnlocked(c.id);
      const equipped = save.equippedCharacter === c.id;
      const btnText = equipped
        ? 'EQUIPPED'
        : unlocked
          ? 'EQUIP'
          : `UNLOCK (${c.cost} ⚡)`;
      const btnClass = equipped ? 'equipped' : unlocked ? '' : 'unlockable';

      return `
        <div class="armory-card ${equipped ? 'equipped' : ''}">
          <div>
            <div class="armory-card-name" style="color:${c.cssColor}">${c.name}</div>
            <div class="armory-card-role">${c.title}</div>
            <div class="armory-card-ability" style="margin-top:4px;"><strong style="color:#fff">${c.abilityName}:</strong> ${c.abilityDesc}</div>
          </div>
          <button class="armory-action-btn ${btnClass}" data-char-action="${c.id}">${btnText}</button>
        </div>
      `;
    }).join('');

    const batCards = BAT_DEFINITIONS.map((b) => {
      const unlocked = this.progression.isBatUnlocked(b.id);
      const equipped = save.equippedBat === b.id;
      const btnText = equipped
        ? 'EQUIPPED'
        : unlocked
          ? 'EQUIP'
          : `UNLOCK (${b.cost} ⚡)`;
      const btnClass = equipped ? 'equipped' : unlocked ? '' : 'unlockable';

      return `
        <div class="armory-card ${equipped ? 'equipped' : ''}">
          <div>
            <div class="armory-card-name" style="color:${b.cssColor}">${b.name}</div>
            <div class="armory-card-role">${b.tagline}</div>
            <div class="armory-card-ability" style="margin-top:4px;">${b.description}</div>
          </div>
          <button class="armory-action-btn ${btnClass}" data-bat-action="${b.id}">${btnText}</button>
        </div>
      `;
    }).join('');

    return `
      <div class="glass-panel armory-panel">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="panel-heading">ARMORY // 5 PLAYABLE FIGHTERS</div>
          <div style="font-size:12px; color:#ffd740; font-weight:700;">${this.statusToast}</div>
        </div>
        <div class="armory-cards-grid">${charCards}</div>

        <div class="panel-heading">ARMORY // 4 EQUIPPABLE 3D BATS & BLADES</div>
        <div class="armory-cards-grid">${batCards}</div>
      </div>
    `;
  }

  private bindMainMenuEvents(): void {
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

    const toggleArmoryBtn = this.root.querySelector('#btn-toggle-armory');
    if (toggleArmoryBtn) {
      toggleArmoryBtn.addEventListener('click', () => {
        this.activeTab = this.activeTab === 'PLAY' ? 'ARMORY' : 'PLAY';
        this.statusToast = '';
        this.renderMainMenu();
      });
    }

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

    this.root.querySelectorAll('[data-char-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const charId = (btn as HTMLElement).dataset.charAction as CharacterId;
        const res = this.progression.unlockOrEquipCharacter(charId);
        this.statusToast = res.message;
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
        const res = this.progression.unlockOrEquipBat(batId);
        this.statusToast = res.message;
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
    const titleColor = summary.playerWon ? '#00e676' : '#ff1744';

    this.root.innerHTML = `
      <div class="post-match-backdrop">
        <div class="mvp-card">
          <div class="mvp-outcome-title" style="color:${titleColor}">${titleText}</div>
          <div style="font-size:13px; color:#8da2c0;">PEAK VELOCITY: ${summary.peakKmh} KM/H (MACH ${summary.peakMach})</div>

          <div class="mvp-badge-box">
            <div style="font-size:11px; letter-spacing:2px; color:#8da2c0;">MATCH MVP</div>
            <div style="font-family:var(--font-display); font-size:22px; font-weight:900; color:${summary.mvpColor}; margin-top:2px;">
              ${summary.mvpName}
            </div>
            <div style="font-size:12px; color:#f0f6ff;">${summary.mvpTitle}</div>
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
              <div class="stat-tile-val" style="color:#ffd740">+${summary.coinsEarned} ⚡</div>
              <div class="stat-tile-lbl">COINS EARNED</div>
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
        this.callbacks.onReturnToShowcase();
        this.renderMainMenu();
      });
    }
  }
}
