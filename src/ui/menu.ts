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
        desc: 'Head-to-head courtyard parry duel. First to 3 round wins.',
      },
      {
        id: 'ffa_4p',
        title: '4-PLAYER FREE-FOR-ALL',
        desc: '4 fighters in the sanctuary. Last survivor wins the round.',
      },
      {
        id: 'endless_gauntlet',
        title: 'ENDLESS SPEED GAUNTLET',
        desc: 'Solo survival rally testing your reflexes at escalating speeds.',
      },
    ];

    const charCards = CHARACTER_DEFINITIONS.map((c) => {
      const equipped = save.equippedCharacter === c.id;
      const btnText = equipped ? 'SELECTED' : 'SELECT';
      const btnClass = equipped ? 'equipped' : '';

      return `
        <div class="armory-card ${equipped ? 'equipped' : ''}" data-char-action="${c.id}">
          <div>
            <div class="armory-card-name">${c.name}</div>
            <div class="armory-card-role">${c.title}</div>
            <div class="armory-card-ability" style="margin-top:6px;">
              <strong style="color:#ffffff;">[Q] ${c.abilityName}:</strong> ${c.abilityDesc}
            </div>
            <div class="armory-card-ability" style="margin-top:5px; font-size:10px; opacity:0.85;">
              Passive (${c.passiveName}): ${c.passiveDesc}
            </div>
          </div>
          <button class="armory-action-btn ${btnClass}" data-char-action="${c.id}">${btnText}</button>
        </div>
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

    this.root.innerHTML = `
      <div class="menu-overlay">
        <div class="menu-header">
          <div>
            <div class="brand-title">BLADE COURTYARD 3D</div>
            <div class="brand-subtitle">MARTIAL PARRY ARENA // SELECT YOUR CHARACTER & ABILITY</div>
          </div>
          <div class="profile-coins-pill">
            <span>WINS: ${save.totalWins}</span>
            <span style="font-size:12px; color:#cbd5e0;">PARRIES: ${save.totalParries} // PEAK: MACH ${save.peakMach.toFixed(2)}</span>
          </div>
        </div>

        <div class="menu-main-grid">
          <!-- Left Column: Mode, Arena & Difficulty -->
          <div class="glass-panel">
            <div class="selector-group">
              <div class="panel-heading">1 // GAME MODE</div>
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
              <div class="panel-heading">2 // COURTYARD ARENA MAP</div>
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
              <div class="panel-heading">3 // BOT DIFFICULTY</div>
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

          <!-- Right Panel: Direct Character, Ability & Weapon Selection -->
          <div class="glass-panel">
            <div class="panel-heading">4 // CHOOSE CHARACTER & UNIQUE [Q] ABILITY</div>
            <div class="armory-cards-grid">${charCards}</div>

            <div class="panel-heading">5 // CHOOSE WEAPON</div>
            <div class="selector-options row-4">${batButtons}</div>

            <div style="margin-top:12px; font-size:12px; color:#cbd5e0;">
              CONTROLS: <strong>WASD</strong> Move & Curve · <strong>Mouse</strong> Look · <strong>Left Click / F</strong> Parry · <strong>E</strong> Lob · <strong>Shift / Right Click</strong> Dodge · <strong>Space</strong> Double Jump · <strong>Q</strong> Character Ability
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindMainMenuEvents();
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
          ? 'VICTORY // COURTYARD CHAMPION'
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
            <button class="btn-secondary-tab" id="btn-back-menu">CHANGE CHARACTER</button>
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
