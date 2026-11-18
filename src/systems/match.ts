import * as THREE from 'three';
import { PlayerFighter } from '../entities/player';
import { INITIAL_BALL_SPEED, PlasmaBall } from '../entities/ball';
import { BAT_DEFINITIONS } from '../entities/bats';
import { CHARACTER_DEFINITIONS } from '../entities/characters';
import { tryActivateCharacterAbility } from '../entities/abilities';
import { AIDifficultyId, AISystem } from './ai';
import { ArenaId, ArenaSystem } from './arenas';
import { CombatSystem } from './combat';
import { VFXSystem } from './vfx';
import { ProgressionSystem } from './progression';
import { InputManager } from '../engine/input';
import { ThirdPersonCamera } from '../engine/camera';
import { gameEvents, getKmhFromSpeed, getMachFromSpeed } from '../engine/events';

export type GameModeId = 'duel_1v1' | 'ffa_4p' | 'endless_gauntlet';
export type MatchState = 'SHOWCASE' | 'COUNTDOWN' | 'ACTIVE_ROUND' | 'ROUND_OVER' | 'MATCH_OVER';

export interface FighterRoundScore {
  id: string;
  name: string;
  isHuman: boolean;
  characterName: string;
  cssColor: string;
  roundsWon: number;
  parries: number;
  eliminations: number;
  alive: boolean;
}

export interface MatchSummaryStats {
  mode: GameModeId;
  playerWon: boolean;
  mvpName: string;
  mvpTitle: string;
  mvpColor: string;
  playerParries: number;
  playerEliminations: number;
  peakMach: number;
  peakKmh: number;
  coinsEarned: number;
  scoreboard: FighterRoundScore[];
}

export class MatchDirector {
  public state: MatchState = 'SHOWCASE';
  public mode: GameModeId = 'duel_1v1';
  public difficulty: AIDifficultyId = 'contender';
  public currentRound = 1;
  public readonly roundsToWin = 3;

  public readonly fighters: PlayerFighter[] = [];
  public readonly roundWins: Map<string, number> = new Map();
  public readonly ball: PlasmaBall;

  // Floating Cyber-Training Drone for Endless Speed Gauntlet
  private readonly droneGroup: THREE.Group;
  public readonly dronePosition = new THREE.Vector3(0, 2.4, -12);
  private droneAngle = 0;

  public countdownTimer = 0;
  public roundOverTimer = 0;
  public lastRoundWinnerName = '';
  public bannerAnnouncement = '';
  public bannerTimer = 0;

  public simClock = 0;
  public peakSpeedThisMatch = INITIAL_BALL_SPEED;
  public gauntletParryScore = 0;
  public lastMatchSummary: MatchSummaryStats | null = null;
  public autoplayHuman = false;

  private readonly _camForward = new THREE.Vector3();
  private readonly _camFlatForward = new THREE.Vector3();
  private readonly _camRight = new THREE.Vector3();
  private readonly _wishMove = new THREE.Vector3();
  private readonly _botMove = new THREE.Vector3();
  private readonly _botAim = new THREE.Vector3();
  private readonly _spawnPos = new THREE.Vector3();
  private readonly _initDir = new THREE.Vector3();

  private onMatchCompletedCallback?: (summary: MatchSummaryStats) => void;
  private onTriggerHitstopCallback?: (durationSec: number) => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly arena: ArenaSystem,
    private readonly combat: CombatSystem,
    private readonly ai: AISystem,
    private readonly vfx: VFXSystem,
    private readonly progression: ProgressionSystem,
    private readonly input: InputManager,
    private readonly tpsCamera: ThirdPersonCamera
  ) {
    this.ball = new PlasmaBall(this.scene);

    // Pre-allocate pool of 4 3D articulated fighters
    const defaultChars = CHARACTER_DEFINITIONS.map((c) => c.id);
    const defaultBats = BAT_DEFINITIONS.map((b) => b.id);
    for (let i = 0; i < 4; i++) {
      const isHuman = i === 0;
      const fighter = new PlayerFighter(
        isHuman ? 'player_1' : `bot_${i}`,
        isHuman ? 'YOU' : `APEX-0${i}`,
        isHuman,
        defaultChars[i % defaultChars.length],
        defaultBats[i % defaultBats.length],
        this.scene
      );
      fighter.eliminate();
      this.fighters.push(fighter);
    }

    // Build Endless Speed Gauntlet Floating Cyber-Drone mesh
    this.droneGroup = new THREE.Group();
    const droneCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 1),
      new THREE.MeshStandardMaterial({
        color: 0x161f33,
        emissive: 0xff1744,
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.85,
        flatShading: true,
      })
    );
    this.droneGroup.add(droneCore);

    const droneHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.08, 6, 18),
      new THREE.MeshBasicMaterial({
        color: 0xff1744,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      })
    );
    droneHalo.rotation.x = Math.PI / 2;
    this.droneGroup.add(droneHalo);
    this.droneGroup.visible = false;
    this.scene.add(this.droneGroup);

    this.startShowcaseDuel();
  }

  public setCallbacks(callbacks: {
    onMatchCompleted: (summary: MatchSummaryStats) => void;
    onTriggerHitstop: (durationSec: number) => void;
  }): void {
    this.onMatchCompletedCallback = callbacks.onMatchCompleted;
    this.onTriggerHitstopCallback = callbacks.onTriggerHitstop;
  }

  /**
   * Starts the live 3D AI vs AI Showcase Duel behind the glassmorphic Main Menu.
   */
  public startShowcaseDuel(): void {
    this.state = 'SHOWCASE';
    this.input.setPointerLockAllowed(false);
    this.droneGroup.visible = false;

    for (let i = 0; i < 4; i++) {
      const f = this.fighters[i];
      if (i < 2) {
        const angle = i === 0 ? 0 : Math.PI;
        const r = 16.5;
        this._spawnPos.set(Math.sin(angle) * r, 0, Math.cos(angle) * r);
        f.setLoadout(
          i === 0 ? this.progression.data.equippedCharacter : 'volt',
          i === 0 ? this.progression.data.equippedBat : 'void_scythe'
        );
        f.respawn(this._spawnPos, angle);
      } else {
        f.eliminate();
      }
    }

    this._spawnPos.set(0, 1.25, 0);
    this._initDir.set(0, 0, 1).normalize();
    this.ball.reset(this._spawnPos, this._initDir, this.fighters[0].id);
  }

  public startMatch(
    mode: GameModeId,
    arenaId: ArenaId,
    difficulty: AIDifficultyId
  ): void {
    this.mode = mode;
    this.difficulty = difficulty;
    this.arena.loadArena(arenaId);
    this.currentRound = 1;
    this.peakSpeedThisMatch = INITIAL_BALL_SPEED;
    this.gauntletParryScore = 0;
    this.lastMatchSummary = null;

    this.roundWins.clear();
    const activeCount = mode === 'ffa_4p' ? 4 : mode === 'duel_1v1' ? 2 : 1;

    const botNames = ['VALKYRIE', 'NEMESIS', 'KAIROS'];
    const botChars = CHARACTER_DEFINITIONS.map((c) => c.id).filter(
      (id) => id !== this.progression.data.equippedCharacter
    );
    const botBats = BAT_DEFINITIONS.map((b) => b.id);

    for (let i = 0; i < 4; i++) {
      const f = this.fighters[i];
      f.parriesThisMatch = 0;
      f.eliminationsThisMatch = 0;
      f.clashesThisMatch = 0;

      if (i < activeCount) {
        this.roundWins.set(f.id, 0);
        if (i === 0) {
          f.name = 'YOU';
          f.setLoadout(
            this.progression.data.equippedCharacter,
            this.progression.data.equippedBat
          );
        } else {
          f.name = botNames[(i - 1) % botNames.length];
          f.setLoadout(
            botChars[(i - 1) % botChars.length],
            botBats[i % botBats.length]
          );
        }
      } else {
        f.eliminate();
      }
    }

    this.input.setPointerLockAllowed(true);
    this.setupRound();
  }

  private setupRound(): void {
    this.state = 'COUNTDOWN';
    this.countdownTimer = 1.65;
    this.bannerAnnouncement =
      this.mode === 'endless_gauntlet'
        ? 'GAUNTLET // SURVIVE MACH 10+'
        : `ROUND ${this.currentRound}`;
    this.bannerTimer = 1.65;

    const activeCount = this.mode === 'ffa_4p' ? 4 : this.mode === 'duel_1v1' ? 2 : 1;
    const spawnR = this.arena.currentArenaId === 'reactor_core' ? 21.0 : 19.0;

    for (let i = 0; i < 4; i++) {
      const f = this.fighters[i];
      if (i < activeCount) {
        const angle = (i / activeCount) * Math.PI * 2;
        this._spawnPos.set(Math.sin(angle) * spawnR, 0, Math.cos(angle) * spawnR);
        f.respawn(this._spawnPos, angle);
      } else {
        f.eliminate();
      }
    }

    const player = this.fighters[0];
    this.tpsCamera.resetBehindTarget(player.position, player.facingYaw);

    if (this.mode === 'endless_gauntlet') {
      this.droneGroup.visible = true;
      this.droneAngle = Math.PI;
      this.dronePosition.set(0, 1.8, -18.5);
      this.droneGroup.position.copy(this.dronePosition);
    } else {
      this.droneGroup.visible = false;
    }

    const ballStartY = this.arena.currentArenaId === 'reactor_core' ? 2.5 : 1.25;
    this._spawnPos.set(0, ballStartY, 0);
    this._initDir.set(0, 0, 1).normalize();
    const firstTarget =
      activeCount > 1
        ? this.fighters[Math.floor(Math.random() * activeCount)].id
        : this.fighters[0].id;
    this.ball.reset(this._spawnPos, this._initDir, firstTarget);

    gameEvents.emit('round_start', { roundNumber: this.currentRound });
  }

  public updateFixed(dt: number): void {
    this.simClock += dt;

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    }

    if (this.ball.speed > this.peakSpeedThisMatch) {
      this.peakSpeedThisMatch = this.ball.speed;
    }

    // 1. Live 3D Showcase Mode behind Main Menu
    if (this.state === 'SHOWCASE') {
      for (let i = 0; i < 2; i++) {
        const f = this.fighters[i];
        if (!f.alive) {
          this.startShowcaseDuel();
          return;
        }
        this.ai.updateBot(
          dt,
          this.simClock,
          f,
          'veteran',
          this.ball,
          this.fighters,
          this.arena.arenaRadius,
          this.arena.obstacles,
          this.vfx,
          this._botMove,
          this._botAim
        );
        f.update(
          dt,
          this._botMove,
          this._botAim,
          this.ball.targetId === f.id,
          this.arena.arenaRadius,
          this.arena.obstacles,
          this.arena.platforms,
          this.arena.jumpPads,
          (pos, yaw, col) => this.vfx.spawnDashAfterimage(pos, yaw, col)
        );
      }

      this.combat.updateBallAndParries(
        dt,
        this.simClock,
        this.ball,
        this.fighters,
        false,
        null,
        this.arena.arenaRadius,
        this.arena.obstacles,
        this.arena.platforms,
        this.vfx,
        {
          onTriggerHitstop: () => {},
          onCameraParryPunch: () => {},
          onFighterEliminated: () => {
            this.startShowcaseDuel();
          },
        }
      );

      this.vfx.update(dt);
      this.input.update(dt);
      return;
    }

    // 2. Active Match Modes
    const activeCount = this.mode === 'ffa_4p' ? 4 : this.mode === 'duel_1v1' ? 2 : 1;

    // Update Endless Gauntlet Drone orbit
    if (this.mode === 'endless_gauntlet') {
      this.droneAngle += dt * 0.65;
      const droneR = 11.5;
      this.dronePosition.set(
        Math.sin(this.droneAngle) * droneR,
        2.8 + Math.sin(this.droneAngle * 2.3) * 0.9,
        Math.cos(this.droneAngle) * droneR
      );
      this.droneGroup.position.copy(this.dronePosition);
      this.droneGroup.rotation.y += dt * 2.5;
    }

    // Update Player 1 & Bots movement + buffered inputs
    for (let i = 0; i < activeCount; i++) {
      const f = this.fighters[i];
      if (!f.alive) continue;

      if (i === 0 && !this.autoplayHuman) {
        // Human Player 1 Camera-Relative WASD & Buffered Actions
        this.tpsCamera.getForwardVector(this._camForward);
        this.tpsCamera.getFlatForwardVector(this._camFlatForward);
        this.tpsCamera.getRightVector(this._camRight);

        const axes = this.input.getMoveAxes();
        this._wishMove
          .set(0, 0, 0)
          .addScaledVector(this._camRight, axes.x)
          .addScaledVector(this._camFlatForward, axes.z);
        if (this._wishMove.lengthSq() > 1) {
          this._wishMove.normalize();
        }

        // Buffered Jump & Double-Jump (100ms Coyote Time + 120ms Jump Buffering)
        if (this.input.hasBuffered('jump')) {
          if (f.tryJump()) {
            this.input.consumeBuffer('jump');
          }
        }

        // Buffered 3D Dodge Dash (Shift / Right Click)
        if (this.input.hasBuffered('dash')) {
          if (f.tryDash(this._wishMove)) {
            this.input.consumeBuffer('dash');
          }
        }

        if (this.state === 'ACTIVE_ROUND') {
          // Buffered Parry (Left Click / F)
          if (this.input.hasBuffered('parry')) {
            if (f.tryParry(false, this.simClock)) {
              this.input.consumeBuffer('parry');
            }
          }

          // Buffered Bunt / Feint (E)
          if (this.input.hasBuffered('bunt')) {
            if (f.tryParry(true, this.simClock)) {
              this.input.consumeBuffer('bunt');
            }
          }

          // Buffered Active Ability (Q)
          if (this.input.hasBuffered('ability')) {
            if (
              tryActivateCharacterAbility(
                f,
                this.ball,
                this.arena.arenaRadius,
                this.vfx
              )
            ) {
              this.input.consumeBuffer('ability');
            }
          }
        }

        f.update(
          dt,
          this._wishMove,
          this._camForward,
          this.ball.targetId === f.id,
          this.arena.arenaRadius,
          this.arena.obstacles,
          this.arena.platforms,
          this.arena.jumpPads,
          (pos, yaw, col) => this.vfx.spawnDashAfterimage(pos, yaw, col)
        );
      } else {
        // AI Bot (or Autoplay Player 1)
        const botTier: AIDifficultyId = i === 0 ? 'grandmaster' : this.difficulty;
        this.ai.updateBot(
          dt,
          this.simClock,
          f,
          botTier,
          this.ball,
          this.fighters,
          this.arena.arenaRadius,
          this.arena.obstacles,
          this.vfx,
          this._botMove,
          this._botAim
        );
        f.update(
          dt,
          this._botMove,
          this._botAim,
          this.ball.targetId === f.id,
          this.arena.arenaRadius,
          this.arena.obstacles,
          this.arena.platforms,
          this.arena.jumpPads,
          (pos, yaw, col) => this.vfx.spawnDashAfterimage(pos, yaw, col)
        );
      }
    }

    // State Machine transitions
    if (this.state === 'COUNTDOWN') {
      this.countdownTimer -= dt;
      this.ball.recordPerceptionSample(this.simClock);
      if (this.countdownTimer <= 0) {
        this.state = 'ACTIVE_ROUND';
        this.bannerAnnouncement = 'CLASH!';
        this.bannerTimer = 0.75;
      }
    } else if (this.state === 'ACTIVE_ROUND') {
      this.combat.updateBallAndParries(
        dt,
        this.simClock,
        this.ball,
        this.fighters,
        this.mode === 'endless_gauntlet',
        this.mode === 'endless_gauntlet' ? this.dronePosition : null,
        this.arena.arenaRadius,
        this.arena.obstacles,
        this.arena.platforms,
        this.vfx,
        {
          onTriggerHitstop: (sec) => {
            if (this.onTriggerHitstopCallback) this.onTriggerHitstopCallback(sec);
          },
          onCameraParryPunch: (intensity, dir) => {
            this.tpsCamera.triggerParryPunch(intensity, dir);
          },
          onFighterEliminated: (victim, attacker) => {
            this.handleFighterEliminated(victim, attacker);
          },
          onGauntletParryScored: () => {
            this.gauntletParryScore++;
          },
        }
      );
    } else if (this.state === 'ROUND_OVER') {
      this.roundOverTimer -= dt;
      if (this.roundOverTimer <= 0) {
        this.currentRound++;
        this.setupRound();
      }
    }

    this.vfx.update(dt);
    this.input.update(dt);
  }

  private handleFighterEliminated(
    victim: PlayerFighter,
    attacker: PlayerFighter | null
  ): void {
    victim.eliminate();
    if (attacker && attacker.id !== victim.id) {
      attacker.eliminationsThisMatch++;
    }

    this.vfx.spawnShockwaveRing(victim.position, 0xc53030, 5.0);
    this.vfx.spawnParticleBurst(victim.position, 0xc53030, 24, 10.0);
    this.tpsCamera.addTrauma(0.45);

    gameEvents.emit('elimination', {
      victimId: victim.id,
      victimName: victim.name,
      attackerId: attacker ? attacker.id : null,
      attackerName: attacker ? attacker.name : 'ARENA',
      position: victim.position,
      speed: this.ball.speed,
    });

    this.bannerAnnouncement = `${victim.name} ELIMINATED!`;
    this.bannerTimer = 1.4;

    // Check Round Completion
    if (this.mode === 'endless_gauntlet') {
      this.finishMatch(this.fighters[0]);
      return;
    }

    const survivors = this.fighters.filter((f) => f.alive);
    if (survivors.length <= 1) {
      const winner = survivors[0] || attacker || this.fighters[0];
      const prevWins = this.roundWins.get(winner.id) || 0;
      const newWins = prevWins + 1;
      this.roundWins.set(winner.id, newWins);
      this.lastRoundWinnerName = winner.name;

      gameEvents.emit('round_end', {
        winnerId: winner.id,
        winnerName: winner.name,
      });

      if (newWins >= this.roundsToWin) {
        this.finishMatch(winner);
      } else {
        this.state = 'ROUND_OVER';
        this.roundOverTimer = 2.1;
        this.bannerAnnouncement = `${winner.name} TAKES ROUND ${this.currentRound}!`;
        this.bannerTimer = 2.0;

        // Reset ball gently for next round
        this._spawnPos.set(0, 2.5, 0);
        this.ball.reset(this._spawnPos, this._initDir.set(0, 0, 1), null);
      }
    } else {
      // More than 1 survivor remains in 4P FFA: retarget ball from center at reduced speed
      const nextTarget = survivors[Math.floor(Math.random() * survivors.length)];
      this.ball.position.set(0, 3.0, 0);
      this.ball.prevPosition.copy(this.ball.position);
      this.ball.speed = Math.max(INITIAL_BALL_SPEED, this.ball.speed * 0.72);
      this.ball.targetId = nextTarget.id;
    }
  }

  private finishMatch(winner: PlayerFighter): void {
    this.state = 'MATCH_OVER';
    this.input.setPointerLockAllowed(false);

    const player = this.fighters[0];
    const playerWon =
      this.mode === 'endless_gauntlet'
        ? this.gauntletParryScore >= 10
        : winner.id === player.id;

    const peakMach = Number(getMachFromSpeed(this.peakSpeedThisMatch).toFixed(2));
    const peakKmh = getKmhFromSpeed(this.peakSpeedThisMatch);

    const coinsEarned = this.progression.recordMatchReward({
      won: playerWon,
      parries: player.parriesThisMatch,
      eliminations: player.eliminationsThisMatch,
      peakMach,
      isGauntlet: this.mode === 'endless_gauntlet',
    });

    const activeCount = this.mode === 'ffa_4p' ? 4 : this.mode === 'duel_1v1' ? 2 : 1;
    const scoreboard: FighterRoundScore[] = [];
    for (let i = 0; i < activeCount; i++) {
      const f = this.fighters[i];
      scoreboard.push({
        id: f.id,
        name: f.name,
        isHuman: f.isHuman,
        characterName: f.characterDef.name,
        cssColor: f.characterDef.cssColor,
        roundsWon: this.roundWins.get(f.id) || 0,
        parries: f.parriesThisMatch,
        eliminations: f.eliminationsThisMatch,
        alive: f.alive,
      });
    }

    // Pick MVP
    let mvp = this.fighters[0];
    let bestMvpScore = -1;
    for (let i = 0; i < activeCount; i++) {
      const f = this.fighters[i];
      const s =
        (this.roundWins.get(f.id) || 0) * 100 +
        f.eliminationsThisMatch * 35 +
        f.parriesThisMatch * 10;
      if (s > bestMvpScore) {
        bestMvpScore = s;
        mvp = f;
      }
    }

    this.lastMatchSummary = {
      mode: this.mode,
      playerWon,
      mvpName: mvp.name,
      mvpTitle: `${mvp.characterDef.name} // ${mvp.characterDef.title}`,
      mvpColor: mvp.characterDef.cssColor,
      playerParries: player.parriesThisMatch,
      playerEliminations: player.eliminationsThisMatch,
      peakMach,
      peakKmh,
      coinsEarned,
      scoreboard,
    };

    if (this.onMatchCompletedCallback) {
      this.onMatchCompletedCallback(this.lastMatchSummary);
    }
  }

  public getScoreboardSnapshot(): FighterRoundScore[] {
    const activeCount = this.mode === 'ffa_4p' ? 4 : this.mode === 'duel_1v1' ? 2 : 1;
    const list: FighterRoundScore[] = [];
    for (let i = 0; i < activeCount; i++) {
      const f = this.fighters[i];
      list.push({
        id: f.id,
        name: f.name,
        isHuman: f.isHuman,
        characterName: f.characterDef.name,
        cssColor: f.characterDef.cssColor,
        roundsWon: this.roundWins.get(f.id) || 0,
        parries: f.parriesThisMatch,
        eliminations: f.eliminationsThisMatch,
        alive: f.alive,
      });
    }
    return list;
  }
}
