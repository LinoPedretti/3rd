import { getKmhFromSpeed, getMachFromSpeed, getVelocityTier } from '../engine/events';
import { MatchDirector } from '../systems/match';

export class DiegeticHUD {
  private readonly container: HTMLElement;
  private readonly speedCard: HTMLElement;
  private readonly tierEl: HTMLElement;
  private readonly kmhEl: HTMLElement;
  private readonly machEl: HTMLElement;
  private readonly pipsBar: HTMLElement;
  private readonly bannerEl: HTMLElement;

  // Dynamic Crosshair & Radial Arcs
  private readonly outerRingCircle: SVGCircleElement;
  private readonly dashArcPath: SVGCircleElement;
  private readonly abilityArcPath: SVGCircleElement;
  private readonly crosshairStatusEl: HTMLElement;

  // Bottom bar labels
  private readonly abilityKeyLabel: HTMLElement;
  private readonly assistStatusLabel: HTMLElement;

  private lastScoreboardHash = '';

  constructor(
    root: HTMLElement,
    onReturnToMenu: () => void,
    onToggleMute: () => boolean
  ) {
    this.container = document.createElement('div');
    this.container.className = 'hud-container';
    this.container.style.display = 'none';

    const circumference = 2 * Math.PI * 52; // r=52 => ~326.7

    this.container.innerHTML = `
      <div class="hud-top-bar">
        <div class="speedometer-card" id="hud-speed-card">
          <div class="speedometer-tier" id="hud-tier-label">TIER 1 // KINETIC</div>
          <div class="speedometer-main">
            <span class="speedometer-kmh" id="hud-kmh-val">1690</span>
            <span class="speedometer-unit">KM/H</span>
            <span class="speedometer-mach" id="hud-mach-val">MACH 1.38</span>
          </div>
        </div>
        <div class="round-pips-bar" id="hud-pips-bar"></div>
      </div>

      <div class="hud-top-right">
        <button class="hud-action-btn" id="hud-btn-mute">AUDIO: ON</button>
        <button class="hud-action-btn" id="hud-btn-menu">ESC // MENU</button>
      </div>

      <div class="hud-banner" id="hud-banner"></div>

      <div class="hud-crosshair-wrapper">
        <svg class="crosshair-svg" viewBox="0 0 150 150">
          <!-- Subtle base guides -->
          <circle cx="75" cy="75" r="34" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2" id="hud-parry-ring" />
          <circle cx="75" cy="75" r="3" fill="#ffffff" />

          <!-- Left Radial Arc: Dodge Dash Cooldown -->
          <circle
            cx="75"
            cy="75"
            r="52"
            fill="none"
            stroke="#00e5ff"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="0"
            transform="rotate(-135 75 75)"
            id="hud-dash-arc"
          />

          <!-- Right Radial Arc: Active Ability Cooldown -->
          <circle
            cx="75"
            cy="75"
            r="60"
            fill="none"
            stroke="#00e676"
            stroke-width="4"
            stroke-linecap="round"
            stroke-dasharray="${2 * Math.PI * 60}"
            stroke-dashoffset="0"
            transform="rotate(-45 75 75)"
            id="hud-ability-arc"
          />
        </svg>
        <div class="crosshair-status-label" id="hud-crosshair-status">READY</div>
      </div>

      <div class="hud-bottom-bar">
        <div class="hud-key-item"><span class="hud-key-badge">LMB / F</span> PARRY + CURVE</div>
        <div class="hud-key-item"><span class="hud-key-badge">E</span> BUNT LOB</div>
        <div class="hud-key-item"><span class="hud-key-badge">SHIFT / RMB</span> 3D DASH</div>
        <div class="hud-key-item"><span class="hud-key-badge">SPACE x2</span> DOUBLE JUMP</div>
        <div class="hud-key-item"><span class="hud-key-badge">Q</span> <span id="hud-ability-name">ABILITY</span></div>
        <div class="hud-key-item"><span class="hud-key-badge">TAB</span> <span id="hud-assist-name">ASSIST: ON</span></div>
      </div>
    `;

    root.appendChild(this.container);

    this.speedCard = this.container.querySelector('#hud-speed-card') as HTMLElement;
    this.tierEl = this.container.querySelector('#hud-tier-label') as HTMLElement;
    this.kmhEl = this.container.querySelector('#hud-kmh-val') as HTMLElement;
    this.machEl = this.container.querySelector('#hud-mach-val') as HTMLElement;
    this.pipsBar = this.container.querySelector('#hud-pips-bar') as HTMLElement;
    this.bannerEl = this.container.querySelector('#hud-banner') as HTMLElement;

    this.outerRingCircle = this.container.querySelector('#hud-parry-ring') as SVGCircleElement;
    this.dashArcPath = this.container.querySelector('#hud-dash-arc') as SVGCircleElement;
    this.abilityArcPath = this.container.querySelector('#hud-ability-arc') as SVGCircleElement;
    this.crosshairStatusEl = this.container.querySelector('#hud-crosshair-status') as HTMLElement;
    this.abilityKeyLabel = this.container.querySelector('#hud-ability-name') as HTMLElement;
    this.assistStatusLabel = this.container.querySelector('#hud-assist-name') as HTMLElement;

    const menuBtn = this.container.querySelector('#hud-btn-menu') as HTMLButtonElement;
    menuBtn.addEventListener('click', () => onReturnToMenu());

    const muteBtn = this.container.querySelector('#hud-btn-mute') as HTMLButtonElement;
    muteBtn.addEventListener('click', () => {
      const muted = onToggleMute();
      muteBtn.textContent = muted ? 'AUDIO: MUTED' : 'AUDIO: ON';
    });
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  public update(match: MatchDirector, ballAssistEnabled: boolean): void {
    if (match.state === 'SHOWCASE' || match.state === 'MATCH_OVER') {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    const ball = match.ball;
    const player = match.fighters[0];
    const speed = ball.speed;
    const mach = getMachFromSpeed(speed);
    const kmh = getKmhFromSpeed(speed);
    const tier = getVelocityTier(speed);

    // 1. Speedometer
    this.tierEl.textContent = tier.label;
    this.kmhEl.textContent = `${kmh}`;
    this.machEl.textContent = `MACH ${mach.toFixed(2)}`;
    this.speedCard.style.borderColor =
      ball.targetId === player.id ? '#e53e3e' : 'rgba(255, 255, 255, 0.28)';

    // 2. Announcement Banner
    if (match.bannerTimer > 0 && match.bannerAnnouncement) {
      this.bannerEl.textContent = match.bannerAnnouncement;
      this.bannerEl.style.opacity = '1';
    } else {
      this.bannerEl.style.opacity = '0';
    }

    // 3. Dynamic Crosshair & Parry-Range Indicator
    const distToBall = player.position.distanceTo(ball.position);
    const inParryRange = distToBall <= player.getParryReach() + 0.65;
    const isLockedOnPlayer = ball.targetId === player.id;

    if (player.parryWhiffTimer > 0) {
      this.outerRingCircle.setAttribute('stroke', '#d69e2e');
      this.outerRingCircle.setAttribute('stroke-width', '3.5');
      this.crosshairStatusEl.textContent = 'RECOVERY';
      this.crosshairStatusEl.style.display = 'block';
      this.crosshairStatusEl.style.color = '#f6e05e';
    } else if (inParryRange) {
      this.outerRingCircle.setAttribute('stroke', '#2f855a');
      this.outerRingCircle.setAttribute('stroke-width', '5');
      this.crosshairStatusEl.textContent = 'STRIKE NOW!';
      this.crosshairStatusEl.style.display = 'block';
      this.crosshairStatusEl.style.color = '#68d391';
    } else if (isLockedOnPlayer) {
      this.outerRingCircle.setAttribute('stroke', '#c53030');
      this.outerRingCircle.setAttribute('stroke-width', '4');
      this.crosshairStatusEl.textContent = 'INCOMING!';
      this.crosshairStatusEl.style.display = 'block';
      this.crosshairStatusEl.style.color = '#fc8181';
    } else {
      this.outerRingCircle.setAttribute('stroke', 'rgba(26, 32, 44, 0.55)');
      this.outerRingCircle.setAttribute('stroke-width', '2.5');
      this.crosshairStatusEl.textContent = '';
      this.crosshairStatusEl.style.display = 'none';
    }

    // 4. Radial Dash & Ability Cooldown Arcs around Crosshair
    const dashCircum = 2 * Math.PI * 52;
    const dashReadyFrac = 1 - Math.min(1, player.dashCooldown / 1.8);
    this.dashArcPath.setAttribute(
      'stroke-dashoffset',
      `${dashCircum * (1 - dashReadyFrac * 0.45)}`
    );
    this.dashArcPath.setAttribute(
      'stroke',
      player.dashCooldown <= 0 ? '#1a202c' : 'rgba(26, 32, 44, 0.25)'
    );

    const abilCircum = 2 * Math.PI * 60;
    const maxAbilCd = player.characterDef.abilityCooldown || 10;
    const abilReadyFrac = 1 - Math.min(1, player.abilityCooldown / maxAbilCd);
    this.abilityArcPath.setAttribute(
      'stroke-dashoffset',
      `${abilCircum * (1 - abilReadyFrac * 0.45)}`
    );
    this.abilityArcPath.setAttribute(
      'stroke',
      player.abilityCooldown <= 0 ? '#2f855a' : 'rgba(26, 32, 44, 0.25)'
    );

    // 5. Bottom Bar Labels
    this.abilityKeyLabel.textContent =
      player.abilityCooldown > 0
        ? `${player.characterDef.abilityName} (${player.abilityCooldown.toFixed(1)}s)`
        : `${player.characterDef.abilityName} (READY)`;
    this.assistStatusLabel.textContent = ballAssistEnabled ? 'ASSIST: ON' : 'ASSIST: FREE';

    // 6. Round Score Pips or Gauntlet Survival Counter
    this.renderScorePips(match);
  }

  private renderScorePips(match: MatchDirector): void {
    if (match.mode === 'endless_gauntlet') {
      const hash = `gauntlet:${match.gauntletParryScore}`;
      if (hash === this.lastScoreboardHash) return;
      this.lastScoreboardHash = hash;
      this.pipsBar.innerHTML = `
        <div class="fighter-score-pill">
          <span style="color:#00e5ff">GAUNTLET PARRIES: ${match.gauntletParryScore}</span>
        </div>
      `;
      return;
    }

    const scores = match.getScoreboardSnapshot();
    const hash = scores.map((s) => `${s.id}:${s.roundsWon}:${s.alive}`).join('|');
    if (hash === this.lastScoreboardHash) return;
    this.lastScoreboardHash = hash;

    this.pipsBar.innerHTML = scores
      .map((s) => {
        const pips: string[] = [];
        for (let i = 0; i < match.roundsToWin; i++) {
          pips.push(`<span class="round-pip ${i < s.roundsWon ? 'filled' : ''}"></span>`);
        }
        return `
          <div class="fighter-score-pill ${s.alive ? '' : 'dead'}">
            <span style="color:${s.cssColor}">${s.name}</span>
            <div class="pip-row">${pips.join('')}</div>
          </div>
        `;
      })
      .join('');
  }
}
